/**
 * Geschäftsordnung des Betriebsrats (§ 36 BetrVG)
 *
 * GET    /api/geschaeftsordnung        – Liste, neueste zuerst (alle authentifizierten Benutzer)
 * POST   /api/geschaeftsordnung        – neue Fassung anlegen (nur VORSITZ)
 * PUT    /api/geschaeftsordnung/:id    – Fassung bearbeiten (nur VORSITZ)
 * DELETE /api/geschaeftsordnung/:id    – Fassung löschen (nur VORSITZ)
 *
 * § 36 BetrVG verlangt für die Geschäftsordnung die Mehrheit ALLER Mitglieder,
 * nicht nur der Anwesenden (strenger als die normale Beschlussfähigkeit § 33 Abs. 2) – daher
 * optional mit einem finalisierten Beschluss verknüpfbar, dessen Ja-Stimmen gegen die zum
 * Zeitpunkt der Abstimmung eingefrorene Soll-Stärke geprüft werden (nur Warnung, kein Blocker,
 * damit ältere/papierne Fassungen ohne Systembeschluss weiter erfassbar bleiben).
 *
 * Je Fassung außerdem die Regeln für die Teilnahme per Video/Telefon (§ 30 Abs. 2 Nr. 1,
 * lib/videoSitzung.ts): erlaubt ja/nein, optional nicht bei vertraulichen TOPs, Freitext für Bedingungen.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { AuditAktion, Role } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { erfordert } from "../middleware/rbac.js";
import { istGeschaeftsordnungsMehrheit } from "../lib/beschlussfaehigkeit.js";

interface VideoFelder {
  videoErlaubt?:          boolean;
  videoNichtVertraulich?: boolean;
  videoBedingungen?:      string | null;
}

interface NeueGeschaeftsordnung extends VideoFelder {
  beschlossenAm?: string;
  bemerkung?:     string;
  dokumentIds?:   string[];
  beschlussId?:   string;
}

interface GeschaeftsordnungUpdate extends VideoFelder {
  beschlossenAm?: string;
  bemerkung?:     string | null;
  beschlussId?:   string | null;
}

interface DokumentZuweisen {
  dokumentId: string;
}

/** Nur gesetzte Felder übernehmen; „nicht bei vertraulichen TOPs“ ergibt nur mit Zuschaltung Sinn */
function videoDaten(b: VideoFelder) {
  return {
    ...(b.videoErlaubt !== undefined ? { videoErlaubt: !!b.videoErlaubt } : {}),
    ...(b.videoNichtVertraulich !== undefined ? { videoNichtVertraulich: !!b.videoNichtVertraulich && b.videoErlaubt !== false } : {}),
    ...(b.videoBedingungen !== undefined ? { videoBedingungen: b.videoBedingungen?.trim().slice(0, 4000) || null } : {}),
  };
}

const DOKUMENT_SELECT  = { id: true, titel: true, dateiname: true };
const BESCHLUSS_SELECT = {
  id: true, antragstext: true, jaStimmen: true, neinStimmen: true, sollStaerke: true, finalisiertAm: true,
  top: { select: { nummer: true, titel: true, sitzung: { select: { titel: true } } } },
};

/** goMehrheitErreicht: null = nicht prüfbar (kein Beschluss verknüpft oder Beschluss ohne Soll-Stärke). */
function mitMehrheit<T extends { beschluss: { jaStimmen: number; sollStaerke: number | null } | null }>(fassung: T) {
  const goMehrheitErreicht = fassung.beschluss?.sollStaerke != null
    ? istGeschaeftsordnungsMehrheit(fassung.beschluss.jaStimmen, fassung.beschluss.sollStaerke)
    : null;
  return { ...fassung, goMehrheitErreicht };
}

async function beschlussPruefen(beschlussId: string, reply: FastifyReply) {
  const beschluss = await prisma.beschluss.findUnique({
    where: { id: beschlussId },
    select: { id: true, finalisiert: true, finalisiertAm: true, geschaeftsordnung: { select: { id: true } } },
  });
  if (!beschluss) { reply.status(404).send({ fehler: "Beschluss nicht gefunden" }); return null; }
  if (!beschluss.finalisiert) { reply.status(409).send({ fehler: "Nur finalisierte Beschlüsse können verknüpft werden" }); return null; }
  return beschluss;
}

export async function geschaeftsordnungRouten(app: FastifyInstance): Promise<void> {

  // ── GET / – Liste ────────────────────────────────────────────────
  app.get(
    "/",
    { preHandler: [authenticate] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const fassungen = await prisma.geschaeftsordnung.findMany({
        include: {
          dokumente: {
            include: { dokument: { select: DOKUMENT_SELECT } },
            orderBy: { reihenfolge: "asc" },
          },
          beschluss: { select: BESCHLUSS_SELECT },
        },
        orderBy: [{ beschlossenAm: "desc" }],
      });
      const mitDoks = fassungen.map(f => ({
        ...f,
        dokumente: f.dokumente.map(gd => gd.dokument),
      }));
      return reply.send(mitDoks.map(mitMehrheit));
    }
  );

  // ── POST / – neue Fassung anlegen ───────────────────────────────
  app.post<{ Body: NeueGeschaeftsordnung }>(
    "/",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request: FastifyRequest<{ Body: NeueGeschaeftsordnung }>, reply: FastifyReply) => {
      const { beschlossenAm, bemerkung, dokumentIds = [], beschlussId } = request.body;

      let datum = beschlossenAm ? new Date(beschlossenAm) : null;

      if (beschlussId) {
        const beschluss = await beschlussPruefen(beschlussId, reply);
        if (!beschluss) return;
        if (beschluss.geschaeftsordnung) {
          return reply.status(409).send({ fehler: "Dieser Beschluss ist schon mit einer anderen Fassung verknüpft" });
        }
        datum = beschluss.finalisiertAm!;
      }
      if (!datum) return reply.status(400).send({ fehler: "beschlossenAm oder beschlussId ist ein Pflichtfeld" });

      if (dokumentIds.length > 0) {
        const dokumente = await prisma.dokument.findMany({
          where: { id: { in: dokumentIds } },
          select: { id: true },
        });
        if (dokumente.length !== dokumentIds.length) {
          return reply.status(404).send({ fehler: "Ein oder mehrere Dokumente nicht gefunden" });
        }
      }

      const fassung = await prisma.geschaeftsordnung.create({
        data: {
          beschlossenAm: datum,
          bemerkung:     bemerkung?.trim() || null,
          beschlussId:   beschlussId || null,
          ...videoDaten(request.body),
          erstelltVonId: request.benutzer.sub,
          dokumente: {
            create: dokumentIds.map((dokumentId, idx) => ({
              dokumentId,
              reihenfolge: idx,
            })),
          },
        },
        include: {
          dokumente: {
            include: { dokument: { select: DOKUMENT_SELECT } },
            orderBy: { reihenfolge: "asc" },
          },
          beschluss: { select: BESCHLUSS_SELECT },
        },
      });

      const mitDoks = {
        ...fassung,
        dokumente: fassung.dokumente.map(gd => gd.dokument),
      };

      await prisma.auditLog.create({
        data: {
          benutzerId: request.benutzer.sub,
          aktion:     AuditAktion.GESCHAEFTSORDNUNG_ERSTELLT,
          ip:         request.ip,
          userAgent:  request.headers["user-agent"] ?? null,
          details:    { id: fassung.id, beschlossenAm: fassung.beschlossenAm, beschlussId: fassung.beschlussId },
        },
      }).catch(() => {});

      return reply.status(201).send(mitMehrheit(mitDoks));
    }
  );

  // ── PUT /:id – Fassung bearbeiten ───────────────────────────────
  app.put<{ Params: { id: string }; Body: GeschaeftsordnungUpdate }>(
    "/:id",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request: FastifyRequest<{ Params: { id: string }; Body: GeschaeftsordnungUpdate }>, reply: FastifyReply) => {
      const { id } = request.params;
      const { beschlossenAm, bemerkung, beschlussId } = request.body;

      const vorhandene = await prisma.geschaeftsordnung.findUnique({ where: { id } });
      if (!vorhandene) return reply.status(404).send({ fehler: "Geschäftsordnung nicht gefunden" });

      let datum = beschlossenAm !== undefined ? new Date(beschlossenAm) : undefined;
      if (beschlussId !== undefined && beschlussId !== null) {
        if (beschlussId !== vorhandene.beschlussId) {
          const beschluss = await beschlussPruefen(beschlussId, reply);
          if (!beschluss) return;
          if (beschluss.geschaeftsordnung) {
            return reply.status(409).send({ fehler: "Dieser Beschluss ist schon mit einer anderen Fassung verknüpft" });
          }
          datum = beschluss.finalisiertAm!;
        }
      }

      const aktualisiert = await prisma.geschaeftsordnung.update({
        where: { id },
        data: {
          ...(datum !== undefined ? { beschlossenAm: datum } : {}),
          ...(bemerkung   !== undefined ? { bemerkung: bemerkung?.trim() || null } : {}),
          ...(beschlussId !== undefined ? { beschlussId: beschlussId || null } : {}),
          ...videoDaten(request.body),
        },
        include: {
          dokumente: {
            include: { dokument: { select: DOKUMENT_SELECT } },
            orderBy: { reihenfolge: "asc" },
          },
          beschluss: { select: BESCHLUSS_SELECT },
        },
      });

      const mitDoks = {
        ...aktualisiert,
        dokumente: aktualisiert.dokumente.map(gd => gd.dokument),
      };

      await prisma.auditLog.create({
        data: {
          benutzerId: request.benutzer.sub,
          aktion:     AuditAktion.GESCHAEFTSORDNUNG_AKTUALISIERT,
          ip:         request.ip,
          userAgent:  request.headers["user-agent"] ?? null,
          details:    { id: aktualisiert.id, beschlossenAm: aktualisiert.beschlossenAm, beschlussId: aktualisiert.beschlussId },
        },
      }).catch(() => {});

      return reply.send(mitMehrheit(mitDoks));
    }
  );

  // ── POST /:id/dokumente – Dokument zu Fassung hinzufügen ─────────
  app.post<{ Params: { id: string }; Body: DokumentZuweisen }>(
    "/:id/dokumente",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request: FastifyRequest<{ Params: { id: string }; Body: DokumentZuweisen }>, reply: FastifyReply) => {
      const { id } = request.params;
      const { dokumentId } = request.body;

      const fassung = await prisma.geschaeftsordnung.findUnique({ where: { id } });
      if (!fassung) return reply.status(404).send({ fehler: "Geschäftsordnung nicht gefunden" });

      const dokument = await prisma.dokument.findUnique({ where: { id: dokumentId } });
      if (!dokument) return reply.status(404).send({ fehler: "Dokument nicht gefunden" });

      const existiert = await prisma.geschaeftsordnungDokument.findUnique({
        where: { geschaeftsordnungId_dokumentId: { geschaeftsordnungId: id, dokumentId } },
      });
      if (existiert) return reply.status(409).send({ fehler: "Dokument ist bereits mit dieser Fassung verknüpft" });

      const maxReihenfolge = await prisma.geschaeftsordnungDokument.findFirst({
        where: { geschaeftsordnungId: id },
        orderBy: { reihenfolge: "desc" },
        select: { reihenfolge: true },
      });

      await prisma.geschaeftsordnungDokument.create({
        data: {
          geschaeftsordnungId: id,
          dokumentId,
          reihenfolge: (maxReihenfolge?.reihenfolge ?? -1) + 1,
        },
      });

      const aktualisiert = await prisma.geschaeftsordnung.findUnique({
        where: { id },
        include: {
          dokumente: {
            include: { dokument: { select: DOKUMENT_SELECT } },
            orderBy: { reihenfolge: "asc" },
          },
          beschluss: { select: BESCHLUSS_SELECT },
        },
      });

      const mitDoks = {
        ...aktualisiert!,
        dokumente: aktualisiert!.dokumente.map(gd => gd.dokument),
      };

      return reply.status(201).send(mitDoks);
    }
  );

  // ── DELETE /:id/dokumente/:dokumentId – Dokument entfernen ───────
  app.delete<{ Params: { id: string; dokumentId: string } }>(
    "/:id/dokumente/:dokumentId",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request: FastifyRequest<{ Params: { id: string; dokumentId: string } }>, reply: FastifyReply) => {
      const { id, dokumentId } = request.params;

      const fassung = await prisma.geschaeftsordnung.findUnique({ where: { id } });
      if (!fassung) return reply.status(404).send({ fehler: "Geschäftsordnung nicht gefunden" });

      const verknuepfung = await prisma.geschaeftsordnungDokument.findUnique({
        where: { geschaeftsordnungId_dokumentId: { geschaeftsordnungId: id, dokumentId } },
      });
      if (!verknuepfung) return reply.status(404).send({ fehler: "Dokument ist nicht mit dieser Fassung verknüpft" });

      await prisma.geschaeftsordnungDokument.delete({
        where: { id: verknuepfung.id },
      });

      const aktualisiert = await prisma.geschaeftsordnung.findUnique({
        where: { id },
        include: {
          dokumente: {
            include: { dokument: { select: DOKUMENT_SELECT } },
            orderBy: { reihenfolge: "asc" },
          },
          beschluss: { select: BESCHLUSS_SELECT },
        },
      });

      const mitDoks = {
        ...aktualisiert!,
        dokumente: aktualisiert!.dokumente.map(gd => gd.dokument),
      };

      return reply.send(mitDoks);
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
