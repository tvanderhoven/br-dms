/**
 * Kummerkasten-Routen
 *
 * POST   /api/kummerkasten      – Anliegen einreichen (ÖFFENTLICH, kein Login, rate-limited)
 * GET    /api/kummerkasten      – alle Einträge (BR-intern)
 * PATCH  /api/kummerkasten/:id  – Status/Notiz bearbeiten (BR-intern)
 * DELETE /api/kummerkasten/:id  – Eintrag löschen (BR-intern)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { KummerkastenStatus } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";

const EINTRAG_SELECT = {
  id:              true,
  nachricht:       true,
  absenderName:    true,
  status:          true,
  notiz:           true,
  bearbeitetVon:   { select: { id: true, name: true } },
  bearbeitetAm:    true,
  erstelltAm:      true,
} as const;

interface EinreichenBody {
  nachricht:    string;
  absenderName?: string;
  // Honeypot-Feld – für Menschen unsichtbar (CSS in der Public-Seite), Bots
  // füllen sowas oft blind aus. Kein Sicherheitsversprechen, nur ein
  // billiger Filter gegen simple Spam-Bots.
  webseite?: string;
}

export async function kummerkastenRouten(app: FastifyInstance): Promise<void> {

  // ── POST / – Anliegen einreichen (öffentlich, ohne Login) ──────────
  app.post<{ Body: EinreichenBody }>(
    "/",
    {
      // Rate-Limit statt Login-Pflicht als Missbrauchsschutz – die Seite
      // ist bewusst anonym erreichbar (siehe Layout/App.tsx: kein geschuetzt()).
      config: {
        rateLimit: { max: 5, timeWindow: "10 minutes" },
      },
      schema: {
        body: {
          type: "object",
          required: ["nachricht"],
          properties: {
            nachricht:    { type: "string", minLength: 1, maxLength: 5000 },
            absenderName: { type: "string", maxLength: 200 },
            webseite:     { type: "string", maxLength: 200 },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: EinreichenBody }>, reply: FastifyReply) => {
      const { nachricht, absenderName, webseite } = request.body;

      // Honeypot ausgefüllt → stiller Erfolg vortäuschen, nichts speichern
      if (webseite && webseite.trim()) {
        return reply.status(201).send({ ok: true });
      }

      if (!nachricht.trim()) {
        return reply.status(400).send({ fehler: "nachricht ist ein Pflichtfeld" });
      }

      await prisma.kummerkastenEintrag.create({
        data: {
          nachricht:    nachricht.trim(),
          absenderName: absenderName?.trim() || null,
        },
      });

      return reply.status(201).send({ ok: true });
    }
  );

  // ── GET / – alle Einträge (BR-intern) ───────────────────────────
  app.get("/", { preHandler: [authenticate] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const eintraege = await prisma.kummerkastenEintrag.findMany({
        select: EINTRAG_SELECT,
        orderBy: { erstelltAm: "desc" },
      });
      return reply.send(eintraege);
    }
  );

  // ── PATCH /:id – Status/Notiz bearbeiten (BR-intern) ────────────
  app.patch<{ Params: { id: string }; Body: { status?: KummerkastenStatus; notiz?: string | null } }>(
    "/:id",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { id } = request.params;
      const { status, notiz } = request.body;

      const vorhanden = await prisma.kummerkastenEintrag.findUnique({ where: { id } });
      if (!vorhanden) return reply.status(404).send({ fehler: "Eintrag nicht gefunden" });

      const aktualisiert = await prisma.kummerkastenEintrag.update({
        where: { id },
        data: {
          ...(status !== undefined ? { status } : {}),
          ...(notiz  !== undefined ? { notiz: notiz?.trim() || null } : {}),
          bearbeitetVonId: request.benutzer.sub,
          bearbeitetAm:    new Date(),
        },
        select: EINTRAG_SELECT,
      });

      return reply.send(aktualisiert);
    }
  );

  // ── DELETE /:id – Eintrag löschen (BR-intern) ───────────────────
  app.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const vorhanden = await prisma.kummerkastenEintrag.findUnique({ where: { id: request.params.id } });
      if (!vorhanden) return reply.status(404).send({ fehler: "Eintrag nicht gefunden" });
      await prisma.kummerkastenEintrag.delete({ where: { id: request.params.id } });
      return reply.send({ ok: true });
    }
  );
}
