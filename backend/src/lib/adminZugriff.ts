/**
 * Inhaltszugriff des Admins
 *
 * Standard: Der Admin darf alles (wie bisher). Gremien, deren Admin nur die
 * Technik betreut (z. B. die IT-Abteilung), können das abschalten – dann
 * verwaltet der Admin Benutzer, Einstellungen, Module und Gesetzestexte, sieht
 * aber keine Sitzungen, Dokumente, Personal- oder sonstigen Gremiumsdaten.
 *
 * Umschalten dürfen nur Vorsitz und Stellvertretung – nie der Admin selbst,
 * sonst wäre die Sperre wirkungslos.
 */

import { Prisma, Role } from "@prisma/client";
import prisma from "./prisma.js";

export const ADMIN_INHALTSZUGRIFF = "admin.inhaltszugriff";

/** true = Admin sieht Inhalte (Standard), false = nur technische Verwaltung */
export async function adminHatInhaltszugriff(): Promise<boolean> {
  const e = await prisma.systemEinstellung.findUnique({ where: { schluessel: ADMIN_INHALTSZUGRIFF } });
  return e?.wert !== "false";
}

/** Ist dieser Benutzer ein Admin ohne Inhaltszugriff? */
export async function istTechnikAdmin(rolle: Role): Promise<boolean> {
  return rolle === Role.ADMIN && !(await adminHatInhaltszugriff());
}

/**
 * Filter für Rundnachrichten (Tagesordnung, "an alle"): Ein Admin ohne
 * Inhaltszugriff bekommt sie nicht, sonst läsen sich Sitzungstitel darüber.
 */
export async function rundnachrichtFilter(): Promise<Prisma.BenutzerWhereInput> {
  return (await adminHatInhaltszugriff()) ? {} : { rolle: { not: Role.ADMIN } };
}
