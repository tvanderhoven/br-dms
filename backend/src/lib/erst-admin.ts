/**
 * Legt beim Start den ersten Admin-Account an, solange noch gar kein
 * Benutzer existiert (Neuinstallation). Ersetzt das manuelle
 * "npx prisma db seed", das im Produktions-Image nicht lauffähig ist
 * (kein tsx, keine Quelldateien).
 */

import { Role } from "@prisma/client";
import prisma from "./prisma.js";
import { hashPassword } from "./password.js";

export async function erstAdminAnlegen(): Promise<void> {
  if ((await prisma.benutzer.count()) > 0) return;

  const email    = (process.env.ADMIN_EMAIL || "admin@br-dms.lokal").toLowerCase().trim();
  const passwort = process.env.ADMIN_PASSWORD ?? "";

  // Kein Standard-Passwort mehr: Ein vergessenes ADMIN_PASSWORD würde sonst ein
  // bekanntes Passwort auf einem frisch installierten System hinterlassen.
  if (passwort.length < 8 || /BITTE_AENDERN|CHANGE_?ME/i.test(passwort)) {
    console.error("[Konfiguration] Erste Installation: ADMIN_PASSWORD in der .env fehlt, ist kürzer als 8 Zeichen " +
                  "oder noch der Platzhalter. Bitte setzen und das Backend neu starten.");
    process.exit(1);
  }

  await prisma.benutzer.create({
    data: {
      email,
      name:         "Administrator",
      passwortHash: hashPassword(passwort),
      rolle:        Role.ADMIN,
      aktiv:        true,
    },
  });
  console.log(`[Backend] Erster Admin-Account angelegt: ${email} – Passwort nach dem ersten Login ändern`);
}
