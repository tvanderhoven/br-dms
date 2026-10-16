/**
 * Amtszeit-Grenzen des Betriebsrats – aus den BR-Wahlen abgeleitet, kein eigenes Datenmodell.
 * Jede BR-Wahl markiert mit ihrer konstituierenden Sitzung den Beginn einer neuen Amtszeit,
 * die vorherige endet dort (§ 21 BetrVG: regulär 4 Jahre). `Wahl.konstituierendeSitzungId` ist
 * bewusst kein Prisma-Relationsfeld (siehe schema.prisma) – daher zwei Abfragen statt einem Join.
 *
 * Ohne BR-Wahl im System (Amtszeit begann vor der Einführung von BR-DMS) lässt sich keine Grenze
 * bestimmen – dann gilt alles als eine einzige, laufende "Amtszeit".
 */

import { WahlArt } from "@prisma/client";
import prisma from "./prisma.js";

export interface Amtszeit {
  von:   string | null;   // ISO, null = unbekannter Beginn (vor BR-DMS)
  bis:   string | null;   // ISO, null = laufende Amtszeit
  label: string;
}

const datumDe = (d: Date) => d.toLocaleDateString("de-DE");

/** Amtszeiten neueste zuerst. Erster Eintrag ist immer die laufende Amtszeit. */
export async function amtszeitListe(): Promise<Amtszeit[]> {
  const wahlen = await prisma.wahl.findMany({
    where:   { art: WahlArt.BR, konstituierendeSitzungId: { not: null } },
    select:  { konstituierendeSitzungId: true },
  });

  const sitzungIds = [...new Set(wahlen.map(w => w.konstituierendeSitzungId!).filter(Boolean))];
  const sitzungen = sitzungIds.length > 0
    ? await prisma.sitzung.findMany({ where: { id: { in: sitzungIds } }, select: { sitzungsdatum: true } })
    : [];

  const beginne = sitzungen.map(s => s.sitzungsdatum).sort((a, b) => a.getTime() - b.getTime());

  if (beginne.length === 0) {
    return [{ von: null, bis: null, label: "Alle Sitzungen (keine BR-Wahl im System erfasst)" }];
  }

  const amtszeiten: Amtszeit[] = [];
  for (let i = beginne.length - 1; i >= 0; i--) {
    const von = beginne[i];
    const bis = i + 1 < beginne.length ? beginne[i + 1] : null;
    amtszeiten.push({
      von: von.toISOString(),
      bis: bis ? bis.toISOString() : null,
      label: bis ? `${datumDe(von)} – ${datumDe(bis)}` : `Laufende Amtszeit (seit ${datumDe(von)})`,
    });
  }
  amtszeiten.push({ von: null, bis: beginne[0].toISOString(), label: `Vor ${datumDe(beginne[0])} (unbekannt)` });
  return amtszeiten;
}
