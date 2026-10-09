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

// ── Vertrauliche TOPs ───────────────────────────────────────────
// JAV und SBV lesen Sitzungen mit (middleware/auth.ts), aber keine als vertraulich
// markierten TOPs – weder in der Sitzungsansicht noch über Beschlüsse, Abstimmungen,
// Protokollblöcke, TOP-Auszüge oder das komplette Protokoll-PDF.

export function siehtKeineVertraulichenTops(rolle: Role): boolean {
  return rolle === Role.JAV || rolle === Role.SBV;
}

// Prisma-where-Teil für Protokollblöcke (Blöcke ohne TOP gehören zur Sitzung allgemein)
export function protokollBlockVertraulichFilter(rolle: Role) {
  if (!siehtKeineVertraulichenTops(rolle)) return {};
  return { OR: [{ topId: null }, { top: { vertraulich: false } }] };
}

/**
 * Für Routen an einem einzelnen TOP: schickt JAV/SBV bei einem vertraulichen TOP
 * dieselbe 404 wie bei einem fehlenden – sie sollen nicht einmal erfahren, dass es
 * ihn gibt. Rückgabe true = weitermachen.
 */
export async function topZugriffPruefen(topId: string, rolle: Role, reply: FastifyReply): Promise<boolean> {
  if (!siehtKeineVertraulichenTops(rolle)) return true;
  const top = await prisma.tOP.findUnique({ where: { id: topId }, select: { vertraulich: true } });
  if (top?.vertraulich) {
    reply.status(404).send({ fehler: "TOP nicht gefunden" });
    return false;
  }
  return true;
}

/**
 * Für Dateien, die die ganze Sitzung enthalten (Protokoll-PDF, Sitzungspaket, Scans):
 * Ein geschwärztes Protokoll gibt es (noch) nicht, deshalb bekommen JAV/SBV diese
 * Dateien nur, wenn die Sitzung keinen vertraulichen TOP hat. Rückgabe true = weitermachen.
 */
export async function sitzungsdateiZugriffPruefen(sitzungId: string, rolle: Role, reply: FastifyReply): Promise<boolean> {
  if (!siehtKeineVertraulichenTops(rolle)) return true;
  const anzahl = await prisma.tOP.count({ where: { sitzungId, vertraulich: true } });
  if (anzahl > 0) {
    reply.status(403).send({ fehler: "Die Sitzung enthält vertrauliche TOPs – das vollständige Protokoll ist für diese Rolle gesperrt" });
    return false;
  }
  return true;
}
