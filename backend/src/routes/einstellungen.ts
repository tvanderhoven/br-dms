/**
 * Einstellungen – Aufbewahrungsregeln
 * GET  /api/einstellungen/aufbewahrung  – alle Regeln (mit Standardwerten als Fallback)
 * PUT  /api/einstellungen/aufbewahrung/:kategorie – anlegen oder aktualisieren
 * GET  /api/einstellungen/sicherheit    – Inaktivitäts-Timeout in Minuten (0 = aus)
 * PUT  /api/einstellungen/sicherheit    – Inaktivitäts-Timeout setzen (nur ADMIN)
 * GET  /api/einstellungen/backups       – Übersicht der backup.sh-Sicherungen (Anzahl, Alter, Größe)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fs from "node:fs/promises";
import path from "node:path";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { erfordert } from "../middleware/rbac.js";
import { Kategorie, Role, Geschlecht } from "@prisma/client";

const STORAGE = process.env.STORAGE_PATH ?? "/data/storage";
const LOGO_VERZ = path.join(STORAGE, "logo");

// ── Protokoll-Layout Defaults ─────────────────────────────────────
const PROTOKOLL_DEFAULTS = {
  kopfzeile:            "Betriebsrat",
  unterzeile:           "Internes Dokumentenmanagementsystem",
  farbe:                "#1e40af",
  fusszeile:            "BR-DMS – Vertraulich",
  unterschrift_vorsitz: "Vorsitzende/r des Betriebsrats",
  unterschrift_zeuge:   "Betriebsratsmitglied (Protokollzeugin/-zeuge)",
  kopfzeile_layout:     "logo_links",
  fusszeile_layout:     "text_links",
} as const;

type ProtokollKey = keyof typeof PROTOKOLL_DEFAULTS;
const PROTOKOLL_KEYS = Object.keys(PROTOKOLL_DEFAULTS) as ProtokollKey[];

const STANDARD_FRISTEN: Record<Kategorie, number> = {
  ANHOERUNG_99:          1825,
  ANHOERUNG_102:         1825,
  BEWERBUNG:              90,
  BEWERBUNG_ALTERNATIV:   30,
  ZEITMODELL_87:         1825,
  PROTOKOLL:             1460,
  BETRIEBSVEREINBARUNG:  3650,
  SONSTIGES:             1825,
};

const ALLE_KATEGORIEN = Object.values(Kategorie);

export async function einstellungenRouten(app: FastifyInstance): Promise<void> {

  // ── GET /aufbewahrung ─────────────────────────────────────────────
  app.get(
    "/aufbewahrung",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const regeln = await prisma.aufbewahrungsregel.findMany();
      const regelMap = new Map(regeln.map(r => [r.kategorie, r]));

      const ergebnis = ALLE_KATEGORIEN.map(k => {
        const r = regelMap.get(k);
        return {
          kategorie:      k,
          tage:           r?.tage           ?? STANDARD_FRISTEN[k],
          rechtsgrundlage: r?.rechtsgrundlage ?? null,
          beschreibung:   r?.beschreibung   ?? null,
          istStandard:    !r,
        };
      });

      return reply.send(ergebnis);
    }
  );

  // ── PUT /aufbewahrung/:kategorie ──────────────────────────────────
  app.put<{
    Params: { kategorie: string };
    Body: { tage: number; rechtsgrundlage?: string; beschreibung?: string };
  }>(
    "/aufbewahrung/:kategorie",
    { preHandler: [authenticate, erfordert(Role.ADMIN)] },
    async (request, reply) => {
      const { kategorie } = request.params;
      const { tage, rechtsgrundlage, beschreibung } = request.body;

      if (!ALLE_KATEGORIEN.includes(kategorie as Kategorie)) {
        return reply.status(400).send({ fehler: "Unbekannte Kategorie" });
      }
      if (!Number.isInteger(tage) || tage < 1) {
        return reply.status(400).send({ fehler: "tage muss eine positive Ganzzahl sein" });
      }

      const regel = await prisma.aufbewahrungsregel.upsert({
        where:  { kategorie: kategorie as Kategorie },
        update: { tage, rechtsgrundlage: rechtsgrundlage ?? null, beschreibung: beschreibung ?? null },
        create: { kategorie: kategorie as Kategorie, tage, rechtsgrundlage: rechtsgrundlage ?? null, beschreibung: beschreibung ?? null },
      });

      return reply.send(regel);
    }
  );

  // ── GET /protokoll ────────────────────────────────────────────────
  app.get(
    "/protokoll",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const einstellungen = await prisma.systemEinstellung.findMany({
        where: { schluessel: { startsWith: "protokoll." } },
      });
      const map = new Map(einstellungen.map(e => [e.schluessel.replace("protokoll.", ""), e.wert]));

      const result: Record<string, string | null> = {};
      for (const key of PROTOKOLL_KEYS) {
        result[key] = map.get(key) ?? PROTOKOLL_DEFAULTS[key];
      }
      result.hat_logo = map.has("logo_pfad") ? "true" : "false";

      return reply.send(result);
    }
  );

  // ── PUT /protokoll ────────────────────────────────────────────────
  app.put<{ Body: Partial<Record<ProtokollKey, string>> }>(
    "/protokoll",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request, reply) => {
      const body = request.body;

      if (body.farbe && !/^#[0-9a-fA-F]{6}$/.test(body.farbe)) {
        return reply.status(400).send({ fehler: "Ungültige Farbe (Hex-Format: #rrggbb)" });
      }

      for (const key of PROTOKOLL_KEYS) {
        if (body[key] !== undefined) {
          await prisma.systemEinstellung.upsert({
            where:  { schluessel: `protokoll.${key}` },
            update: { wert: body[key] as string },
            create: { schluessel: `protokoll.${key}`, wert: body[key] as string },
          });
        }
      }

      return reply.send({ ok: true });
    }
  );

  // ── POST /protokoll/logo ──────────────────────────────────────────
  app.post(
    "/protokoll/logo",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request, reply) => {
      const data = await request.file();
      if (!data) return reply.status(400).send({ fehler: "Keine Datei" });

      const erlaubt: Record<string, string> = {
        "image/png":  "png",
        "image/jpeg": "jpg",
        "image/jpg":  "jpg",
      };
      const ext = erlaubt[data.mimetype];
      if (!ext) return reply.status(400).send({ fehler: "Nur PNG oder JPG erlaubt" });

      const chunks: Buffer[] = [];
      for await (const chunk of data.file) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);

      if (buffer.length > 2 * 1024 * 1024) {
        return reply.status(400).send({ fehler: "Logo darf max. 2 MB groß sein" });
      }

      await fs.mkdir(LOGO_VERZ, { recursive: true });

      // altes Logo löschen
      const alt = await prisma.systemEinstellung.findUnique({ where: { schluessel: "protokoll.logo_pfad" } });
      if (alt?.wert) await fs.unlink(alt.wert).catch(() => {});

      const dateiPfad = path.join(LOGO_VERZ, `logo.${ext}`);
      await fs.writeFile(dateiPfad, buffer);

      await prisma.systemEinstellung.upsert({
        where:  { schluessel: "protokoll.logo_pfad" },
        update: { wert: dateiPfad },
        create: { schluessel: "protokoll.logo_pfad", wert: dateiPfad },
      });

      return reply.send({ ok: true });
    }
  );

  // ── DELETE /protokoll/logo ────────────────────────────────────────
  app.delete(
    "/protokoll/logo",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (_request, reply) => {
      const einstellung = await prisma.systemEinstellung.findUnique({
        where: { schluessel: "protokoll.logo_pfad" },
      });
      if (einstellung?.wert) await fs.unlink(einstellung.wert).catch(() => {});
      await prisma.systemEinstellung.deleteMany({ where: { schluessel: "protokoll.logo_pfad" } });
      return reply.send({ ok: true });
    }
  );

  // ── GET /protokoll/logo ───────────────────────────────────────────
  app.get(
    "/protokoll/logo",
    {},
    async (_request, reply) => {
      const einstellung = await prisma.systemEinstellung.findUnique({
        where: { schluessel: "protokoll.logo_pfad" },
      });
      if (!einstellung?.wert) return reply.status(404).send({ fehler: "Kein Logo hinterlegt" });

      try {
        const buffer   = await fs.readFile(einstellung.wert);
        const mimeType = einstellung.wert.endsWith(".png") ? "image/png" : "image/jpeg";
        return reply.header("Content-Type", mimeType).send(buffer);
      } catch {
        return reply.status(404).send({ fehler: "Logo-Datei nicht gefunden" });
      }
    }
  );

  // ── Design-Einstellungen ────────────────────────────────────────────
  const DESIGN_DEFAULTS = {
    sidebar_farbe:   "#222327",
    akzent_farbe:    "#222327",
    text_farbe:      "#222327",
    hintergrund:     "#f3f3f4",
    schrift_groesse: "16",
    dark_mode:       "auto",
  } as const;

  type DesignKey = keyof typeof DESIGN_DEFAULTS;
  const DESIGN_KEYS = Object.keys(DESIGN_DEFAULTS) as DesignKey[];

  // Bewusst ohne Login: enthält nur Farben/Schriftgröße und wird schon auf
  // Login- und Kummerkasten-Seite gebraucht, damit dort dasselbe Design gilt.
  app.get(
    "/design",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const einstellungen = await prisma.systemEinstellung.findMany({
        where: { schluessel: { startsWith: "design." } },
      });
      const map = new Map(einstellungen.map(e => [e.schluessel.replace("design.", ""), e.wert]));

      const result: Record<string, string> = {};
      for (const key of DESIGN_KEYS) {
        result[key] = map.get(key) ?? DESIGN_DEFAULTS[key];
      }
      return reply.send(result);
    }
  );

  app.put<{ Body: Partial<Record<DesignKey, string>> }>(
    "/design",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request, reply) => {
      const body = request.body;

      if (body.sidebar_farbe && !/^#[0-9a-fA-F]{6}$/.test(body.sidebar_farbe)) {
        return reply.status(400).send({ fehler: "Ungültige Sidebar-Farbe (Hex: #rrggbb)" });
      }
      if (body.akzent_farbe && !/^#[0-9a-fA-F]{6}$/.test(body.akzent_farbe)) {
        return reply.status(400).send({ fehler: "Ungültige Akzent-Farbe (Hex: #rrggbb)" });
      }
      if (body.text_farbe && !/^#[0-9a-fA-F]{6}$/.test(body.text_farbe)) {
        return reply.status(400).send({ fehler: "Ungültige Text-Farbe (Hex: #rrggbb)" });
      }
      if (body.hintergrund && !/^#[0-9a-fA-F]{6}$/.test(body.hintergrund)) {
        return reply.status(400).send({ fehler: "Ungültige Hintergrund-Farbe (Hex: #rrggbb)" });
      }
      if (body.schrift_groesse) {
        const s = parseInt(body.schrift_groesse, 10);
        if (!Number.isInteger(s) || s < 12 || s > 24) {
          return reply.status(400).send({ fehler: "schrift_groesse muss zwischen 12 und 24 liegen" });
        }
      }
      if (body.dark_mode && !["auto", "light", "dark"].includes(body.dark_mode)) {
        return reply.status(400).send({ fehler: "dark_mode muss auto, light oder dark sein" });
      }

      for (const key of DESIGN_KEYS) {
        if (body[key] !== undefined) {
          await prisma.systemEinstellung.upsert({
            where:  { schluessel: `design.${key}` },
            update: { wert: body[key] as string },
            create: { schluessel: `design.${key}`, wert: body[key] as string },
          });
        }
      }

      return reply.send({ ok: true });
    }
  );

  // ── Sicherheit: automatisches Abmelden bei Inaktivität ─────────────
  // 0 = deaktiviert. GET ist für alle eingeloggten Benutzer (der Client
  // braucht den Wert, um den Inaktivitäts-Timer zu stellen), PUT nur ADMIN.
  const SICHERHEIT_DEFAULT_MINUTEN = 30;

  app.get(
    "/sicherheit",
    { preHandler: [authenticate] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const einstellung = await prisma.systemEinstellung.findUnique({
        where: { schluessel: "sicherheit.inaktivitaet_minuten" },
      });
      const inaktivitaetMinuten = einstellung ? parseInt(einstellung.wert, 10) : SICHERHEIT_DEFAULT_MINUTEN;
      return reply.send({ inaktivitaetMinuten });
    }
  );

  app.put<{ Body: { inaktivitaetMinuten: number } }>(
    "/sicherheit",
    { preHandler: [authenticate, erfordert(Role.ADMIN)] },
    async (request, reply) => {
      const { inaktivitaetMinuten } = request.body;
      if (!Number.isInteger(inaktivitaetMinuten) || inaktivitaetMinuten < 0 || inaktivitaetMinuten > 480) {
        return reply.status(400).send({ fehler: "inaktivitaetMinuten muss zwischen 0 (deaktiviert) und 480 liegen" });
      }

      await prisma.systemEinstellung.upsert({
        where:  { schluessel: "sicherheit.inaktivitaet_minuten" },
        update: { wert: String(inaktivitaetMinuten) },
        create: { schluessel: "sicherheit.inaktivitaet_minuten", wert: String(inaktivitaetMinuten) },
      });

      return reply.send({ ok: true, inaktivitaetMinuten });
    }
  );

  // ── GET /backups – Übersicht der backup.sh-Sicherungen (nur lesend) ─
  // BACKUP_PATH wird read-only in den Container gemountet (siehe docker-compose.yml).
  // backup.sh legt je Lauf ein Paar db_<ts>.sql.gz + storage_<ts>.tar.gz an.
  const BACKUP_PATH = process.env.BACKUP_PATH ?? "/data/backups";
  const BACKUP_DATEI_REGEX = /^(db|storage)_(\d{8}_\d{6})\.(?:sql\.gz|tar\.gz)$/;

  app.get(
    "/backups",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const dateinamen = await fs.readdir(BACKUP_PATH);
        const saetze = new Map<string, { zeitpunkt: Date; groesseBytes: number; hatDb: boolean; hatStorage: boolean }>();

        for (const name of dateinamen) {
          const treffer = name.match(BACKUP_DATEI_REGEX);
          if (!treffer) continue;
          const [, art, ts] = treffer;
          const zeitpunkt = new Date(
            `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(9, 11)}:${ts.slice(11, 13)}:${ts.slice(13, 15)}`
          );
          const { size } = await fs.stat(path.join(BACKUP_PATH, name));

          const eintrag = saetze.get(ts) ?? { zeitpunkt, groesseBytes: 0, hatDb: false, hatStorage: false };
          eintrag.groesseBytes += size;
          if (art === "db") eintrag.hatDb = true;
          if (art === "storage") eintrag.hatStorage = true;
          saetze.set(ts, eintrag);
        }

        const liste = [...saetze.values()].sort((a, b) => b.zeitpunkt.getTime() - a.zeitpunkt.getTime());

        return reply.send({
          pfadLesbar: true,
          anzahl:     liste.length,
          saetze:     liste.map(s => ({
            zeitpunkt:    s.zeitpunkt.toISOString(),
            groesseBytes: s.groesseBytes,
            vollstaendig: s.hatDb && s.hatStorage,
          })),
        });
      } catch {
        // Ordner nicht gemountet/lesbar (z.B. vor dem ersten Deploy mit dem neuen Volume) – kein harter Fehler
        return reply.send({ pfadLesbar: false, anzahl: 0, saetze: [] });
      }
    }
  );

  // ── Wahlquote: Minderheitengeschlecht + Mindestsitze (§15 Abs. 2 BetrVG) ──
  // Basis für den automatischen Ersatzmitglieder-Nachrück-Vorschlag (siehe
  // lib/ersatzVorschlag.ts). Werte kommen 1:1 aus dem Wahlprotokoll der
  // letzten BR-Wahl – keine Berechnung hier. null/0 = nicht konfiguriert,
  // dann wird beim Nachrücken keine Quote geprüft.
  app.get(
    "/wahlquote",
    { preHandler: [authenticate, erfordert(Role.MITGLIED)] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const einstellungen = await prisma.systemEinstellung.findMany({
        where: { schluessel: { in: ["wahl.minderheitengeschlecht", "wahl.mindestsitze_minderheit"] } },
      });
      const map = new Map(einstellungen.map(e => [e.schluessel, e.wert]));

      const geschlechtWert = map.get("wahl.minderheitengeschlecht");
      const mindestsitzeMinderheit = parseInt(map.get("wahl.mindestsitze_minderheit") ?? "0", 10);

      return reply.send({
        minderheitengeschlecht: (geschlechtWert || null) as Geschlecht | null,
        mindestsitzeMinderheit: Number.isNaN(mindestsitzeMinderheit) ? 0 : mindestsitzeMinderheit,
      });
    }
  );

  app.put<{ Body: { minderheitengeschlecht: Geschlecht | null; mindestsitzeMinderheit: number } }>(
    "/wahlquote",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request, reply) => {
      const { minderheitengeschlecht, mindestsitzeMinderheit } = request.body;

      if (minderheitengeschlecht !== null && !Object.values(Geschlecht).includes(minderheitengeschlecht)) {
        return reply.status(400).send({ fehler: "Ungültiges Geschlecht" });
      }
      if (!Number.isInteger(mindestsitzeMinderheit) || mindestsitzeMinderheit < 0) {
        return reply.status(400).send({ fehler: "mindestsitzeMinderheit muss eine Ganzzahl >= 0 sein" });
      }

      await prisma.systemEinstellung.upsert({
        where:  { schluessel: "wahl.minderheitengeschlecht" },
        update: { wert: minderheitengeschlecht ?? "" },
        create: { schluessel: "wahl.minderheitengeschlecht", wert: minderheitengeschlecht ?? "" },
      });
      await prisma.systemEinstellung.upsert({
        where:  { schluessel: "wahl.mindestsitze_minderheit" },
        update: { wert: String(mindestsitzeMinderheit) },
        create: { schluessel: "wahl.mindestsitze_minderheit", wert: String(mindestsitzeMinderheit) },
      });

      return reply.send({ ok: true, minderheitengeschlecht, mindestsitzeMinderheit });
    }
  );

  // ── GET /system ───────────────────────────────────────────────────
  app.get(
    "/system",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (_request, reply) => {
      return reply.send({
        watchFolderPfad:  process.env.WATCH_INBOX_PATH || process.env.WATCH_FOLDER || "/data/watch_inbox",
        watchFolderAktiv: process.env.WATCH_FOLDER_ENABLED === "true",
      });
    }
  );

  // ── Module (Admin-Ein/Ausschalter) ─────────────────────────────────
  // Steuert, ob optionale Module (Personalverwaltung, Betriebsvereinbarungen,
  // Wissensarchiv, Ressourcen, Themensammlung) in der Oberfläche sichtbar sind.
  // Gedacht für Installationen bei anderen Betriebsräten, die nicht alle Module wollen.
  const MODULE_DEFAULTS = {
    personalverwaltung:     "true",
    betriebsvereinbarungen: "true",
    wissensarchiv:          "true",
    ressourcen:             "true",
    themensammlung:         "true",
  } as const;

  type ModuleKey = keyof typeof MODULE_DEFAULTS;
  const MODULE_KEYS = Object.keys(MODULE_DEFAULTS) as ModuleKey[];

  // GET ist bewusst nur "authenticate" (nicht VORSITZ+), da jeder eingeloggte
  // Benutzer wissen muss, welche Module in der Sidebar erscheinen sollen.
  app.get(
    "/module",
    { preHandler: [authenticate] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const einstellungen = await prisma.systemEinstellung.findMany({
        where: { schluessel: { startsWith: "module." } },
      });
      const map = new Map(einstellungen.map(e => [e.schluessel.replace("module.", ""), e.wert]));

      const result: Record<string, boolean> = {};
      for (const key of MODULE_KEYS) {
        result[key] = (map.get(key) ?? MODULE_DEFAULTS[key]) === "true";
      }
      return reply.send(result);
    }
  );

  app.put<{ Body: Partial<Record<ModuleKey, boolean>> }>(
    "/module",
    { preHandler: [authenticate, erfordert(Role.ADMIN)] },
    async (request, reply) => {
      const body = request.body;

      for (const key of MODULE_KEYS) {
        if (body[key] !== undefined) {
          await prisma.systemEinstellung.upsert({
            where:  { schluessel: `module.${key}` },
            update: { wert: body[key] ? "true" : "false" },
            create: { schluessel: `module.${key}`, wert: body[key] ? "true" : "false" },
          });
        }
      }

      return reply.send({ ok: true });
    }
  );
}
