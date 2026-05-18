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
};

/**
 * Gibt einen Hook zurück, der mindestens die angegebene Rolle erfordert.
 *
 * Beispiel:
 *   app.delete("/api/dokumente/:id", { preHandler: [authenticate, erfordert("VORSITZ")] }, ...)
 */
export function erfordert(mindestRolle: Role) {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const benutzer = request.benutzer;
    if (!benutzer) {
      return reply.status(401).send({ fehler: "Nicht authentifiziert" });
    }

    // Ersatzmitglied: nur Zugriff wenn aktiv als Vertretung
    if (benutzer.rolle === Role.ERSATZMITGLIED && RANG[mindestRolle] >= RANG[Role.MITGLIED]) {
      const aktiv = await prisma.benutzer.findUnique({
        where: { id: benutzer.sub },
        select: { istVertretungFuer: true },
      });
      if (!aktiv?.istVertretungFuer) {
        await auditZugriffVerweigert(request);
        return reply.status(403).send({ fehler: "Nur lesender Zugriff ohne aktive Vertretung" });
      }
    }

    if (RANG[benutzer.rolle] < RANG[mindestRolle]) {
      await auditZugriffVerweigert(request);
      return reply.status(403).send({ fehler: "Keine Berechtigung" });
    }
  };
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
