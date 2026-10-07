/**
 * Geschäftsordnung des Betriebsrats (§ 36 BetrVG)
 *
 * GET    /api/geschaeftsordnung        – Liste, neueste zuerst (alle authentifizierten Benutzer)
 * POST   /api/geschaeftsordnung        – neue Fassung anlegen (nur VORSITZ)
 * PUT    /api/geschaeftsordnung/:id    – Fassung bearbeiten (nur VORSITZ)
 * DELETE /api/geschaeftsordnung/:id    – Fassung löschen (nur VORSITZ)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { AuditAktion, Role } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { erfordert } from "../middleware/rbac.js";

interface NeueGeschaeftsordnung {
  beschlossenAm: string;
  bemerkung?:    string;
  dokumentId?:   string;
}

interface GeschaeftsordnungUpdate {
  beschlossenAm?: string;
  bemerkung?:     string | null;
  dokumentId?:    string | null;
}

const DOKUMENT_SELECT = { id: true, titel: true, dateiname: true };

export async function geschaeftsordnungRouten(app: FastifyInstance): Promise<void> {

  // ── GET / – Liste ────────────────────────────────────────────────
  app.get(
    "/",
    { preHandler: [authenticate] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const fassungen = await prisma.geschaeftsordnung.findMany({
        include: { dokument: { select: DOKUMENT_SELECT } },
        orderBy: [{ beschlossenAm: "desc" }],
      });
      return reply.send(fassungen);
    }
  );

  // ── POST / – neue Fassung anlegen ───────────────────────────────
  app.post<{ Body: NeueGeschaeftsordnung }>(
    "/",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request: FastifyRequest<{ Body: NeueGeschaeftsordnung }>, reply: FastifyReply) => {
      const { beschlossenAm, bemerkung, dokumentId } = request.body;

      if (!beschlossenAm) return reply.status(400).send({ fehler: "beschlossenAm ist ein Pflichtfeld" });

      if (dokumentId) {
        const dokument = await prisma.dokument.findUnique({ where: { id: dokumentId } });
        if (!dokument) return reply.status(404).send({ fehler: "Dokument nicht gefunden" });
      }

      const fassung = await prisma.geschaeftsordnung.create({
        data: {
          beschlossenAm: new Date(beschlossenAm),
          bemerkung:     bemerkung?.trim() || null,
          dokumentId:    dokumentId || null,
          erstelltVonId: request.benutzer.sub,
        },
        include: { dokument: { select: DOKUMENT_SELECT } },
      });

      await prisma.auditLog.create({
        data: {
          benutzerId: request.benutzer.sub,
          aktion:     AuditAktion.GESCHAEFTSORDNUNG_ERSTELLT,
          ip:         request.ip,
          userAgent:  request.headers["user-agent"] ?? null,
          details:    { id: fassung.id, beschlossenAm: fassung.beschlossenAm },
        },
      }).catch(() => {});

      return reply.status(201).send(fassung);
    }
  );

  // ── PUT /:id – Fassung bearbeiten ───────────────────────────────
  app.put<{ Params: { id: string }; Body: GeschaeftsordnungUpdate }>(
    "/:id",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request: FastifyRequest<{ Params: { id: string }; Body: GeschaeftsordnungUpdate }>, reply: FastifyReply) => {
      const { id } = request.params;
      const { beschlossenAm, bemerkung, dokumentId } = request.body;

      const vorhandene = await prisma.geschaeftsordnung.findUnique({ where: { id } });
      if (!vorhandene) return reply.status(404).send({ fehler: "Geschäftsordnung nicht gefunden" });

      if (dokumentId) {
        const dokument = await prisma.dokument.findUnique({ where: { id: dokumentId } });
        if (!dokument) return reply.status(404).send({ fehler: "Dokument nicht gefunden" });
      }

      const aktualisiert = await prisma.geschaeftsordnung.update({
        where: { id },
        data: {
          ...(beschlossenAm !== undefined ? { beschlossenAm: new Date(beschlossenAm) } : {}),
          ...(bemerkung     !== undefined ? { bemerkung: bemerkung?.trim() || null } : {}),
          ...(dokumentId    !== undefined ? { dokumentId: dokumentId || null } : {}),
        },
        include: { dokument: { select: DOKUMENT_SELECT } },
      });

      await prisma.auditLog.create({
        data: {
          benutzerId: request.benutzer.sub,
          aktion:     AuditAktion.GESCHAEFTSORDNUNG_AKTUALISIERT,
          ip:         request.ip,
          userAgent:  request.headers["user-agent"] ?? null,
          details:    { id: aktualisiert.id, beschlossenAm: aktualisiert.beschlossenAm },
        },
      }).catch(() => {});

      return reply.send(aktualisiert);
    }
  );

  // ── DELETE /:id – Fassung löschen ───────────────────────────────
  app.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;
      const vorhandene = await prisma.geschaeftsordnung.findUnique({ where: { id } });
      if (!vorhandene) return reply.status(404).send({ fehler: "Geschäftsordnung nicht gefunden" });

      await prisma.geschaeftsordnung.delete({ where: { id } });

      await prisma.auditLog.create({
        data: {
          benutzerId: request.benutzer.sub,
          aktion:     AuditAktion.GESCHAEFTSORDNUNG_GELOESCHT,
          ip:         request.ip,
          userAgent:  request.headers["user-agent"] ?? null,
          details:    { id: vorhandene.id, beschlossenAm: vorhandene.beschlossenAm },
        },
      }).catch(() => {});

      return reply.send({ ok: true });
    }
  );
}
