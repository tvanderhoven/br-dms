import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import jwt from "@fastify/jwt";
import { authRouten } from "./routes/auth.js";
import { dokumentRouten } from "./routes/dokumente.js";
import { benutzerRouten } from "./routes/benutzer.js";
import { sitzungRouten } from "./routes/sitzungen.js";
import { abstimmungRouten } from "./routes/abstimmungen.js";
import { pdfRouten } from "./routes/pdf.js";
import { nachrichtenRouten } from "./routes/nachrichten.js";
import { kommentarRouten } from "./routes/kommentare.js";
import { anwesenheitRouten } from "./routes/anwesenheit.js";
import { protocolRouten } from "./routes/protocol.js";
import { beschlussRouten } from "./routes/beschluesse.js";
import { aufgabenRouten } from "./routes/aufgaben.js";
import { watchfolderRouten } from "./routes/watchfolder.js";
import { vorlagenRouten } from "./routes/vorlagen.js";
import { sucheRouten } from "./routes/suche.js";
import { themenRouten } from "./routes/themen.js";
import { einstellungenRouten } from "./routes/einstellungen.js";
import { wissenRouten } from "./routes/wissen.js";
import { ressourcenRouten } from "./routes/ressourcen.js";
import { auditRouten } from "./routes/audit.js";
import { startDeletionWorker } from "./workers/deletion.worker.js";
import { startFristenWorker } from "./workers/fristen.worker.js";
import { startWiedervorlageWorker } from "./workers/wiedervorlage.worker.js";
import { starteWatchFolder } from "./services/watchfolder.service.js";
import { beschlussRegisterRouten } from "./routes/beschlussregister.js";
import { fristenRouten } from "./routes/fristen.js";
import { exportRouten } from "./routes/export.js";

process.on("uncaughtException", (err) => {
  console.error("[process] uncaughtException – Backend bleibt am Laufen:", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[process] unhandledRejection – Backend bleibt am Laufen:", reason);
});

const app = Fastify({
  logger: { level: process.env.NODE_ENV === "production" ? "info" : "debug" },
});

await app.register(cors, { origin: true, credentials: true });

await app.register(jwt, {
  secret: process.env.JWT_SECRET!,
  sign: { expiresIn: process.env.JWT_EXPIRES_IN ?? "24h" },
});

await app.register(multipart, {
  limits: { fileSize: 50 * 1024 * 1024 },
  attachFieldsToBody: false,
});

// ── Routen ────────────────────────────────────────────────────────
app.get("/health", async () => ({ status: "ok", zeit: new Date().toISOString() }));
await app.register(authRouten,       { prefix: "/api/auth" });
await app.register(dokumentRouten,   { prefix: "/api/dokumente" });
await app.register(benutzerRouten,   { prefix: "/api/benutzer" });
await app.register(sitzungRouten,    { prefix: "/api/sitzungen" });
await app.register(abstimmungRouten, { prefix: "/api/sitzungen" });
await app.register(pdfRouten,        { prefix: "/api/sitzungen" });
await app.register(nachrichtenRouten,{ prefix: "/api/nachrichten" });
await app.register(kommentarRouten,  { prefix: "/api" });
await app.register(anwesenheitRouten,{ prefix: "/api/sitzungen" });
await app.register(protocolRouten,   { prefix: "/api/sitzungen" });
await app.register(beschlussRouten,  { prefix: "/api/sitzungen" });
await app.register(aufgabenRouten,     { prefix: "/api/aufgaben" });
await app.register(watchfolderRouten,  { prefix: "/api/watchfolder" });
await app.register(vorlagenRouten,     { prefix: "/api/vorlagen" });
await app.register(sucheRouten,        { prefix: "/api" });
await app.register(themenRouten,       { prefix: "/api" });
await app.register(einstellungenRouten,{ prefix: "/api/einstellungen" });
await app.register(wissenRouten,       { prefix: "/api/wissen" });
await app.register(ressourcenRouten,   { prefix: "/api/ressourcen" });
await app.register(auditRouten,              { prefix: "/api/audit" });
await app.register(beschlussRegisterRouten,  { prefix: "/api/beschluesse" });
await app.register(fristenRouten,            { prefix: "/api/fristen" });
await app.register(exportRouten,             { prefix: "/api/export" });

// ── Worker & Services ─────────────────────────────────────────────
startDeletionWorker(process.env.NODE_ENV !== "production");
startFristenWorker();
startWiedervorlageWorker();

if (process.env.WATCH_FOLDER_ENABLED === "true") {
  starteWatchFolder();
}

// ── Start ─────────────────────────────────────────────────────────
const port = parseInt(process.env.BACKEND_PORT ?? "4000", 10);
await app.listen({ port, host: "0.0.0.0" });
console.log(`[Backend] Läuft auf Port ${port}`);
