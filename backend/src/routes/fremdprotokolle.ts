/**
 * Fremdprotokolle (Paket 5)
 *
 * Protokoll eines Gremiums, das der BR nicht selbst im System führt (ASA,
 * Wirtschaftsausschuss, Gesamtbetriebsrat, ...) – ein einzelnes hochgeladenes
 * Dokument mit Gremium + Datum, ohne TOPs/Anwesenheit. Verschlüsselung wie bei
 * Dokument/SitzungScan (AES-256-GCM, siehe lib/encryption.ts).
 *
 * GET    /api/fremdprotokolle              – Liste (Filter: gremiumId)
 * POST   /api/fremdprotokolle              – Upload (nur VORSITZ)
 * GET    /api/fremdprotokolle/:id/download – entschlüsselt herunterladen
 * PATCH  /api/fremdprotokolle/:id          – Metadaten ändern (nur VORSITZ)
 * DELETE /api/fremdprotokolle/:id          – löschen (nur VORSITZ)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { AuditAktion, Role } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { fremdprotokollVertraulichFilter } from "../lib/vertraulich.js";
import { authenticate } from "../middleware/auth.js";
import { erfordert } from "../middleware/rbac.js";
import { encryptFile, decryptFile, secureDelete } from "../lib/encryption.js";

const STORAGE    = process.env.STORAGE_PATH ?? "/data/storage";
const MASTER_KEY = process.env.ENCRYPTION_KEY!;
const REL_PFAD    = "fremdprotokolle";

const ERLAUBTE_MIMETYPEN = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-word.document.macroEnabled.12",
];

interface ListenFilter {
  gremiumId?: string;
}

interface Update {
  titel?:      string;
  datum?:      string;
  bemerkung?:  string | null;
  vertraulich?: boolean;
  gremiumId?:  string;
}

const GREMIUM_SELECT = { id: true, name: true };


export async function fremdprotokolleRouten(app: FastifyInstance): Promise<void> {

  // ── GET / – Liste ────────────────────────────────────────────────
  app.get<{ Querystring: ListenFilter }>(
    "/",
    { preHandler: [authenticate] },
    async (request: FastifyRequest<{ Querystring: ListenFilter }>, reply: FastifyReply) => {
      const { gremiumId } = request.query;
      const rolle = request.benutzer.rolle;
      const sub   = request.benutzer.sub;

      const protokolle = await prisma.fremdprotokoll.findMany({
        where: {
          ...(gremiumId ? { gremiumId } : {}),
          ...fremdprotokollVertraulichFilter(rolle, sub),
        },
        include: { gremium: { select: GREMIUM_SELECT } },
        orderBy: [{ datum: "desc" }],
      });
      return reply.send(protokolle);
    }
  );

  // ── POST / – Upload ────────────────────────────────────────────
  app.post(
    "/",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const data = await request.file();
      if (!data) return reply.status(400).send({ fehler: "Keine Datei übermittelt" });

      if (!ERLAUBTE_MIMETYPEN.includes(data.mimetype)) {
        return reply.status(400).send({ fehler: "Nur PDF, JPG, PNG, DOCX oder DOCM erlaubt" });
      }

      const fields      = data.fields as Record<string, { value: string }>;
      const gremiumId   = fields.gremiumId?.value;
      const datum       = fields.datum?.value;
      const titel       = fields.titel?.value?.trim();
      const bemerkung   = fields.bemerkung?.value?.trim() ?? undefined;
      const vertraulich = fields.vertraulich?.value === "true";

      if (!gremiumId || !datum || !titel) {
        return reply.status(400).send({ fehler: "gremiumId, datum und titel sind Pflichtfelder" });
      }

      const gremium = await prisma.gremium.findUnique({ where: { id: gremiumId } });
      if (!gremium) return reply.status(404).send({ fehler: "Gremium nicht gefunden" });

      const datumParsed = new Date(datum);
      if (Number.isNaN(datumParsed.getTime())) {
        return reply.status(400).send({ fehler: "Ungültiges Datum" });
      }

      const id      = randomUUID();
      const tmpPfad = path.join(STORAGE, "tmp", `${id}.tmp`);
      const encName = `${id}.enc`;
      const encPfad = path.join(STORAGE, REL_PFAD, encName);

      await fs.mkdir(path.join(STORAGE, "tmp"), { recursive: true });
      await fs.mkdir(path.join(STORAGE, REL_PFAD), { recursive: true });

      await pipeline(data.file as any, createWriteStream(tmpPfad)).catch(async (err) => {
        await fs.unlink(tmpPfad).catch(() => {});
        throw err;
      });

      const stat = await fs.stat(tmpPfad);

      const { checksum } = await encryptFile({
        sourcePath: tmpPfad,
        destPath:   encPfad,
        masterKey:  MASTER_KEY,
        documentId: id,
      }).catch(async (err) => {
        await fs.unlink(tmpPfad).catch(() => {});
        throw err;
      });

      await fs.unlink(tmpPfad);

      const protokoll = await prisma.fremdprotokoll.create({
        data: {
          id,
          gremiumId,
          datum:       datumParsed,
          titel,
          bemerkung:   bemerkung || null,
          vertraulich,
          dateiname:   data.filename,
          speicherpfad: REL_PFAD,
          verschlPfad:  encName,
          dateigroesse: stat.size,
          mimeTyp:      data.mimetype,
          pruefsumme:   checksum,
          hochgeladenVonId: request.benutzer.sub,
        },
        include: { gremium: { select: GREMIUM_SELECT } },
      });

      await prisma.auditLog.create({
        data: {
          benutzerId: request.benutzer.sub,
          aktion:     AuditAktion.FREMDPROTOKOLL_ERSTELLT,
          ip:         request.ip,
          userAgent:  request.headers["user-agent"] ?? null,
          details:    { id: protokoll.id, titel: protokoll.titel, gremium: gremium.name },
        },
      }).catch(() => {});

      return reply.status(201).send(protokoll);
    }
  );

  // ── GET /:id/download – entschlüsselt herunterladen ────────────
  app.get<{ Params: { id: string } }>(
    "/:id/download",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { rolle, sub } = request.benutzer;
      const protokoll = await prisma.fremdprotokoll.findFirst({
        where: { id: request.params.id, ...fremdprotokollVertraulichFilter(rolle, sub) },
      });
      if (!protokoll) {
        const vorhanden = await prisma.fremdprotokoll.count({ where: { id: request.params.id } });
        return vorhanden
          ? reply.status(403).send({ fehler: "Vertrauliches Fremdprotokoll – nur für Vorsitz, Stellvertretung und Mitglieder des Gremiums" })
          : reply.status(404).send({ fehler: "Nicht gefunden" });
      }

      const encPfad  = path.join(STORAGE, protokoll.speicherpfad, protokoll.verschlPfad);
      const klartext = await decryptFile({
        sourcePath: encPfad,
        masterKey:  MASTER_KEY,
        documentId: protokoll.id,
      });

      await prisma.auditLog.create({
        data: {
          benutzerId: request.benutzer.sub,
          aktion:     AuditAktion.FREMDPROTOKOLL_HERUNTERGELADEN,
          ip:         request.ip,
          userAgent:  request.headers["user-agent"] ?? null,
          details:    { id: protokoll.id, titel: protokoll.titel },
        },
      }).catch(() => {});

      return reply
        .header("Content-Type", protokoll.mimeTyp)
        .header("Content-Disposition", `attachment; filename="${encodeURIComponent(protokoll.dateiname)}"`)
        .header("Content-Length", klartext.length)
        .send(klartext);
    }
  );

  // ── PATCH /:id – Metadaten ändern ───────────────────────────────
  app.patch<{ Params: { id: string }; Body: Update }>(
    "/:id",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request: FastifyRequest<{ Params: { id: string }; Body: Update }>, reply: FastifyReply) => {
      const { id } = request.params;
      const { titel, datum, bemerkung, vertraulich, gremiumId } = request.body;

      const vorhandenes = await prisma.fremdprotokoll.findUnique({ where: { id } });
      if (!vorhandenes) return reply.status(404).send({ fehler: "Nicht gefunden" });

      if (gremiumId !== undefined) {
        const gremium = await prisma.gremium.findUnique({ where: { id: gremiumId } });
        if (!gremium) return reply.status(404).send({ fehler: "Gremium nicht gefunden" });
      }

      let datumParsed: Date | undefined;
      if (datum !== undefined) {
        datumParsed = new Date(datum);
        if (Number.isNaN(datumParsed.getTime())) {
          return reply.status(400).send({ fehler: "Ungültiges Datum" });
        }
      }

      const aktualisiert = await prisma.fremdprotokoll.update({
        where: { id },
        data: {
          ...(titel       !== undefined ? { titel: titel.trim() } : {}),
          ...(datumParsed !== undefined ? { datum: datumParsed } : {}),
          ...(bemerkung   !== undefined ? { bemerkung: bemerkung?.trim() || null } : {}),
          ...(vertraulich !== undefined ? { vertraulich } : {}),
          ...(gremiumId   !== undefined ? { gremiumId } : {}),
        },
        include: { gremium: { select: GREMIUM_SELECT } },
      });

      await prisma.auditLog.create({
        data: {
          benutzerId: request.benutzer.sub,
          aktion:     AuditAktion.FREMDPROTOKOLL_AKTUALISIERT,
          ip:         request.ip,
          userAgent:  request.headers["user-agent"] ?? null,
          details:    { id: aktualisiert.id, titel: aktualisiert.titel },
        },
      }).catch(() => {});

      return reply.send(aktualisiert);
    }
  );

  // ── DELETE /:id – löschen ───────────────────────────────────────
  app.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;
      const vorhandenes = await prisma.fremdprotokoll.findUnique({ where: { id } });
      if (!vorhandenes) return reply.status(404).send({ fehler: "Nicht gefunden" });

      await secureDelete(path.join(STORAGE, vorhandenes.speicherpfad, vorhandenes.verschlPfad)).catch(() => {});
      await prisma.fremdprotokoll.delete({ where: { id } });

      await prisma.auditLog.create({
        data: {
          benutzerId: request.benutzer.sub,
          aktion:     AuditAktion.FREMDPROTOKOLL_GELOESCHT,
          ip:         request.ip,
          userAgent:  request.headers["user-agent"] ?? null,
          details:    { id: vorhandenes.id, titel: vorhandenes.titel },
        },
      }).catch(() => {});

      return reply.send({ ok: true });
    }
  );
}
