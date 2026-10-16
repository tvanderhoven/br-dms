/**
 * Einberufung auf Antrag (§ 29 Abs. 2 BetrVG) – ein Viertel der Mitglieder oder der
 * Arbeitgeber können eine Sitzung verlangen; sie muss binnen einer Woche nach Zugang
 * des Antrags stattfinden (Frist über lib/einberufungsfrist.ts).
 *
 * GET    /                      – Liste (offene zuerst)
 * POST   /arbeitgeber           – Antrag des Arbeitgebers erfassen (VORSITZ, da kein eigener Login)
 * POST   /mitglieder            – Mitglieder-Antrag stellen, Ersteller unterzeichnet automatisch
 * POST   /:id/unterzeichnen     – mitunterzeichnen, löst bei Quorum (ein Viertel) die Frist aus
 * DELETE /:id/unterzeichnen     – eigene Unterschrift zurückziehen (nur solange noch gesammelt wird)
 * PATCH  /:id                   – mit einer Sitzung verknüpfen ("erledigt")
 * DELETE /:id                   – löschen (VORSITZ)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { AuditAktion, Role } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { erfordert } from "../middleware/rbac.js";
import { sollStaerkeErmitteln } from "../lib/beschlussfaehigkeit.js";
import { mindestUnterzeichnerErmitteln, einberufungsfristAnlegen } from "../lib/einberufungsfrist.js";

const ANTRAG_SELECT = {
  id:               true,
  antragstellerTyp: true,
  grund:            true,
  zugangAm:         true,
  erstelltAm:       true,
  erfasstVon:       { select: { name: true } },
  sitzung:          { select: { id: true, titel: true, sitzungsdatum: true } },
  unterzeichner: {
    select: { benutzerId: true, unterzeichnetAm: true, benutzer: { select: { name: true } } },
  },
  fristen: {
    select: { id: true, faelligAm: true, status: true },
  },
} as const;

async function audit(
  request: FastifyRequest, aktion: AuditAktion, antragId: string, details?: object,
) {
  await prisma.auditLog.create({
    data: {
      benutzerId: request.benutzer.sub,
      aktion,
      ip:         request.ip,
      userAgent:  request.headers["user-agent"] ?? null,
      details:    JSON.parse(JSON.stringify({ antragId, ...details })),
    },
  }).catch(() => {});
}

export async function einberufungsantragRouten(app: FastifyInstance): Promise<void> {

  // ── GET / – Liste ──────────────────────────────────────────────
  app.get(
    "/",
    { preHandler: [authenticate, erfordert(Role.MITGLIED)] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const antraege = await prisma.einberufungsantrag.findMany({
        orderBy: { erstelltAm: "desc" },
        select:  ANTRAG_SELECT,
      });
      const sollStaerke = await sollStaerkeErmitteln();
      return reply.send({ antraege, sollStaerke, mindestUnterzeichner: mindestUnterzeichnerErmitteln(sollStaerke) });
    }
  );

  // ── POST /arbeitgeber – Antrag des Arbeitgebers erfassen ───────
  app.post(
    "/arbeitgeber",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { grund, zugangAm } = request.body as { grund?: string; zugangAm?: string };
      if (!grund?.trim()) return reply.status(400).send({ fehler: "grund ist ein Pflichtfeld" });

      const zugang = zugangAm ? new Date(zugangAm) : new Date();
      if (Number.isNaN(zugang.getTime())) return reply.status(400).send({ fehler: "Ungültiger Zugangszeitpunkt" });
      if (zugang.getTime() > Date.now() + 10 * 60_000) {
        return reply.status(400).send({ fehler: "Der Zugang kann nicht in der Zukunft liegen" });
      }

      const antrag = await prisma.einberufungsantrag.create({
        data: {
          antragstellerTyp: "ARBEITGEBER",
          grund:            grund.trim(),
          erfasstVonId:     request.benutzer.sub,
          zugangAm:         zugang,
        },
        select: ANTRAG_SELECT,
      });
      await einberufungsfristAnlegen(antrag.id, zugang);
      await audit(request, AuditAktion.EINBERUFUNGSANTRAG_ERSTELLT, antrag.id, { antragstellerTyp: "ARBEITGEBER" });

      const aktualisiert = await prisma.einberufungsantrag.findUnique({ where: { id: antrag.id }, select: ANTRAG_SELECT });
      return reply.status(201).send(aktualisiert);
    }
  );

  // ── POST /mitglieder – Mitglieder-Antrag stellen ───────────────
  app.post(
    "/mitglieder",
    { preHandler: [authenticate, erfordert(Role.MITGLIED)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { grund } = request.body as { grund?: string };
      if (!grund?.trim()) return reply.status(400).send({ fehler: "grund ist ein Pflichtfeld" });

      const antrag = await prisma.einberufungsantrag.create({
        data: {
          antragstellerTyp: "MITGLIEDER",
          grund:            grund.trim(),
          erfasstVonId:     request.benutzer.sub,
          unterzeichner:    { create: { benutzerId: request.benutzer.sub } },
        },
      });
      await audit(request, AuditAktion.EINBERUFUNGSANTRAG_ERSTELLT, antrag.id, { antragstellerTyp: "MITGLIEDER" });

      await quorumPruefen(antrag.id, request);

      const aktualisiert = await prisma.einberufungsantrag.findUnique({ where: { id: antrag.id }, select: ANTRAG_SELECT });
      return reply.status(201).send(aktualisiert);
    }
  );

  // ── POST /:id/unterzeichnen – mitunterzeichnen ─────────────────
  app.post(
    "/:id/unterzeichnen",
    { preHandler: [authenticate, erfordert(Role.MITGLIED)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const antrag = await prisma.einberufungsantrag.findUnique({ where: { id }, select: { id: true, antragstellerTyp: true, zugangAm: true } });
      if (!antrag) return reply.status(404).send({ fehler: "Antrag nicht gefunden" });
      if (antrag.antragstellerTyp !== "MITGLIEDER") {
        return reply.status(409).send({ fehler: "Nur Mitglieder-Anträge können unterzeichnet werden" });
      }
      if (antrag.zugangAm) {
        return reply.status(409).send({ fehler: "Das Quorum ist bereits erreicht, die Frist läuft" });
      }

      await prisma.einberufungsantragUnterzeichner.upsert({
        where:  { antragId_benutzerId: { antragId: id, benutzerId: request.benutzer.sub } },
        update: {},
        create: { antragId: id, benutzerId: request.benutzer.sub },
      });
      await audit(request, AuditAktion.EINBERUFUNGSANTRAG_UNTERZEICHNET, id);

      await quorumPruefen(id, request);

      const aktualisiert = await prisma.einberufungsantrag.findUnique({ where: { id }, select: ANTRAG_SELECT });
      return reply.send(aktualisiert);
    }
  );

  // ── DELETE /:id/unterzeichnen – Unterschrift zurückziehen ──────
  app.delete(
    "/:id/unterzeichnen",
    { preHandler: [authenticate, erfordert(Role.MITGLIED)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const antrag = await prisma.einberufungsantrag.findUnique({ where: { id }, select: { zugangAm: true } });
      if (!antrag) return reply.status(404).send({ fehler: "Antrag nicht gefunden" });
      if (antrag.zugangAm) {
        return reply.status(409).send({ fehler: "Das Quorum ist bereits erreicht, die Unterschrift kann nicht mehr zurückgezogen werden" });
      }

      await prisma.einberufungsantragUnterzeichner.deleteMany({
        where: { antragId: id, benutzerId: request.benutzer.sub },
      });

      const aktualisiert = await prisma.einberufungsantrag.findUnique({ where: { id }, select: ANTRAG_SELECT });
      return reply.send(aktualisiert);
    }
  );

  // ── PATCH /:id – mit Sitzung verknüpfen ────────────────────────
  app.patch(
    "/:id",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const { sitzungId } = request.body as { sitzungId?: string | null };

      const antrag = await prisma.einberufungsantrag.findUnique({ where: { id }, select: { id: true } });
      if (!antrag) return reply.status(404).send({ fehler: "Antrag nicht gefunden" });

      if (sitzungId) {
        const sitzung = await prisma.sitzung.findUnique({ where: { id: sitzungId }, select: { id: true } });
        if (!sitzung) return reply.status(404).send({ fehler: "Sitzung nicht gefunden" });
      }

      const aktualisiert = await prisma.einberufungsantrag.update({
        where: { id },
        data:  { sitzungId: sitzungId ?? null },
        select: ANTRAG_SELECT,
      });
      await audit(request, sitzungId ? AuditAktion.EINBERUFUNGSANTRAG_ERLEDIGT : AuditAktion.EINBERUFUNGSANTRAG_UNTERZEICHNET, id, { sitzungId });
      return reply.send(aktualisiert);
    }
  );

  // ── DELETE /:id – löschen ───────────────────────────────────────
  app.delete(
    "/:id",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const antrag = await prisma.einberufungsantrag.findUnique({ where: { id }, select: { id: true } });
      if (!antrag) return reply.status(404).send({ fehler: "Antrag nicht gefunden" });

      await prisma.einberufungsantrag.delete({ where: { id } });
      await audit(request, AuditAktion.EINBERUFUNGSANTRAG_GELOESCHT, id);
      return reply.send({ nachricht: "Antrag gelöscht" });
    }
  );

  /** Prüft, ob ein Mitglieder-Antrag das Quorum (ein Viertel) erreicht hat, und löst dann die Frist aus. */
  async function quorumPruefen(antragId: string, request: FastifyRequest): Promise<void> {
    const [antrag, sollStaerke] = await Promise.all([
      prisma.einberufungsantrag.findUnique({
        where: { id: antragId },
        select: { zugangAm: true, _count: { select: { unterzeichner: true } } },
      }),
      sollStaerkeErmitteln(),
    ]);
    if (!antrag || antrag.zugangAm) return;

    const mindest = mindestUnterzeichnerErmitteln(sollStaerke);
    if (antrag._count.unterzeichner < mindest) return;

    const jetzt = new Date();
    await prisma.einberufungsantrag.update({ where: { id: antragId }, data: { zugangAm: jetzt } });
    await einberufungsfristAnlegen(antragId, jetzt);
    await audit(request, AuditAktion.EINBERUFUNGSANTRAG_AKTIV, antragId, { unterzeichner: antrag._count.unterzeichner, sollStaerke });
  }
}
