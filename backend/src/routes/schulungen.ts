/**
 * Schulungsverwaltung / Qualifikationsmatrix
 *
 * GET    /api/qualifikationen              – alle Qualifikationstypen (Katalog)
 * POST   /api/qualifikationen              – neue Qualifikation anlegen
 *
 * GET    /api/schulungen                   – Schulungstermine (Filter: qualifikationId, status, von, bis)
 * POST   /api/schulungen                   – neuen Termin anlegen (optional mit Teilnehmerliste)
 * PUT    /api/schulungen/:id               – Termin bearbeiten
 * DELETE /api/schulungen/:id               – Termin löschen
 * POST   /api/schulungen/:id/teilnehmer    – Teilnehmer hinzufügen
 * PATCH  /api/schulungen/:id/teilnehmer/:mitarbeiterId – Teilnahme-Status ändern
 * DELETE /api/schulungen/:id/teilnehmer/:mitarbeiterId – Teilnehmer entfernen
 *
 * GET    /api/schulungen/matrix            – abgeleitete Qualifikationsmatrix (Mitarbeiter × Qualifikation)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { SchulungsStatus, Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";

// ── Qualifikationen (Katalog) ───────────────────────────────────────
export async function qualifikationenRouten(app: FastifyInstance): Promise<void> {

  app.get("/", { preHandler: [authenticate] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const qualifikationen = await prisma.qualifikation.findMany({ orderBy: { name: "asc" } });
      return reply.send(qualifikationen);
    }
  );

  app.post<{ Body: { name: string; beschreibung?: string; gueltigkeitsdauerMonate?: number | null } }>(
    "/",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { name, beschreibung, gueltigkeitsdauerMonate } = request.body;
      if (!name?.trim()) return reply.status(400).send({ fehler: "name ist ein Pflichtfeld" });

      const vorhanden = await prisma.qualifikation.findUnique({ where: { name: name.trim() } });
      if (vorhanden) return reply.status(409).send({ fehler: "Qualifikation existiert bereits" });

      const qualifikation = await prisma.qualifikation.create({
        data: {
          name:                    name.trim(),
          beschreibung:            beschreibung?.trim() || null,
          gueltigkeitsdauerMonate: gueltigkeitsdauerMonate ?? null,
        },
      });
      return reply.status(201).send(qualifikation);
    }
  );
}

// ── Schulungstermine + Teilnahmen + Matrix ──────────────────────────
interface ListenFilter {
  qualifikationId?: string;
  status?:          string;
  von?:             string;
  bis?:             string;
}

interface NeuerTermin {
  qualifikationId: string;
  titel?:          string;
  datum:           string;
  ort?:            string;
  anbieter?:       string;
  kosten?:         number;
  status?:         SchulungsStatus;
  bemerkung?:      string;
  teilnehmerIds?:  string[];
}

interface TerminUpdate {
  qualifikationId?: string;
  titel?:           string | null;
  datum?:           string;
  ort?:             string | null;
  anbieter?:        string | null;
  kosten?:          number | null;
  status?:          SchulungsStatus;
  bemerkung?:       string | null;
}

const TEILNEHMER_INCLUDE = {
  teilnehmer: {
    include: { mitarbeiter: { include: { abteilung: { select: { id: true, name: true } } } } },
  },
  qualifikation: true,
};

function baueWhere(filter: ListenFilter): Prisma.SchulungsterminWhereInput {
  const where: Prisma.SchulungsterminWhereInput = {};
  if (filter.qualifikationId) where.qualifikationId = filter.qualifikationId;
  if (filter.status && Object.values(SchulungsStatus).includes(filter.status as SchulungsStatus)) {
    where.status = filter.status as SchulungsStatus;
  }
  if (filter.von || filter.bis) {
    where.datum = {
      ...(filter.von ? { gte: new Date(filter.von) } : {}),
      ...(filter.bis ? { lte: new Date(filter.bis) } : {}),
    };
  }
  return where;
}

export async function schulungenRouten(app: FastifyInstance): Promise<void> {

  // ── GET /matrix – abgeleitete Qualifikationsmatrix ────────────────
  // Muss vor "/:id"-artigen Routen registriert werden (find-my-way bevorzugt zwar
  // statische Routen automatisch, aber so bleibt's auch beim Lesen eindeutig).
  app.get("/matrix", { preHandler: [authenticate] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const [mitarbeiterListe, qualifikationen, teilnahmen] = await Promise.all([
        prisma.mitarbeiter.findMany({ orderBy: [{ nachname: "asc" }, { vorname: "asc" }] }),
        prisma.qualifikation.findMany({ orderBy: { name: "asc" } }),
        prisma.schulungsTeilnahme.findMany({
          where:   { teilgenommen: true, schulungstermin: { status: SchulungsStatus.ABSOLVIERT } },
          include: { schulungstermin: { select: { datum: true, qualifikationId: true } } },
        }),
      ]);

      // Neuestes Absolvierungsdatum je Mitarbeiter+Qualifikation ermitteln
      const neueste = new Map<string, Date>();
      for (const t of teilnahmen) {
        const key = `${t.mitarbeiterId}|${t.schulungstermin.qualifikationId}`;
        const bestehend = neueste.get(key);
        if (!bestehend || t.schulungstermin.datum > bestehend) {
          neueste.set(key, t.schulungstermin.datum);
        }
      }

      const jetzt = new Date();
      const zeilen = mitarbeiterListe.map(m => ({
        mitarbeiter: { id: m.id, vorname: m.vorname, nachname: m.nachname },
        zellen: qualifikationen.map(q => {
          const absolviertAm = neueste.get(`${m.id}|${q.id}`) ?? null;
          let gueltigBis: Date | null = null;
          let status: "NIE" | "GUELTIG" | "ABGELAUFEN" = "NIE";

          if (absolviertAm) {
            if (q.gueltigkeitsdauerMonate) {
              gueltigBis = new Date(absolviertAm);
              gueltigBis.setMonth(gueltigBis.getMonth() + q.gueltigkeitsdauerMonate);
              status = gueltigBis >= jetzt ? "GUELTIG" : "ABGELAUFEN";
            } else {
              status = "GUELTIG";
            }
          }

          return { qualifikationId: q.id, absolviertAm, gueltigBis, status };
        }),
      }));

      return reply.send({ qualifikationen, zeilen });
    }
  );

  // ── GET / – Schulungstermine auflisten ────────────────────────────
  app.get<{ Querystring: ListenFilter }>(
    "/",
    { preHandler: [authenticate] },
    async (request: FastifyRequest<{ Querystring: ListenFilter }>, reply: FastifyReply) => {
      const termine = await prisma.schulungstermin.findMany({
        where:   baueWhere(request.query),
        include: TEILNEHMER_INCLUDE,
        orderBy: [{ datum: "desc" }],
      });
      return reply.send(termine);
    }
  );

  // ── POST / – neuen Termin anlegen ─────────────────────────────────
  app.post<{ Body: NeuerTermin }>(
    "/",
    { preHandler: [authenticate] },
    async (request: FastifyRequest<{ Body: NeuerTermin }>, reply: FastifyReply) => {
      const { qualifikationId, titel, datum, ort, anbieter, kosten, status, bemerkung, teilnehmerIds } = request.body;

      if (!qualifikationId) return reply.status(400).send({ fehler: "qualifikationId ist ein Pflichtfeld" });
      if (!datum)           return reply.status(400).send({ fehler: "datum ist ein Pflichtfeld" });

      const qualifikation = await prisma.qualifikation.findUnique({ where: { id: qualifikationId } });
      if (!qualifikation) return reply.status(404).send({ fehler: "Qualifikation nicht gefunden" });

      const termin = await prisma.schulungstermin.create({
        data: {
          qualifikationId,
          titel:         titel?.trim() || null,
          datum:         new Date(datum),
          ort:           ort?.trim() || null,
          anbieter:      anbieter?.trim() || null,
          kosten:        kosten ?? null,
          status:        status ?? SchulungsStatus.GEPLANT,
          bemerkung:     bemerkung?.trim() || null,
          erstelltVonId: request.benutzer.sub,
          ...(teilnehmerIds?.length ? {
            teilnehmer: { create: teilnehmerIds.map(mitarbeiterId => ({ mitarbeiterId })) },
          } : {}),
        },
        include: TEILNEHMER_INCLUDE,
      });

      return reply.status(201).send(termin);
    }
  );

  // ── PUT /:id – Termin bearbeiten ──────────────────────────────────
  app.put<{ Params: { id: string }; Body: TerminUpdate }>(
    "/:id",
    { preHandler: [authenticate] },
    async (request: FastifyRequest<{ Params: { id: string }; Body: TerminUpdate }>, reply: FastifyReply) => {
      const { id } = request.params;
      const { qualifikationId, titel, datum, ort, anbieter, kosten, status, bemerkung } = request.body;

      const vorhandener = await prisma.schulungstermin.findUnique({ where: { id } });
      if (!vorhandener) return reply.status(404).send({ fehler: "Termin nicht gefunden" });

      if (qualifikationId) {
        const qualifikation = await prisma.qualifikation.findUnique({ where: { id: qualifikationId } });
        if (!qualifikation) return reply.status(404).send({ fehler: "Qualifikation nicht gefunden" });
      }

      const aktualisiert = await prisma.schulungstermin.update({
        where: { id },
        data: {
          ...(qualifikationId !== undefined ? { qualifikationId } : {}),
          ...(titel           !== undefined ? { titel: titel?.trim() || null } : {}),
          ...(datum           !== undefined ? { datum: new Date(datum) } : {}),
          ...(ort             !== undefined ? { ort: ort?.trim() || null } : {}),
          ...(anbieter        !== undefined ? { anbieter: anbieter?.trim() || null } : {}),
          ...(kosten          !== undefined ? { kosten } : {}),
          ...(status          !== undefined ? { status } : {}),
          ...(bemerkung       !== undefined ? { bemerkung: bemerkung?.trim() || null } : {}),
        },
        include: TEILNEHMER_INCLUDE,
      });

      return reply.send(aktualisiert);
    }
  );

  // ── DELETE /:id – Termin löschen ──────────────────────────────────
  app.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [authenticate] },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;
      const vorhandener = await prisma.schulungstermin.findUnique({ where: { id } });
      if (!vorhandener) return reply.status(404).send({ fehler: "Termin nicht gefunden" });

      await prisma.schulungstermin.delete({ where: { id } });
      return reply.send({ ok: true });
    }
  );

  // ── POST /:id/teilnehmer – Teilnehmer hinzufügen ──────────────────
  app.post<{ Params: { id: string }; Body: { mitarbeiterId: string; teilgenommen?: boolean } }>(
    "/:id/teilnehmer",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { id } = request.params;
      const { mitarbeiterId, teilgenommen } = request.body;

      if (!mitarbeiterId) return reply.status(400).send({ fehler: "mitarbeiterId ist ein Pflichtfeld" });

      const termin = await prisma.schulungstermin.findUnique({ where: { id } });
      if (!termin) return reply.status(404).send({ fehler: "Termin nicht gefunden" });

      const mitarbeiter = await prisma.mitarbeiter.findUnique({ where: { id: mitarbeiterId } });
      if (!mitarbeiter) return reply.status(404).send({ fehler: "Mitarbeiter nicht gefunden" });

      const vorhanden = await prisma.schulungsTeilnahme.findUnique({
        where: { schulungsterminId_mitarbeiterId: { schulungsterminId: id, mitarbeiterId } },
      });
      if (vorhanden) return reply.status(409).send({ fehler: "Mitarbeiter ist bereits Teilnehmer" });

      await prisma.schulungsTeilnahme.create({
        data: { schulungsterminId: id, mitarbeiterId, teilgenommen: teilgenommen ?? true },
      });

      const aktualisiert = await prisma.schulungstermin.findUnique({ where: { id }, include: TEILNEHMER_INCLUDE });
      return reply.status(201).send(aktualisiert);
    }
  );

  // ── PATCH /:id/teilnehmer/:mitarbeiterId – Teilnahme-Status ändern ─
  app.patch<{ Params: { id: string; mitarbeiterId: string }; Body: { teilgenommen: boolean } }>(
    "/:id/teilnehmer/:mitarbeiterId",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { id, mitarbeiterId } = request.params;
      const { teilgenommen } = request.body;

      const vorhanden = await prisma.schulungsTeilnahme.findUnique({
        where: { schulungsterminId_mitarbeiterId: { schulungsterminId: id, mitarbeiterId } },
      });
      if (!vorhanden) return reply.status(404).send({ fehler: "Teilnahme nicht gefunden" });

      await prisma.schulungsTeilnahme.update({
        where: { schulungsterminId_mitarbeiterId: { schulungsterminId: id, mitarbeiterId } },
        data:  { teilgenommen },
      });

      const aktualisiert = await prisma.schulungstermin.findUnique({ where: { id }, include: TEILNEHMER_INCLUDE });
      return reply.send(aktualisiert);
    }
  );

  // ── DELETE /:id/teilnehmer/:mitarbeiterId – Teilnehmer entfernen ──
  app.delete<{ Params: { id: string; mitarbeiterId: string } }>(
    "/:id/teilnehmer/:mitarbeiterId",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { id, mitarbeiterId } = request.params;

      const vorhanden = await prisma.schulungsTeilnahme.findUnique({
        where: { schulungsterminId_mitarbeiterId: { schulungsterminId: id, mitarbeiterId } },
      });
      if (!vorhanden) return reply.status(404).send({ fehler: "Teilnahme nicht gefunden" });

      await prisma.schulungsTeilnahme.delete({
        where: { schulungsterminId_mitarbeiterId: { schulungsterminId: id, mitarbeiterId } },
      });

      const aktualisiert = await prisma.schulungstermin.findUnique({ where: { id }, include: TEILNEHMER_INCLUDE });
      return reply.send(aktualisiert);
    }
  );
}
