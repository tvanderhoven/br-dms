/**
 * Legt eine Sitzung an wie "Neue Sitzung" in der App: Version 1.0, Tagesordnung aus
 * Vorlage oder Standard-TOPs der Sitzungsart, alle aktiven Benutzer als anwesend
 * vorausgefüllt (außer bei der Betriebsversammlung). Genutzt von routes/sitzungen.ts
 * und der Wahl-Übernahme (konstituierende Sitzung, routes/wahlen.ts).
 */

import { Prisma, PrismaClient, Role, SitzungStatus } from "@prisma/client";
import defaultPrisma from "./prisma.js";
import { STANDARD_TOPS, istBetriebsversammlung } from "./sitzungstypen.js";

export interface NeueSitzung {
  titel:         string;
  sitzungsdatum: Date;
  ort?:          string | null;
  sitzungstyp:   string;
  notizen?:      string | null;
  vorlageId?:    string | null;
  gremiumId?:    string | null;
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
      gremiumId:     s.gremiumId ?? null,
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

  // Ordentliche Mitglieder und JAV als "Anwesend" (= geladen) vorausfüllen –
  // Ersatzmitglieder nur, wenn sie für jemanden geladen werden; Admin nie.
  // Nicht bei der Betriebsversammlung, dort zählt nur die Teilnehmerzahl.
  // Gehört die Sitzung einem anderen Gremium (nicht dem BR), werden stattdessen dessen
  // Mitglieder vorausgefüllt – bewusst KEIN Fallback auf die BR-Mitglieder, wenn das
  // Gremium noch keine Mitglieder hat (sonst würden stillschweigend falsche Personen
  // als "anwesend" markiert); die Anwesenheitsliste bleibt dann leer zum Nachtragen.
  const aktive = istBetriebsversammlung(s.sitzungstyp) ? [] :
    s.gremiumId
      ? (await client.gremiumMitglied.findMany({
          where:  { gremiumId: s.gremiumId, benutzer: { aktiv: true } },
          select: { benutzerId: true },
        })).map(m => ({ id: m.benutzerId }))
      : await client.benutzer.findMany({
          where: { aktiv: true, rolle: { in: [Role.VORSITZ, Role.STELLVERTRETER, Role.MITGLIED, Role.JAV, Role.SBV] } },
          select: { id: true },
        });
  if (aktive.length > 0) {
    await client.anwesenheit.createMany({
      data: aktive.map(b => ({ sitzungId: sitzung.id, benutzerId: b.id, status: "ANWESEND" })),
    });
  }

  return sitzung.id;
}
