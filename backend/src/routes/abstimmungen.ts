/**
 * Abstimmungs-Routen (eingebettet in Sitzungs-Kontext)
 *
 * GET    /api/sitzungen/:id/tops/:topId/abstimmung        – laden
 * POST   /api/sitzungen/:id/tops/:topId/abstimmung        – anlegen
 * PATCH  /api/sitzungen/:id/tops/:topId/abstimmung        – Stimmen + finalisieren
 * DELETE /api/sitzungen/:id/tops/:topId/abstimmung        – zurücksetzen (nur VORSITZ, nicht final)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { SitzungStatus, AuditAktion, Role, Stimme } from "@prisma/client";
import { createHash } from "node:crypto";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { erfordert } from "../middleware/rbac.js";

const ABSTIMMUNG_SELECT = {
  id:              true,
  rechtsgrundlage: true,
  fragestellung:   true,
  jaStimmen:       true,
  neinStimmen:     true,
  enthaltungen:    true,
  anwesend:        true,
  ergebnis:        true,
  finalisiert:     true,
  finalisiertAm:   true,
  erstelltAm:      true,
  stimmen: {
    select: {
      benutzerId: true,
      stimme:     true,
      stellvertretungFuer: true,
    },
  },
} as const;

function berechneErgebnis(ja: number, nein: number): string {
  if (ja > nein) return "ANGENOMMEN";
  if (nein > ja) return "ABGELEHNT";
  return "UNENTSCHIEDEN";
}

export async function abstimmungRouten(app: FastifyInstance): Promise<void> {

  // ── GET – Abstimmung laden ─────────────────────────────────────
  app.get(
    "/:sitzungId/tops/:topId/abstimmung",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { topId } = request.params as { sitzungId: string; topId: string };
      const abstimmung = await prisma.abstimmung.findUnique({
        where:  { topId },
        select: ABSTIMMUNG_SELECT,
      });
      if (!abstimmung) return reply.status(404).send({ fehler: "Keine Abstimmung für diesen TOP" });
      return reply.send(abstimmung);
    }
  );

  // ── POST – Abstimmung anlegen ──────────────────────────────────
  app.post(
    "/:sitzungId/tops/:topId/abstimmung",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { sitzungId, topId } = request.params as { sitzungId: string; topId: string };
      const { rechtsgrundlage, fragestellung } =
        request.body as { rechtsgrundlage: string; fragestellung: string };

      if (!fragestellung?.trim()) {
        return reply.status(400).send({ fehler: "fragestellung ist erforderlich" });
      }

      const sitzung = await prisma.sitzung.findUnique({ where: { id: sitzungId }, select: { status: true } });
      if (!sitzung) return reply.status(404).send({ fehler: "Sitzung nicht gefunden" });
      if (sitzung.status !== SitzungStatus.PROTOKOLL_ENTWURF) {
        return reply.status(409).send({ fehler: "Abstimmungen sind nur im Status PROTOKOLL_ENTWURF möglich" });
      }

      const vorhanden = await prisma.abstimmung.findUnique({ where: { topId } });
      if (vorhanden) return reply.status(409).send({ fehler: "Für diesen TOP existiert bereits eine Abstimmung" });

      const top = await prisma.tOP.findFirst({ where: { id: topId, sitzungId }, select: { id: true } });
      if (!top) return reply.status(404).send({ fehler: "TOP nicht gefunden" });

      const abstimmung = await prisma.abstimmung.create({
        data: {
          topId,
          rechtsgrundlage: rechtsgrundlage?.trim() || "Sonstige Beschlussfassung",
          fragestellung:   fragestellung.trim(),
          erstelltVonId:   request.benutzer.sub,
        },
        select: ABSTIMMUNG_SELECT,
      });

      await prisma.auditLog.create({
        data: {
          sitzungId,
          benutzerId: request.benutzer.sub,
          aktion:     AuditAktion.ABSTIMMUNG_ERSTELLT,
          ip:         request.ip,
          userAgent:  request.headers["user-agent"] ?? null,
          details:    JSON.parse(JSON.stringify({ topId, fragestellung })),
        },
      }).catch(() => {});

      return reply.status(201).send(abstimmung);
    }
  );

  // ── PATCH – Stimmen speichern / finalisieren ───────────────────
  app.patch(
    "/:sitzungId/tops/:topId/abstimmung",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { sitzungId, topId } = request.params as { sitzungId: string; topId: string };
      const { stimmen, finalisieren } =
        request.body as {
          stimmen: { benutzerId: string; stimme: Stimme; stellvertretungFuer?: string }[];
          finalisieren?: boolean;
        };

      const abstimmung = await prisma.abstimmung.findUnique({
        where: { topId },
        select: { id: true, finalisiert: true },
      });
      if (!abstimmung) return reply.status(404).send({ fehler: "Abstimmung nicht gefunden" });
      if (abstimmung.finalisiert) return reply.status(409).send({ fehler: "Finalisierte Abstimmungen sind unveränderlich" });

      const gueltigeStimmen = (stimmen ?? []).filter(s =>
        Object.values(Stimme).includes(s.stimme)
      );

      const jaCount      = gueltigeStimmen.filter(s => s.stimme === Stimme.JA).length;
      const neinCount    = gueltigeStimmen.filter(s => s.stimme === Stimme.NEIN).length;
      const enthaltCount = gueltigeStimmen.filter(s => s.stimme === Stimme.ENTHALTUNG).length;
      const ergebnis     = berechneErgebnis(jaCount, neinCount);

      const aktualisiert = await prisma.$transaction(async (tx) => {
        // Bestehende Stimmen löschen und neu schreiben (idempotent)
        await tx.abstimmungsStimme.deleteMany({ where: { abstimmungId: abstimmung.id } });

        if (gueltigeStimmen.length > 0) {
          await tx.abstimmungsStimme.createMany({
            data: gueltigeStimmen.map(s => ({
              abstimmungId:        abstimmung.id,
              benutzerId:          s.benutzerId,
              stimme:              s.stimme,
              stellvertretungFuer: s.stellvertretungFuer ?? null,
            })),
          });
        }

        return tx.abstimmung.update({
          where: { id: abstimmung.id },
          data: {
            jaStimmen:        jaCount,
            neinStimmen:      neinCount,
            enthaltungen:     enthaltCount,
            anwesend:         gueltigeStimmen.length,
            ergebnis,
            finalisiert:      finalisieren ?? false,
            finalisiertAm:    finalisieren ? new Date() : null,
            finalisiertVonId: finalisieren ? request.benutzer.sub : null,
          },
          select: ABSTIMMUNG_SELECT,
        });
      });

      if (finalisieren) {
        // TOP-Status automatisch auf Basis des Ergebnisses setzen
        await prisma.tOP.update({
          where: { id: topId },
          data: {
            status: ergebnis === "ANGENOMMEN" ? "BESCHLOSSEN" : ergebnis === "ABGELEHNT" ? "ABGELEHNT" : "ZUR_KENNTNIS",
            ergebnis: `${ergebnis === "ANGENOMMEN" ? "Angenommen" : ergebnis === "ABGELEHNT" ? "Abgelehnt" : "Unentschieden"} (${jaCount}:${neinCount}, ${enthaltCount} Enthaltungen)`,
          },
        }).catch(() => {});

        await prisma.auditLog.create({
          data: {
            sitzungId,
            benutzerId: request.benutzer.sub,
            aktion:     AuditAktion.ABSTIMMUNG_FINALISIERT,
            ip:         request.ip,
            userAgent:  request.headers["user-agent"] ?? null,
            details:    JSON.parse(JSON.stringify({ topId, ergebnis, jaCount, neinCount, enthaltCount })),
          },
        }).catch(() => {});
      }

      return reply.send(aktualisiert);
    }
  );

  // ── DELETE – Abstimmung zurücksetzen ───────────────────────────
  app.delete(
    "/:sitzungId/tops/:topId/abstimmung",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { topId } = request.params as { sitzungId: string; topId: string };
      const abstimmung = await prisma.abstimmung.findUnique({
        where: { topId }, select: { id: true, finalisiert: true },
      });
      if (!abstimmung) return reply.status(404).send({ fehler: "Abstimmung nicht gefunden" });
      if (abstimmung.finalisiert) {
        return reply.status(409).send({ fehler: "Finalisierte Abstimmungen können nicht zurückgesetzt werden" });
      }
      await prisma.abstimmung.delete({ where: { id: abstimmung.id } });
      return reply.send({ nachricht: "Abstimmung zurückgesetzt" });
    }
  );
}
