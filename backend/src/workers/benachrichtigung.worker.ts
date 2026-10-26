import cron from "node-cron";
import { faelligeAufgabenMelden, mailRueckfallSenden } from "../lib/benachrichtigung.js";

/**
 * Benachrichtigungen (lib/benachrichtigung.ts):
 *  - alle 5 Minuten die fälligen Rückfall-Mails für ungelesene Benachrichtigungen
 *  - täglich um 07:00 die heute fälligen Aufgaben
 */
export function startBenachrichtigungWorker(): void {
  cron.schedule(
    "*/5 * * * *",
    async () => {
      const r = await mailRueckfallSenden().catch(err => { console.error("[BenachrichtigungWorker] Fehler:", err); return null; });
      if (r?.gesendetAn.length) console.log(`[BenachrichtigungWorker] Mail an ${r.gesendetAn.join(", ")}`);
    },
    { timezone: "Europe/Berlin" }
  );
  cron.schedule(
    "0 7 * * *",
    async () => {
      const n = await faelligeAufgabenMelden().catch(err => { console.error("[BenachrichtigungWorker] Fällige Aufgaben:", err); return 0; });
      if (n) console.log(`[BenachrichtigungWorker] ${n} fällige Aufgabe(n) gemeldet`);
    },
    { timezone: "Europe/Berlin" }
  );
  console.log("[BenachrichtigungWorker] Registriert: Mail-Rückfall alle 5 Minuten, fällige Aufgaben um 07:00 (Europe/Berlin)");
}
