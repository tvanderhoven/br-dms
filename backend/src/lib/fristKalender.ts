/**
 * Feiertagskalender der Installation (Einstellungen → Fristen): Bundesland und
 * regionale Zusatzfeiertage, aus denen der Fristenrechner das Fristende nach
 * § 193 BGB bestimmt. Getrennt von fristRechner.ts, damit der Rechner ohne
 * Datenbank testbar bleibt.
 */

import { PrismaClient } from "@prisma/client";
import defaultPrisma from "./prisma.js";
import { istBundesland, istZusatzFeiertag } from "./feiertage.js";
import type { FeiertagsKalender } from "./fristRechner.js";

export const FRISTEN_BUNDESLAND       = "fristen.bundesland";
export const FRISTEN_ZUSATZ_FEIERTAGE = "fristen.zusatz_feiertage";   // kommagetrennt

export async function ladeFeiertagsKalender(prisma: PrismaClient = defaultPrisma): Promise<FeiertagsKalender> {
  const e = await prisma.systemEinstellung.findMany({
    where: { schluessel: { in: [FRISTEN_BUNDESLAND, FRISTEN_ZUSATZ_FEIERTAGE] } },
  });
  const wert = (k: string) => e.find(x => x.schluessel === k)?.wert ?? "";
  const land = wert(FRISTEN_BUNDESLAND);
  return {
    bundesland: istBundesland(land) ? land : null,
    zusatz:     wert(FRISTEN_ZUSATZ_FEIERTAGE).split(",").map(s => s.trim()).filter(istZusatzFeiertag),
  };
}
