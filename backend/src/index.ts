import { startDeletionWorker } from "./workers/deletion.worker.js";
import { startFristenWorker } from "./workers/fristen.worker.js";
import { startWiedervorlageWorker } from "./workers/wiedervorlage.worker.js";
import { startGesetzeWorker } from "./workers/gesetze.worker.js";
import { startAblaufWorker } from "./workers/ablauf.worker.js";
import { startBackupWorker } from "./workers/backup.worker.js";
import { startUpdateCheckWorker } from "./workers/updateCheck.worker.js";
import { startEingangWorker } from "./workers/eingang.worker.js";
import { startBenachrichtigungWorker } from "./workers/benachrichtigung.worker.js";
import { starteWatchFolder } from "./services/watchfolder.service.js";
import { erstAdminAnlegen } from "./lib/erst-admin.js";
import { backlogUebernehmen } from "./lib/themenakte.js";
import { konfigPruefen } from "./lib/konfigPruefen.js";
import { baueApp } from "./app.js";

konfigPruefen();

process.on("uncaughtException", (err) => {
  console.error("[process] uncaughtException – Backend bleibt am Laufen:", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[process] unhandledRejection – Backend bleibt am Laufen:", reason);
});

const app = await baueApp();

// ── Erster Admin (nur bei leerer Benutzertabelle) ─────────────────
await erstAdminAnlegen();

// ── Karten des alten Themen-Backlogs einmalig als Themenakten übernehmen ──
await backlogUebernehmen().catch(err => console.error("[Themenakte] Übernahme des Backlogs fehlgeschlagen:", err));

// ── Worker & Services ─────────────────────────────────────────────
startDeletionWorker(process.env.NODE_ENV !== "production");
startFristenWorker();
startWiedervorlageWorker();
startGesetzeWorker();
startAblaufWorker();
startBackupWorker();
startUpdateCheckWorker();
startEingangWorker();
startBenachrichtigungWorker();

if (process.env.WATCH_FOLDER_ENABLED === "true") {
  starteWatchFolder().catch(err => console.error("[watchfolder] Start fehlgeschlagen:", err));
}

// ── Start ─────────────────────────────────────────────────────────
const port = parseInt(process.env.BACKEND_PORT ?? "4000", 10);
await app.listen({ port, host: "0.0.0.0" });
console.log(`[Backend] Läuft auf Port ${port}`);
