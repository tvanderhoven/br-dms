/**
 * Scan-Upload für Unterschriften (Paket 4, Stufe 4)
 *
 * POST   /api/sitzungen/:id/scans                  – Scan hochladen (ziel: ANWESENHEITSLISTE | PROTOKOLL_UNTERSCHRIFTEN | BEIDE)
 * GET    /api/sitzungen/:id/scans/:typ/download     – Scan entschlüsselt herunterladen
 * DELETE /api/sitzungen/:id/scans/:typ              – Scan löschen
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { SitzungScanTyp, AuditAktion, Role } from "@prisma/client";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { erfordert } from "../middleware/rbac.js";
import { decryptFile, secureDelete } from "../lib/encryption.js";
import { STORAGE_SITZUNG_SCANS as STORAGE, MASTER_KEY, scanStatusFehler, speichereSitzungScan } from "../lib/sitzungScan.js";

const ERLAUBTE_MIMETYPEN = ["application/pdf", "image/jpeg", "image/png"];

async function audit(
  sitzungId: string,
  benutzerId: string,
  aktion: AuditAktion,
  request: FastifyRequest,
  details?: object
) {
  await prisma.auditLog.create({
    data: {
      sitzungId,
      benutzerId,
      aktion,
      ip:        request.ip,
      userAgent: request.headers["user-agent"] ?? null,
      details:   details ? JSON.parse(JSON.stringify(details)) : null,
    },
  }).catch(() => {});
}

export async function sitzungScanRouten(app: FastifyInstance): Promise<void> {

  // ── POST /:id/scans – Scan hochladen ────────────────────────────
  app.post<{ Params: { id: string } }>(
    "/:id/scans",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request, reply) => {
      const { id } = request.params;

      const sitzung = await prisma.sitzung.findUnique({
        where: { id },
        select: { id: true, status: true },
      });
      if (!sitzung) return reply.status(404).send({ fehler: "Sitzung nicht gefunden" });

      const data = await request.file();
      if (!data) return reply.status(400).send({ fehler: "Keine Datei übermittelt" });

      if (!ERLAUBTE_MIMETYPEN.includes(data.mimetype)) {
        return reply.status(400).send({ fehler: "Nur PDF, JPG oder PNG erlaubt" });
      }

      const fields = data.fields as Record<string, { value: string }>;
      const ziel   = fields.ziel?.value;

      if (ziel !== "ANWESENHEITSLISTE" && ziel !== "PROTOKOLL_UNTERSCHRIFTEN" && ziel !== "BEIDE") {
        return reply.status(400).send({ fehler: "ziel muss ANWESENHEITSLISTE, PROTOKOLL_UNTERSCHRIFTEN oder BEIDE sein" });
      }

      const ziele: SitzungScanTyp[] = ziel === "BEIDE"
        ? [SitzungScanTyp.ANWESENHEITSLISTE, SitzungScanTyp.PROTOKOLL_UNTERSCHRIFTEN]
        : [ziel as SitzungScanTyp];

      for (const typ of ziele) {
        const fehler = scanStatusFehler(sitzung.status, typ);
        if (fehler) return reply.status(409).send({ fehler });
      }

      const tmpId   = randomUUID();
      const tmpPfad = path.join(STORAGE, "tmp", `${tmpId}.tmp`);
      await fs.mkdir(path.join(STORAGE, "tmp"), { recursive: true });

      await pipeline(data.file as any, createWriteStream(tmpPfad)).catch(async (err) => {
        await fs.unlink(tmpPfad).catch(() => {});
        throw err;
      });

      try {
        for (const typ of ziele) {
          await speichereSitzungScan({
            sitzungId:  id,
            typ,
            quellPfad:  tmpPfad,
            dateiname:  data.filename,
            mimeTyp:    data.mimetype,
            benutzerId: request.benutzer.sub,
          });
        }
      } finally {
        await fs.unlink(tmpPfad).catch(() => {});
      }

      return reply.status(201).send({ ok: true });
    }
  );

  // ── GET /:id/scans/:typ/download – entschlüsselt herunterladen ──
  app.get<{ Params: { id: string; typ: string } }>(
    "/:id/scans/:typ/download",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { id } = request.params;
      const typParam = request.params.typ;
      if (typParam !== SitzungScanTyp.ANWESENHEITSLISTE && typParam !== SitzungScanTyp.PROTOKOLL_UNTERSCHRIFTEN) {
        return reply.status(400).send({ fehler: "Unbekannter Scan-Typ" });
      }
      const typ = typParam as SitzungScanTyp;

      const scan = await prisma.sitzungScan.findUnique({
        where: { sitzungId_typ: { sitzungId: id, typ } },
      });
      if (!scan) return reply.status(404).send({ fehler: "Kein Scan vorhanden" });

      const encPfad  = path.join(STORAGE, scan.speicherpfad, scan.verschlPfad);
      const klartext = await decryptFile({
        sourcePath: encPfad,
        masterKey:  MASTER_KEY,
        documentId: scan.id,
      });

      return reply
        .header("Content-Type", scan.mimeTyp)
        .header("Content-Disposition", `attachment; filename="${encodeURIComponent(scan.dateiname)}"`)
        .send(klartext);
    }
  );

  // ── DELETE /:id/scans/:typ – Scan löschen ───────────────────────
  app.delete<{ Params: { id: string; typ: string } }>(
    "/:id/scans/:typ",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request, reply) => {
      const { id } = request.params;
      const typParam = request.params.typ;
      if (typParam !== SitzungScanTyp.ANWESENHEITSLISTE && typParam !== SitzungScanTyp.PROTOKOLL_UNTERSCHRIFTEN) {
        return reply.status(400).send({ fehler: "Unbekannter Scan-Typ" });
      }
      const typ = typParam as SitzungScanTyp;

      const scan = await prisma.sitzungScan.findUnique({
        where: { sitzungId_typ: { sitzungId: id, typ } },
      });
      if (!scan) return reply.status(404).send({ fehler: "Kein Scan vorhanden" });

      await secureDelete(path.join(STORAGE, scan.speicherpfad, scan.verschlPfad)).catch(() => {});
      await prisma.sitzungScan.delete({ where: { id: scan.id } });

      await audit(id, request.benutzer.sub, AuditAktion.SITZUNG_SCAN_GELOESCHT, request, { typ, dateiname: scan.dateiname });

      return reply.send({ nachricht: "Scan gelöscht" });
    }
  );
}
