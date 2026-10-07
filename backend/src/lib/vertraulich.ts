/**
 * Wer sieht vertrauliche Inhalte?
 *
 * Vorsitz und Stellvertretung sind gleichgestellt und sehen alles Vertrauliche, ebenso der Admin
 * (sofern er nicht über lib/adminZugriff.ts auf die Technik beschränkt ist). Alle anderen sehen
 * ein vertrauliches Dokument nur, wenn sie es selbst hochgeladen haben, und ein vertrauliches
 * Fremdprotokoll nur, wenn sie Mitglied des jeweiligen Gremiums sind.
 */

import { Role } from "@prisma/client";

const SIEHT_ALLES_VERTRAULICHE: Role[] = [Role.VORSITZ, Role.STELLVERTRETER, Role.ADMIN];

export function siehtAllesVertrauliche(rolle: Role): boolean {
  return SIEHT_ALLES_VERTRAULICHE.includes(rolle);
}

// Prisma-where-Teil für Dokument-Abfragen
export function dokumentVertraulichFilter(rolle: Role, benutzerId: string) {
  if (siehtAllesVertrauliche(rolle)) return {};
  return { OR: [{ vertraulich: false }, { hochgeladenVonId: benutzerId }] };
}

export function darfDokumentSehen(
  dokument: { vertraulich: boolean; hochgeladenVonId: string },
  rolle: Role,
  benutzerId: string,
): boolean {
  return !dokument.vertraulich || siehtAllesVertrauliche(rolle) || dokument.hochgeladenVonId === benutzerId;
}

// Prisma-where-Teil für Fremdprotokoll-Abfragen
export function fremdprotokollVertraulichFilter(rolle: Role, benutzerId: string) {
  if (siehtAllesVertrauliche(rolle)) return {};
  return { OR: [{ vertraulich: false }, { gremium: { mitglieder: { some: { benutzerId } } } }] };
}
