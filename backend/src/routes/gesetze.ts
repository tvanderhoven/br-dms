/**
 * Gesetzestexte (statischer Import von gesetze-im-internet.de)
 *
 * GET  /api/gesetze/status          – Übersicht Quellen (Anzahl Paragraphen, Stand)
 * POST /api/gesetze/aktualisieren   – Import anstoßen, ohne Benachrichtigung (ADMIN)
 * POST /api/gesetze/worker-testen   – kompletter automatischer Ablauf inkl. Benachrichtigung (ADMIN)
 * GET  /api/gesetze/:id             – einzelner Paragraph (Volltext)
 *
 * Läuft automatisch monatlich (siehe workers/gesetze.worker.ts) – VORSITZ/STELLVERTRETER
 * bekommen dann eine Nachricht, wenn sich an einem bereits bekannten Paragraphen
 * wirklich etwas geändert hat.
 */

import { FastifyInstance } from "fastify";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { erfordert } from "../middleware/rbac.js";
import { Role } from "@prisma/client";
import { GESETZE_QUELLEN, alleGesetzeAktualisieren } from "../services/gesetze.service.js";
import { GesetzeWorker } from "../workers/gesetze.worker.js";

export async function gesetzeRouten(app: FastifyInstance): Promise<void> {

  // ── GET /status – Übersicht je Gesetz ───────────────────────────
  app.get(
    "/status",
    { preHandler: [authenticate] },
    async (_request, reply) => {
      const status = await Promise.all(
        GESETZE_QUELLEN.map(async q => {
          const anzahl = await prisma.gesetzParagraph.count({ where: { gesetzSlug: q.slug } });
          const letzter = await prisma.gesetzParagraph.findFirst({
            where: { gesetzSlug: q.slug },
            orderBy: { aktualisiertAm: "desc" },
            select: { aktualisiertAm: true },
          });
          return {
            slug: q.slug,
            name: q.name,
            anzahl,
            aktualisiertAm: letzter?.aktualisiertAm ?? null,
          };
        })
      );
      return reply.send(status);
    }
  );

  // ── POST /aktualisieren – Import anstoßen ───────────────────────
  app.post(
    "/aktualisieren",
    { preHandler: [authenticate, erfordert(Role.ADMIN)] },
    async (_request, reply) => {
      const ergebnisse = await alleGesetzeAktualisieren();
      return reply.send({ ergebnisse });
    }
  );

  // ── POST /worker-testen – kompletter Ablauf inkl. Benachrichtigung ──
  app.post(
    "/worker-testen",
    { preHandler: [authenticate, erfordert(Role.ADMIN)] },
    async (_request, reply) => {
      const ergebnis = await new GesetzeWorker().run();
      return reply.send(ergebnis);
    }
  );

  // ── GET /:id – einzelner Paragraph ───────────────────────────────
  app.get<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const paragraph = await prisma.gesetzParagraph.findUnique({ where: { id: request.params.id } });
      if (!paragraph) return reply.status(404).send({ fehler: "Paragraph nicht gefunden" });
      return reply.send(paragraph);
    }
  );
}
