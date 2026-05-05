/**
 * Nachrichten-Routen – Interne Member-Inbox
 *
 * GET    /api/nachrichten              – Alle Nachrichten des aktuellen Benutzers
 * POST   /api/nachrichten              – Neue Nachricht senden
 * PATCH  /api/nachrichten/:id/gelesen  – Als gelesen markieren
 * DELETE /api/nachrichten/:id          – Nachricht löschen
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { NachrichtTyp, AuditAktion } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";

const NACHRICHT_SELECT = {
  id: true,
  betreff: true,
  inhalt: true,
  typ: true,
  absender: {
    select: { id: true, name: true, email: true },
  },
  sitzung: {
    select: { id: true, titel: true, sitzungsdatum: true },
  },
  pdfDateiname: true,
  gelesen: true,
  gelesenAm: true,
  erstelltAm: true,
} as const;

export async function nachrichtenRouten(app: FastifyInstance): Promise<void> {

  // ── GET / – Alle Nachrichten des Benutzers ─────────────────────
  app.get(
    "/",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const nachrichten = await prisma.nachricht.findMany({
        where: { empfaengerId: request.benutzer.sub },
        select: NACHRICHT_SELECT,
        orderBy: { erstelltAm: "desc" },
      });
      return reply.send(nachrichten);
    }
  );

  // ── GET /gesendet – Gesendete Nachrichten ─────────────────────
  app.get(
    "/gesendet",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const nachrichten = await prisma.nachricht.findMany({
        where: { absenderId: request.benutzer.sub },
        select: {
          ...NACHRICHT_SELECT,
          empfaenger: { select: { id: true, name: true, email: true } },
        },
        orderBy: { erstelltAm: "desc" },
        take: 100,
      });
      return reply.send(nachrichten);
    }
  );

  // ── POST / – Neue Nachricht senden ─────────────────────────────
  app.post(
    "/",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { betreff, inhalt, typ, empfaengerId, sitzungId, alle } = request.body as {
        betreff: string;
        inhalt: string;
        typ?: NachrichtTyp;
        empfaengerId?: string;
        sitzungId?: string;
        alle?: boolean;
      };

      if (!betreff || !inhalt) {
        return reply.status(400).send({ fehler: "betreff und inhalt sind Pflichtfelder" });
      }

      let empfaengerIds: string[] = [];
      if (empfaengerId) {
        empfaengerIds = [empfaengerId];
      } else if (alle || sitzungId) {
        const brMitglieder = await prisma.benutzer.findMany({
          where: { aktiv: true, id: { not: request.benutzer.sub } },
          select: { id: true },
        });
        empfaengerIds = brMitglieder.map(b => b.id);
      } else {
        return reply.status(400).send({ fehler: "empfaengerId oder alle:true erforderlich" });
      }

      const nachrichten = await prisma.$transaction(
        empfaengerIds.map(empfaengerId =>
          prisma.nachricht.create({
            data: {
              betreff,
              inhalt,
              typ: typ ?? NachrichtTyp.NORMAL,
              absenderId: request.benutzer.sub,
              empfaengerId,
              sitzungId: sitzungId ?? null,
            },
            select: NACHRICHT_SELECT,
          })
        )
      );

      await prisma.auditLog.create({
        data: {
          benutzerId: request.benutzer.sub,
          aktion: AuditAktion.NACHRICHT_GESENDET,
          ip: request.ip,
          userAgent: request.headers["user-agent"] ?? null,
          details: { betreff, empfaengerCount: nachrichten.length },
        },
      });

      return reply.status(201).send(nachrichten.length === 1 ? nachrichten[0] : nachrichten);
    }
  );

  // ── PATCH /:id/gelesen – Als gelesen markieren ─────────────────
  app.patch(
    "/:id/gelesen",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      const nachricht = await prisma.nachricht.findFirst({
        where: { id, empfaengerId: request.benutzer.sub },
      });

      if (!nachricht) {
        return reply.status(404).send({ fehler: "Nachricht nicht gefunden" });
      }

      if (nachricht.gelesen) {
        return reply.send(nachricht);
      }

      const aktualisiert = await prisma.nachricht.update({
        where: { id },
        data: {
          gelesen: true,
          gelesenAm: new Date(),
        },
        select: NACHRICHT_SELECT,
      });

      return reply.send(aktualisiert);
    }
  );

  // ── DELETE /:id – Nachricht löschen ────────────────────────────
  app.delete(
    "/:id",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      const nachricht = await prisma.nachricht.findFirst({
        where: { id, empfaengerId: request.benutzer.sub },
      });

      if (!nachricht) {
        return reply.status(404).send({ fehler: "Nachricht nicht gefunden" });
      }

      await prisma.nachricht.delete({ where: { id } });

      return reply.send({ nachricht: "Nachricht gelöscht" });
    }
  );
}
