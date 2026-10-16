/**
 * Einberufung auf Antrag (§ 29 Abs. 2 BetrVG): ein Viertel der Mitglieder oder der
 * Arbeitgeber können eine Sitzung verlangen ("unter Angabe der Gründe"); sie muss dann
 * binnen einer Woche nach Zugang des Antrags stattfinden. Nutzt denselben Fristrechner
 * wie die Anhörungsfristen (§§ 187, 188, 193 BGB).
 *
 * Nicht juristisch geprüft.
 */

import { FristTyp } from "@prisma/client";
import prisma from "./prisma.js";
import { berechneFristende } from "./fristRechner.js";
import { ladeFeiertagsKalender } from "./fristKalender.js";

/** "Mindestens ein Viertel" – aufgerundet (9 Mitglieder → mind. 3 Unterzeichner). */
export function mindestUnterzeichnerErmitteln(sollStaerke: number): number {
  return Math.ceil(sollStaerke / 4);
}

/** Legt die Wochenfrist an, sobald ein Antrag zugeht (Arbeitgeber direkt, Mitglieder beim Quorum). */
export async function einberufungsfristAnlegen(antragId: string, zugangAm: Date): Promise<void> {
  const kalender = await ladeFeiertagsKalender();
  const ende = berechneFristende(zugangAm, { wochen: 1 }, kalender);
  await prisma.frist.create({
    data: {
      typ: FristTyp.EINBERUFUNG_29,
      faelligAm: ende.ende,
      bezeichnung: "Einberufung auf Antrag (§ 29 Abs. 2 BetrVG)",
      einberufungsantragId: antragId,
    },
  });
}
