/**
 * Einstellungen – Aufbewahrungsregeln
 * GET  /api/einstellungen/aufbewahrung  – alle Regeln (mit Standardwerten als Fallback)
 * PUT  /api/einstellungen/aufbewahrung/:kategorie – anlegen oder aktualisieren
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fs from "node:fs/promises";
import path from "node:path";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { erfordert } from "../middleware/rbac.js";
import { Kategorie, Role } from "@prisma/client";

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
    sidebar_farbe:   "#1e3a5f",
    akzent_farbe:    "#2563eb",
    text_farbe:      "#111827",
    hintergrund:     "#f9fafb",
    schrift_groesse: "16",
    dark_mode:       "auto",
  } as const;

  type DesignKey = keyof typeof DESIGN_DEFAULTS;
  const DESIGN_KEYS = Object.keys(DESIGN_DEFAULTS) as DesignKey[];

  app.get(
    "/design",
    { preHandler: [authenticate] },
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
}
