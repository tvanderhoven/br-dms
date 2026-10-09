/**
 * Kommentar-Routen – Kommentare pro Sitzung, TOP oder Dokument
 *
 * GET    /api/sitzungen/:id/kommentare       – Alle Kommentare zur Sitzung
 * POST   /api/sitzungen/:id/kommentare       – Kommentar hinzufügen
 * DELETE /api/sitzungen/:id/kommentare/:kid  – Kommentar löschen
 *
 * GET    /api/tops/:topId/kommentare         – Alle Kommentare zu einem TOP
 * POST   /api/tops/:topId/kommentare         – Kommentar zu TOP hinzufügen
 *
 * GET    /api/dokumente/:dokumentId/kommentare – Alle Kommentare zu Dokument
 * POST   /api/dokumente/:dokumentId/kommentare – Kommentar zu Dokument hinzufügen
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import prisma from "../lib/prisma.js";
import { dokumentZugriffPruefen } from "../lib/vertraulich.js";
import { authenticate } from "../middleware/auth.js";

const KOMMENTAR_SELECT = {
  id: true,
  inhalt: true,
  inhaltJson: true,
  erstelltAm: true,
  aktualisiertAm: true,
  autor: {
    select: { id: true, name: true, email: true },
  },
} as const;

export async function kommentarRouten(app: FastifyInstance): Promise<void> {

  // ── GET /sitzungen/:id/kommentare ─────────────────────────────
  app.get(
    "/sitzungen/:id/kommentare",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      const kommentare = await prisma.kommentar.findMany({
        where: { sitzungId: id },
        select: KOMMENTAR_SELECT,
        orderBy: { erstelltAm: "asc" },
      });

      return reply.send(kommentare);
    }
  );

  // ── POST /sitzungen/:id/kommentare ────────────────────────────
  app.post(
    "/sitzungen/:id/kommentare",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const { inhalt, inhaltJson } = request.body as { inhalt: string; inhaltJson?: object };

      if (!inhalt || inhalt.trim().length === 0) {
        return reply.status(400).send({ fehler: "inhalt ist erforderlich" });
      }

      const sitzung = await prisma.sitzung.findUnique({
        where: { id },
        select: { id: true },
      });

      if (!sitzung) {
        return reply.status(404).send({ fehler: "Sitzung nicht gefunden" });
      }

      const kommentar = await prisma.kommentar.create({
        data: {
          inhalt,
          inhaltJson: inhaltJson ?? undefined,
          sitzungId: id,
          autorId: request.benutzer.sub,
        },
        select: KOMMENTAR_SELECT,
      });

      return reply.status(201).send(kommentar);
    }
  );

  // ── DELETE /sitzungen/:id/kommentare/:kid ─────────────────────
  app.delete(
    "/sitzungen/:id/kommentare/:kid",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, kid } = request.params as { id: string; kid: string };

      const kommentar = await prisma.kommentar.findFirst({
        where: { id: kid, sitzungId: id },
      });

      if (!kommentar) {
        return reply.status(404).send({ fehler: "Kommentar nicht gefunden" });
      }

      // Nur Autor oder ADMIN/VORSITZ/STELLVERTRETER kann löschen
      if (kommentar.autorId !== request.benutzer.sub &&
          request.benutzer.rolle !== "ADMIN" &&
          request.benutzer.rolle !== "VORSITZ" &&
          request.benutzer.rolle !== "STELLVERTRETER") {
        return reply.status(403).send({ fehler: "Keine Berechtigung zum Löschen" });
      }

      await prisma.kommentar.delete({ where: { id: kid } });

      return reply.send({ nachricht: "Kommentar gelöscht" });
    }
  );

  // ── GET /tops/:topId/kommentare ───────────────────────────────
  app.get(
    "/tops/:topId/kommentare",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { topId } = request.params as { topId: string };

      const kommentare = await prisma.kommentar.findMany({
        where: { topId },
        select: KOMMENTAR_SELECT,
        orderBy: { erstelltAm: "asc" },
      });

      return reply.send(kommentare);
    }
  );

  // ── POST /tops/:topId/kommentare ──────────────────────────────
  app.post(
    "/tops/:topId/kommentare",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { topId } = request.params as { topId: string };
      const { inhalt, inhaltJson } = request.body as { inhalt: string; inhaltJson?: object };

      if (!inhalt || inhalt.trim().length === 0) {
        return reply.status(400).send({ fehler: "inhalt ist erforderlich" });
      }

      const top = await prisma.tOP.findUnique({
        where: { id: topId },
        select: { id: true },
      });

      if (!top) {
        return reply.status(404).send({ fehler: "TOP nicht gefunden" });
      }

      const kommentar = await prisma.kommentar.create({
        data: {
          inhalt,
          inhaltJson: inhaltJson ?? undefined,
          topId,
          autorId: request.benutzer.sub,
        },
        select: KOMMENTAR_SELECT,
      });

      return reply.status(201).send(kommentar);
    }
  );

  // ── DELETE /tops/:topId/kommentare/:kid ──────────────────────────
  app.delete(
    "/tops/:topId/kommentare/:kid",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { topId, kid } = request.params as { topId: string; kid: string };

      const kommentar = await prisma.kommentar.findFirst({
        where: { id: kid, topId },
      });

      if (!kommentar) {
        return reply.status(404).send({ fehler: "Kommentar nicht gefunden" });
      }

      if (kommentar.autorId !== request.benutzer.sub &&
          request.benutzer.rolle !== "ADMIN" &&
          request.benutzer.rolle !== "VORSITZ" &&
          request.benutzer.rolle !== "STELLVERTRETER") {
        return reply.status(403).send({ fehler: "Keine Berechtigung zum Löschen" });
      }

      await prisma.kommentar.delete({ where: { id: kid } });

      return reply.send({ nachricht: "Kommentar gelöscht" });
    }
  );

  // ── GET /dokumente/:dokumentId/kommentare ─────────────────────
  app.get(
    "/dokumente/:dokumentId/kommentare",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { dokumentId } = request.params as { dokumentId: string };
      if (!(await dokumentZugriffPruefen(dokumentId, request.benutzer, reply))) return reply;

      const kommentare = await prisma.kommentar.findMany({
        where: { dokumentId },
        select: KOMMENTAR_SELECT,
        orderBy: { erstelltAm: "asc" },
      });

      return reply.send(kommentare);
    }
  );

  // ── POST /dokumente/:dokumentId/kommentare ────────────────────
  app.post(
    "/dokumente/:dokumentId/kommentare",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { dokumentId } = request.params as { dokumentId: string };
      const { inhalt, inhaltJson } = request.body as { inhalt: string; inhaltJson?: object };

      if (!inhalt || inhalt.trim().length === 0) {
        return reply.status(400).send({ fehler: "inhalt ist erforderlich" });
      }

      if (!(await dokumentZugriffPruefen(dokumentId, request.benutzer, reply))) return reply;
      const dokument = await prisma.dokument.findUnique({
        where: { id: dokumentId },
        select: { id: true },
      });

      if (!dokument) {
        return reply.status(404).send({ fehler: "Dokument nicht gefunden" });
      }

      const kommentar = await prisma.kommentar.create({
        data: {
          inhalt,
          inhaltJson: inhaltJson ?? undefined,
          dokumentId,
          autorId: request.benutzer.sub,
        },
        select: KOMMENTAR_SELECT,
      });

      return reply.status(201).send(kommentar);
    }
  );

  // ── DELETE /dokumente/:dokumentId/kommentare/:kid ─────────────
  app.delete(
    "/dokumente/:dokumentId/kommentare/:kid",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { dokumentId, kid } = request.params as { dokumentId: string; kid: string };

      const kommentar = await prisma.kommentar.findFirst({
        where: { id: kid, dokumentId },
      });

      if (!kommentar) {
        return reply.status(404).send({ fehler: "Kommentar nicht gefunden" });
      }

      if (kommentar.autorId !== request.benutzer.sub &&
          request.benutzer.rolle !== "ADMIN" &&
          request.benutzer.rolle !== "VORSITZ" &&
          request.benutzer.rolle !== "STELLVERTRETER") {
        return reply.status(403).send({ fehler: "Keine Berechtigung zum Löschen" });
      }

      await prisma.kommentar.delete({ where: { id: kid } });

      return reply.send({ nachricht: "Kommentar gelöscht" });
    }
  );
}
