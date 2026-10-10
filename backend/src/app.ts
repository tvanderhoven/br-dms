/**
 * Fastify-App mit allen Plugins und Routen – ohne Start, Worker und Erst-Admin.
 * Getrennt von index.ts, damit die Rollentests (test/) dieselbe App per
 * app.inject() ansprechen können, ohne einen Port zu öffnen.
 */

import Fastify, { FastifyInstance, RouteOptions } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import { authRouten } from "./routes/auth.js";
import { kontoRouten } from "./routes/konto.js";
import { dokumentRouten } from "./routes/dokumente.js";
import { benutzerRouten } from "./routes/benutzer.js";
import { sitzungRouten } from "./routes/sitzungen.js";
import { abstimmungRouten } from "./routes/abstimmungen.js";
import { pdfRouten } from "./routes/pdf.js";
import { sitzungScanRouten } from "./routes/sitzungScans.js";
import { scanEingangRouten } from "./routes/scanEingang.js";
import { sitzungspaketRouten } from "./routes/sitzungspaket.js";
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
import { einladungRouten } from "./routes/einladung.js";
import { beschlussRegisterRouten } from "./routes/beschlussregister.js";
import { fristenRouten } from "./routes/fristen.js";
import { wahlRouten } from "./routes/wahlen.js";
import { exportRouten } from "./routes/export.js";
import { mitarbeiterRouten, abteilungenRouten } from "./routes/mitarbeiter.js";
import { gehaltstabelleRouten } from "./routes/gehaltstabelle.js";
import { zeitmodellRouten } from "./routes/zeitmodell.js";
import { ueberstundenRouten } from "./routes/ueberstunden.js";
import { betriebsvereinbarungenRouten } from "./routes/betriebsvereinbarungen.js";
import { qualifikationenRouten, schulungenRouten } from "./routes/schulungen.js";
import { gesetzeRouten } from "./routes/gesetze.js";
import { kummerkastenRouten } from "./routes/kummerkasten.js";
import { ablaufRouten } from "./routes/ablauf.js";
import { gremienRouten } from "./routes/gremien.js";
import { fremdprotokolleRouten } from "./routes/fremdprotokolle.js";
import { geschaeftsordnungRouten } from "./routes/geschaeftsordnung.js";
import { anhoerungRouten } from "./routes/anhoerung.js";
import { ordnerRouten } from "./routes/ordner.js";

export interface AppOptionen {
  /** Fastify-Logger; die Tests schalten ihn ab */
  logger?: boolean;
  /** Wird für jede registrierte Route aufgerufen (Rollentests sammeln so alle Routen ein) */
  beiRoute?: (route: RouteOptions) => void;
}

export async function baueApp(optionen: AppOptionen = {}): Promise<FastifyInstance> {
  // Anfragen kommen über zwei eigene Stationen: HTTPS-Proxy → Frontend-nginx → Backend.
  // Beide hängen die Absenderadresse an X-Forwarded-For an; genau diesen zwei Stationen
  // vertrauen, damit request.ip (Audit-Log, Login-Limit) der Arbeitsplatz ist und nicht
  // der Container davor. Was der Browser selbst in den Header schreibt, steht weiter
  // links und wird nicht ausgewertet. Steht noch ein Reverse-Proxy davor (z. B. der des
  // NAS), PROXY_STATIONEN in der .env um 1 erhöhen.
  const proxyStationenWert = Number(process.env.PROXY_STATIONEN ?? 2);
  const proxyStationen = Number.isInteger(proxyStationenWert) && proxyStationenWert >= 0 ? proxyStationenWert : 2;

  const app = Fastify({
    logger: optionen.logger === false ? false : { level: process.env.NODE_ENV === "production" ? "info" : "debug" },
    // station 0 = direkter Absender der Verbindung, 1 = Eintrag davor in X-Forwarded-For …
    trustProxy: (_adresse: string, station: number) => station < proxyStationen,
  });

  if (optionen.beiRoute) app.addHook("onRoute", optionen.beiRoute);

  // Nur die echte Frontend-Origin zulassen statt jede beliebige Seite (origin: true) -
  // APP_URL ist ohnehin schon Pflicht-Env-Var (siehe README), lokale Dev-Server als Fallback.
  const erlaubteOrigins = [
    process.env.APP_URL,
    "http://localhost:5173", // Vite Dev-Server
    "http://localhost:3000", // lokaler Frontend-Build
  ].filter((o): o is string => Boolean(o));

  await app.register(cors, {
    origin: erlaubteOrigins.length > 0 ? erlaubteOrigins : true,
    credentials: true,
    // @fastify/cors ≥ 10 erlaubt ohne Angabe nur GET/HEAD/POST
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"],
  });

  await app.register(jwt, {
    secret: process.env.JWT_SECRET!,
    sign: { expiresIn: process.env.JWT_EXPIRES_IN ?? "24h" },
  });

  await app.register(multipart, {
    limits: { fileSize: 50 * 1024 * 1024 },
    attachFieldsToBody: false,
  });

  // global: false → gilt nur für Routen, die explizit config.rateLimit setzen
  // (aktuell nur der öffentliche Kummerkasten-Endpunkt, siehe routes/kummerkasten.ts)
  await app.register(rateLimit, { global: false });

  // ── Routen ────────────────────────────────────────────────────────
  app.get("/health", async () => ({ status: "ok", zeit: new Date().toISOString() }));
  await app.register(authRouten,       { prefix: "/api/auth" });
  await app.register(kontoRouten,      { prefix: "/api/konto" });
  await app.register(dokumentRouten,   { prefix: "/api/dokumente" });
  await app.register(ordnerRouten,     { prefix: "/api/ordner" });
  await app.register(scanEingangRouten,{ prefix: "/api/scan-eingang" });
  await app.register(benutzerRouten,   { prefix: "/api/benutzer" });
  await app.register(sitzungRouten,    { prefix: "/api/sitzungen" });
  await app.register(abstimmungRouten, { prefix: "/api/sitzungen" });
  await app.register(pdfRouten,        { prefix: "/api/sitzungen" });
  await app.register(sitzungScanRouten,{ prefix: "/api/sitzungen" });
  await app.register(sitzungspaketRouten,{ prefix: "/api/sitzungen" });
  await app.register(nachrichtenRouten,{ prefix: "/api/nachrichten" });
  await app.register(kommentarRouten,  { prefix: "/api" });
  await app.register(anwesenheitRouten,{ prefix: "/api/sitzungen" });
  await app.register(einladungRouten,   { prefix: "/api/sitzungen" });
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
  await app.register(wahlRouten,              { prefix: "/api/wahlen" });
  await app.register(exportRouten,             { prefix: "/api/export" });
  await app.register(mitarbeiterRouten,        { prefix: "/api/mitarbeiter" });
  await app.register(abteilungenRouten,        { prefix: "/api/abteilungen" });
  await app.register(gehaltstabelleRouten,     { prefix: "/api/gehaltstabelle" });
  await app.register(zeitmodellRouten,         { prefix: "/api/zeitmodell" });
  await app.register(ueberstundenRouten,       { prefix: "/api/ueberstunden" });
  await app.register(betriebsvereinbarungenRouten, { prefix: "/api/betriebsvereinbarungen" });
  await app.register(qualifikationenRouten,    { prefix: "/api/qualifikationen" });
  await app.register(schulungenRouten,         { prefix: "/api/schulungen" });
  await app.register(gesetzeRouten,            { prefix: "/api/gesetze" });
  await app.register(kummerkastenRouten,       { prefix: "/api/kummerkasten" });
  await app.register(ablaufRouten,             { prefix: "/api/ablauf" });
  await app.register(gremienRouten,            { prefix: "/api/gremien" });
  await app.register(fremdprotokolleRouten,    { prefix: "/api/fremdprotokolle" });
  await app.register(geschaeftsordnungRouten,  { prefix: "/api/geschaeftsordnung" });
  await app.register(anhoerungRouten,          { prefix: "/api/dokumente" });

  return app;
}
