/**
 * Einladungsmail datensparsam (Roadmap, Paket 1 vom 20.10.2026)
 *
 * Wie viel von der Tagesordnung steht in der Einladungsmail und im Kalendertermin?
 *   VOLLSTAENDIG  TOP-Liste, Tagesordnung als PDF, .ics mit TOP-Liste (wie bisher)
 *   NUR_TITEL     TOP-Liste ohne PDF
 *   NUR_LINK      nur Termin, Ort und Link zur Sitzung in BR-DMS
 * Die Voreinstellung legt der Vorsitz unter Einstellungen → System fest, je Versand änderbar.
 *
 * In Mail und .ics steht je TOP der neutrale Titel für die Einladung, falls einer gesetzt
 * ist – die Tagesordnung in BR-DMS und das PDF behalten den echten Titel.
 */

import { EinladungDetail } from "@prisma/client";
import prisma from "./prisma.js";

export const EINLADUNG_DETAIL = "einladung.detail";

export const EINLADUNG_DETAIL_LABEL: Record<EinladungDetail, string> = {
  VOLLSTAENDIG: "Vollständig",
  NUR_TITEL:    "Nur TOP-Titel",
  NUR_LINK:     "Nur Link",
};

export function istEinladungDetail(wert: unknown): wert is EinladungDetail {
  return typeof wert === "string" && wert in EINLADUNG_DETAIL_LABEL;
}

/** Voreinstellung aus den Einstellungen – ohne Eintrag wie bisher vollständig */
export async function einladungDetailStandard(): Promise<EinladungDetail> {
  const e = await prisma.systemEinstellung.findUnique({ where: { schluessel: EINLADUNG_DETAIL } });
  return istEinladungDetail(e?.wert) ? e.wert : EinladungDetail.VOLLSTAENDIG;
}

/** Titel eines TOPs in Einladungsmail und Kalendertermin */
export function titelInEinladung(top: { titel: string; einladungTitel?: string | null }): string {
  return top.einladungTitel?.trim() || top.titel;
}

/** Welche TOPs und ob das PDF in die Mail kommen – getrennt testbar vom Versand */
export function einladungInhalt<T extends { nummer: number; titel: string; einladungTitel?: string | null }>(
  detail: EinladungDetail,
  tops: T[],
  pdfMoeglich: boolean,
): { tops: { nummer: number; titel: string }[] | null; mitPdf: boolean } {
  return {
    tops:   detail === EinladungDetail.NUR_LINK ? null : tops.map(t => ({ nummer: t.nummer, titel: titelInEinladung(t) })),
    mitPdf: detail === EinladungDetail.VOLLSTAENDIG && pdfMoeglich,
  };
}
