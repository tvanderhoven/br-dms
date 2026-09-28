/**
 * Zeitmodell – Zeitraum-Historie je Mitarbeiter (Von/Bis, Bis=null=unbefristet).
 * Getrennt von der Eingruppierung (siehe routes/gehaltstabelle.ts), weil sich
 * das Zeitmodell viel öfter ändert und einen echten Gültigkeitszeitraum hat.
 *
 * GET    /api/zeitmodell                – Zeiträume (Filter: mitarbeiterId, abteilungId)
 * GET    /api/zeitmodell/laufen-bald-ab – Zeiträume, die in den nächsten N Tagen enden (?tage=30)
 * POST   /api/zeitmodell                – neuen Zeitraum anlegen (schließt automatisch einen offenen Vorgänger)
 * PUT    /api/zeitmodell/:id            – Zeitraum bearbeiten
 * DELETE /api/zeitmodell/:id            – Zeitraum löschen
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { Prisma, Role, Zeitmodell } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { erfordert } from "../middleware/rbac.js";
import { findeUeberlappung, zeitmodellPeriodeAnlegen } from "../lib/zeitmodell.js";

interface ListenFilter {
  mitarbeiterId?: string;
  abteilungId?:   string;
}

interface NeuerZeitraum {
  mitarbeiterId: string;
  zeitmodell:    Zeitmodell;
  gueltigVon:    string;
  gueltigBis?:   string | null;
  bemerkung?:    string;
}

interface ZeitraumUpdate {
  zeitmodell?: Zeitmodell;
  gueltigVon?: string;
  gueltigBis?: string | null;
  bemerkung?:  string | null;
}

const ZEITMODELL_WERTE = Object.values(Zeitmodell);

const MITARBEITER_INCLUDE = {
  mitarbeiter: {
    include: { abteilung: { select: { id: true, name: true } } },
  },
};

function baueWhere(filter: ListenFilter): Prisma.ZeitmodellEintragWhereInput {
  const where: Prisma.ZeitmodellEintragWhereInput = {};
  if (filter.mitarbeiterId) where.mitarbeiterId = filter.mitarbeiterId;
  if (filter.abteilungId)   where.mitarbeiter = { abteilungId: filter.abteilungId };
  return where;
}

export async function zeitmodellRouten(app: FastifyInstance): Promise<void> {

  // ── GET / – Zeiträume auflisten ──────────────────────────────────
  app.get<{ Querystring: ListenFilter }>(
    "/",
    { preHandler: [authenticate, erfordert(Role.MITGLIED)] },
    async (request: FastifyRequest<{ Querystring: ListenFilter }>, reply: FastifyReply) => {
      const zeitraeume = await prisma.zeitmodellEintrag.findMany({
        where:   baueWhere(request.query),
        include: MITARBEITER_INCLUDE,
        orderBy: [{ gueltigVon: "desc" }],
      });
      return reply.send(zeitraeume);
    }
  );

  // ── GET /laufen-bald-ab – befristete Zeiträume kurz vor Ablauf ───
  app.get<{ Querystring: { tage?: string } }>(
    "/laufen-bald-ab",
    { preHandler: [authenticate, erfordert(Role.MITGLIED)] },
    async (request: FastifyRequest<{ Querystring: { tage?: string } }>, reply: FastifyReply) => {
      const tageZahl = Number(request.query.tage);
      const tage = Number.isFinite(tageZahl) && tageZahl > 0 ? tageZahl : 30;

      const heute = new Date();
      const grenze = new Date(heute);
      grenze.setDate(grenze.getDate() + tage);

      const zeitraeume = await prisma.zeitmodellEintrag.findMany({
        where:   { gueltigBis: { gte: heute, lte: grenze } },
        include: MITARBEITER_INCLUDE,
        orderBy: [{ gueltigBis: "asc" }],
      });
      return reply.send(zeitraeume);
    }
  );

  // ── POST / – neuen Zeitraum anlegen ──────────────────────────────
  app.post<{ Body: NeuerZeitraum }>(
    "/",
    { preHandler: [authenticate, erfordert(Role.MITGLIED)] },
    async (request: FastifyRequest<{ Body: NeuerZeitraum }>, reply: FastifyReply) => {
      const { mitarbeiterId, zeitmodell, gueltigVon, gueltigBis, bemerkung } = request.body;

      if (!mitarbeiterId?.trim()) return reply.status(400).send({ fehler: "mitarbeiterId ist ein Pflichtfeld" });
      if (!zeitmodell || !ZEITMODELL_WERTE.includes(zeitmodell)) {
        return reply.status(400).send({ fehler: `zeitmodell muss einer von ${ZEITMODELL_WERTE.join(", ")} sein` });
      }
      if (!gueltigVon) return reply.status(400).send({ fehler: "gueltigVon ist ein Pflichtfeld" });

      const von = new Date(gueltigVon);
      const bis = gueltigBis ? new Date(gueltigBis) : null;
      if (bis && bis < von) return reply.status(400).send({ fehler: "gueltigBis darf nicht vor gueltigVon liegen" });

      const mitarbeiter = await prisma.mitarbeiter.findUnique({ where: { id: mitarbeiterId } });
      if (!mitarbeiter) return reply.status(404).send({ fehler: "Mitarbeiter nicht gefunden" });

      // Schließt automatisch einen offenen Vorgänger-Zeitraum, statt bei jeder
      // "neuer aktueller Zeitraum"-Eingabe eine Überschneidung abzulehnen.
      const ergebnis = await zeitmodellPeriodeAnlegen(prisma as unknown as Prisma.TransactionClient, {
        mitarbeiterId, zeitmodell, gueltigVon: von, gueltigBis: bis, bemerkung: bemerkung?.trim() || null,
      });

      if (ergebnis.art === "konflikt") {
        return reply.status(409).send({ fehler: ergebnis.grund });
      }

      const zeitraum = await prisma.zeitmodellEintrag.findUniqueOrThrow({
        where: { id: ergebnis.eintrag.id },
        include: MITARBEITER_INCLUDE,
      });
      return reply.status(ergebnis.art === "angelegt" ? 201 : 200).send(zeitraum);
    }
  );

  // ── PUT /:id – Zeitraum bearbeiten ───────────────────────────────
  app.put<{ Params: { id: string }; Body: ZeitraumUpdate }>(
    "/:id",
    { preHandler: [authenticate, erfordert(Role.MITGLIED)] },
    async (request: FastifyRequest<{ Params: { id: string }; Body: ZeitraumUpdate }>, reply: FastifyReply) => {
      const { id } = request.params;
      const { zeitmodell, gueltigVon, gueltigBis, bemerkung } = request.body;

      const vorhandener = await prisma.zeitmodellEintrag.findUnique({ where: { id } });
      if (!vorhandener) return reply.status(404).send({ fehler: "Zeitraum nicht gefunden" });

      if (zeitmodell !== undefined && !ZEITMODELL_WERTE.includes(zeitmodell)) {
        return reply.status(400).send({ fehler: `zeitmodell muss einer von ${ZEITMODELL_WERTE.join(", ")} sein` });
      }

      const von = gueltigVon !== undefined ? new Date(gueltigVon) : vorhandener.gueltigVon;
      const bis = gueltigBis !== undefined ? (gueltigBis ? new Date(gueltigBis) : null) : vorhandener.gueltigBis;
      if (bis && bis < von) return reply.status(400).send({ fehler: "gueltigBis darf nicht vor gueltigVon liegen" });

      const ueberlappung = await findeUeberlappung(
        prisma as unknown as Prisma.TransactionClient, vorhandener.mitarbeiterId, von, bis, id,
      );
      if (ueberlappung) {
        return reply.status(409).send({
          fehler: `Überschneidet sich mit bestehendem Zeitraum ${ueberlappung.gueltigVon.toLocaleDateString("de-DE")} – ${ueberlappung.gueltigBis?.toLocaleDateString("de-DE") ?? "unbefristet"}`,
        });
      }

      const aktualisiert = await prisma.zeitmodellEintrag.update({
        where: { id },
        data: {
          ...(zeitmodell !== undefined ? { zeitmodell } : {}),
          gueltigVon: von,
          gueltigBis: bis,
          ...(bemerkung !== undefined ? { bemerkung: bemerkung?.trim() || null } : {}),
        },
        include: MITARBEITER_INCLUDE,
      });
      return reply.send(aktualisiert);
    }
  );

  // ── DELETE /:id – Zeitraum löschen ───────────────────────────────
  app.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [authenticate, erfordert(Role.MITGLIED)] },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;
      const vorhandener = await prisma.zeitmodellEintrag.findUnique({ where: { id } });
      if (!vorhandener) return reply.status(404).send({ fehler: "Zeitraum nicht gefunden" });

      await prisma.zeitmodellEintrag.delete({ where: { id } });
      return reply.send({ ok: true });
    }
  );
}
