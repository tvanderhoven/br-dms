/**
 * RBAC – Rollenbasierte Zugriffskontrolle
 *
 * Hierarchie: ADMIN > VORSITZ = STELLVERTRETER > MITGLIED > ERSATZMITGLIED
 */

import { FastifyRequest, FastifyReply } from "fastify";
import { Role } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { AuditAktion } from "@prisma/client";

const RANG: Record<Role, number> = {
  ADMIN:          4,
  VORSITZ:        3,
  STELLVERTRETER: 3,
  MITGLIED:       2,
  ERSATZMITGLIED: 1,
  // JAV und SBV stehen bewusst außerhalb der normalen Rangleiter (0 = niedrigster Rang) –
  // der eigentliche Zugriff wird schon in middleware/auth.ts auf GET /api/sitzungen/*
  // beschränkt, dieser Rang ist nur eine zusätzliche Absicherung für erfordert()-Checks.
  JAV:            0,
  SBV:            0,
  // Externe Protokollführung: unterhalb aller – kommt nur über die Freigabe aus middleware/auth.ts durch
  EXTERN:        -1,
};

/**
 * Wirksamer Rang: Ein Ersatzmitglied zählt nur mit aktiver Vertretung als Mitglied,
 * sonst bleibt es beim lesenden Rang. Für Prüfungen im Handler, die nicht über
 * erfordert() laufen (z. B. Teile einer Antwort, Autorenschaft).
 */
export async function hatMindestrolle(benutzer: { sub: string; rolle: Role }, mindestRolle: Role): Promise<boolean> {
  if (benutzer.rolle === Role.ERSATZMITGLIED && RANG[mindestRolle] >= RANG[Role.MITGLIED]) {
    const aktiv = await prisma.benutzer.findUnique({
      where: { id: benutzer.sub },
      select: { istVertretungFuer: true },
    });
    return !!aktiv?.istVertretungFuer && RANG[Role.MITGLIED] >= RANG[mindestRolle];
  }
  return RANG[benutzer.rolle] >= RANG[mindestRolle];
}

/**
 * Gibt einen Hook zurück, der mindestens die angegebene Rolle erfordert.
 *
 * Beispiel:
 *   app.delete("/api/dokumente/:id", { preHandler: [authenticate, erfordert("VORSITZ")] }, ...)
 */
export function erfordert(mindestRolle: Role) {
  const pruefen = async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const benutzer = request.benutzer;
    if (!benutzer) {
      return reply.status(401).send({ fehler: "Nicht authentifiziert" });
    }

    // Externe Protokollführung: nur auf geprüften Sitzungsrouten (middleware/auth.ts) und dort
    // höchstens mit den Rechten eines Mitglieds (Protokoll, Anwesenheit) – nie Vorsitz-Aktionen
    if (benutzer.rolle === Role.EXTERN) {
      if (request.externFreigabe && RANG[mindestRolle] <= RANG[Role.MITGLIED]) return;
      await auditZugriffVerweigert(request);
      return reply.status(403).send({ fehler: "Keine Berechtigung" });
    }

    // Ersatzmitglied: nur Zugriff wenn aktiv als Vertretung – dann mit den Rechten eines Mitglieds
    if (!(await hatMindestrolle(benutzer, mindestRolle))) {
      await auditZugriffVerweigert(request);
      const ohneVertretung = benutzer.rolle === Role.ERSATZMITGLIED && RANG[mindestRolle] === RANG[Role.MITGLIED];
      return reply.status(403).send({ fehler: ohneVertretung ? "Nur lesender Zugriff ohne aktive Vertretung" : "Keine Berechtigung" });
    }
  };
  // Für die Rechte-Übersicht der Rollentests (test/rechte.test.ts) ablesbar
  return Object.assign(pruefen, { mindestRolle });
}

async function auditZugriffVerweigert(request: FastifyRequest): Promise<void> {
  await prisma.auditLog.create({
    data: {
      benutzerId: request.benutzer?.sub ?? null,
      aktion:     AuditAktion.ZUGRIFF_VERWEIGERT,
      ip:         request.ip,
      userAgent:  request.headers["user-agent"] ?? null,
      details:    { pfad: request.url, methode: request.method },
    },
  }).catch(() => {}); // Audit-Fehler nie nach oben weitergeben
}
