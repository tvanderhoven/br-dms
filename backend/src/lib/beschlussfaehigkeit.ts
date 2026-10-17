/**
 * Beschlussfähigkeit des Betriebsrats (§ 33 Abs. 2 BetrVG): mindestens die Hälfte
 * der Mitglieder muss an der Abstimmung teilnehmen. "Mitglieder" sind die ordentlichen
 * Sitze (VORSITZ/STELLVERTRETER/MITGLIED) – Ersatzmitglieder zählen nur, wenn sie ein
 * abwesendes Mitglied vertreten (das fließt bereits über Beschluss.anwesend ein, siehe
 * routes/beschluesse.ts), JAV/SBV sind nicht stimmberechtigt und zählen nicht zur Soll-Stärke.
 *
 * Nicht juristisch geprüft.
 */

import { Role } from "@prisma/client";
import prisma from "./prisma.js";

export async function sollStaerkeErmitteln(): Promise<number> {
  return prisma.benutzer.count({
    where: { aktiv: true, rolle: { in: [Role.VORSITZ, Role.STELLVERTRETER, Role.MITGLIED] } },
  });
}

/** "Mindestens die Hälfte" – bei ungerader Soll-Stärke aufgerundet (9 Mitglieder → mind. 5). */
export function istBeschlussfaehig(anwesend: number, sollStaerke: number): boolean {
  return anwesend >= Math.ceil(sollStaerke / 2);
}

/**
 * § 36 BetrVG: Beschlüsse über die Geschäftsordnung brauchen die Mehrheit ALLER
 * Mitglieder, nicht nur der Anwesenden – strenger als die normale Beschlussfähigkeit oben
 * (9 Mitglieder → mind. 5 Ja-Stimmen, unabhängig davon wie viele teilgenommen haben).
 */
export function istGeschaeftsordnungsMehrheit(jaStimmen: number, sollStaerke: number): boolean {
  return jaStimmen > sollStaerke / 2;
}
