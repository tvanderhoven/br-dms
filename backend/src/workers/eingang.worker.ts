import cron from "node-cron";
import { sammelmeldungSenden } from "../lib/eingangMeldung.js";

/** Stündliche Sammelmail über neue Eingänge an Vorsitz/Stellvertretung (lib/eingangMeldung.ts) */
export function startEingangWorker(): void {
  cron.schedule(
    "0 * * * *",
    async () => {
      const r = await sammelmeldungSenden().catch(err => { console.error("[EingangWorker] Fehler:", err); return null; });
      if (r?.gesendetAn.length) console.log(`[EingangWorker] ${r.dokumente} Eingang/Eingänge gemeldet an ${r.gesendetAn.join(", ")}`);
    },
    { timezone: "Europe/Berlin" }
  );
  console.log("[EingangWorker] Registriert: stündlich zur vollen Stunde (Europe/Berlin)");
}
