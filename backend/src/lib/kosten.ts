/**
 * Kosten des Betriebsrats (§ 40 BetrVG) – Bezeichnungen und Abgleich mit den Schulungen
 */

import { KostenArt, KostenStatus, SchulungsStatus } from "@prisma/client";
import prisma from "./prisma.js";

export const KOSTEN_ART_LABEL: Record<KostenArt, string> = {
  SCHULUNG:          "Schulung (§ 37 Abs. 6/7)",
  SACHVERSTAENDIGER: "Sachverständige (§ 80 Abs. 3)",
  RECHTSANWALT:      "Rechtsanwalt",
  EINIGUNGSSTELLE:   "Einigungsstelle (§ 76a)",
  SACHMITTEL:        "Sachmittel (§ 40 Abs. 2)",
  REISEKOSTEN:       "Reisekosten",
  SONSTIGES:         "Sonstiges",
};

export const KOSTEN_STATUS_LABEL: Record<KostenStatus, string> = {
  BEANTRAGT: "Beantragt",
  ZUGESAGT:  "Zugesagt",
  BEZAHLT:   "Bezahlt",
  ABGELEHNT: "Abgelehnt",
};

export function euro(cent: number): string {
  return (cent / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

/**
 * BR-Schulungen (Qualifikation mit brSchulung) mit Kosten als Posten führen.
 *
 * Datum, Bezeichnung und Betrag kommen immer aus dem Schulungstermin; Status,
 * Beschluss, Rechnung und Bemerkung pflegt man in der Kostenübersicht und bleiben
 * beim Abgleich erhalten. Läuft vor jedem Lesen der Übersicht – so passt sie auch
 * zu Terminen, die vor dieser Funktion angelegt oder seitdem geändert wurden.
 * Abgesagte Termine, Termine ohne Kosten oder ohne BR-Haken fallen heraus.
 */
export async function schulungskostenAbgleichen(): Promise<void> {
  const termine = await prisma.schulungstermin.findMany({
    where:  { qualifikation: { brSchulung: true }, kosten: { gt: 0 }, status: { not: SchulungsStatus.ABGESAGT } },
    select: { id: true, datum: true, titel: true, anbieter: true, kosten: true, qualifikation: { select: { name: true } } },
  });
  const ids = termine.map(t => t.id);

  await prisma.kostenposten.deleteMany({
    where: { schulungsterminId: { not: null }, NOT: { schulungsterminId: { in: ids } } },
  });

  for (const t of termine) {
    const stamm = {
      datum:       t.datum,
      bezeichnung: t.titel?.trim() || t.qualifikation.name,
      empfaenger:  t.anbieter,
      betragCent:  Math.round((t.kosten ?? 0) * 100),
    };
    await prisma.kostenposten.upsert({
      where:  { schulungsterminId: t.id },
      create: { ...stamm, art: KostenArt.SCHULUNG, schulungsterminId: t.id },
      update: stamm,
    }).catch((e: { code?: string }) => {
      // Zwei Aufrufe gleichzeitig legen denselben Posten an – der zweite darf scheitern
      if (e.code !== "P2002") throw e;
    });
  }
}
