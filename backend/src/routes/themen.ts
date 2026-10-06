/**
 * Themensammlung für Öffentlichkeitsarbeit
 * GET /api/themen?von=&bis=&stichwort=
 *
 * Liefert TOPs aus finalisierten/entwurfs-Protokollen deren Titel das Stichwort enthalten.
 * Gedacht für TOPs wie "Öffentlichkeitsarbeit" die öffentliche Kurztexte im ergebnis haben.
 */

import { FastifyInstance, FastifyRequest } from "fastify";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";

export async function themenRouten(app: FastifyInstance) {
  app.get<{ Querystring: { von?: string; bis?: string; stichwort?: string } }>(
    "/themen",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply) => {
      const { von, bis, stichwort = "öffentlich" } =
        (request as any).query as { von?: string; bis?: string; stichwort?: string };

      const vonDatum = von ? new Date(von) : new Date(new Date().getFullYear(), 0, 1);
      const bisDatum = bis ? new Date(bis) : new Date();
      bisDatum.setHours(23, 59, 59, 999);

      const tops = await prisma.tOP.findMany({
        where: {
          titel: { contains: stichwort.trim(), mode: "insensitive" },
          sitzung: {
            sitzungsdatum: { gte: vonDatum, lte: bisDatum },
            status: { in: ["PROTOKOLL_ENTWURF", "PROTOKOLL_FINAL", "ABGESCHLOSSEN"] },
          },
        },
        select: {
          id:           true,
          nummer:       true,
          titel:        true,
          ergebnis:     true,
          ergebnisJson: true,
          sitzung: {
            select: {
              id:            true,
              titel:         true,
              sitzungsdatum: true,
              status:        true,
            },
          },
        },
        orderBy: { sitzung: { sitzungsdatum: "asc" } },
      });

      return reply.send(tops);
    }
  );
}
