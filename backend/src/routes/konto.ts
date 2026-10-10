/**
 * Mein Konto – alles, was eine Person an ihrem eigenen Konto sehen und ändern darf
 *
 * GET    /api/konto                         – Profil + Stand der Zwei-Faktor-Anmeldung
 * PATCH  /api/konto/einladung-email         – Zweitadresse für Einladungen
 * PATCH  /api/konto/email                   – Anmelde-E-Mail (nur mit Passwort)
 * GET    /api/konto/anmeldungen             – eigene letzte Anmeldungen
 * POST   /api/konto/abmelden-ueberall       – alle anderen Sitzungen beenden
 * POST   /api/konto/zwei-faktor/start       – Einrichtung beginnen (Passwort), liefert QR-Code
 * POST   /api/konto/zwei-faktor/bestaetigen – ersten Code prüfen, liefert Wiederherstellungscodes
 * POST   /api/konto/zwei-faktor/neue-codes  – neue Wiederherstellungscodes (Code aus der App)
 * DELETE /api/konto/zwei-faktor             – abschalten (Passwort; nicht bei Pflicht)
 *
 * Alle Routen arbeiten nur am eigenen Konto (request.benutzer.sub) und sind für jede
 * Rolle offen – auch JAV/SBV und den Admin ohne Inhaltszugriff (middleware/auth.ts).
 */

import { FastifyInstance, FastifyRequest } from "fastify";
import { AuditAktion } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { verifyPassword } from "../lib/password.js";
import { istEmailAdresse } from "../lib/emailAdresse.js";
import { sendeEmailGeaendertHinweis } from "../lib/mailer.js";
import { anmeldeTokenErneuern } from "../lib/anmeldeToken.js";
import {
  anmeldeCodePruefen, einrichtungAbschliessen, einrichtungStarten, istPflicht,
  neueWiederherstellungscodes, ZWEI_FAKTOR_LEEREN, zweiFaktorRichtlinie,
} from "../lib/zweiFaktor.js";

const audit = (request: FastifyRequest, aktion: AuditAktion, details: Record<string, unknown> = {}) =>
  prisma.auditLog.create({
    data: {
      benutzerId: request.benutzer.sub, aktion, ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null, details: JSON.parse(JSON.stringify(details)),
    },
  });

// preValidation statt preHandler: Unangemeldete bekommen 401, nicht 400 vom Schema.
// Je Route statt app.addHook, damit die Rollentests den Hook an der Route sehen.
const login = { preValidation: [authenticate] };

const nurPasswort = {
  body: { type: "object", required: ["passwort"], properties: { passwort: { type: "string", minLength: 1 } } },
};
const nurCode = {
  body: { type: "object", required: ["code"], properties: { code: { type: "string", minLength: 1, maxLength: 20 } } },
};

export async function kontoRouten(app: FastifyInstance): Promise<void> {

  async function passwortStimmt(request: FastifyRequest, passwort: string): Promise<boolean> {
    const b = await prisma.benutzer.findUnique({ where: { id: request.benutzer.sub }, select: { passwortHash: true } });
    return !!b && verifyPassword(passwort, b.passwortHash);
  }

  // ── GET / ──────────────────────────────────────────────────────
  app.get("/", login, async (request, reply) => {
    const b = await prisma.benutzer.findUnique({
      where:  { id: request.benutzer.sub },
      select: {
        id: true, name: true, email: true, einladungEmail: true, rolle: true,
        letzterLogin: true, erstelltAm: true, zweiFaktorAktiv: true, zweiFaktorWiederherstellung: true,
      },
    });
    if (!b) return reply.status(404).send({ fehler: "Benutzer nicht gefunden" });
    const richtlinie = await zweiFaktorRichtlinie();
    const { zweiFaktorWiederherstellung, zweiFaktorAktiv, ...profil } = b;
    return reply.send({
      ...profil,
      zweiFaktor: {
        modus:     richtlinie.modus,
        aktiv:     zweiFaktorAktiv && richtlinie.modus !== "aus",
        pflicht:   richtlinie.pflichtRollen.includes(b.rolle),
        restCodes: zweiFaktorWiederherstellung.length,
      },
    });
  });

  // ── PATCH /einladung-email ─────────────────────────────────────
  app.patch<{ Body: { einladungEmail: string | null } }>(
    "/einladung-email",
    {
      ...login,
      schema: {
        body: {
          type: "object", required: ["einladungEmail"],
          properties: { einladungEmail: { type: ["string", "null"], maxLength: 254 } },
        },
      },
    },
    async (request, reply) => {
      const wert = request.body.einladungEmail?.trim().toLowerCase() || null;
      if (wert && !istEmailAdresse(wert)) return reply.status(400).send({ fehler: "Keine gültige E-Mail-Adresse" });
      await prisma.benutzer.update({ where: { id: request.benutzer.sub }, data: { einladungEmail: wert } });
      await audit(request, AuditAktion.EMAIL_GEAENDERT, { einladungEmail: wert });
      return reply.send({ einladungEmail: wert });
    }
  );

  // ── PATCH /email – Anmelde-E-Mail ──────────────────────────────
  // Sie ist Benutzername und Ziel von „Passwort vergessen“. Darum nur mit Passwort,
  // und die alte Adresse bekommt einen Hinweis – sonst könnte jemand an einem offenen
  // Rechner die Adresse umbiegen und sich das Konto per Reset-Link holen.
  app.patch<{ Body: { email: string; passwort: string } }>(
    "/email",
    {
      ...login,
      config: { rateLimit: { max: 10, timeWindow: "10 minutes" } },
      schema: {
        body: {
          type: "object", required: ["email", "passwort"],
          properties: { email: { type: "string", minLength: 3, maxLength: 254 }, passwort: { type: "string", minLength: 1 } },
        },
      },
    },
    async (request, reply) => {
      const neu = request.body.email.trim().toLowerCase();
      if (!istEmailAdresse(neu)) return reply.status(400).send({ fehler: "Keine gültige E-Mail-Adresse" });
      if (!(await passwortStimmt(request, request.body.passwort))) {
        return reply.status(400).send({ fehler: "Passwort ist falsch" });
      }

      const ich = await prisma.benutzer.findUnique({ where: { id: request.benutzer.sub }, select: { name: true, email: true } });
      if (!ich) return reply.status(404).send({ fehler: "Benutzer nicht gefunden" });
      if (neu === ich.email) return reply.send({ email: neu });

      // Anmeldung geht auch mit dem Teil vor dem "@" – der muss eindeutig bleiben
      const lokal = neu.split("@")[0];
      const belegt = await prisma.benutzer.findFirst({
        where:  { id: { not: request.benutzer.sub }, OR: [{ email: neu }, { email: { startsWith: `${lokal}@` } }] },
        select: { id: true },
      });
      if (belegt) {
        return reply.status(409).send({ fehler: "Diese Adresse (oder der Name vor dem @) ist schon an einem anderen Konto vergeben" });
      }

      await prisma.benutzer.update({ where: { id: request.benutzer.sub }, data: { email: neu } });
      await audit(request, AuditAktion.EMAIL_GEAENDERT, { alt: ich.email, neu });
      try {
        await sendeEmailGeaendertHinweis(ich.email, ich.name, neu);
      } catch (err) {
        request.log.warn({ err }, "Hinweis an die alte E-Mail-Adresse nicht versendet");
      }
      return reply.send({ email: neu });
    }
  );

  // ── GET /anmeldungen ───────────────────────────────────────────
  app.get("/anmeldungen", login, async (request, reply) => {
    const eintraege = await prisma.auditLog.findMany({
      where:   { benutzerId: request.benutzer.sub, aktion: AuditAktion.LOGIN },
      orderBy: { zeitpunkt: "desc" },
      take:    15,
      select:  { zeitpunkt: true, ip: true, userAgent: true, details: true },
    });
    return reply.send(eintraege.map(e => ({
      zeitpunkt: e.zeitpunkt,
      ip:        e.ip,
      userAgent: e.userAgent,
      erfolg:    (e.details as { erfolg?: boolean } | null)?.erfolg !== false,
    })));
  });

  // ── POST /abmelden-ueberall ────────────────────────────────────
  app.post("/abmelden-ueberall", login, async (request, reply) => {
    const b = await prisma.benutzer.update({
      where:  { id: request.benutzer.sub },
      data:   { tokenVersion: { increment: 1 } },
      select: { id: true, email: true, rolle: true, tokenVersion: true },
    });
    await audit(request, AuditAktion.LOGOUT, { ueberall: true });
    return reply.send({ token: await anmeldeTokenErneuern(request, reply, b) });
  });

  // ── Zwei-Faktor-Anmeldung ──────────────────────────────────────
  app.post<{ Body: { passwort: string } }>(
    "/zwei-faktor/start",
    { ...login, config: { rateLimit: { max: 10, timeWindow: "10 minutes" } }, schema: nurPasswort },
    async (request, reply) => {
      if ((await zweiFaktorRichtlinie()).modus === "aus") {
        return reply.status(403).send({ fehler: "Die Zwei-Faktor-Anmeldung ist in dieser Installation ausgeschaltet" });
      }
      if (!(await passwortStimmt(request, request.body.passwort))) {
        return reply.status(400).send({ fehler: "Passwort ist falsch" });
      }
      const b = await prisma.benutzer.findUnique({ where: { id: request.benutzer.sub }, select: { email: true, zweiFaktorAktiv: true } });
      if (b?.zweiFaktorAktiv) return reply.status(409).send({ fehler: "Ist schon eingerichtet" });
      return reply.send(await einrichtungStarten(request.benutzer.sub, b!.email));
    }
  );

  app.post<{ Body: { code: string } }>(
    "/zwei-faktor/bestaetigen",
    { ...login, config: { rateLimit: { max: 10, timeWindow: "10 minutes" } }, schema: nurCode },
    async (request, reply) => {
      const fertig = await einrichtungAbschliessen(request.benutzer.sub, request.body.code);
      if (!fertig) return reply.status(400).send({ fehler: "Code falsch – bitte den aktuellen Code aus der App eingeben" });
      await audit(request, AuditAktion.ZWEI_FAKTOR_EINGERICHTET);
      return reply.send({
        wiederherstellungscodes: fertig.wiederherstellungscodes,
        token: await anmeldeTokenErneuern(request, reply, fertig.benutzer), // andere Sitzungen sind beendet
      });
    }
  );

  app.post<{ Body: { code: string } }>(
    "/zwei-faktor/neue-codes",
    { ...login, config: { rateLimit: { max: 10, timeWindow: "10 minutes" } }, schema: nurCode },
    async (request, reply) => {
      // Nur mit dem Code aus der App – ein alter Wiederherstellungscode reicht hier nicht
      if (!/^\s*\d{3}\s*\d{3}\s*$/.test(request.body.code) || !(await anmeldeCodePruefen(request.benutzer.sub, request.body.code)).ok) {
        return reply.status(400).send({ fehler: "Code falsch oder schon verwendet" });
      }
      const codes = neueWiederherstellungscodes();
      await prisma.benutzer.update({ where: { id: request.benutzer.sub }, data: { zweiFaktorWiederherstellung: codes.hashes } });
      await audit(request, AuditAktion.ZWEI_FAKTOR_EINGERICHTET, { neueWiederherstellungscodes: true });
      return reply.send({ wiederherstellungscodes: codes.klartext });
    }
  );

  app.delete<{ Body: { passwort: string } }>(
    "/zwei-faktor",
    { ...login, config: { rateLimit: { max: 10, timeWindow: "10 minutes" } }, schema: nurPasswort },
    async (request, reply) => {
      if (await istPflicht(request.benutzer.rolle)) {
        return reply.status(403).send({ fehler: "Für deine Rolle ist die Zwei-Faktor-Anmeldung Pflicht" });
      }
      if (!(await passwortStimmt(request, request.body.passwort))) {
        return reply.status(400).send({ fehler: "Passwort ist falsch" });
      }
      await prisma.benutzer.update({ where: { id: request.benutzer.sub }, data: ZWEI_FAKTOR_LEEREN });
      await audit(request, AuditAktion.ZWEI_FAKTOR_DEAKTIVIERT);
      return reply.send({ ok: true });
    }
  );
}
