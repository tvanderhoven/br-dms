/**
 * Dokument-Routen – Upload, Download, Liste, Löschen
 *
 * GET    /api/dokumente          – Liste
 * POST   /api/dokumente          – Upload (multipart)
 * GET    /api/dokumente/:id      – Metadaten
 * GET    /api/dokumente/:id/download – Entschlüsselt herunterladen
 * PATCH  /api/dokumente/:id      – Metadaten aktualisieren
 * DELETE /api/dokumente/:id      – Löschvormerkung setzen
 *
 * E-Mails (.eml/.msg):
 * GET    /api/dokumente/:id/email                        – Kopf, Text, HTML, abgelegte Anhänge
 * GET    /api/dokumente/:id/email/anhaenge/:nr           – Anhang herunterladen
 * POST   /api/dokumente/:id/email/anhaenge/:nr/ablegen   – Anhang als eigenes Dokument
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { Kategorie, DokumentStatus, AuditAktion, Role, SitzungStatus } from "@prisma/client";
import { Readable } from "node:stream";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { decryptFile, encryptFile } from "../lib/encryption.js";
import path from "node:path";
import prisma from "../lib/prisma.js";
import { dokumentVertraulichFilter, darfDokumentSehen, dokumentZugriffPruefen } from "../lib/vertraulich.js";
import { authenticate } from "../middleware/auth.js";
import { erfordert } from "../middleware/rbac.js";
import { verarbeiteDokument, anhangAblegen, UngueltigeEmailError } from "../services/dokument-pipeline.service.js";
import { emailFormat, emailLesen, istEmailMime, EmailFormat, EMAIL_MIME } from "../lib/email.js";

const STORAGE = process.env.STORAGE_PATH ?? "/data/storage";
const MASTER_KEY = process.env.ENCRYPTION_KEY!;

/** Gespeicherte E-Mail entschlüsseln und lesen */
async function gespeicherteEmail(dokument: { id: string; speicherpfad: string; verschlPfad: string; mimeTyp: string }) {
  const format: EmailFormat = dokument.mimeTyp === EMAIL_MIME.msg ? "msg" : "eml";
  const klartext = await decryptFile({
    sourcePath: path.join(STORAGE, dokument.speicherpfad, dokument.verschlPfad),
    masterKey:  MASTER_KEY,
    documentId: dokument.id,
  });
  return emailLesen(klartext, format);
}

export async function dokumentRouten(app: FastifyInstance): Promise<void> {

  // ── GET /inbox – nur Vorsitz/Stellvertreter (erstellen die Tagesordnung
  //               und ordnen dafür eingehende Dokumente zu) ────────────
  app.get(
    "/inbox",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { rolle, sub } = request.benutzer;

      const dokumente = await prisma.dokument.findMany({
        where: {
          inboxGelesen: false,
          status: { notIn: [DokumentStatus.GELOESCHT] },
          ...dokumentVertraulichFilter(rolle, sub),
        },
        select: {
          id:           true,
          titel:        true,
          alias:        true,
          tags:         true,
          kategorie:    true,
          mimeTyp:      true,
          dateiname:    true,
          dateigroesse: true,
          inboxQuelle:  true,
          inboxGelesen: true,
          erstelltAm:   true,
          hochgeladenVon: { select: { name: true } },
        },
        orderBy: { erstelltAm: "desc" },
      });

      return reply.send(dokumente);
    }
  );

  // ── GET /suche ────────────────────────────────────────────────
  app.get<{ Querystring: { q?: string; kategorie?: string } }>(
    "/suche",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { q, kategorie } = request.query;
      const { rolle, sub } = request.benutzer;
      if (!q || q.trim().length < 2) return reply.send([]);

      const suchbegriff = `%${q.trim()}%`;

      const dokumente = await prisma.dokument.findMany({
        where: {
          status: { notIn: [DokumentStatus.GELOESCHT] },
          ...dokumentVertraulichFilter(rolle, sub),
          ...(kategorie && Object.values(Kategorie).includes(kategorie as Kategorie)
            ? { kategorie: kategorie as Kategorie }
            : {}),
          OR: [
            { titel:      { contains: q.trim(), mode: "insensitive" } },
            { alias:      { contains: q.trim(), mode: "insensitive" } },
            { textinhalt: { contains: q.trim(), mode: "insensitive" } },
            { aktenzeichen: { contains: q.trim(), mode: "insensitive" } },
          ],
        },
        select: {
          id:          true,
          titel:       true,
          alias:       true,
          tags:        true,
          kategorie:   true,
          dateiname:   true,
          mimeTyp:     true,
          erstelltAm:  true,
        },
        take: 20,
        orderBy: { erstelltAm: "desc" },
      });

      return reply.send(dokumente);
    }
  );

  // ── GET / ──────────────────────────────────────────────────────
  app.get(
    "/",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { rolle, sub } = request.benutzer;

      const dokumente = await prisma.dokument.findMany({
        where: {
          status: { notIn: [DokumentStatus.GELOESCHT] },
          // Vertrauliche Dokumente: Vorsitz, Stellvertretung, Admin oder wer sie hochgeladen hat
          ...dokumentVertraulichFilter(rolle, sub),
        },
        select: {
          id:            true,
          titel:         true,
          alias:         true,
          kategorie:     true,
          status:        true,
          dateiname:     true,
          dateigroesse:  true,
          mimeTyp:       true,
          aktenzeichen:  true,
          vertraulich:   true,
          ordnerId:      true,
          emailKopf:     true,
          quelleDokument: { select: { id: true, titel: true, alias: true } },
          deleteAt:      true,
          erstelltAm:    true,
          textinhalt:    true,
          hochgeladenVon: { select: { name: true } },
          fristen: {
            where:  { status: "OFFEN" },
            select: { id: true, typ: true, faelligAm: true, status: true },
          },
          // In welchen Sitzungen/TOPs wurde das Dokument behandelt?
          topVerknuepfungen: {
            select: {
              top: {
                select: {
                  nummer: true,
                  titel:  true,
                  sitzung: { select: { id: true, titel: true, sitzungsdatum: true, gremium: { select: { id: true, name: true } } } },
                },
              },
            },
          },
        },
        orderBy: { erstelltAm: "desc" },
      });

      return reply.send(dokumente);
    }
  );

  // ── POST / – Upload ────────────────────────────────────────────
  app.post(
    "/",
    { preHandler: [authenticate, erfordert(Role.MITGLIED)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const data = await request.file();
      if (!data) return reply.status(400).send({ fehler: "Keine Datei übermittelt" });

      const erlaubt = [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-word.document.macroEnabled.12",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ];
      const istEmail = !!emailFormat(data.filename, data.mimetype);
      if (!erlaubt.includes(data.mimetype) && !istEmail) {
        return reply.status(400).send({ fehler: "Nur PDF, DOCX, DOCM, XLSX und E-Mails (EML, MSG) erlaubt" });
      }

      const fields         = data.fields as Record<string, { value: string }>;
      const titel          = fields.titel?.value?.trim();
      const kategorieStr   = fields.kategorie?.value as Kategorie;
      const aktenzeichen   = fields.aktenzeichen?.value?.trim() ?? undefined;
      const vertraulich    = fields.vertraulich?.value === "true";
      const ordnerId       = fields.ordnerId?.value || undefined;
      const kuendigungsArtStr = fields.kuendigungsArt?.value;
      const kuendigungsArt = kuendigungsArtStr === "ORDENTLICH" || kuendigungsArtStr === "AUSSERORDENTLICH"
        ? kuendigungsArtStr : undefined;

      // Bei E-Mails darf der Titel leer bleiben – dann gilt der Betreff
      if ((!titel && !istEmail) || !kategorieStr || !Object.values(Kategorie).includes(kategorieStr)) {
        return reply.status(400).send({ fehler: "titel und kategorie sind Pflichtfelder" });
      }
      const anhaengeAblegen = fields.anhaengeAblegen?.value === "true";
      if (ordnerId && !(await prisma.ordner.findUnique({ where: { id: ordnerId }, select: { id: true } }))) {
        return reply.status(400).send({ fehler: "Ordner nicht gefunden" });
      }

      try {
        const dokument = await verarbeiteDokument({
          stream:            data.file as any,
          originalDateiname: data.filename,
          mimetype:          data.mimetype,
          userId:            request.benutzer.sub,
          ip:                request.ip,
          userAgent:         request.headers["user-agent"],
          metadata:          { titel, kategorie: kategorieStr, aktenzeichen, vertraulich, inboxQuelle: "UPLOAD", kuendigungsArt, ordnerId, anhaengeAblegen },
        });
        return reply.status(201).send(dokument);
      } catch (err) {
        if (err instanceof UngueltigeEmailError) return reply.status(400).send({ fehler: err.message });
        throw err;
      }
    }
  );

  // ── GET /:id ───────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const dokument = await prisma.dokument.findUnique({
        where:  { id: request.params.id },
        include: { fristen: true, hochgeladenVon: { select: { name: true } } },
      });

      if (!dokument || dokument.status === DokumentStatus.GELOESCHT) {
        return reply.status(404).send({ fehler: "Nicht gefunden" });
      }

      if (!darfDokumentSehen(dokument, request.benutzer.rolle, request.benutzer.sub)) {
        return reply.status(403).send({ fehler: "Vertrauliches Dokument" });
      }

      await prisma.auditLog.create({
        data: {
          benutzerId: request.benutzer.sub,
          dokumentId: dokument.id,
          aktion:     AuditAktion.DOKUMENT_ANGESEHEN,
          ip:         request.ip,
          userAgent:  request.headers["user-agent"] ?? null,
        },
      });

      return reply.send(dokument);
    }
  );

  // ── GET /:id/download ──────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    "/:id/download",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const dokument = await prisma.dokument.findUnique({
        where: { id: request.params.id },
      });

      if (!dokument || dokument.status === DokumentStatus.GELOESCHT) {
        return reply.status(404).send({ fehler: "Nicht gefunden" });
      }

      if (!darfDokumentSehen(dokument, request.benutzer.rolle, request.benutzer.sub)) {
        return reply.status(403).send({ fehler: "Vertrauliches Dokument" });
      }

      const encPfad = path.join(STORAGE, dokument.speicherpfad, dokument.verschlPfad);
      const klartext = await decryptFile({
        sourcePath: encPfad,
        masterKey:  MASTER_KEY,
        documentId: dokument.id,
      });

      await prisma.auditLog.create({
        data: {
          benutzerId: request.benutzer.sub,
          dokumentId: dokument.id,
          aktion:     AuditAktion.DOKUMENT_HERUNTERGELADEN,
          ip:         request.ip,
          userAgent:  request.headers["user-agent"] ?? null,
        },
      });

      return reply
        .header("Content-Type", dokument.mimeTyp)
        .header("Content-Disposition", `attachment; filename="${encodeURIComponent(dokument.dateiname)}"`)
        .header("Content-Length", klartext.length)
        .send(klartext);
    }
  );

  // ── PATCH /:id – Metadaten aktualisieren ──────────────────────
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>(
    "/:id",
    { preHandler: [authenticate, erfordert(Role.MITGLIED)] },
    async (request, reply) => {
      const dokument = await prisma.dokument.findUnique({ where: { id: request.params.id } });
      if (!dokument || dokument.status === DokumentStatus.GELOESCHT) {
        return reply.status(404).send({ fehler: "Nicht gefunden" });
      }
      if (!darfDokumentSehen(dokument, request.benutzer.rolle, request.benutzer.sub)) {
        return reply.status(403).send({ fehler: "Vertrauliches Dokument" });
      }

      const body = request.body;
      const erlaubteFelder = ["alias", "tags", "kategorie", "aktenzeichen", "beschreibung", "vertraulich"] as const;
      const aenderungen: Record<string, unknown> = {};

      for (const feld of erlaubteFelder) {
        if (feld in body) aenderungen[feld] = body[feld];
      }

      if ("ordnerId" in body) {
        const ordnerId = (body["ordnerId"] as string | null) || null;
        if (ordnerId && !(await prisma.ordner.findUnique({ where: { id: ordnerId }, select: { id: true } }))) {
          return reply.status(400).send({ fehler: "Ordner nicht gefunden" });
        }
        aenderungen["ordnerId"] = ordnerId;
      }

      if ("deleteAt" in body) {
        // Ein Datum in der Vergangenheit würde der Lösch-Worker beim nächsten Lauf
        // endgültig vollstrecken – sofort löschen geht nur über DELETE /:id.
        const neu = body["deleteAt"] ? new Date(body["deleteAt"] as string) : null;
        if (neu && Number.isNaN(neu.getTime())) {
          return reply.status(400).send({ fehler: "Ungültiges Löschdatum" });
        }
        const heute = new Date(); heute.setHours(0, 0, 0, 0);
        if (neu && neu <= heute) {
          return reply.status(400).send({ fehler: "Das Löschdatum muss in der Zukunft liegen" });
        }
        aenderungen["deleteAt"] = neu;
      }
      if ("wiedervorlageAm" in body) {
        aenderungen["wiedervorlageAm"] = body["wiedervorlageAm"] ? new Date(body["wiedervorlageAm"] as string) : null;
      }

      if (Object.keys(aenderungen).length === 0) {
        return reply.status(400).send({ fehler: "Keine änderbaren Felder angegeben" });
      }

      // Feldnamen nur aus der festen Liste – nie aus der Anfrage übernehmen
      const protokollFelder = [...erlaubteFelder, "ordnerId", "deleteAt", "wiedervorlageAm"] as const;
      const vorher = Object.fromEntries(
        protokollFelder.filter(f => f in aenderungen).map(f => [f, (dokument as Record<string, unknown>)[f]]),
      );

      const aktualisiert = await prisma.dokument.update({
        where: { id: dokument.id },
        data:  aenderungen as any,
      });

      await prisma.auditLog.create({
        data: {
          benutzerId: request.benutzer.sub,
          dokumentId: dokument.id,
          aktion:     AuditAktion.DOKUMENT_METADATEN_GEAENDERT,
          ip:         request.ip,
          userAgent:  request.headers["user-agent"] ?? null,
          details:    JSON.parse(JSON.stringify({ vorher, nachher: aenderungen })),
        },
      });

      return reply.send(aktualisiert);
    }
  );

  // ── PATCH /:id/inbox-gelesen ───────────────────────────────────
  app.patch<{ Params: { id: string } }>(
    "/:id/inbox-gelesen",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const dokument = await prisma.dokument.findUnique({ where: { id: request.params.id } });
      if (!dokument || dokument.status === DokumentStatus.GELOESCHT) {
        return reply.status(404).send({ fehler: "Nicht gefunden" });
      }
      if (!darfDokumentSehen(dokument, request.benutzer.rolle, request.benutzer.sub)) {
        return reply.status(403).send({ fehler: "Vertrauliches Dokument" });
      }

      await prisma.dokument.update({
        where: { id: dokument.id },
        data:  { inboxGelesen: true, inboxGelesenAm: new Date() },
      });

      await prisma.auditLog.create({
        data: {
          benutzerId: request.benutzer.sub,
          dokumentId: dokument.id,
          aktion:     AuditAktion.INBOX_DOKUMENT_GELESEN,
          ip:         request.ip,
          userAgent:  request.headers["user-agent"] ?? null,
        },
      });

      return reply.send({ ok: true });
    }
  );

  // ── GET /:id/vorschau – Inline-PDF-Preview ─────────────────────
  app.get<{ Params: { id: string } }>(
    "/:id/vorschau",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const dokument = await prisma.dokument.findUnique({ where: { id: request.params.id } });
      if (!dokument || dokument.status === DokumentStatus.GELOESCHT) {
        return reply.status(404).send({ fehler: "Nicht gefunden" });
      }
      if (dokument.mimeTyp !== "application/pdf") {
        return reply.status(415).send({ fehler: "Nur PDF-Vorschau unterstützt" });
      }

      if (!darfDokumentSehen(dokument, request.benutzer.rolle, request.benutzer.sub)) {
        return reply.status(403).send({ fehler: "Vertrauliches Dokument" });
      }

      const encPfad = path.join(STORAGE, dokument.speicherpfad, dokument.verschlPfad);
      const klartext = await decryptFile({ sourcePath: encPfad, masterKey: MASTER_KEY, documentId: dokument.id });

      return reply
        .header("Content-Type", "application/pdf")
        .header("Content-Disposition", `inline; filename="${encodeURIComponent(dokument.dateiname)}"`)
        .header("Content-Length", klartext.length)
        .send(klartext);
    }
  );

  // ── GET /:id/email – E-Mail lesen ──────────────────────────────
  app.get<{ Params: { id: string } }>(
    "/:id/email",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const dokument = await prisma.dokument.findUnique({ where: { id: request.params.id } });
      if (!dokument || dokument.status === DokumentStatus.GELOESCHT) {
        return reply.status(404).send({ fehler: "Nicht gefunden" });
      }
      if (!istEmailMime(dokument.mimeTyp)) return reply.status(415).send({ fehler: "Keine E-Mail" });
      if (!darfDokumentSehen(dokument, request.benutzer.rolle, request.benutzer.sub)) {
        return reply.status(403).send({ fehler: "Vertrauliches Dokument" });
      }

      const mail = await gespeicherteEmail(dokument);
      // Bereits abgelegte Anhänge – nur die, die dieser Benutzer sehen darf
      const abgelegt = await prisma.dokument.findMany({
        where:  { quelleDokumentId: dokument.id, status: { not: DokumentStatus.GELOESCHT }, ...dokumentVertraulichFilter(request.benutzer.rolle, request.benutzer.sub) },
        select: { id: true, titel: true, alias: true, dateiname: true },
      });

      return reply.send({
        betreff: mail.betreff, von: mail.von, an: mail.an, cc: mail.cc, datum: mail.datum,
        text: mail.text, html: mail.html,
        anhaenge: mail.anhaenge.map(({ nr, name, mimeTyp, groesse, ablegbar }) => ({
          nr, name, mimeTyp, groesse, ablegbar,
          dokument: abgelegt.find(d => d.dateiname === name) ?? null,
        })),
      });
    }
  );

  // ── GET /:id/email/anhaenge/:nr – Anhang herunterladen ─────────
  app.get<{ Params: { id: string; nr: string } }>(
    "/:id/email/anhaenge/:nr",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const dokument = await prisma.dokument.findUnique({ where: { id: request.params.id } });
      if (!dokument || dokument.status === DokumentStatus.GELOESCHT || !istEmailMime(dokument.mimeTyp)) {
        return reply.status(404).send({ fehler: "Nicht gefunden" });
      }
      if (!darfDokumentSehen(dokument, request.benutzer.rolle, request.benutzer.sub)) {
        return reply.status(403).send({ fehler: "Vertrauliches Dokument" });
      }

      const mail = await gespeicherteEmail(dokument);
      const anhang = mail.anhaenge.find(a => a.nr === Number(request.params.nr));
      if (!anhang) return reply.status(404).send({ fehler: "Anhang nicht gefunden" });

      await prisma.auditLog.create({
        data: {
          benutzerId: request.benutzer.sub,
          dokumentId: dokument.id,
          aktion:     AuditAktion.DOKUMENT_HERUNTERGELADEN,
          ip:         request.ip,
          userAgent:  request.headers["user-agent"] ?? null,
          details:    { anhang: anhang.name },
        },
      });

      return reply
        .header("Content-Type", anhang.mimeTyp)
        .header("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(anhang.name)}`)
        .header("Content-Length", anhang.inhalt.length)
        .send(anhang.inhalt);
    }
  );

  // ── POST /:id/email/anhaenge/:nr/ablegen – Anhang als Dokument ─
  app.post<{ Params: { id: string; nr: string } }>(
    "/:id/email/anhaenge/:nr/ablegen",
    { preHandler: [authenticate, erfordert(Role.MITGLIED)] },
    async (request, reply) => {
      const dokument = await prisma.dokument.findUnique({ where: { id: request.params.id } });
      if (!dokument || dokument.status === DokumentStatus.GELOESCHT || !istEmailMime(dokument.mimeTyp)) {
        return reply.status(404).send({ fehler: "Nicht gefunden" });
      }
      if (!darfDokumentSehen(dokument, request.benutzer.rolle, request.benutzer.sub)) {
        return reply.status(403).send({ fehler: "Vertrauliches Dokument" });
      }

      const mail = await gespeicherteEmail(dokument);
      const anhang = mail.anhaenge.find(a => a.nr === Number(request.params.nr));
      if (!anhang) return reply.status(404).send({ fehler: "Anhang nicht gefunden" });
      if (!anhang.ablegbar) {
        return reply.status(400).send({ fehler: "Nur PDF, DOCX, DOCM, XLSX und E-Mails können als Dokument abgelegt werden – andere Anhänge bitte herunterladen" });
      }
      const vorhanden = await prisma.dokument.findFirst({
        where: { quelleDokumentId: dokument.id, dateiname: anhang.name, status: { not: DokumentStatus.GELOESCHT } },
        select: { id: true },
      });
      if (vorhanden) return reply.status(409).send({ fehler: "Dieser Anhang ist schon als Dokument abgelegt" });

      try {
        const neu = await anhangAblegen(dokument, anhang, request.benutzer.sub, {
          ip: request.ip, userAgent: request.headers["user-agent"],
        });
        return reply.status(201).send(neu);
      } catch (err) {
        if (err instanceof UngueltigeEmailError) return reply.status(400).send({ fehler: err.message });
        throw err;
      }
    }
  );

  // ── GET /:id/verknuepfungen ────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    "/:id/verknuepfungen",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { id } = request.params;
      if (!(await dokumentZugriffPruefen(id, request.benutzer, reply))) return reply;

      const [tops, aufgaben] = await Promise.all([
        prisma.topDokument.findMany({
          where: { dokumentId: id },
          include: {
            top: {
              select: {
                id: true, nummer: true, titel: true, status: true,
                sitzung: { select: { id: true, titel: true, sitzungsdatum: true, gremium: { select: { id: true, name: true } } } },
                beschluesse: { select: { id: true, antragstext: true, ergebnis: true } },
              },
            },
          },
        }),
        prisma.aufgabe.findMany({
          where: {
            dokumentId: id,
            OR: [
              { sichtbarkeit: "OEFFENTLICH" },
              { sichtbarkeit: "PRIVAT", erstelltVonId: (request as any).benutzer.sub },
            ],
          },
          select: {
            id: true, titel: true, prioritaet: true, erledigt: true, faelligAm: true,
            zugewiesenAn: { select: { name: true } },
          },
        }),
      ]);

      return reply.send({ tops: tops.map(t => t.top), aufgaben });
    }
  );

  // ── POST /:id/aktionen/sitzung-top ────────────────────────────
  app.post<{ Params: { id: string }; Body: { sitzungId: string; topTitel: string; topId?: string; fristDatum?: string } }>(
    "/:id/aktionen/sitzung-top",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request, reply) => {
      const { id } = request.params;
      const { sitzungId, topTitel, topId, fristDatum } = request.body;

      const dokument = await prisma.dokument.findUnique({ where: { id } });
      if (!dokument || dokument.status === DokumentStatus.GELOESCHT) {
        return reply.status(404).send({ fehler: "Nicht gefunden" });
      }

      const sitzung = await prisma.sitzung.findUnique({ where: { id: sitzungId } });
      if (!sitzung) return reply.status(404).send({ fehler: "Sitzung nicht gefunden" });

      // Gleiche Regel wie auf der Sitzungsseite (routes/sitzungen.ts, POST /:id/tops bzw.
      // POST /:id/tops/:topId/dokumente): eine fixierte Tagesordnung ist eingefroren –
      // neue TOPs nur im ENTWURF, neue Dokumente danach nur noch bei Spontan-TOPs.
      if (sitzung.status === SitzungStatus.PROTOKOLL_FINAL || sitzung.status === SitzungStatus.ABGESCHLOSSEN || sitzung.status === SitzungStatus.ABGESAGT) {
        return reply.status(409).send({ fehler: "Finalisierte Sitzungen sind unveränderlich" });
      }

      let zielTopId = topId;
      if (!zielTopId) {
        if (sitzung.status !== SitzungStatus.ENTWURF) {
          return reply.status(409).send({ fehler: "TOPs können nur in Sitzungen im Status ENTWURF hinzugefügt werden" });
        }
        const vorhandeneNummern = await prisma.tOP.findMany({
          where: { sitzungId }, select: { nummer: true }, orderBy: { nummer: "desc" }, take: 1,
        });
        const naechsteNummer = (vorhandeneNummern[0]?.nummer ?? 0) + 1;
        const neuerTop = await prisma.tOP.create({
          data: { sitzungId, nummer: naechsteNummer, titel: topTitel },
        });
        zielTopId = neuerTop.id;
      } else {
        const top = await prisma.tOP.findFirst({ where: { id: zielTopId, sitzungId }, select: { spontan: true } });
        if (!top) return reply.status(404).send({ fehler: "TOP nicht gefunden" });
        if (sitzung.status !== SitzungStatus.ENTWURF && !top.spontan) {
          return reply.status(409).send({ fehler: "Die Tagesordnung ist fixiert – Dokumente können nur noch bei Spontan-TOPs verknüpft werden" });
        }
      }

      await prisma.topDokument.upsert({
        where: { topId_dokumentId: { topId: zielTopId!, dokumentId: id } },
        create: { topId: zielTopId!, dokumentId: id, verknuepftVonId: request.benutzer.sub },
        update: {},
      });

      if (fristDatum) {
        await prisma.frist.create({
          data: {
            dokumentId: id,
            typ:        "BENUTZERDEFINIERT",
            faelligAm:  new Date(fristDatum),
            bezeichnung: `Sitzung: ${sitzung.titel}`,
          },
        });
      }

      await prisma.dokument.update({
        where: { id },
        data:  { inboxGelesen: true, inboxGelesenAm: new Date() },
      });

      await prisma.auditLog.create({
        data: {
          benutzerId: request.benutzer.sub,
          dokumentId: id,
          sitzungId,
          aktion:     AuditAktion.DOKUMENT_TOP_GEAENDERT,
          details:    { topId: zielTopId, sitzungId },
        },
      });

      return reply.status(201).send({ topId: zielTopId });
    }
  );

  // ── POST /:id/aktionen/wissensarchiv ──────────────────────────
  app.post<{ Params: { id: string }; Body: { tags?: string[]; kategorie?: Kategorie } }>(
    "/:id/aktionen/wissensarchiv",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request, reply) => {
      const { id } = request.params;
      const { tags, kategorie } = request.body;

      const dokument = await prisma.dokument.findUnique({ where: { id } });
      if (!dokument || dokument.status === DokumentStatus.GELOESCHT) {
        return reply.status(404).send({ fehler: "Nicht gefunden" });
      }

      const daten: Record<string, unknown> = { inboxGelesen: true, inboxGelesenAm: new Date() };
      if (tags)      daten.tags      = tags;
      if (kategorie) daten.kategorie = kategorie;

      const aktualisiert = await prisma.dokument.update({ where: { id }, data: daten as any });

      await prisma.auditLog.create({
        data: {
          benutzerId: request.benutzer.sub,
          dokumentId: id,
          aktion:     AuditAktion.DOKUMENT_TAG_GEAENDERT,
          details:    { tags, kategorie },
        },
      });

      return reply.send(aktualisiert);
    }
  );

  // ── POST /:id/aktionen/aufgabe ────────────────────────────────
  app.post<{ Params: { id: string }; Body: { titel: string; zugewiesenAnId?: string; prioritaet?: string; faelligAm?: string; sichtbarkeit?: string } }>(
    "/:id/aktionen/aufgabe",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request, reply) => {
      const { id } = request.params;
      const { titel, zugewiesenAnId, prioritaet, faelligAm, sichtbarkeit } = request.body;

      const dokument = await prisma.dokument.findUnique({ where: { id } });
      if (!dokument || dokument.status === DokumentStatus.GELOESCHT) {
        return reply.status(404).send({ fehler: "Nicht gefunden" });
      }

      const aufgabe = await prisma.aufgabe.create({
        data: {
          titel,
          dokumentId:     id,
          erstelltVonId:  request.benutzer.sub,
          zugewiesenAnId: zugewiesenAnId ?? null,
          prioritaet:     (prioritaet as any) ?? "MITTEL",
          sichtbarkeit:   (sichtbarkeit as any) ?? "OEFFENTLICH",
          faelligAm:      faelligAm ? new Date(faelligAm) : null,
        },
      });

      await prisma.auditLog.create({
        data: {
          benutzerId: request.benutzer.sub,
          dokumentId: id,
          aktion:     AuditAktion.DOKUMENT_AUFGABE_ERSTELLT,
          details:    { aufgabeId: aufgabe.id, titel },
        },
      });

      return reply.status(201).send(aufgabe);
    }
  );

  // ── POST /:id/aktionen/erledigt ───────────────────────────────
  app.post<{ Params: { id: string } }>(
    "/:id/aktionen/erledigt",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request, reply) => {
      const { id } = request.params;

      const dokument = await prisma.dokument.findUnique({ where: { id } });
      if (!dokument || dokument.status === DokumentStatus.GELOESCHT) {
        return reply.status(404).send({ fehler: "Nicht gefunden" });
      }

      await prisma.dokument.update({
        where: { id },
        data:  { inboxGelesen: true, inboxGelesenAm: new Date() },
      });

      await prisma.auditLog.create({
        data: {
          benutzerId: request.benutzer.sub,
          dokumentId: id,
          aktion:     AuditAktion.INBOX_DOKUMENT_GELESEN,
          details:    { erledigt: true },
        },
      });

      return reply.send({ ok: true });
    }
  );

  // ── GET /:id/versionen ────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    "/:id/versionen",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const dokument = await prisma.dokument.findUnique({ where: { id: request.params.id } });
      if (!dokument || dokument.status === DokumentStatus.GELOESCHT) {
        return reply.status(404).send({ fehler: "Nicht gefunden" });
      }
      if (!darfDokumentSehen(dokument, request.benutzer.rolle, request.benutzer.sub)) {
        return reply.status(403).send({ fehler: "Vertrauliches Dokument" });
      }

      const versionen = await prisma.dokumentVersion.findMany({
        where: { dokumentId: request.params.id },
        orderBy: { version: "desc" },
        include: { dokument: { select: { hochgeladenVonId: true } } },
      });

      const benutzerIds = [...new Set(versionen.map(v => v.erstelltVonId))];
      const benutzer = await prisma.benutzer.findMany({
        where: { id: { in: benutzerIds } },
        select: { id: true, name: true },
      });
      const benutzerMap = Object.fromEntries(benutzer.map(b => [b.id, b.name]));

      return reply.send(versionen.map(v => ({
        id:             v.id,
        version:        v.version,
        dateiname:      v.dateiname,
        dateigroesse:   v.dateigroesse,
        aenderungsnotiz: v.aenderungsnotiz,
        erstelltAm:     v.erstelltAm,
        erstelltVon:    benutzerMap[v.erstelltVonId] ?? v.erstelltVonId,
      })));
    }
  );

  // ── POST /:id/versionen – neue Version hochladen ───────────────
  app.post<{ Params: { id: string } }>(
    "/:id/versionen",
    { preHandler: [authenticate, erfordert(Role.MITGLIED)] },
    async (request, reply) => {
      const dokument = await prisma.dokument.findUnique({ where: { id: request.params.id } });
      if (!dokument || dokument.status === DokumentStatus.GELOESCHT) {
        return reply.status(404).send({ fehler: "Nicht gefunden" });
      }
      if (!darfDokumentSehen(dokument, request.benutzer.rolle, request.benutzer.sub)) {
        return reply.status(403).send({ fehler: "Vertrauliches Dokument" });
      }

      const data = await request.file();
      if (!data) return reply.status(400).send({ fehler: "Keine Datei übermittelt" });

      const fields = data.fields as Record<string, { value: string }>;
      const aenderungsnotiz = fields.aenderungsnotiz?.value?.trim() || null;

      const versionId = randomUUID();
      const tmpPfad   = path.join(STORAGE, "tmp", `${versionId}.tmp`);
      const relPfad   = "versionen";
      const encName   = `${versionId}.enc`;
      const encPfad   = path.join(STORAGE, relPfad, encName);

      await fs.mkdir(path.join(STORAGE, "tmp"), { recursive: true });
      await fs.mkdir(path.join(STORAGE, relPfad), { recursive: true });

      await pipeline(data.file as any, createWriteStream(tmpPfad)).catch(async (err) => {
        await fs.unlink(tmpPfad).catch(() => {});
        throw err;
      });

      const stat = await fs.stat(tmpPfad);

      const { checksum } = await encryptFile({
        sourcePath: tmpPfad,
        destPath:   encPfad,
        masterKey:  MASTER_KEY,
        documentId: versionId,
      }).catch(async (err) => {
        await fs.unlink(tmpPfad).catch(() => {});
        throw err;
      });

      await fs.unlink(tmpPfad);

      const letzte = await prisma.dokumentVersion.findFirst({
        where: { dokumentId: dokument.id },
        orderBy: { version: "desc" },
      });
      const naechsteVersion = (letzte?.version ?? 0) + 1;

      const version = await prisma.dokumentVersion.create({
        data: {
          id:             versionId,
          dokumentId:     dokument.id,
          version:        naechsteVersion,
          dateiname:      data.filename,
          speicherpfad:   relPfad,
          verschlPfad:    encName,
          dateigroesse:   stat.size,
          pruefsumme:     checksum,
          aenderungsnotiz,
          erstelltVonId:  request.benutzer.sub,
        },
      });

      await prisma.auditLog.create({
        data: {
          benutzerId: request.benutzer.sub,
          dokumentId: dokument.id,
          aktion:     AuditAktion.DOKUMENT_VERSION_ERSTELLT,
          ip:         request.ip,
          userAgent:  request.headers["user-agent"] ?? null,
          details:    { version: naechsteVersion, dateiname: data.filename },
        },
      });

      return reply.status(201).send(version);
    }
  );

  // ── GET /:id/versionen/:vid/download ──────────────────────────
  app.get<{ Params: { id: string; vid: string } }>(
    "/:id/versionen/:vid/download",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { id, vid } = request.params;

      const dokument = await prisma.dokument.findUnique({ where: { id } });
      if (!dokument || dokument.status === DokumentStatus.GELOESCHT) {
        return reply.status(404).send({ fehler: "Nicht gefunden" });
      }

      if (!darfDokumentSehen(dokument, request.benutzer.rolle, request.benutzer.sub)) {
        return reply.status(403).send({ fehler: "Vertrauliches Dokument" });
      }

      const version = await prisma.dokumentVersion.findFirst({
        where: { id: vid, dokumentId: id },
      });
      if (!version) return reply.status(404).send({ fehler: "Version nicht gefunden" });

      const encPfad = path.join(STORAGE, version.speicherpfad, version.verschlPfad);
      const klartext = await decryptFile({
        sourcePath: encPfad,
        masterKey:  MASTER_KEY,
        documentId: version.id,
      });

      return reply
        .header("Content-Type", dokument.mimeTyp)
        .header("Content-Disposition", `attachment; filename="${encodeURIComponent(version.dateiname)}"`)
        .header("Content-Length", klartext.length)
        .send(klartext);
    }
  );

  // ── DELETE /:id ────────────────────────────────────────────────
  app.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request, reply) => {
      const dokument = await prisma.dokument.findUnique({
        where: { id: request.params.id },
      });

      if (!dokument || dokument.status === DokumentStatus.GELOESCHT) {
        return reply.status(404).send({ fehler: "Nicht gefunden" });
      }

      // Sofort löschen: deleteAt = jetzt → Worker räumt beim nächsten Lauf auf
      await prisma.dokument.update({
        where: { id: dokument.id },
        data:  { deleteAt: new Date(), status: DokumentStatus.LOESCHVORMERKUNG },
      });

      await prisma.auditLog.create({
        data: {
          benutzerId: request.benutzer.sub,
          dokumentId: dokument.id,
          aktion:     AuditAktion.DOKUMENT_GELOESCHT,
          ip:         request.ip,
          userAgent:  request.headers["user-agent"] ?? null,
          details:    { manuell: true },
        },
      });

      return reply.send({ nachricht: "Löschvormerkung gesetzt" });
    }
  );
}
