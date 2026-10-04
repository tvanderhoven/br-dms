/**
 * PDF-Routen
 *
 * GET /api/sitzungen/:id/pdf/:versionNummer – PDF herunterladen
 * POST /api/sitzungen/:id/pdf/:versionNummer – PDF (neu) generieren (VORSITZ)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { Role } from "@prisma/client";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { erfordert } from "../middleware/rbac.js";
import { pdfGenerieren, anwesenheitslistePdfGenerieren, topAuszugPdfGenerieren } from "../services/pdf.service.js";
import { vergleicheNachMitgliederSortierung } from "../lib/mitgliederSortierung.js";

const STORAGE = process.env.STORAGE_PATH ?? "/data/storage";

async function sitzungFuerPdf(id: string) {
  return prisma.sitzung.findUnique({
    where: { id },
    select: {
      titel:         true,
      sitzungsdatum: true,
      ort:           true,
      sitzungstyp:   true,
      notizen:       true,
      teilnehmerzahl: true,
      erstelltVon:   { select: { name: true } },
      anwesenheiten: {
        select: {
          status:         true,
          benutzer:       { select: { id: true, name: true, rolle: true } },
          vertretungFuer: { select: { name: true } },
        },
        orderBy: { benutzer: { name: "asc" } },
      },
      tops: {
        orderBy: { nummer: "asc" },
        select: {
          nummer:      true,
          titel:       true,
          inhalt:      true,
          inhaltsJson: true,
          ergebnis:    true,
          ergebnisJson: true,
          status:      true,
          dokumente: {
            select: {
              dokument: { select: { titel: true, kategorie: true, aktenzeichen: true } },
            },
          },
          beschluesse: {
            orderBy: { reihenfolge: "asc" as const },
            select: {
              antragstext:     true,
              rechtsgrundlage: true,
              jaStimmen:       true,
              neinStimmen:     true,
              enthaltungen:    true,
              nichtTeilgenommen: true,
              anwesend:        true,
              ergebnis:        true,
              finalisiert:     true,
            },
          },
          kommentare: {
            orderBy: { erstelltAm: "asc" as const },
            select: {
              inhalt:     true,
              erstelltAm: true,
              autor:      { select: { name: true } },
            },
          },
          abstimmung: {
            select: {
              rechtsgrundlage: true,
              fragestellung:   true,
              jaStimmen:       true,
              neinStimmen:     true,
              enthaltungen:    true,
              anwesend:        true,
              ergebnis:        true,
              stimmen: {
                select: {
                  stimme:    true,
                  benutzer:  { select: { name: true } },
                },
              },
            },
          },
        },
      },
    },
  });
}

export async function pdfRouten(app: FastifyInstance): Promise<void> {

  // ── GET /:id/anwesenheitsliste – Anwesenheitsliste als PDF ────
  app.get(
    "/:id/anwesenheitsliste",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      const sitzung = await prisma.sitzung.findUnique({
        where: { id },
        select: { titel: true, sitzungsdatum: true, ort: true, sitzungstyp: true, status: true },
      });
      if (!sitzung) return reply.status(404).send({ fehler: "Sitzung nicht gefunden" });

      const alleBenutzer = await prisma.benutzer.findMany({
        where: { aktiv: true, rolle: { in: ["VORSITZ", "STELLVERTRETER", "MITGLIED", "ERSATZMITGLIED", "JAV"] } },
        select: { id: true, name: true, rolle: true, wahlReihenfolge: true },
      });
      alleBenutzer.sort(vergleicheNachMitgliederSortierung);

      const anwesenheiten = await prisma.anwesenheit.findMany({
        where: { sitzungId: id },
        select: {
          benutzerId:     true,
          status:         true,
          vertretungFuer: { select: { name: true } },
        },
      });

      const anwesenheitMap = new Map(anwesenheiten.map(a => [a.benutzerId, a]));

      const mitglieder = alleBenutzer.map(b => ({
        id:                b.id,
        name:              b.name,
        rolle:             b.rolle,
        status:            anwesenheitMap.get(b.id)?.status ?? null,
        vertretungFuerName: anwesenheitMap.get(b.id)?.vertretungFuer?.name ?? null,
      }));

      const buffer = await anwesenheitslistePdfGenerieren(sitzung, mitglieder);
      const dateiname = `anwesenheitsliste-${sitzung.titel.replace(/[^a-zA-Z0-9äöüÄÖÜß]/g, "-")}.pdf`;

      return reply
        .header("Content-Type", "application/pdf")
        .header("Content-Disposition", `attachment; filename="${dateiname}"`)
        .send(buffer);
    }
  );

  // ── GET – PDF herunterladen ────────────────────────────────────
  app.get(
    "/:id/pdf/:versionNummer",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, versionNummer } = request.params as { id: string; versionNummer: string };

      const version = await prisma.sitzungVersion.findUnique({
        where: { sitzungId_versionNummer: { sitzungId: id, versionNummer } },
        select: { id: true, pdfPfad: true, pdfDateiname: true, typ: true, versionNummer: true, erstelltAm: true, finalisiertAm: true },
      });

      if (!version) return reply.status(404).send({ fehler: "Version nicht gefunden" });

      // Wenn PDF noch nicht generiert → on-the-fly generieren
      if (!version.pdfPfad) {
        return reply.status(404).send({ fehler: "PDF wurde noch nicht generiert. Bitte zuerst fixieren oder finalisieren." });
      }

      try {
        const pdfBuffer = await fs.readFile(version.pdfPfad);
        return reply
          .header("Content-Type", "application/pdf")
          .header("Content-Disposition", `attachment; filename="${version.pdfDateiname ?? `sitzung-${versionNummer}.pdf`}"`)
          .send(pdfBuffer);
      } catch {
        return reply.status(404).send({ fehler: "PDF-Datei nicht gefunden" });
      }
    }
  );

  // ── POST – PDF manuell (neu) generieren ────────────────────────
  app.post(
    "/:id/pdf/:versionNummer",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, versionNummer } = request.params as { id: string; versionNummer: string };

      const version = await prisma.sitzungVersion.findUnique({
        where: { sitzungId_versionNummer: { sitzungId: id, versionNummer } },
        select: { id: true, typ: true, versionNummer: true, erstelltAm: true, finalisiertAm: true },
      });
      if (!version) return reply.status(404).send({ fehler: "Version nicht gefunden" });

      const sitzung = await sitzungFuerPdf(id);
      if (!sitzung) return reply.status(404).send({ fehler: "Sitzung nicht gefunden" });

      const mitProtokoll = version.typ === "PROTOKOLL_ENTWURF" || version.typ === "PROTOKOLL_FINAL";

      const { buffer, zeitstempel } = await pdfGenerieren(sitzung, version, mitProtokoll);

      const pdfDir      = path.join(STORAGE, "pdfs");
      const dateiname   = `sitzung-${id}-v${versionNummer}.pdf`;
      const pdfPfad     = path.join(pdfDir, dateiname);

      await fs.mkdir(pdfDir, { recursive: true });
      await fs.writeFile(pdfPfad, buffer);

      await prisma.sitzungVersion.update({
        where: { id: version.id },
        data: { pdfPfad, pdfDateiname: dateiname, pdfErstelltAm: new Date(), zeitstempel },
      });

      return reply
        .header("Content-Type", "application/pdf")
        .header("Content-Disposition", `attachment; filename="${dateiname}"`)
        .send(buffer);
    }
  );

  // ── GET /:id/tops/:topId/auszug – Einzelner TOP als PDF ─────────
  app.get(
    "/:id/tops/:topId/auszug",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, topId } = request.params as { id: string; topId: string };

      const sitzung = await prisma.sitzung.findUnique({
        where: { id },
        select: { titel: true, sitzungsdatum: true, ort: true, sitzungstyp: true },
      });
      if (!sitzung) return reply.status(404).send({ fehler: "Sitzung nicht gefunden" });

      const top = await prisma.tOP.findUnique({
        where: { id: topId },
        select: {
          nummer:      true,
          titel:       true,
          inhalt:      true,
          inhaltsJson: true,
          ergebnis:    true,
          ergebnisJson: true,
          status:      true,
          beschluesse: {
            orderBy: { reihenfolge: "asc" },
            select: { antragstext: true, ergebnis: true, finalisiert: true },
          },
        },
      });
      if (!top) return reply.status(404).send({ fehler: "TOP nicht gefunden" });

      const buffer = await topAuszugPdfGenerieren(sitzung, top);
      const dateiname = `auszug-top${top.nummer}-${sitzung.titel.replace(/[^a-zA-Z0-9äöüÄÖÜß]/g, "-")}.pdf`;

      return reply
        .header("Content-Type", "application/pdf")
        .header("Content-Disposition", `attachment; filename="${dateiname}"`)
        .send(buffer);
    }
  );
}

// ── Exportfunktion für interne Nutzung (fixieren/finalisieren) ────
export async function pdfAutomatischGenerieren(
  sitzungId:     string,
  versionId:     string,
  versionNummer: string,
  versionTyp:    string,
  erstelltAm:    Date,
  finalisiertAm: Date | null,
): Promise<void> {
  try {
    const sitzung = await sitzungFuerPdf(sitzungId);
    if (!sitzung) return;

    const mitProtokoll = versionTyp === "PROTOKOLL_ENTWURF" || versionTyp === "PROTOKOLL_FINAL";
    const { buffer, zeitstempel } = await pdfGenerieren(
      sitzung,
      { versionNummer, typ: versionTyp, erstelltAm, finalisiertAm },
      mitProtokoll,
    );

    const pdfDir    = path.join(STORAGE, "pdfs");
    const dateiname = `sitzung-${sitzungId}-v${versionNummer}.pdf`;
    const pdfPfad   = path.join(pdfDir, dateiname);

    await fs.mkdir(pdfDir, { recursive: true });
    await fs.writeFile(pdfPfad, buffer);

    await prisma.sitzungVersion.update({
      where: { id: versionId },
      data: { pdfPfad, pdfDateiname: dateiname, pdfErstelltAm: new Date(), zeitstempel },
    });
  } catch (err) {
    // PDF-Fehler nie nach oben — Sitzungs-Workflow soll nicht blockiert werden
    console.error("[PDF] Fehler bei automatischer Generierung:", err);
  }
}
