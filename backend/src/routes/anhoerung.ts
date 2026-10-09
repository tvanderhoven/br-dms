/**
 * Anhörung als Vorgang (§ 99 / § 102 BetrVG) – begleitet ein Dokument der
 * Kategorie ANHOERUNG_99/ANHOERUNG_102 von Eingang bis Versand der Stellungnahme.
 *
 * GET  /api/dokumente/:dokumentId/vorgang               – Vorgang + Fristen + verfügbare Beschlüsse
 * PATCH /api/dokumente/:dokumentId/vorgang              – Status/Stellungnahme manuell bearbeiten
 * POST /api/dokumente/:dokumentId/vorgang/aus-beschluss – Stellungnahme aus einem finalisierten Beschluss vorbefüllen
 * POST /api/dokumente/:dokumentId/vorgang/versenden     – als versendet markieren, Brief-PDF archivieren, Fristen erledigen
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { AnhoerungArt, AnhoerungStatus, AuditAktion, Kategorie, Role } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { darfDokumentSehen } from "../lib/vertraulich.js";
import { authenticate } from "../middleware/auth.js";
import { erfordert } from "../middleware/rbac.js";
import { encryptFile } from "../lib/encryption.js";
import { stellungnahmePdfGenerieren } from "../services/pdf.service.js";

const STORAGE    = process.env.STORAGE_PATH ?? "/data/storage";
const MASTER_KEY = process.env.ENCRYPTION_KEY!;

const VORGANG_INCLUDE = {
  beschluss: {
    select: {
      id: true, antragstext: true, rechtsgrundlage: true, finalisiertAm: true,
      top: { select: { nummer: true, titel: true, sitzung: { select: { titel: true } } } },
    },
  },
  versendetVon: { select: { name: true } },
} as const;

async function audit(request: FastifyRequest, aktion: AuditAktion, dokumentId: string, details: Record<string, unknown>) {
  await prisma.auditLog.create({
    data: {
      benutzerId: request.benutzer.sub,
      dokumentId,
      aktion,
      ip:         request.ip,
      userAgent:  request.headers["user-agent"] ?? null,
      details:    JSON.parse(JSON.stringify(details)),
    },
  }).catch(() => {});
}

/** Holt oder legt (für ältere Dokumente ohne Vorgang) den Vorgang zu einem Dokument an. */
async function vorgangSicherstellen(dokumentId: string) {
  const bestehend = await prisma.anhoerungsVorgang.findUnique({ where: { dokumentId } });
  if (bestehend) return bestehend;
  return prisma.anhoerungsVorgang.create({ data: { dokumentId } });
}

export async function anhoerungRouten(app: FastifyInstance): Promise<void> {

  // ── GET /:dokumentId/vorgang ─────────────────────────────────────
  app.get<{ Params: { dokumentId: string } }>(
    "/:dokumentId/vorgang",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { dokumentId } = request.params;
      const dokument = await prisma.dokument.findUnique({ where: { id: dokumentId } });
      if (!dokument) return reply.status(404).send({ fehler: "Dokument nicht gefunden" });
      if (!darfDokumentSehen(dokument, request.benutzer.rolle, request.benutzer.sub)) {
        return reply.status(403).send({ fehler: "Vertrauliches Dokument" });
      }
      if (dokument.kategorie !== Kategorie.ANHOERUNG_99 && dokument.kategorie !== Kategorie.ANHOERUNG_102) {
        return reply.status(400).send({ fehler: "Kein Anhörungs-Dokument" });
      }

      const vorgang = await vorgangSicherstellen(dokumentId);
      const vorgangMitRelationen = await prisma.anhoerungsVorgang.findUnique({
        where: { id: vorgang.id },
        include: VORGANG_INCLUDE,
      });

      const fristen = await prisma.frist.findMany({
        where:   { dokumentId },
        orderBy: { faelligAm: "asc" },
      });

      const verknuepfungen = await prisma.topDokument.findMany({
        where:   { dokumentId },
        include: {
          top: {
            select: {
              nummer: true, titel: true,
              sitzung:    { select: { titel: true } },
              beschluesse: {
                where:   { finalisiert: true },
                orderBy: { reihenfolge: "asc" },
                select:  { id: true, antragstext: true, rechtsgrundlage: true, finalisiertAm: true },
              },
            },
          },
        },
      });
      const verfuegbareBeschluesse = verknuepfungen.flatMap(v =>
        v.top.beschluesse.map(b => ({
          ...b,
          topNummer:    v.top.nummer,
          topTitel:     v.top.titel,
          sitzungTitel: v.top.sitzung.titel,
        }))
      );

      return reply.send({ vorgang: vorgangMitRelationen, fristen, verfuegbareBeschluesse });
    }
  );

  // ── PATCH /:dokumentId/vorgang – manuell bearbeiten ───────────────
  app.patch<{
    Params: { dokumentId: string };
    Body: {
      status?: AnhoerungStatus;
      stellungnahmeArt?: AnhoerungArt | null;
      stellungnahmeGruende?: string[];
      stellungnahmeText?: string | null;
    };
  }>(
    "/:dokumentId/vorgang",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request, reply) => {
      const { dokumentId } = request.params;
      const { status, stellungnahmeArt, stellungnahmeGruende, stellungnahmeText } = request.body ?? {};

      if (status && !Object.values(AnhoerungStatus).includes(status)) {
        return reply.status(400).send({ fehler: "Unbekannter Status" });
      }
      if (stellungnahmeArt && !Object.values(AnhoerungArt).includes(stellungnahmeArt)) {
        return reply.status(400).send({ fehler: "Unbekannte Stellungnahme-Art" });
      }

      const vorgang = await vorgangSicherstellen(dokumentId);
      const aktualisiert = await prisma.anhoerungsVorgang.update({
        where: { id: vorgang.id },
        data: {
          ...(status !== undefined && { status }),
          ...(stellungnahmeArt !== undefined && { stellungnahmeArt }),
          ...(stellungnahmeGruende !== undefined && { stellungnahmeGruende }),
          ...(stellungnahmeText !== undefined && { stellungnahmeText: stellungnahmeText?.trim() || null }),
        },
        include: VORGANG_INCLUDE,
      });

      if (status !== undefined) {
        await audit(request, AuditAktion.ANHOERUNG_STATUS_GEAENDERT, dokumentId, { status });
      }
      if (stellungnahmeArt !== undefined || stellungnahmeGruende !== undefined || stellungnahmeText !== undefined) {
        await audit(request, AuditAktion.ANHOERUNG_STELLUNGNAHME_GESPEICHERT, dokumentId, { stellungnahmeArt });
      }

      return reply.send(aktualisiert);
    }
  );

  // ── POST /:dokumentId/vorgang/aus-beschluss ───────────────────────
  app.post<{ Params: { dokumentId: string }; Body: { beschlussId?: string } }>(
    "/:dokumentId/vorgang/aus-beschluss",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request, reply) => {
      const { dokumentId } = request.params;
      const { beschlussId } = request.body ?? {};
      if (!beschlussId) return reply.status(400).send({ fehler: "beschlussId ist ein Pflichtfeld" });

      const beschluss = await prisma.beschluss.findUnique({
        where:   { id: beschlussId },
        include: { top: { include: { dokumente: { select: { dokumentId: true } } } } },
      });
      if (!beschluss) return reply.status(404).send({ fehler: "Beschluss nicht gefunden" });
      if (!beschluss.finalisiert) {
        return reply.status(409).send({ fehler: "Beschluss ist noch nicht finalisiert" });
      }
      const istVerknuepft = beschluss.top.dokumente.some(d => d.dokumentId === dokumentId);
      if (!istVerknuepft) {
        return reply.status(409).send({ fehler: "Beschluss gehört zu keinem mit diesem Dokument verknüpften TOP" });
      }

      const bereitsGenutzt = await prisma.anhoerungsVorgang.findFirst({
        where: { beschlussId, NOT: { dokumentId } },
      });
      if (bereitsGenutzt) {
        return reply.status(409).send({ fehler: "Dieser Beschluss ist bereits einem anderen Vorgang zugeordnet" });
      }

      const art: AnhoerungArt = beschluss.rechtsgrundlage.includes("§ 99")
        ? AnhoerungArt.ZUSTIMMUNGSVERWEIGERUNG
        : beschluss.rechtsgrundlage.includes("§ 102")
        ? AnhoerungArt.WIDERSPRUCH
        : AnhoerungArt.ZUSTIMMUNG;

      const vorgang = await vorgangSicherstellen(dokumentId);
      const aktualisiert = await prisma.anhoerungsVorgang.update({
        where: { id: vorgang.id },
        data: {
          beschlussId,
          stellungnahmeArt:  art,
          stellungnahmeText: beschluss.antragstext,
          status:            AnhoerungStatus.BESCHLOSSEN,
        },
        include: VORGANG_INCLUDE,
      });

      await audit(request, AuditAktion.ANHOERUNG_STELLUNGNAHME_GESPEICHERT, dokumentId, { beschlussId, art });
      return reply.send(aktualisiert);
    }
  );

  // ── POST /:dokumentId/vorgang/versenden ───────────────────────────
  app.post<{ Params: { dokumentId: string }; Body: { versandDatum?: string } }>(
    "/:dokumentId/vorgang/versenden",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request: FastifyRequest<{ Params: { dokumentId: string }; Body: { versandDatum?: string } }>, reply: FastifyReply) => {
      const { dokumentId } = request.params;
      const dokument = await prisma.dokument.findUnique({ where: { id: dokumentId } });
      if (!dokument) return reply.status(404).send({ fehler: "Dokument nicht gefunden" });

      const vorgang = await vorgangSicherstellen(dokumentId);

      const versandDatum = request.body?.versandDatum ? new Date(request.body.versandDatum) : new Date();
      if (Number.isNaN(versandDatum.getTime())) {
        return reply.status(400).send({ fehler: "Ungültiges Versanddatum" });
      }

      const pdf = await stellungnahmePdfGenerieren(dokument, {
        stellungnahmeArt:     vorgang.stellungnahmeArt,
        stellungnahmeGruende: vorgang.stellungnahmeGruende,
        stellungnahmeText:    vorgang.stellungnahmeText,
      });

      const neueId = randomUUID();
      const relPfad = Kategorie.SCHRIFTVERKEHR.toLowerCase();
      const encName = `${neueId}.enc`;
      const tmpPfad = path.join(STORAGE, "tmp", `${neueId}.tmp`);
      await fs.mkdir(path.join(STORAGE, "tmp"), { recursive: true });
      await fs.mkdir(path.join(STORAGE, relPfad), { recursive: true });
      await fs.writeFile(tmpPfad, pdf);
      const { checksum } = await encryptFile({
        sourcePath: tmpPfad,
        destPath:   path.join(STORAGE, relPfad, encName),
        masterKey:  MASTER_KEY,
        documentId: neueId,
      });
      await fs.unlink(tmpPfad);

      const dokTitel = dokument.alias ?? dokument.titel;
      const versandDokument = await prisma.dokument.create({
        data: {
          id:              neueId,
          titel:           `Stellungnahme – ${dokTitel}`,
          kategorie:       Kategorie.SCHRIFTVERKEHR,
          dateiname:       `Stellungnahme_${dokTitel.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`,
          speicherpfad:    relPfad,
          verschlPfad:     encName,
          dateigroesse:    pdf.length,
          mimeTyp:         "application/pdf",
          pruefsumme:       checksum,
          aktenzeichen:    dokument.aktenzeichen,
          hochgeladenVonId: request.benutzer.sub,
        },
      });
      await audit(request, AuditAktion.DOKUMENT_ERSTELLT, versandDokument.id, {
        kategorie: Kategorie.SCHRIFTVERKEHR, quelle: "ANHOERUNG_VERSAND",
      });

      const aktualisiert = await prisma.anhoerungsVorgang.update({
        where: { id: vorgang.id },
        data: {
          status:            AnhoerungStatus.BEANTWORTET,
          versendetAm:       versandDatum,
          versendetVonId:    request.benutzer.sub,
          versandDokumentId: versandDokument.id,
        },
        include: VORGANG_INCLUDE,
      });

      const erledigt = await prisma.frist.updateMany({
        where: { dokumentId, status: "OFFEN" },
        data:  { status: "ERLEDIGT", erledigtAm: versandDatum, erledigtVonId: request.benutzer.sub },
      });

      await audit(request, AuditAktion.ANHOERUNG_VERSENDET, dokumentId, {
        versandDatum, versandDokumentId: versandDokument.id, fristenErledigt: erledigt.count,
      });

      return reply.send({ vorgang: aktualisiert, versandDokumentId: versandDokument.id, fristenErledigt: erledigt.count });
    }
  );
}
