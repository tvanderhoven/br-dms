/**
 * Wer sieht vertrauliche Inhalte?
 *
 * Vorsitz und Stellvertretung sind gleichgestellt und sehen alles Vertrauliche, ebenso der Admin
 * (sofern er nicht über lib/adminZugriff.ts auf die Technik beschränkt ist). Alle anderen sehen
 * ein vertrauliches Dokument nur, wenn sie es selbst hochgeladen haben, und ein vertrauliches
 * Fremdprotokoll nur, wenn sie Mitglied des jeweiligen Gremiums sind.
 */

import { DokumentStatus, Role } from "@prisma/client";
import type { FastifyReply } from "fastify";
import prisma from "./prisma.js";

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

/**
 * Für Routen, die nur die Dokument-ID kennen (Kommentare, Verknüpfungen …):
 * prüft, ob das Dokument existiert und für den Benutzer sichtbar ist, und
 * schickt sonst 404 bzw. 403. Rückgabe true = weitermachen.
 */
export async function dokumentZugriffPruefen(
  dokumentId: string,
  benutzer: { rolle: Role; sub: string },
  reply: FastifyReply,
): Promise<boolean> {
  const dokument = await prisma.dokument.findUnique({
    where:  { id: dokumentId },
    select: { vertraulich: true, hochgeladenVonId: true, status: true },
  });
  if (!dokument || dokument.status === DokumentStatus.GELOESCHT) {
    reply.status(404).send({ fehler: "Dokument nicht gefunden" });
    return false;
  }
  if (!darfDokumentSehen(dokument, benutzer.rolle, benutzer.sub)) {
    reply.status(403).send({ fehler: "Vertrauliches Dokument" });
    return false;
  }
  return true;
}

// Prisma-where-Teil für Fremdprotokoll-Abfragen
export function fremdprotokollVertraulichFilter(rolle: Role, benutzerId: string) {
  if (siehtAllesVertrauliche(rolle)) return {};
  return { OR: [{ vertraulich: false }, { gremium: { mitglieder: { some: { benutzerId } } } }] };
}
