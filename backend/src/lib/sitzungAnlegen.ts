/**
 * Legt eine Sitzung an wie "Neue Sitzung" in der App: Version 1.0, Tagesordnung aus
 * Vorlage oder Standard-TOPs der Sitzungsart, alle aktiven Benutzer als anwesend
 * vorausgefüllt (außer bei der Betriebsversammlung). Genutzt von routes/sitzungen.ts
 * und der Wahl-Übernahme (konstituierende Sitzung, routes/wahlen.ts).
 */

import { Prisma, PrismaClient, SitzungStatus } from "@prisma/client";
import defaultPrisma from "./prisma.js";
import { STANDARD_TOPS, istBetriebsversammlung } from "./sitzungstypen.js";

export interface NeueSitzung {
  titel:         string;
  sitzungsdatum: Date;
  ort?:          string | null;
  sitzungstyp:   string;
  notizen?:      string | null;
  vorlageId?:    string | null;
  erstelltVonId: string;
}

export async function sitzungAnlegen(
  s: NeueSitzung,
  client: PrismaClient | Prisma.TransactionClient = defaultPrisma,
): Promise<string> {
  const sitzung = await client.sitzung.create({
    data: {
      titel:         s.titel,
      sitzungsdatum: s.sitzungsdatum,
      ort:           s.ort ?? null,
      sitzungstyp:   s.sitzungstyp,
      notizen:       s.notizen ?? null,
      status:        SitzungStatus.ENTWURF,
      erstelltVonId: s.erstelltVonId,
      versionen: {
        create: { versionNummer: "1.0", typ: "TAGESORDNUNG_ENTWURF", readonly: false, erstelltVonId: s.erstelltVonId },
      },
    },
    select: { id: true },
  });

  const standardTops = STANDARD_TOPS[s.sitzungstyp];
  if (!s.vorlageId && standardTops) {
    await client.tOP.createMany({
      data: standardTops.map((t, i) => ({ sitzungId: sitzung.id, nummer: i + 1, titel: t })),
    });
  }

  if (s.vorlageId) {
    const vorlage = await client.sitzungsVorlage.findUnique({
      where: { id: s.vorlageId },
      include: { tops: { orderBy: { reihenfolge: "asc" } } },
    });
    if (vorlage && vorlage.tops.length > 0) {
      await client.tOP.createMany({
        data: vorlage.tops.map((t, i) => ({
          sitzungId:   sitzung.id,
          nummer:      i + 1,
          titel:       t.titel,
          inhalt:      t.inhalt ?? null,
          inhaltsJson: t.inhaltsJson ?? undefined,
        })),
      });
    }
  }

  // Alle aktiven Mitglieder als "Anwesend" vorausfüllen – nicht bei der
  // Betriebsversammlung, dort zählt nur die Teilnehmerzahl
  const aktive = istBetriebsversammlung(s.sitzungstyp) ? [] : await client.benutzer.findMany({
    where: { aktiv: true },
    select: { id: true },
  });
  if (aktive.length > 0) {
    await client.anwesenheit.createMany({
      data: aktive.map(b => ({ sitzungId: sitzung.id, benutzerId: b.id, status: "ANWESEND" })),
    });
  }

  return sitzung.id;
}
