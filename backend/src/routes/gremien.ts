/**
 * Gremien-Register (Paket 5)
 *
 * GET    /api/gremien        – Liste (alle authentifizierten Benutzer)
 * POST   /api/gremien        – neues Gremium anlegen (nur VORSITZ)
 * PUT    /api/gremien/:id    – Gremium bearbeiten (nur VORSITZ)
 * DELETE /api/gremien/:id    – Gremium löschen (nur VORSITZ, nur ohne Verknüpfungen)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { AuditAktion, Role } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { erfordert } from "../middleware/rbac.js";

interface ListenFilter {
  aktiv?: string;
}

interface NeuesGremium {
  name:            string;
  rechtsgrundlage?: string;
  bemerkung?:      string;
  aktiv?:          boolean;
}

interface GremiumUpdate {
  name?:            string;
  rechtsgrundlage?: string | null;
  bemerkung?:       string | null;
  aktiv?:           boolean;
}

export async function gremienRouten(app: FastifyInstance): Promise<void> {

  // ── GET / – Liste ────────────────────────────────────────────────
  app.get<{ Querystring: ListenFilter }>(
    "/",
    { preHandler: [authenticate] },
    async (request: FastifyRequest<{ Querystring: ListenFilter }>, reply: FastifyReply) => {
      const { aktiv } = request.query;
      const gremien = await prisma.gremium.findMany({
        where: aktiv !== undefined ? { aktiv: aktiv === "true" } : {},
        include: {
          _count: { select: { sitzungen: true, fremdprotokolle: true } },
        },
        orderBy: [{ name: "asc" }],
      });
      return reply.send(gremien);
    }
  );

  // ── POST / – neues Gremium anlegen ──────────────────────────────
  app.post<{ Body: NeuesGremium }>(
    "/",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request: FastifyRequest<{ Body: NeuesGremium }>, reply: FastifyReply) => {
      const { name, rechtsgrundlage, bemerkung, aktiv } = request.body;

      if (!name?.trim()) return reply.status(400).send({ fehler: "name ist ein Pflichtfeld" });

      const vorhanden = await prisma.gremium.findUnique({ where: { name: name.trim() } });
      if (vorhanden) return reply.status(409).send({ fehler: "Ein Gremium mit diesem Namen existiert bereits" });

      const gremium = await prisma.gremium.create({
        data: {
          name:            name.trim(),
          rechtsgrundlage: rechtsgrundlage?.trim() || null,
          bemerkung:       bemerkung?.trim() || null,
          aktiv:           aktiv ?? true,
        },
      });

      await prisma.auditLog.create({
        data: {
          benutzerId: request.benutzer.sub,
          aktion:     AuditAktion.GREMIUM_ERSTELLT,
          ip:         request.ip,
          userAgent:  request.headers["user-agent"] ?? null,
          details:    { id: gremium.id, name: gremium.name },
        },
      }).catch(() => {});

      return reply.status(201).send(gremium);
    }
  );

  // ── PUT /:id – Gremium bearbeiten ───────────────────────────────
  app.put<{ Params: { id: string }; Body: GremiumUpdate }>(
    "/:id",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request: FastifyRequest<{ Params: { id: string }; Body: GremiumUpdate }>, reply: FastifyReply) => {
      const { id } = request.params;
      const { name, rechtsgrundlage, bemerkung, aktiv } = request.body;

      const vorhandenes = await prisma.gremium.findUnique({ where: { id } });
      if (!vorhandenes) return reply.status(404).send({ fehler: "Gremium nicht gefunden" });

      if (name !== undefined && name.trim() !== vorhandenes.name) {
        const kollision = await prisma.gremium.findUnique({ where: { name: name.trim() } });
        if (kollision) return reply.status(409).send({ fehler: "Ein Gremium mit diesem Namen existiert bereits" });
      }

      const aktualisiert = await prisma.gremium.update({
        where: { id },
        data: {
          ...(name            !== undefined ? { name: name.trim() } : {}),
          ...(rechtsgrundlage !== undefined ? { rechtsgrundlage: rechtsgrundlage?.trim() || null } : {}),
          ...(bemerkung       !== undefined ? { bemerkung: bemerkung?.trim() || null } : {}),
          ...(aktiv           !== undefined ? { aktiv } : {}),
        },
      });

      await prisma.auditLog.create({
        data: {
          benutzerId: request.benutzer.sub,
          aktion:     AuditAktion.GREMIUM_AKTUALISIERT,
          ip:         request.ip,
          userAgent:  request.headers["user-agent"] ?? null,
          details:    { id: aktualisiert.id, name: aktualisiert.name },
        },
      }).catch(() => {});

      return reply.send(aktualisiert);
    }
  );

  // ── DELETE /:id – Gremium löschen ───────────────────────────────
  app.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;

      const vorhandenes = await prisma.gremium.findUnique({
        where:   { id },
        include: { _count: { select: { sitzungen: true, fremdprotokolle: true } } },
      });
      if (!vorhandenes) return reply.status(404).send({ fehler: "Gremium nicht gefunden" });

      const { sitzungen, fremdprotokolle } = vorhandenes._count;
      if (sitzungen > 0 || fremdprotokolle > 0) {
        return reply.status(409).send({
          fehler: `Gremium kann nicht gelöscht werden: noch ${sitzungen} Sitzung(en) und ${fremdprotokolle} Fremdprotokoll(e) verknüpft. Stattdessen deaktivieren.`,
        });
      }

      await prisma.gremium.delete({ where: { id } });

      await prisma.auditLog.create({
        data: {
          benutzerId: request.benutzer.sub,
          aktion:     AuditAktion.GREMIUM_GELOESCHT,
          ip:         request.ip,
          userAgent:  request.headers["user-agent"] ?? null,
          details:    { id: vorhandenes.id, name: vorhandenes.name },
        },
      }).catch(() => {});

      return reply.send({ ok: true });
    }
  );

  // ── GET /:id/mitglieder – Mitgliederliste ───────────────────────
  app.get<{ Params: { id: string } }>(
    "/:id/mitglieder",
    { preHandler: [authenticate] },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;
      const mitglieder = await prisma.gremiumMitglied.findMany({
        where:   { gremiumId: id },
        include: { benutzer: { select: { id: true, name: true, rolle: true } } },
        orderBy: { benutzer: { name: "asc" } },
      });
      return reply.send(mitglieder.map(m => m.benutzer));
    }
  );

  // ── POST /:id/mitglieder – Mitglied hinzufügen ──────────────────
  app.post<{ Params: { id: string }; Body: { benutzerId: string } }>(
    "/:id/mitglieder",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request: FastifyRequest<{ Params: { id: string }; Body: { benutzerId: string } }>, reply: FastifyReply) => {
      const { id } = request.params;
      const { benutzerId } = request.body;
      if (!benutzerId) return reply.status(400).send({ fehler: "benutzerId ist ein Pflichtfeld" });

      const gremium = await prisma.gremium.findUnique({ where: { id } });
      if (!gremium) return reply.status(404).send({ fehler: "Gremium nicht gefunden" });

      const benutzer = await prisma.benutzer.findUnique({ where: { id: benutzerId } });
      if (!benutzer) return reply.status(404).send({ fehler: "Benutzer nicht gefunden" });

      const vorhanden = await prisma.gremiumMitglied.findUnique({
        where: { gremiumId_benutzerId: { gremiumId: id, benutzerId } },
      });
      if (vorhanden) return reply.status(409).send({ fehler: "Benutzer ist bereits Mitglied dieses Gremiums" });

      await prisma.gremiumMitglied.create({ data: { gremiumId: id, benutzerId } });

      await prisma.auditLog.create({
        data: {
          benutzerId: request.benutzer.sub,
          aktion:     AuditAktion.GREMIUM_MITGLIED_HINZUGEFUEGT,
          ip:         request.ip,
          userAgent:  request.headers["user-agent"] ?? null,
          details:    { gremiumId: id, gremium: gremium.name, mitglied: benutzer.name },
        },
      }).catch(() => {});

      return reply.status(201).send({ ok: true });
    }
  );

  // ── DELETE /:id/mitglieder/:benutzerId – Mitglied entfernen ─────
  app.delete<{ Params: { id: string; benutzerId: string } }>(
    "/:id/mitglieder/:benutzerId",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request: FastifyRequest<{ Params: { id: string; benutzerId: string } }>, reply: FastifyReply) => {
      const { id, benutzerId } = request.params;

      const vorhanden = await prisma.gremiumMitglied.findUnique({
        where: { gremiumId_benutzerId: { gremiumId: id, benutzerId } },
      });
      if (!vorhanden) return reply.status(404).send({ fehler: "Mitgliedschaft nicht gefunden" });

      const [gremium, benutzer] = await Promise.all([
        prisma.gremium.findUnique({ where: { id } }),
        prisma.benutzer.findUnique({ where: { id: benutzerId } }),
      ]);

      await prisma.gremiumMitglied.delete({ where: { gremiumId_benutzerId: { gremiumId: id, benutzerId } } });

      await prisma.auditLog.create({
        data: {
          benutzerId: request.benutzer.sub,
          aktion:     AuditAktion.GREMIUM_MITGLIED_ENTFERNT,
          ip:         request.ip,
          userAgent:  request.headers["user-agent"] ?? null,
          details:    { gremiumId: id, gremium: gremium?.name, mitglied: benutzer?.name },
        },
      }).catch(() => {});

      return reply.send({ ok: true });
    }
  );
}
