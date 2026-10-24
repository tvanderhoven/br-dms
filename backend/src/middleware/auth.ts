/**
 * JWT-Authentifizierungs-Hook für Fastify
 */

import { FastifyRequest, FastifyReply } from "fastify";
import { AuditAktion, Role, SitzungStatus } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { adminHatInhaltszugriff } from "../lib/adminZugriff.js";

export interface JwtPayload {
  sub:   string;  // Benutzer-ID
  email: string;
  rolle: Role;
  tv?:   number;  // Token-Version, muss zu benutzer.tokenVersion passen (fehlt bei Tokens von vor dem Widerruf = 0)
  zweck?: string; // nur bei Zwischen-Tokens der Zwei-Faktor-Anmeldung (lib/anmeldeToken.ts) – hier nie gültig
}

declare module "fastify" {
  interface FastifyRequest {
    benutzer: JwtPayload;
    /** Externe Protokollführung: Zugriff auf eine ihr zugeordnete Sitzung geprüft (erfordert() lässt dann bis MITGLIED durch) */
    externFreigabe?: boolean;
  }
}

// JAV und SBV: stark eingeschränkte Rollen, dürfen nur Sitzungen/Protokolle LESEN.
// Zentral hier durchgesetzt (statt in jeder einzelnen Route), damit kein
// Modul versehentlich offen bleibt, wenn später neue Routen dazukommen.
const EINGESCHRAENKT_ERLAUBTE_GET_PFADE = [/^\/api\/sitzungen(\/|$)/];

function eingeschraenkteRolleDarfZugreifen(request: FastifyRequest): boolean {
  const pfad = request.url.split("?")[0];
  if (pfad === "/api/auth/me") return true; // Rolle/Name fürs eigene Profil laden
  if (pfad === "/api/auth/logout") return true;
  if (/^\/api\/konto(\/|$)/.test(pfad)) return true; // eigenes Konto (Passwort, E-Mail, 2FA)
  return request.method === "GET" && EINGESCHRAENKT_ERLAUBTE_GET_PFADE.some(r => r.test(pfad));
}

// Externe Protokollführung (Roadmap Paket 4): Positivliste, jede Sitzungsroute nur für Sitzungen,
// in denen die Person als Protokollführung eingetragen ist, und nur bis das Protokoll finalisiert
// ist. Tagesordnung, Anwesenheit und Protokoll-Editor – keine Dokumente, kein Kummerkasten, keine
// Mitarbeiterdaten, keine Wahlen, keine Nachrichten. Welche TOPs sie sieht: lib/vertraulich.ts.
const EXTERN_SITZUNGSROUTEN: { methoden: string[]; muster: RegExp }[] = [
  { methoden: ["GET"],                    muster: /^\/api\/sitzungen\/([^/]+)$/ },
  { methoden: ["GET", "POST"],            muster: /^\/api\/sitzungen\/([^/]+)\/anwesenheit$/ },
  { methoden: ["DELETE"],                 muster: /^\/api\/sitzungen\/([^/]+)\/anwesenheit\/[^/]+$/ },
  { methoden: ["GET", "POST"],            muster: /^\/api\/sitzungen\/([^/]+)\/blocks$/ },
  { methoden: ["PATCH", "DELETE"],        muster: /^\/api\/sitzungen\/([^/]+)\/blocks\/[^/]+$/ },
  { methoden: ["PATCH"],                  muster: /^\/api\/sitzungen\/([^/]+)\/tops\/[^/]+$/ },
  { methoden: ["GET"],                    muster: /^\/api\/sitzungen\/([^/]+)\/tops\/[^/]+\/(beschluesse|abstimmung)$/ },
];
const EXTERN_ZUGRIFF_ENDET: SitzungStatus[] = [SitzungStatus.PROTOKOLL_FINAL, SitzungStatus.ABGESCHLOSSEN, SitzungStatus.ABGESAGT];

async function externDarfZugreifen(request: FastifyRequest, benutzerId: string): Promise<boolean> {
  const pfad = request.url.split("?")[0];
  if (pfad === "/api/auth/me" || pfad === "/api/auth/logout" || /^\/api\/konto(\/|$)/.test(pfad)) return true;
  if (request.method === "GET" && pfad === "/api/sitzungen") return true;   // Liste filtert routes/sitzungen.ts

  const treffer = EXTERN_SITZUNGSROUTEN.find(r => r.methoden.includes(request.method) && r.muster.test(pfad));
  if (!treffer) return false;
  const sitzungId = pfad.match(treffer.muster)![1];
  const sitzung = await prisma.sitzung.findUnique({ where: { id: sitzungId }, select: { protokollfuehrerId: true, status: true } });
  if (!sitzung || sitzung.protokollfuehrerId !== benutzerId || EXTERN_ZUGRIFF_ENDET.includes(sitzung.status)) return false;

  request.externFreigabe = true;
  // Zugriffsprotokoll: jedes Öffnen und jede Änderung, damit der Vorsitz es bei Streit um die
  // Verschwiegenheit nachvollziehen kann
  await prisma.auditLog.create({
    data: {
      benutzerId, sitzungId, aktion: AuditAktion.EXTERN_ZUGRIFF,
      ip: request.ip, userAgent: request.headers["user-agent"] ?? null,
      details: { methode: request.method, pfad },
    },
  }).catch(() => {});
  return true;
}

// Admin ohne Inhaltszugriff (Einstellung von Vorsitz/Stellvertretung, siehe
// lib/adminZugriff.ts): nur die technische Verwaltung. Ebenfalls zentral als
// Positivliste, damit neue Inhaltsrouten automatisch gesperrt sind.
const TECHNIK_ADMIN_PFADE = [
  /^\/api\/auth\//,
  /^\/api\/konto(\/|$)/,
  /^\/api\/benutzer(\/|$)/,
  /^\/api\/einstellungen\//,
  /^\/api\/gesetze\//,
  /^\/api\/nachrichten(\/|$)/,   // nur die eigenen
];
// Gehaltstabelle nach fehlerhaftem Import bereinigen – löscht, ohne etwas anzuzeigen
const TECHNIK_ADMIN_LOESCHEN = /^\/api\/gehaltstabelle\/(eintraege|alle)$/;

function technikAdminDarfZugreifen(request: FastifyRequest): boolean {
  const pfad = request.url.split("?")[0];
  if (request.method === "DELETE" && TECHNIK_ADMIN_LOESCHEN.test(pfad)) return true;
  return TECHNIK_ADMIN_PFADE.some(r => r.test(pfad));
}

/** Hook: JWT verifizieren und Benutzer an Request anhängen */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const payload = await request.jwtVerify<JwtPayload>();

    // Zwischen-Token (Passwort richtig, zweiter Faktor fehlt noch) öffnet keine API
    if (payload.zweck) {
      return reply.status(401).send({ fehler: "Anmeldung nicht abgeschlossen" });
    }

    // Benutzer noch aktiv?
    const benutzer = await prisma.benutzer.findUnique({
      where: { id: payload.sub },
      select: { id: true, aktiv: true, rolle: true, email: true, tokenVersion: true },
    });

    if (!benutzer?.aktiv) {
      return reply.status(401).send({ fehler: "Konto deaktiviert" });
    }

    // Nach Abmelden oder Passwortwechsel ist die Version hochgezählt – ältere Tokens gelten nicht mehr
    if ((payload.tv ?? 0) !== benutzer.tokenVersion) {
      return reply.status(401).send({ fehler: "Sitzung beendet – bitte neu anmelden" });
    }

    request.benutzer = { sub: benutzer.id, email: benutzer.email, rolle: benutzer.rolle };

    if ((benutzer.rolle === Role.JAV || benutzer.rolle === Role.SBV) && !eingeschraenkteRolleDarfZugreifen(request)) {
      return reply.status(403).send({ fehler: "Kein Zugriff für diese Rolle" });
    }

    if (benutzer.rolle === Role.EXTERN && !(await externDarfZugreifen(request, benutzer.id))) {
      return reply.status(403).send({ fehler: "Kein Zugriff – nur die Sitzungen, die Sie protokollieren, bis das Protokoll finalisiert ist" });
    }

    if (benutzer.rolle === Role.ADMIN && !technikAdminDarfZugreifen(request) && !(await adminHatInhaltszugriff())) {
      return reply.status(403).send({ fehler: "Der Admin hat in dieser Installation keinen Zugriff auf Inhalte" });
    }
  } catch {
    return reply.status(401).send({ fehler: "Nicht authentifiziert" });
  }
}
