/**
 * Protocol-Blocks-Routen – Strukturierte Protokoll-Verwaltung
 *
 * GET    /api/sitzungen/:id/blocks        – Alle Protocol-Blocks
 * POST   /api/sitzungen/:id/blocks        – Block hinzufügen
 * PATCH  /api/sitzungen/:id/blocks/:bid   – Block aktualisieren
 * DELETE /api/sitzungen/:id/blocks/:bid   – Block löschen
 * PATCH  /api/sitzungen/:id/blocks/reorder – Reihenfolge ändern
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { erfordert } from "../middleware/rbac.js";
import { Role } from "@prisma/client";

const BLOCK_SELECT = {
  id: true,
  typ: true,
  topId: true,
  top: {
    select: { id: true, nummer: true, titel: true },
  },
  inhalt: true,
  inhaltsJson: true,
  reihenfolge: true,
  erstelltAm: true,
  aktualisiertAm: true,
} as const;

export async function protocolRouten(app: FastifyInstance): Promise<void> {

  // ── GET /:id/blocks – Alle Blocks ──────────────────────────────
  app.get(
    "/:id/blocks",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      const blocks = await prisma.protocolBlock.findMany({
        where: { sitzungId: id },
        orderBy: { reihenfolge: "asc" },
      });

      return reply.send(blocks);
    }
  );

  // ── POST /:id/blocks – Block hinzufügen ────────────────────────
  app.post(
    "/:id/blocks",
    { preHandler: [authenticate, erfordert(Role.MITGLIED)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const { typ, topId, inhalt, inhaltsJson } = request.body as {
        typ: string;
        topId?: string;
        inhalt?: string;
        inhaltsJson?: object;
      };

      const sitzung = await prisma.sitzung.findUnique({
        where: { id },
        select: { id: true, status: true },
      });

      if (!sitzung) {
        return reply.status(404).send({ fehler: "Sitzung nicht gefunden" });
      }

      // Top prüfen falls angegeben
      if (topId) {
        const top = await prisma.tOP.findFirst({
          where: { id: topId, sitzungId: id },
        });
        if (!top) {
          return reply.status(400).send({ fehler: "TOP nicht gefunden" });
        }
      }

      // Nächste Reihenfolge ermitteln
      const maxReihenfolge = await prisma.protocolBlock.aggregate({
        where: { sitzungId: id },
        _max: { reihenfolge: true },
      });

      const block = await prisma.protocolBlock.create({
        data: {
          sitzungId: id,
          typ,
          topId: topId ?? undefined,
          inhalt: inhalt ?? undefined,
          inhaltsJson: inhaltsJson ?? undefined,
          reihenfolge: (maxReihenfolge._max.reihenfolge ?? -1) + 1,
        },
      });

      return reply.status(201).send(block);
    }
  );

  // ── PATCH /:id/blocks/:bid – Aktualisieren ─────────────────────
  app.patch(
    "/:id/blocks/:bid",
    { preHandler: [authenticate, erfordert(Role.MITGLIED)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, bid } = request.params as { id: string; bid: string };
      const { inhalt, inhaltsJson } = request.body as {
        inhalt?: string;
        inhaltsJson?: object;
      };

      const block = await prisma.protocolBlock.findFirst({
        where: { id: bid, sitzungId: id },
      });

      if (!block) {
        return reply.status(404).send({ fehler: "Block nicht gefunden" });
      }

      const aktualisiert = await prisma.protocolBlock.update({
        where: { id: bid },
        data: {
          ...(inhalt !== undefined && { inhalt }),
          ...(inhaltsJson !== undefined && { inhaltsJson: inhaltsJson ?? undefined }),
        },
      });

      return reply.send(aktualisiert);
    }
  );

  // ── DELETE /:id/blocks/:bid – Löschen ──────────────────────────
  app.delete(
    "/:id/blocks/:bid",
    { preHandler: [authenticate, erfordert(Role.MITGLIED)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, bid } = request.params as { id: string; bid: string };

      const block = await prisma.protocolBlock.findFirst({
        where: { id: bid, sitzungId: id },
      });

      if (!block) {
        return reply.status(404).send({ fehler: "Block nicht gefunden" });
      }

      await prisma.protocolBlock.delete({ where: { id: bid } });

      // Reihenfolge neu nummerieren
      const restBlocks = await prisma.protocolBlock.findMany({
        where: { sitzungId: id },
        orderBy: { reihenfolge: "asc" },
        select: { id: true },
      });

      await prisma.$transaction(
        restBlocks.map((b, i) =>
          prisma.protocolBlock.update({
            where: { id: b.id },
            data: { reihenfolge: i },
          })
        )
      );

      return reply.send({ nachricht: "Block gelöscht" });
    }
  );

  // ── PATCH /:id/blocks/reorder – Reihenfolge ────────────────────
  app.patch(
    "/:id/blocks/reorder",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const { blockIds } = request.body as { blockIds: string[] };

      await prisma.$transaction(
        blockIds.map((blockId, index) =>
          prisma.protocolBlock.update({
            where: { id: blockId },
            data: { reihenfolge: index },
          })
        )
      );

      const blocks = await prisma.protocolBlock.findMany({
        where: { sitzungId: id },
        orderBy: { reihenfolge: "asc" },
      });

      return reply.send(blocks);
    }
  );
}
