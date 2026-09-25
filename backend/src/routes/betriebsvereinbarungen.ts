/**
 * Betriebsvereinbarungs-Register
 *
 * GET    /api/betriebsvereinbarungen        – Liste (Filter: status, von/bis auf laufzeitEnde)
 * POST   /api/betriebsvereinbarungen        – neue BV anlegen (nur VORSITZ)
 * PUT    /api/betriebsvereinbarungen/:id    – BV bearbeiten (nur VORSITZ)
 * DELETE /api/betriebsvereinbarungen/:id    – BV löschen (nur VORSITZ)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { BVStatus, AuditAktion, Role, Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { erfordert } from "../middleware/rbac.js";

interface ListenFilter {
  status?: string;
  von?:    string;
  bis?:    string;
  q?:      string;
}

interface NeueBV {
  titel:           string;
  abschlussdatum:  string;
  geltungsbereich?: string;
  status?:         BVStatus;
  laufzeitEnde?:   string;
  bemerkung?:      string;
  dokumentId?:     string;
}

interface BVUpdate {
  titel?:           string;
  abschlussdatum?:  string;
  geltungsbereich?: string | null;
  status?:          BVStatus;
  laufzeitEnde?:    string | null;
  bemerkung?:       string | null;
  dokumentId?:      string | null;
}

const DOKUMENT_SELECT = { id: true, titel: true, dateiname: true };

function baueWhere(filter: ListenFilter): Prisma.BetriebsvereinbarungWhereInput {
  const where: Prisma.BetriebsvereinbarungWhereInput = {};
  if (filter.status && Object.values(BVStatus).includes(filter.status as BVStatus)) {
    where.status = filter.status as BVStatus;
  }
  if (filter.von || filter.bis) {
    where.laufzeitEnde = {
      ...(filter.von ? { gte: new Date(filter.von) } : {}),
      ...(filter.bis ? { lte: new Date(filter.bis) } : {}),
    };
  }
  if (filter.q?.trim()) {
    const q = filter.q.trim();
    // Volltext im verknüpften Dokument nur bei PDFs vorhanden (textinhalt wird beim
    // Upload per pdftotext extrahiert, siehe dokument-pipeline.service.ts) – bei DOCX
    // greift hier nur die Suche in Titel/Geltungsbereich/Bemerkung.
    where.OR = [
      { titel:           { contains: q, mode: "insensitive" } },
      { geltungsbereich: { contains: q, mode: "insensitive" } },
      { bemerkung:       { contains: q, mode: "insensitive" } },
      { dokument: { textinhalt: { contains: q, mode: "insensitive" } } },
    ];
  }
  return where;
}

export async function betriebsvereinbarungenRouten(app: FastifyInstance): Promise<void> {

  // ── GET / – Liste ────────────────────────────────────────────────
  app.get<{ Querystring: ListenFilter }>(
    "/",
    { preHandler: [authenticate] },
    async (request: FastifyRequest<{ Querystring: ListenFilter }>, reply: FastifyReply) => {
      const bvs = await prisma.betriebsvereinbarung.findMany({
        where:   baueWhere(request.query),
        include: { dokument: { select: DOKUMENT_SELECT } },
        orderBy: [{ titel: "asc" }],
      });
      return reply.send(bvs);
    }
  );

  // ── POST / – neue BV anlegen ────────────────────────────────────
  app.post<{ Body: NeueBV }>(
    "/",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request: FastifyRequest<{ Body: NeueBV }>, reply: FastifyReply) => {
      const { titel, abschlussdatum, geltungsbereich, status, laufzeitEnde, bemerkung, dokumentId } = request.body;

      if (!titel?.trim())     return reply.status(400).send({ fehler: "titel ist ein Pflichtfeld" });
      if (!abschlussdatum)    return reply.status(400).send({ fehler: "abschlussdatum ist ein Pflichtfeld" });

      if (dokumentId) {
        const dokument = await prisma.dokument.findUnique({ where: { id: dokumentId } });
        if (!dokument) return reply.status(404).send({ fehler: "Dokument nicht gefunden" });
      }

      const bv = await prisma.betriebsvereinbarung.create({
        data: {
          titel:           titel.trim(),
          abschlussdatum:  new Date(abschlussdatum),
          geltungsbereich: geltungsbereich?.trim() || null,
          status:          status ?? BVStatus.AKTIV,
          laufzeitEnde:    laufzeitEnde ? new Date(laufzeitEnde) : null,
          bemerkung:       bemerkung?.trim() || null,
          dokumentId:      dokumentId || null,
          erstelltVonId:   request.benutzer.sub,
        },
        include: { dokument: { select: DOKUMENT_SELECT } },
      });

      await prisma.auditLog.create({
        data: {
          benutzerId: request.benutzer.sub,
          aktion:     AuditAktion.BV_ERSTELLT,
          ip:         request.ip,
          userAgent:  request.headers["user-agent"] ?? null,
          details:    { id: bv.id, titel: bv.titel },
        },
      }).catch(() => {});

      return reply.status(201).send(bv);
    }
  );

  // ── PUT /:id – BV bearbeiten ────────────────────────────────────
  app.put<{ Params: { id: string }; Body: BVUpdate }>(
    "/:id",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request: FastifyRequest<{ Params: { id: string }; Body: BVUpdate }>, reply: FastifyReply) => {
      const { id } = request.params;
      const { titel, abschlussdatum, geltungsbereich, status, laufzeitEnde, bemerkung, dokumentId } = request.body;

      const vorhandene = await prisma.betriebsvereinbarung.findUnique({ where: { id } });
      if (!vorhandene) return reply.status(404).send({ fehler: "Betriebsvereinbarung nicht gefunden" });

      if (dokumentId) {
        const dokument = await prisma.dokument.findUnique({ where: { id: dokumentId } });
        if (!dokument) return reply.status(404).send({ fehler: "Dokument nicht gefunden" });
      }

      const aktualisiert = await prisma.betriebsvereinbarung.update({
        where: { id },
        data: {
          ...(titel           !== undefined ? { titel: titel.trim() } : {}),
          ...(abschlussdatum  !== undefined ? { abschlussdatum: new Date(abschlussdatum) } : {}),
          ...(geltungsbereich !== undefined ? { geltungsbereich: geltungsbereich?.trim() || null } : {}),
          ...(status          !== undefined ? { status } : {}),
          ...(laufzeitEnde    !== undefined ? { laufzeitEnde: laufzeitEnde ? new Date(laufzeitEnde) : null } : {}),
          ...(bemerkung       !== undefined ? { bemerkung: bemerkung?.trim() || null } : {}),
          ...(dokumentId      !== undefined ? { dokumentId: dokumentId || null } : {}),
        },
        include: { dokument: { select: DOKUMENT_SELECT } },
      });

      await prisma.auditLog.create({
        data: {
          benutzerId: request.benutzer.sub,
          aktion:     AuditAktion.BV_AKTUALISIERT,
          ip:         request.ip,
          userAgent:  request.headers["user-agent"] ?? null,
          details:    { id: aktualisiert.id, titel: aktualisiert.titel },
        },
      }).catch(() => {});

      return reply.send(aktualisiert);
    }
  );

  // ── DELETE /:id – BV löschen ────────────────────────────────────
  app.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;
      const vorhandene = await prisma.betriebsvereinbarung.findUnique({ where: { id } });
      if (!vorhandene) return reply.status(404).send({ fehler: "Betriebsvereinbarung nicht gefunden" });

      await prisma.betriebsvereinbarung.delete({ where: { id } });

      await prisma.auditLog.create({
        data: {
          benutzerId: request.benutzer.sub,
          aktion:     AuditAktion.BV_GELOESCHT,
          ip:         request.ip,
          userAgent:  request.headers["user-agent"] ?? null,
          details:    { id: vorhandene.id, titel: vorhandene.titel },
        },
      }).catch(() => {});

      return reply.send({ ok: true });
    }
  );
}
