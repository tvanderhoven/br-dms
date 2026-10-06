/**
 * Sitzungspaket – alle zusammengehörenden Dateien einer Sitzung als ein ZIP
 * (Paket 4, Stufe 5)
 *
 * GET /api/sitzungen/:id/sitzungspaket
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import AdmZip from "adm-zip";
import fs from "node:fs/promises";
import path from "node:path";
import { SitzungScanTyp, SitzungStatus, AuditAktion } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { decryptFile } from "../lib/encryption.js";
import { STORAGE_SITZUNG_SCANS as STORAGE, MASTER_KEY } from "../lib/sitzungScan.js";
import { istBetriebsversammlung } from "../lib/sitzungstypen.js";

const ROLLE_LABEL: Record<string, string> = {
  VORSITZ: "Vorsitz", STELLVERTRETER: "Stellv. Vorsitz", MITGLIED: "Mitglied",
  ERSATZMITGLIED: "Ersatzmitglied", JAV: "JAV", ADMIN: "Admin",
};

function csvZelle(v: string): string {
  return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function dateinameTeil(titel: string): string {
  return titel.replace(/[^a-zA-Z0-9äöüÄÖÜß]/g, "-");
}

function erweiterungVon(dateiname: string, mimeTyp: string): string {
  const ext = path.extname(dateiname);
  if (ext) return ext;
  return mimeTyp === "application/pdf" ? ".pdf" : mimeTyp === "image/png" ? ".png" : ".jpg";
}

export async function sitzungspaketRouten(app: FastifyInstance): Promise<void> {

  // Gleiche Zugriffsregel wie die einzelnen Bestandteile (Protokoll-PDF, Scan-Download):
  // nur authenticate, keine Rollenbeschränkung – das Paket ist nicht sensibler als seine Teile.
  app.get(
    "/:id/sitzungspaket",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      const sitzung = await prisma.sitzung.findUnique({
        where:  { id },
        select: { titel: true, sitzungstyp: true, status: true },
      });
      if (!sitzung) return reply.status(404).send({ fehler: "Sitzung nicht gefunden" });

      if (sitzung.status !== SitzungStatus.PROTOKOLL_FINAL && sitzung.status !== SitzungStatus.ABGESCHLOSSEN) {
        return reply.status(409).send({ fehler: "Sitzungspaket erst nach Finalisierung des Protokolls verfügbar" });
      }

      const istBV = istBetriebsversammlung(sitzung.sitzungstyp);
      const zip = new AdmZip();

      const [tagesordnung, protokoll, versandnachweis, scans] = await Promise.all([
        prisma.sitzungVersion.findFirst({ where: { sitzungId: id, typ: "TAGESORDNUNG_FIXIERT" }, select: { pdfPfad: true } }),
        prisma.sitzungVersion.findFirst({ where: { sitzungId: id, typ: "PROTOKOLL_FINAL" }, select: { pdfPfad: true } }),
        prisma.einladungVersand.findMany({ where: { sitzungId: id }, orderBy: { versendetAm: "asc" } }),
        prisma.sitzungScan.findMany({ where: { sitzungId: id } }),
      ]);

      if (tagesordnung?.pdfPfad) {
        const buffer = await fs.readFile(tagesordnung.pdfPfad).catch(() => null);
        if (buffer) zip.addFile(istBV ? "01_Einladung.pdf" : "01_Tagesordnung.pdf", buffer);
      }

      if (versandnachweis.length > 0) {
        const zeilen = [
          ["Name", "Adresse", "Rolle", "Vertretung für", "Versendet am", "Erfolgreich", "Fehler"],
          ...versandnachweis.map(v => [
            v.name, v.adresse, ROLLE_LABEL[v.rolle] ?? v.rolle, v.vertretungFuer ?? "",
            v.versendetAm.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }),
            v.erfolgreich ? "ja" : "nein", v.fehler ?? "",
          ]),
        ];
        const csv = "\uFEFF" + zeilen.map(z => z.map(csvZelle).join(";")).join("\r\n");
        zip.addFile("02_Versandnachweis.csv", Buffer.from(csv, "utf-8"));
      }

      if (protokoll?.pdfPfad) {
        const buffer = await fs.readFile(protokoll.pdfPfad).catch(() => null);
        if (buffer) zip.addFile(istBV ? "03_Niederschrift.pdf" : "03_Protokoll.pdf", buffer);
      }

      const alScan = scans.find(s => s.typ === SitzungScanTyp.ANWESENHEITSLISTE);
      if (alScan) {
        const klartext = await decryptFile({
          sourcePath: path.join(STORAGE, alScan.speicherpfad, alScan.verschlPfad),
          masterKey:  MASTER_KEY,
          documentId: alScan.id,
        }).catch(() => null);
        if (klartext) zip.addFile(`04_Anwesenheitsliste-Scan${erweiterungVon(alScan.dateiname, alScan.mimeTyp)}`, klartext);
      }

      const protokollScan = scans.find(s => s.typ === SitzungScanTyp.PROTOKOLL_UNTERSCHRIFTEN);
      if (protokollScan) {
        const klartext = await decryptFile({
          sourcePath: path.join(STORAGE, protokollScan.speicherpfad, protokollScan.verschlPfad),
          masterKey:  MASTER_KEY,
          documentId: protokollScan.id,
        }).catch(() => null);
        if (klartext) zip.addFile(`05_Protokoll-Unterschriften-Scan${erweiterungVon(protokollScan.dateiname, protokollScan.mimeTyp)}`, klartext);
      }

      await prisma.auditLog.create({
        data: {
          sitzungId:  id,
          benutzerId: request.benutzer.sub,
          aktion:     AuditAktion.SITZUNGSPAKET_HERUNTERGELADEN,
          ip:         request.ip,
          userAgent:  request.headers["user-agent"] ?? null,
        },
      }).catch(() => {});

      const dateiname = `sitzungspaket-${dateinameTeil(sitzung.titel)}.zip`;
      return reply
        .header("Content-Type", "application/zip")
        .header("Content-Disposition", `attachment; filename="${dateiname}"`)
        .send(zip.toBuffer());
    }
  );
}
