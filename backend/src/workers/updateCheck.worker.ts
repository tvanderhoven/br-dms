/**
 * Täglicher Update-Check (siehe lib/updateCheck.ts).
 *
 * Einmal kurz nach dem Start – der Cache verhindert dabei eine zweite Anfrage am
 * selben Tag – und dann jeden Morgen. Mit UPDATE_CHECK_ENABLED=false wird gar
 * nichts registriert.
 */

import cron from "node-cron";
import { updateCheckAktiv, updatePruefen } from "../lib/updateCheck.js";

export function startUpdateCheckWorker(): void {
  if (!updateCheckAktiv()) {
    console.log("[UpdateCheck] Abgeschaltet (UPDATE_CHECK_ENABLED=false)");
    return;
  }
  // Nicht im selben Moment wie der Start der übrigen Dienste
  setTimeout(() => { void updatePruefen(); }, 60_000).unref();

  cron.schedule("23 6 * * *", () => { void updatePruefen(); }, { timezone: "Europe/Berlin" });
  console.log("[UpdateCheck] Registriert: täglich um 06:23 Uhr (Europe/Berlin)");
}
