/**
 * Welche Sitzung passt für eine Fristsache? (Issue #25/#26)
 *
 * Der Betriebsrat muss vor Fristende beschließen (§ 33 BetrVG) und die
 * Stellungnahme dem Arbeitgeber zuleiten. Vorgeschlagen werden die nächsten
 * geplanten Sitzungen; reicht keine davon (oder ist die Tagesordnung schon
 * fixiert), gibt es eine Warnung – dann ist eine Sondersitzung nötig.
 *
 * Achtung Zeitzonen: Sitzungszeiten liegen "wie eingegeben" in UTC (09:00 Uhr
 * Ortszeit = 09:00Z, siehe lib/kalender.ts), Fristen dagegen als echter
 * Zeitpunkt (23:59 deutscher Zeit). Verglichen werden deshalb Kalendertage.
 */

import { FristStatus, SitzungStatus } from "@prisma/client";
import prisma from "./prisma.js";
import { KATEGORIE_LABEL } from "./kategorien.js";
import { berlinerTag } from "./fristRechner.js";

const sitzungsTag = (d: Date) => d.toISOString().slice(0, 10);

export interface VorgeschlageneSitzung {
  id:          string;
  titel:       string;
  datum:       Date;          // wie gespeichert (Ortszeit in UTC-Feldern)
  status:      SitzungStatus;
  gremium:     string | null;
  rechtzeitig: boolean | null;  // null = keine offene Frist
  letzterTag:  boolean;         // Sitzung am Tag des Fristendes
  topMoeglich: boolean;         // nur im Entwurf lassen sich TOPs ergänzen
}

export interface Sitzungsvorschlag {
  fristende:   Date | null;
  vorschlagTitel: string;
  verknuepft:  Array<VorgeschlageneSitzung & { topNummer: number; topTitel: string }>;
  sitzungen:   VorgeschlageneSitzung[];
  /** Keine verknüpfte und keine erreichbare Sitzung vor Fristende */
  sondersitzungNoetig: boolean;
}

export async function sitzungsvorschlag(dokumentId: string, jetzt = new Date()): Promise<Sitzungsvorschlag | null> {
  const dok = await prisma.dokument.findUnique({
    where:   { id: dokumentId },
    include: {
      fristen: { where: { status: FristStatus.OFFEN }, orderBy: { faelligAm: "asc" }, take: 1 },
      topVerknuepfungen: {
        include: { top: { include: { sitzung: { include: { gremium: { select: { name: true } } } } } } },
      },
    },
  });
  if (!dok) return null;

  const fristende = dok.fristen[0]?.faelligAm ?? null;
  const fristTag  = fristende ? berlinerTag(fristende) : null;

  const bewerte = (s: { id: string; titel: string; sitzungsdatum: Date; status: SitzungStatus; gremium: { name: string } | null }): VorgeschlageneSitzung => {
    const tag = sitzungsTag(s.sitzungsdatum);
    return {
      id: s.id, titel: s.titel, datum: s.sitzungsdatum, status: s.status, gremium: s.gremium?.name ?? null,
      rechtzeitig: fristTag ? tag <= fristTag : null,
      letzterTag:  tag === fristTag,
      topMoeglich: s.status === SitzungStatus.ENTWURF,
    };
  };

  const verknuepft = dok.topVerknuepfungen
    .filter(v => v.top.sitzung.status !== SitzungStatus.ABGESAGT)
    .map(v => ({ ...bewerte(v.top.sitzung), topNummer: v.top.nummer, topTitel: v.top.titel }));

  // Ab heute (Kalendertag in deutscher Zeit, im Format der Sitzungszeiten)
  const heute = new Date(`${berlinerTag(jetzt)}T00:00:00Z`);
  const sitzungen = (await prisma.sitzung.findMany({
    where: {
      status:        { in: [SitzungStatus.ENTWURF, SitzungStatus.TAGESORDNUNG_FIXIERT] },
      sitzungstyp:   { not: "BETRIEBSVERSAMMLUNG" },
      sitzungsdatum: { gte: heute },
      id:            { notIn: verknuepft.map(v => v.id) },
    },
    include: { gremium: { select: { name: true } } },
    orderBy: { sitzungsdatum: "asc" },
    take:    6,
  })).map(bewerte);

  return {
    fristende,
    vorschlagTitel: `${KATEGORIE_LABEL[dok.kategorie]}: ${dok.alias ?? dok.titel}`,
    verknuepft,
    // Alles bis zur ersten Sitzung nach Fristende – spätere helfen nicht
    sitzungen: sitzungen.filter((s, i) => s.rechtzeitig !== false || sitzungen.findIndex(x => x.rechtzeitig === false) === i),
    sondersitzungNoetig: !!fristende
      && !verknuepft.some(v => v.rechtzeitig)
      && !sitzungen.some(s => s.rechtzeitig && s.topMoeglich),
  };
}
