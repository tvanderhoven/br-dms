/**
 * Anwesenheits-Routen – Verwaltung der Teilnahme an Sitzungen
 *
 * GET    /api/sitzungen/:id/anwesenheit        – Anwesenheitsliste abrufen
 * POST   /api/sitzungen/:id/anwesenheit        – Eintrag erstellen/aktualisieren
 * DELETE /api/sitzungen/:id/anwesenheit/:uid   – Eintrag löschen
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { AnwesenheitsStatus, Role } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { erfordert } from "../middleware/rbac.js";

const ANWESENHEIT_SELECT = {
  id: true,
  status: true,
  vertretungFuer: {
    select: { id: true, name: true },
  },
  benutzer: {
    select: { id: true, name: true, rolle: true },
  },
  erstelltAm: true,
  aktualisiertAm: true,
} as const;

export async function anwesenheitRouten(app: FastifyInstance): Promise<void> {

  // ── GET /:id/anwesenheit – Liste ───────────────────────────────
  app.get(
    "/:id/anwesenheit",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      const anwesenheiten = await prisma.anwesenheit.findMany({
        where: { sitzungId: id },
        select: ANWESENHEIT_SELECT,
        orderBy: { benutzer: { name: "asc" } },
      });

      // Alle BR-Mitglieder laden (für vollständige Liste) – ADMIN ist ein rein
      // funktionaler Zugang, kein echtes Sitzungsmitglied, taucht hier nicht auf.
      const alleMitglieder = await prisma.benutzer.findMany({
        where: { aktiv: true, rolle: { not: Role.ADMIN } },
        select: { id: true, name: true, rolle: true, istVertretungFuer: true },
        orderBy: { name: "asc" },
      });

      // Anwesenheiten zuordnen
      const anwesendMap = new Map(anwesenheiten.map(a => [a.benutzer.id, a]));
      const liste = alleMitglieder.map(m => ({
        benutzer: m,
        anwesenheit: anwesendMap.get(m.id) ?? null,
      }));

      return reply.send(liste);
    }
  );

  // ── POST /:id/anwesenheit – Eintrag setzen ─────────────────────
  app.post(
    "/:id/anwesenheit",
    { preHandler: [authenticate, erfordert(Role.MITGLIED)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const { benutzerId, status, vertretungFuerId } = request.body as {
        benutzerId: string;
        status: AnwesenheitsStatus;
        vertretungFuerId?: string;
      };

      const sitzung = await prisma.sitzung.findUnique({
        where: { id },
        select: { id: true },
      });

      if (!sitzung) {
        return reply.status(404).send({ fehler: "Sitzung nicht gefunden" });
      }

      const benutzer = await prisma.benutzer.findUnique({
        where: { id: benutzerId },
        select: { id: true, aktiv: true },
      });

      if (!benutzer || !benutzer.aktiv) {
        return reply.status(404).send({ fehler: "Benutzer nicht gefunden" });
      }

      // Nur ERSATZ_FUER braucht vertretungFuerId
      if (status === AnwesenheitsStatus.ERSATZ_FUER && !vertretungFuerId) {
        return reply.status(400).send({ fehler: "vertretungFuerId erforderlich für Ersatzmitglied" });
      }

      const anwesenheit = await prisma.anwesenheit.upsert({
        where: {
          sitzungId_benutzerId: {
            sitzungId: id,
            benutzerId: benutzerId,
          },
        },
        update: {
          status,
          vertretungFuerId: vertretungFuerId ?? null,
        },
        create: {
          sitzungId: id,
          benutzerId: benutzerId,
          status,
          vertretungFuerId: vertretungFuerId ?? null,
        },
        select: ANWESENHEIT_SELECT,
      });

      return reply.status(201).send(anwesenheit);
    }
  );

  // ── DELETE /:id/anwesenheit/:uid ───────────────────────────────
  app.delete(
    "/:id/anwesenheit/:uid",
    { preHandler: [authenticate, erfordert(Role.MITGLIED)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, uid } = request.params as { id: string; uid: string };

      const anwesenheit = await prisma.anwesenheit.findFirst({
        where: { id: uid, sitzungId: id },
      });

      if (!anwesenheit) {
        return reply.status(404).send({ fehler: "Eintrag nicht gefunden" });
      }

      await prisma.anwesenheit.delete({ where: { id: uid } });

      return reply.send({ nachricht: "Eintrag gelöscht" });
    }
  );
}
