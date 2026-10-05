/**
 * JWT-Authentifizierungs-Hook für Fastify
 */

import { FastifyRequest, FastifyReply } from "fastify";
import { Role } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { adminHatInhaltszugriff } from "../lib/adminZugriff.js";

export interface JwtPayload {
  sub:   string;  // Benutzer-ID
  email: string;
  rolle: Role;
}

declare module "fastify" {
  interface FastifyRequest {
    benutzer: JwtPayload;
  }
}

// JAV: stark eingeschränkte Rolle, darf nur Sitzungen/Protokolle LESEN.
// Zentral hier durchgesetzt (statt in jeder einzelnen Route), damit kein
// Modul versehentlich offen bleibt, wenn später neue Routen dazukommen.
const JAV_ERLAUBTE_GET_PFADE = [/^\/api\/sitzungen(\/|$)/];

function javDarfZugreifen(request: FastifyRequest): boolean {
  const pfad = request.url.split("?")[0];
  if (pfad === "/api/auth/me") return true; // Rolle/Name fürs eigene Profil laden
  return request.method === "GET" && JAV_ERLAUBTE_GET_PFADE.some(r => r.test(pfad));
}

// Admin ohne Inhaltszugriff (Einstellung von Vorsitz/Stellvertretung, siehe
// lib/adminZugriff.ts): nur die technische Verwaltung. Ebenfalls zentral als
// Positivliste, damit neue Inhaltsrouten automatisch gesperrt sind.
const TECHNIK_ADMIN_PFADE = [
  /^\/api\/auth\//,
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

    // Benutzer noch aktiv?
    const benutzer = await prisma.benutzer.findUnique({
      where: { id: payload.sub },
      select: { id: true, aktiv: true, rolle: true, email: true },
    });

    if (!benutzer?.aktiv) {
      return reply.status(401).send({ fehler: "Konto deaktiviert" });
    }

    request.benutzer = { sub: benutzer.id, email: benutzer.email, rolle: benutzer.rolle };

    if (benutzer.rolle === Role.JAV && !javDarfZugreifen(request)) {
      return reply.status(403).send({ fehler: "Kein Zugriff für diese Rolle" });
    }

    if (benutzer.rolle === Role.ADMIN && !technikAdminDarfZugreifen(request) && !(await adminHatInhaltszugriff())) {
      return reply.status(403).send({ fehler: "Der Admin hat in dieser Installation keinen Zugriff auf Inhalte" });
    }
  } catch {
    return reply.status(401).send({ fehler: "Nicht authentifiziert" });
  }
}
