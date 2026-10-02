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

  const email    = (process.env.ADMIN_EMAIL ?? "admin@br-dms.lokal").toLowerCase().trim();
  const passwort = process.env.ADMIN_PASSWORD ?? "ChangeMe123!";

  await prisma.benutzer.create({
    data: {
      email,
      name:         "Administrator",
      passwortHash: hashPassword(passwort),
      rolle:        Role.ADMIN,
      aktiv:        true,
    },
  });
  console.log(`[Backend] Erster Admin-Account angelegt: ${email}`);
  if (passwort === "ChangeMe123!") {
    console.log("[Backend] ⚠️  Standard-Passwort aktiv – sofort in den Einstellungen ändern!");
  }
}
