/**
 * Audit-Log – nur für ADMIN und VORSITZ
 *
 * GET /api/audit   – paginierte Liste mit Filtern
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { AuditAktion, Role } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { erfordert } from "../middleware/rbac.js";

const SEITEN_GROESSE = 50;

interface AuditQuery {
  seite?:      string;
  benutzerId?: string;
  aktion?:     string;
  von?:        string;
  bis?:        string;
}

export async function auditRouten(app: FastifyInstance): Promise<void> {

  app.get<{ Querystring: AuditQuery }>(
    "/",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request: FastifyRequest<{ Querystring: AuditQuery }>, reply: FastifyReply) => {
      const { seite = "1", benutzerId, aktion, von, bis } = request.query;
      const page  = Math.max(1, parseInt(seite, 10) || 1);
      const skip  = (page - 1) * SEITEN_GROESSE;

      const where: Record<string, unknown> = {};

      if (benutzerId) where.benutzerId = benutzerId;

      if (aktion && Object.values(AuditAktion).includes(aktion as AuditAktion)) {
        where.aktion = aktion as AuditAktion;
      }

      if (von || bis) {
        where.zeitpunkt = {
          ...(von ? { gte: new Date(von) } : {}),
          ...(bis ? { lte: new Date(bis + "T23:59:59.999Z") } : {}),
        };
      }

      const [eintraege, gesamt] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          orderBy: { zeitpunkt: "desc" },
          skip,
          take: SEITEN_GROESSE,
          select: {
            id:        true,
            aktion:    true,
            ip:        true,
            details:   true,
            zeitpunkt: true,
            benutzer:  { select: { id: true, name: true, email: true } },
            dokument:  { select: { id: true, titel: true, alias: true } },
            sitzung:   { select: { id: true, titel: true } },
          },
        }),
        prisma.auditLog.count({ where }),
      ]);

      return reply.send({
        eintraege,
        gesamt,
        seite: page,
        seiten: Math.ceil(gesamt / SEITEN_GROESSE),
      });
    }
  );
}
