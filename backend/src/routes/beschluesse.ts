/**
 * Beschluss-Routen – Mehrere Beschlüsse pro TOP (rechtssichere Beschlussfassung)
 *
 * GET    /api/sitzungen/:sitzungId/tops/:topId/beschluesse
 * POST   /api/sitzungen/:sitzungId/tops/:topId/beschluesse
 * PATCH  /api/sitzungen/:sitzungId/tops/:topId/beschluesse/:beschlussId
 * DELETE /api/sitzungen/:sitzungId/tops/:topId/beschluesse/:beschlussId
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { SitzungStatus, AuditAktion, Role } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { erfordert } from "../middleware/rbac.js";

const BESCHLUSS_SELECT = {
  id:              true,
  topId:           true,
  antragstext:     true,
  rechtsgrundlage: true,
  reihenfolge:     true,
  jaStimmen:       true,
  neinStimmen:     true,
  enthaltungen:    true,
  nichtTeilgenommen: true,
  anwesend:        true,
  ergebnis:        true,
  finalisiert:     true,
  finalisiertAm:   true,
  erstelltAm:      true,
  aktualisiertAm:  true,
  stimmen: {
    select: {
      benutzerId:    true,
      stimme:        true,
      vertretungFuer: true,
    },
  },
} as const;

function berechneErgebnis(ja: number, nein: number): string {
  if (ja > nein) return "ANGENOMMEN";
  if (nein > ja) return "ABGELEHNT";
  return "UNENTSCHIEDEN";
}

export async function beschlussRouten(app: FastifyInstance): Promise<void> {

  // ── GET – alle Beschlüsse für einen TOP ───────────────────────
  app.get(
    "/:sitzungId/tops/:topId/beschluesse",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { sitzungId, topId } = request.params as { sitzungId: string; topId: string };

      const top = await prisma.tOP.findFirst({
        where: { id: topId, sitzungId },
        select: { id: true },
      });
      if (!top) return reply.status(404).send({ fehler: "TOP nicht gefunden" });

      const beschluesse = await prisma.beschluss.findMany({
        where: { topId },
        select: BESCHLUSS_SELECT,
        orderBy: { reihenfolge: "asc" },
      });

      return reply.send(beschluesse);
    }
  );

  // ── POST – neuen Beschluss anlegen ────────────────────────────
  app.post(
    "/:sitzungId/tops/:topId/beschluesse",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { sitzungId, topId } = request.params as { sitzungId: string; topId: string };
      const { antragstext, rechtsgrundlage } =
        request.body as { antragstext?: string; rechtsgrundlage?: string };

      const sitzung = await prisma.sitzung.findUnique({
        where: { id: sitzungId },
        select: { status: true },
      });
      if (!sitzung) return reply.status(404).send({ fehler: "Sitzung nicht gefunden" });
      if (sitzung.status !== SitzungStatus.PROTOKOLL_ENTWURF) {
        return reply.status(409).send({ fehler: "Beschlüsse sind nur im Status PROTOKOLL_ENTWURF möglich" });
      }

      const top = await prisma.tOP.findFirst({
        where: { id: topId, sitzungId },
        select: { id: true },
      });
      if (!top) return reply.status(404).send({ fehler: "TOP nicht gefunden" });

      const anzahl = await prisma.beschluss.count({ where: { topId } });

      const beschluss = await prisma.beschluss.create({
        data: {
          topId,
          antragstext:     (antragstext ?? "").trim(),
          rechtsgrundlage: rechtsgrundlage?.trim() || "Sonstige Beschlussfassung",
          reihenfolge:     anzahl,
          erstelltVonId:   request.benutzer.sub,
        },
        select: BESCHLUSS_SELECT,
      });

      await prisma.auditLog.create({
        data: {
          sitzungId,
          benutzerId: request.benutzer.sub,
          aktion:     AuditAktion.ABSTIMMUNG_ERSTELLT,
          ip:         request.ip,
          userAgent:  request.headers["user-agent"] ?? null,
          details:    JSON.parse(JSON.stringify({ topId, beschlussId: beschluss.id })),
        },
      }).catch(() => {});

      return reply.status(201).send(beschluss);
    }
  );

  // ── PATCH – Text / Stimmergebnis / Finalisieren ──────────────
  app.patch(
    "/:sitzungId/tops/:topId/beschluesse/:beschlussId",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { sitzungId, topId, beschlussId } =
        request.params as { sitzungId: string; topId: string; beschlussId: string };
      const { antragstext, rechtsgrundlage, jaStimmen, neinStimmen, enthaltungen, nichtTeilgenommen, finalisieren } =
        request.body as {
          antragstext?:    string;
          rechtsgrundlage?: string;
          jaStimmen?:      number;
          neinStimmen?:    number;
          enthaltungen?:   number;
          nichtTeilgenommen?: number;
          finalisieren?:   boolean;
        };

      const beschluss = await prisma.beschluss.findFirst({
        where: { id: beschlussId, topId },
        select: { id: true, finalisiert: true },
      });
      if (!beschluss) return reply.status(404).send({ fehler: "Beschluss nicht gefunden" });
      if (beschluss.finalisiert) {
        return reply.status(409).send({ fehler: "Finalisierte Beschlüsse sind unveränderlich" });
      }

      const ja        = Math.max(0, jaStimmen          ?? 0);
      const nein      = Math.max(0, neinStimmen        ?? 0);
      const enthal    = Math.max(0, enthaltungen       ?? 0);
      const nichtTeilg = Math.max(0, nichtTeilgenommen  ?? 0);
      const ergebnis = berechneErgebnis(ja, nein);

      const hatStimmen = jaStimmen !== undefined || neinStimmen !== undefined || enthaltungen !== undefined || nichtTeilgenommen !== undefined;

      const aktualisiert = await prisma.beschluss.update({
        where: { id: beschluss.id },
        data: {
          ...(antragstext !== undefined     && { antragstext: antragstext.trim() }),
          ...(rechtsgrundlage !== undefined && { rechtsgrundlage: rechtsgrundlage.trim() }),
          ...(hatStimmen && {
            jaStimmen:    ja,
            neinStimmen:  nein,
            enthaltungen: enthal,
            nichtTeilgenommen: nichtTeilg,
            // "anwesend" = stimmberechtigt anwesend (ohne Nicht-Teilgenommen, z.B. JAV)
            anwesend:     ja + nein + enthal,
            ergebnis,
          }),
          finalisiert:      finalisieren ?? false,
          finalisiertAm:    finalisieren ? new Date() : null,
          finalisiertVonId: finalisieren ? request.benutzer.sub : null,
        },
        select: BESCHLUSS_SELECT,
      });

      if (finalisieren) {
        await prisma.tOP.update({
          where: { id: topId },
          data: {
            status: ergebnis === "ANGENOMMEN" ? "BESCHLOSSEN"
                  : ergebnis === "ABGELEHNT"  ? "ABGELEHNT"
                  : "ZUR_KENNTNIS",
          },
        }).catch(() => {});

        await prisma.auditLog.create({
          data: {
            sitzungId,
            benutzerId: request.benutzer.sub,
            aktion:     AuditAktion.ABSTIMMUNG_FINALISIERT,
            ip:         request.ip,
            userAgent:  request.headers["user-agent"] ?? null,
            details:    JSON.parse(JSON.stringify({ topId, beschlussId, ergebnis, ja, nein, enthal, nichtTeilg })),
          },
        }).catch(() => {});
      }

      return reply.send(aktualisiert);
    }
  );

  // ── DELETE – Beschluss löschen (nur wenn nicht finalisiert) ───
  app.delete(
    "/:sitzungId/tops/:topId/beschluesse/:beschlussId",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { topId, beschlussId } =
        request.params as { sitzungId: string; topId: string; beschlussId: string };

      const beschluss = await prisma.beschluss.findFirst({
        where: { id: beschlussId, topId },
        select: { id: true, finalisiert: true },
      });
      if (!beschluss) return reply.status(404).send({ fehler: "Beschluss nicht gefunden" });
      if (beschluss.finalisiert) {
        return reply.status(409).send({ fehler: "Finalisierte Beschlüsse können nicht gelöscht werden" });
      }

      await prisma.beschluss.delete({ where: { id: beschluss.id } });
      return reply.send({ nachricht: "Beschluss gelöscht" });
    }
  );
}
