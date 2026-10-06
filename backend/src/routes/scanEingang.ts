/**
 * Scan-Eingang – wartende Scans aus dem Watch-Folder-Unterordner "protokoll_scan",
 * bevor sie einer Sitzung + einem SitzungScanTyp zugeordnet werden.
 *
 * GET    /api/scan-eingang               – Liste der wartenden Scans
 * GET    /api/scan-eingang/:id/datei     – Datei entschlüsselt ansehen (inline)
 * POST   /api/scan-eingang/:id/zuordnen  – einer Sitzung + Typ(en) zuordnen
 * DELETE /api/scan-eingang/:id           – verwerfen, ohne zuzuordnen
 */

import { FastifyInstance } from "fastify";
import { Role, SitzungScanTyp } from "@prisma/client";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { erfordert } from "../middleware/rbac.js";
import { decryptFile, secureDelete } from "../lib/encryption.js";
import { STORAGE_SITZUNG_SCANS as STORAGE, MASTER_KEY, scanStatusFehler, speichereSitzungScan } from "../lib/sitzungScan.js";

const GUELTIGE_TYPEN = [SitzungScanTyp.ANWESENHEITSLISTE, SitzungScanTyp.PROTOKOLL_UNTERSCHRIFTEN];

export async function scanEingangRouten(app: FastifyInstance): Promise<void> {

  // ── GET / – Liste der wartenden Scans ───────────────────────────
  app.get(
    "/",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (_request, reply) => {
      const scans = await prisma.scanEingang.findMany({
        orderBy: { erkanntAm: "asc" },
        select:  { id: true, dateiname: true, dateigroesse: true, mimeTyp: true, erkanntAm: true },
      });
      return reply.send(scans);
    }
  );

  // ── GET /:id/datei – entschlüsselt ansehen (inline) ─────────────
  app.get<{ Params: { id: string } }>(
    "/:id/datei",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request, reply) => {
      const scan = await prisma.scanEingang.findUnique({ where: { id: request.params.id } });
      if (!scan) return reply.status(404).send({ fehler: "Nicht gefunden" });

      const klartext = await decryptFile({
        sourcePath: path.join(STORAGE, scan.speicherpfad, scan.verschlPfad),
        masterKey:  MASTER_KEY,
        documentId: scan.id,
      });

      return reply.header("Content-Type", scan.mimeTyp).send(klartext);
    }
  );

  // ── POST /:id/zuordnen – einer Sitzung + Typ(en) zuordnen ───────
  app.post<{ Params: { id: string }; Body: { sitzungId: string; typen: SitzungScanTyp[] } }>(
    "/:id/zuordnen",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request, reply) => {
      const { sitzungId, typen } = request.body;

      if (!sitzungId) return reply.status(400).send({ fehler: "sitzungId ist erforderlich" });
      const zieltypen = Array.from(new Set(typen ?? []));
      if (zieltypen.length === 0 || zieltypen.some(t => !GUELTIGE_TYPEN.includes(t))) {
        return reply.status(400).send({ fehler: "typen muss ANWESENHEITSLISTE und/oder PROTOKOLL_UNTERSCHRIFTEN enthalten" });
      }

      const scan = await prisma.scanEingang.findUnique({ where: { id: request.params.id } });
      if (!scan) return reply.status(404).send({ fehler: "Scan nicht gefunden" });

      const sitzung = await prisma.sitzung.findUnique({ where: { id: sitzungId }, select: { status: true } });
      if (!sitzung) return reply.status(404).send({ fehler: "Sitzung nicht gefunden" });

      for (const typ of zieltypen) {
        const fehler = scanStatusFehler(sitzung.status, typ);
        if (fehler) return reply.status(409).send({ fehler });
      }

      const tmpPfad = path.join(STORAGE, "tmp", `${randomUUID()}.tmp`);
      await fs.mkdir(path.join(STORAGE, "tmp"), { recursive: true });

      const klartext = await decryptFile({
        sourcePath: path.join(STORAGE, scan.speicherpfad, scan.verschlPfad),
        masterKey:  MASTER_KEY,
        documentId: scan.id,
      });
      await fs.writeFile(tmpPfad, klartext);

      try {
        for (const typ of zieltypen) {
          await speichereSitzungScan({
            sitzungId,
            typ,
            quellPfad:  tmpPfad,
            dateiname:  scan.dateiname,
            mimeTyp:    scan.mimeTyp,
            benutzerId: request.benutzer.sub,
          });
        }
      } finally {
        await fs.unlink(tmpPfad).catch(() => {});
      }

      await secureDelete(path.join(STORAGE, scan.speicherpfad, scan.verschlPfad)).catch(() => {});
      await prisma.scanEingang.delete({ where: { id: scan.id } });

      return reply.send({ ok: true });
    }
  );

  // ── DELETE /:id – verwerfen ──────────────────────────────────────
  app.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request, reply) => {
      const scan = await prisma.scanEingang.findUnique({ where: { id: request.params.id } });
      if (!scan) return reply.status(404).send({ fehler: "Nicht gefunden" });

      await secureDelete(path.join(STORAGE, scan.speicherpfad, scan.verschlPfad)).catch(() => {});
      await prisma.scanEingang.delete({ where: { id: scan.id } });

      return reply.send({ nachricht: "Scan verworfen" });
    }
  );
}
