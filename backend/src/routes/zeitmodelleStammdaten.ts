/**
 * Zeitmodell-Stammdaten – die Liste der in dieser Installation verfügbaren
 * Zeitmodell-Bezeichnungen (z.B. eigene Buchstaben-Codes oder reale
 * Stundenmodelle wie "38h"), frei konfigurierbar statt fest im Code. Nicht zu
 * verwechseln mit routes/zeitmodell.ts (die Zeitraum-Historie je Mitarbeiter,
 * die auf diese Stammdaten verweist).
 *
 * GET  /api/zeitmodelle      – alle Zeitmodelle (inkl. inaktive)
 * POST /api/zeitmodelle      – neues Zeitmodell anlegen
 * PUT  /api/zeitmodelle/:id  – Zeitmodell bearbeiten (Bezeichnung/Wochenstunden/Sortierung/Aktiv/Standard)
 *
 * "standard" ist die Vorauswahl beim Anlegen eines neuen Zeitmodell-Zeitraums
 * (siehe routes/zeitmodell.ts) – höchstens eins gleichzeitig, das Setzen
 * eines neuen Standards setzt automatisch alle anderen zurück.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { Role } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { erfordert } from "../middleware/rbac.js";

interface NeuesZeitmodell {
  bezeichnung:   string;
  wochenstunden?: number | null;
  sortierung?:   number;
  standard?:     boolean;
}

interface ZeitmodellUpdate {
  bezeichnung?:   string;
  wochenstunden?: number | null;
  sortierung?:    number;
  aktiv?:         boolean;
  standard?:      boolean;
}

function gueltigeWochenstunden(wert: unknown): wert is number {
  return typeof wert === "number" && Number.isFinite(wert) && wert > 0 && wert <= 60;
}

export async function zeitmodelleStammdatenRouten(app: FastifyInstance): Promise<void> {

  // ── GET / – alle Zeitmodelle ─────────────────────────────────────
  app.get(
    "/",
    { preHandler: [authenticate, erfordert(Role.MITGLIED)] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const zeitmodelle = await prisma.zeitmodell.findMany({
        orderBy: [{ sortierung: "asc" }, { bezeichnung: "asc" }],
      });
      return reply.send(zeitmodelle);
    }
  );

  // ── POST / – neues Zeitmodell anlegen ────────────────────────────
  app.post<{ Body: NeuesZeitmodell }>(
    "/",
    { preHandler: [authenticate, erfordert(Role.MITGLIED)] },
    async (request: FastifyRequest<{ Body: NeuesZeitmodell }>, reply: FastifyReply) => {
      const { bezeichnung, wochenstunden, sortierung, standard } = request.body;

      if (!bezeichnung?.trim()) return reply.status(400).send({ fehler: "bezeichnung ist ein Pflichtfeld" });
      if (wochenstunden != null && !gueltigeWochenstunden(wochenstunden)) {
        return reply.status(400).send({ fehler: "wochenstunden muss zwischen 0 und 60 liegen" });
      }

      const vorhanden = await prisma.zeitmodell.findUnique({ where: { bezeichnung: bezeichnung.trim() } });
      if (vorhanden) return reply.status(409).send({ fehler: "Zeitmodell existiert bereits" });

      const zeitmodell = await prisma.$transaction(async tx => {
        if (standard) await tx.zeitmodell.updateMany({ data: { standard: false } });
        return tx.zeitmodell.create({
          data: {
            bezeichnung: bezeichnung.trim(),
            wochenstunden: wochenstunden ?? null,
            sortierung: sortierung ?? 0,
            standard: !!standard,
          },
        });
      });
      return reply.status(201).send(zeitmodell);
    }
  );

  // ── PUT /:id – Zeitmodell bearbeiten ─────────────────────────────
  app.put<{ Params: { id: string }; Body: ZeitmodellUpdate }>(
    "/:id",
    { preHandler: [authenticate, erfordert(Role.MITGLIED)] },
    async (request: FastifyRequest<{ Params: { id: string }; Body: ZeitmodellUpdate }>, reply: FastifyReply) => {
      const { id } = request.params;
      const { bezeichnung, wochenstunden, sortierung, aktiv, standard } = request.body;

      const vorhandenes = await prisma.zeitmodell.findUnique({ where: { id } });
      if (!vorhandenes) return reply.status(404).send({ fehler: "Zeitmodell nicht gefunden" });

      if (bezeichnung !== undefined) {
        if (!bezeichnung.trim()) return reply.status(400).send({ fehler: "bezeichnung darf nicht leer sein" });
        const konflikt = await prisma.zeitmodell.findUnique({ where: { bezeichnung: bezeichnung.trim() } });
        if (konflikt && konflikt.id !== id) return reply.status(409).send({ fehler: "Zeitmodell existiert bereits" });
      }
      if (wochenstunden != null && !gueltigeWochenstunden(wochenstunden)) {
        return reply.status(400).send({ fehler: "wochenstunden muss zwischen 0 und 60 liegen" });
      }

      const aktualisiert = await prisma.$transaction(async tx => {
        // Höchstens ein Standard-Zeitmodell gleichzeitig – beim Setzen alle
        // anderen zurücksetzen, statt das dem Frontend zu überlassen.
        if (standard === true) await tx.zeitmodell.updateMany({ where: { id: { not: id } }, data: { standard: false } });
        return tx.zeitmodell.update({
          where: { id },
          data: {
            ...(bezeichnung !== undefined ? { bezeichnung: bezeichnung.trim() } : {}),
            ...(wochenstunden !== undefined ? { wochenstunden } : {}),
            ...(sortierung !== undefined ? { sortierung } : {}),
            ...(aktiv !== undefined ? { aktiv } : {}),
            ...(standard !== undefined ? { standard } : {}),
          },
        });
      });
      return reply.send(aktualisiert);
    }
  );
}
