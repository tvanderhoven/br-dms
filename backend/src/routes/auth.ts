/**
 * Auth-Routen
 * POST /api/auth/login
 * POST /api/auth/login/zweiter-faktor        – Code aus der Authenticator-App
 * POST /api/auth/login/einrichten/start      – 2FA-Pflicht: QR-Code holen
 * POST /api/auth/login/einrichten/bestaetigen
 * POST /api/auth/logout
 * GET  /api/auth/me
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { AuditAktion, Prisma, Role } from "@prisma/client";
import { randomBytes } from "node:crypto";
import prisma from "../lib/prisma.js";
import { istTechnikAdmin } from "../lib/adminZugriff.js";
import { verifyPassword, hashPassword } from "../lib/password.js";
import { authenticate } from "../middleware/auth.js";
import { sendePasswortReset } from "../lib/mailer.js";
import { anmeldeToken, anmeldeTokenErneuern, STANDARD_LAUFZEIT, zwischenToken, type Zweck } from "../lib/anmeldeToken.js";
import { anmeldeCodePruefen, einrichtungAbschliessen, einrichtungStarten, istPflicht, zweiFaktorRichtlinie } from "../lib/zweiFaktor.js";

interface LoginBody {
  email:    string; // vollständige E-Mail ODER Teil vor dem "@" (Benutzername)
  passwort: string;
  eingeloggtBleiben?: boolean; // false → Token nur 1h gültig statt der konfigurierten Dauer
}

export async function authRouten(app: FastifyInstance): Promise<void> {

  // ── POST /login ────────────────────────────────────────────────
  app.post<{ Body: LoginBody }>(
    "/login",
    {
      // Kein Login-Zwang für diesen Endpunkt möglich (das ist ja der Login selbst) -
      // Rate-Limit als Schutz gegen Brute-Force-Angriffe auf Passwörter.
      config: {
        rateLimit: { max: 10, timeWindow: "10 minutes" },
      },
      schema: {
        body: {
          type: "object",
          required: ["email", "passwort"],
          properties: {
            email:             { type: "string", minLength: 1 },
            passwort:          { type: "string", minLength: 1 },
            eingeloggtBleiben: { type: "boolean" },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: LoginBody }>, reply: FastifyReply) => {
      const { email, passwort, eingeloggtBleiben } = request.body;

      // Eingabe kann die vollständige E-Mail oder nur der Teil vor dem "@" sein
      const eingabe  = email.toLowerCase().trim();
      const istEmail = eingabe.includes("@");

      const benutzer = await prisma.benutzer.findFirst({
        where:  istEmail ? { email: eingabe } : { email: { startsWith: `${eingabe}@` } },
        select: { id: true, name: true, email: true, rolle: true, aktiv: true, passwortHash: true, tokenVersion: true, zweiFaktorAktiv: true },
      });

      // Timing-sicherer Vergleich (kein User-Enumeration)
      const gueltig = benutzer
        ? verifyPassword(passwort, benutzer.passwortHash)
        : (verifyPassword(passwort, "dummy:dummy"), false);

      if (!benutzer || !gueltig || !benutzer.aktiv) {
        await prisma.auditLog.create({
          data: {
            aktion:    AuditAktion.LOGIN,
            ip:        request.ip,
            userAgent: request.headers["user-agent"] ?? null,
            details:   { erfolg: false, email },
          },
        });
        return reply.status(401).send({ fehler: "E-Mail oder Passwort falsch" });
      }

      // Zweiter Faktor: eingerichtet → Code abfragen; Pflicht, aber nicht eingerichtet → erst einrichten.
      // Steht die 2FA in den Einstellungen auf "aus", wird nie gefragt.
      const bleiben = eingeloggtBleiben !== false;
      if ((await zweiFaktorRichtlinie()).modus !== "aus") {
        if (benutzer.zweiFaktorAktiv) {
          return reply.send({ zweiterFaktor: true, zwischenToken: await zwischenToken(reply, benutzer, "zweiter-faktor", bleiben) });
        }
        if (await istPflicht(benutzer.rolle)) {
          return reply.send({ einrichtungNoetig: true, zwischenToken: await zwischenToken(reply, benutzer, "einrichten", bleiben) });
        }
      }

      return reply.send(await anmeldungAbschliessen(request, reply, benutzer, bleiben));
    }
  );

  /** Zwischen-Token prüfen: richtiger Zweck, Konto aktiv, Token-Version aktuell */
  async function zwischenTokenPruefen(token: string, zweck: Zweck) {
    let p: { sub: string; tv?: number; zweck?: string; bleiben?: boolean };
    try { p = app.jwt.verify(token); } catch { return null; }
    if (p.zweck !== zweck) return null;
    const b = await prisma.benutzer.findUnique({
      where:  { id: p.sub },
      select: { id: true, name: true, email: true, rolle: true, aktiv: true, tokenVersion: true },
    });
    if (!b?.aktiv || (p.tv ?? 0) !== b.tokenVersion) return null;
    return { benutzer: b, bleiben: p.bleiben !== false };
  }

  const ZWISCHEN_SCHEMA = (mitCode: boolean) => ({
    body: {
      type: "object",
      required: mitCode ? ["zwischenToken", "code"] : ["zwischenToken"],
      properties: {
        zwischenToken: { type: "string", minLength: 1 },
        ...(mitCode ? { code: { type: "string", minLength: 1, maxLength: 20 } } : {}),
      },
    },
  });

  // ── POST /login/zweiter-faktor ─────────────────────────────────
  app.post<{ Body: { zwischenToken: string; code: string } }>(
    "/login/zweiter-faktor",
    { config: { rateLimit: { max: 10, timeWindow: "10 minutes" } }, schema: ZWISCHEN_SCHEMA(true) },
    async (request, reply) => {
      const z = await zwischenTokenPruefen(request.body.zwischenToken, "zweiter-faktor");
      if (!z) return reply.status(401).send({ fehler: "Anmeldung abgelaufen – bitte noch einmal mit Passwort anmelden" });

      const ergebnis = await anmeldeCodePruefen(z.benutzer.id, request.body.code);
      if (!ergebnis.ok) {
        await prisma.auditLog.create({
          data: {
            benutzerId: z.benutzer.id, aktion: AuditAktion.LOGIN, ip: request.ip,
            userAgent: request.headers["user-agent"] ?? null,
            details: { erfolg: false, grund: "Code falsch" },
          },
        });
        // 400 statt 401: das Frontend soll im Code-Schritt bleiben
        return reply.status(400).send({ fehler: "Code falsch oder schon verwendet" });
      }

      return reply.send({
        ...(await anmeldungAbschliessen(request, reply, z.benutzer, z.bleiben, ergebnis.wiederherstellung ? { wiederherstellungscode: true } : {})),
        ...(ergebnis.wiederherstellung ? { restCodes: ergebnis.restCodes } : {}),
      });
    }
  );

  // ── POST /login/einrichten/start – Pflicht-Einrichtung beim Login ─
  app.post<{ Body: { zwischenToken: string } }>(
    "/login/einrichten/start",
    { config: { rateLimit: { max: 10, timeWindow: "10 minutes" } }, schema: ZWISCHEN_SCHEMA(false) },
    async (request, reply) => {
      const z = await zwischenTokenPruefen(request.body.zwischenToken, "einrichten");
      if (!z) return reply.status(401).send({ fehler: "Anmeldung abgelaufen – bitte noch einmal mit Passwort anmelden" });
      return reply.send(await einrichtungStarten(z.benutzer.id, z.benutzer.email));
    }
  );

  app.post<{ Body: { zwischenToken: string; code: string } }>(
    "/login/einrichten/bestaetigen",
    { config: { rateLimit: { max: 10, timeWindow: "10 minutes" } }, schema: ZWISCHEN_SCHEMA(true) },
    async (request, reply) => {
      const z = await zwischenTokenPruefen(request.body.zwischenToken, "einrichten");
      if (!z) return reply.status(401).send({ fehler: "Anmeldung abgelaufen – bitte noch einmal mit Passwort anmelden" });

      const fertig = await einrichtungAbschliessen(z.benutzer.id, request.body.code);
      if (!fertig) return reply.status(400).send({ fehler: "Code falsch – bitte den aktuellen Code aus der App eingeben" });

      await prisma.auditLog.create({
        data: { benutzerId: z.benutzer.id, aktion: AuditAktion.ZWEI_FAKTOR_EINGERICHTET, ip: request.ip, details: { beimLogin: true } },
      });
      return reply.send({
        ...(await anmeldungAbschliessen(request, reply, { ...z.benutzer, tokenVersion: fertig.benutzer.tokenVersion }, z.bleiben)),
        wiederherstellungscodes: fertig.wiederherstellungscodes,
      });
    }
  );

  /** Letzter Schritt jeder Anmeldung: Token, letzter Login, Audit-Eintrag */
  async function anmeldungAbschliessen(
    request: FastifyRequest,
    reply: FastifyReply,
    benutzer: { id: string; name: string; email: string; rolle: Role; tokenVersion: number },
    bleiben: boolean,
    auditDetails: Record<string, unknown> = {},
  ) {
    const token = await anmeldeToken(reply, benutzer, bleiben ? STANDARD_LAUFZEIT() : "1h");

    await prisma.benutzer.update({
      where: { id: benutzer.id },
      data:  { letzterLogin: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        benutzerId: benutzer.id,
        aktion:     AuditAktion.LOGIN,
        ip:         request.ip,
        userAgent:  request.headers["user-agent"] ?? null,
        details:    { erfolg: true, ...auditDetails } as Prisma.InputJsonObject,
      },
    });

    return {
      token,
      benutzer: { id: benutzer.id, name: benutzer.name, email: benutzer.email, rolle: benutzer.rolle },
    };
  }

  // ── POST /logout ───────────────────────────────────────────────
  // Zählt die Token-Version hoch: alle bisher ausgestellten Tokens dieses Benutzers
  // werden ungültig – auch auf anderen Rechnern, auf denen er noch angemeldet ist.
  app.post(
    "/logout",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      await prisma.benutzer.update({
        where: { id: request.benutzer.sub },
        data:  { tokenVersion: { increment: 1 } },
      });

      await prisma.auditLog.create({
        data: {
          benutzerId: request.benutzer.sub,
          aktion:     AuditAktion.LOGOUT,
          ip:         request.ip,
          userAgent:  request.headers["user-agent"] ?? null,
        },
      });

      return reply.send({ nachricht: "Abgemeldet" });
    }
  );

  // ── GET /me ────────────────────────────────────────────────────
  app.get(
    "/me",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const benutzer = await prisma.benutzer.findUnique({
        where:  { id: request.benutzer.sub },
        select: { id: true, name: true, email: true, rolle: true, letzterLogin: true, istVertretungFuer: true },
      });
      if (!benutzer) return reply.send(benutzer);
      // Frontend blendet für einen Admin ohne Inhaltszugriff alles außer der Verwaltung aus
      return reply.send({ ...benutzer, ohneInhaltszugriff: await istTechnikAdmin(benutzer.rolle) });
    }
  );

  // ── PATCH /passwort – eigenes Passwort ändern (eingeloggt) ──────
  app.patch<{ Body: { aktuellesPasswort: string; neuesPasswort: string } }>(
    "/passwort",
    {
      preValidation: [authenticate], // vor der Schema-Prüfung: Unangemeldete bekommen 401, nicht 400
      schema: {
        body: {
          type: "object",
          required: ["aktuellesPasswort", "neuesPasswort"],
          properties: {
            aktuellesPasswort: { type: "string", minLength: 1 },
            neuesPasswort:     { type: "string", minLength: 8 },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: { aktuellesPasswort: string; neuesPasswort: string } }>, reply: FastifyReply) => {
      const { aktuellesPasswort, neuesPasswort } = request.body;

      const benutzer = await prisma.benutzer.findUnique({
        where: { id: request.benutzer.sub },
        select: { id: true, passwortHash: true },
      });
      if (!benutzer) return reply.status(404).send({ fehler: "Benutzer nicht gefunden" });

      // 400 statt 401 – das Frontend wertet 401 als „Sitzung abgelaufen“ und meldet ab
      if (!verifyPassword(aktuellesPasswort, benutzer.passwortHash)) {
        return reply.status(400).send({ fehler: "Aktuelles Passwort ist falsch" });
      }

      // Alle anderen Sitzungen enden; diese hier bekommt einen neuen Token mit derselben Restlaufzeit
      const aktualisiert = await prisma.benutzer.update({
        where:  { id: benutzer.id },
        data:   { passwortHash: hashPassword(neuesPasswort), tokenVersion: { increment: 1 } },
        select: { id: true, email: true, rolle: true, tokenVersion: true },
      });
      const token = await anmeldeTokenErneuern(request, reply, aktualisiert);

      await prisma.auditLog.create({
        data: {
          benutzerId: benutzer.id,
          aktion:     AuditAktion.PASSWORT_GEAENDERT,
          ip:         request.ip,
          userAgent:  request.headers["user-agent"] ?? null,
          details:    { durchVorsitz: false },
        },
      });

      return reply.send({ nachricht: "Passwort erfolgreich geändert", token });
    }
  );

  // ── POST /passwort-vergessen ───────────────────────────────────
  app.post<{ Body: { email: string } }>(
    "/passwort-vergessen",
    {
      // verhindert, dass jemand anderen Benutzern massenhaft Reset-Mails schickt
      config: {
        rateLimit: { max: 5, timeWindow: "15 minutes" },
      },
      schema: {
        body: {
          type: "object",
          required: ["email"],
          properties: { email: { type: "string", format: "email" } },
        },
      },
    },
    async (request, reply) => {
      const { email } = request.body;
      const benutzer = await prisma.benutzer.findUnique({
        where: { email: email.toLowerCase().trim() },
        select: { id: true, name: true, email: true, aktiv: true },
      });

      // Immer gleiche Antwort (kein User-Enumeration)
      if (!benutzer || !benutzer.aktiv) {
        return reply.send({ nachricht: "Falls die E-Mail bekannt ist, wurde ein Link gesendet." });
      }

      const token = randomBytes(32).toString("hex");
      const gueltigBis = new Date(Date.now() + 60 * 60 * 1000); // 1 Stunde

      await prisma.passwortReset.create({
        data: { benutzerId: benutzer.id, token, gueltigBis },
      });

      try {
        await sendePasswortReset(benutzer.email, benutzer.name, token);
      } catch (err) {
        app.log.error({ err }, "E-Mail-Versand fehlgeschlagen");
        return reply.status(500).send({ fehler: "E-Mail konnte nicht gesendet werden. SMTP konfiguriert?" });
      }

      return reply.send({ nachricht: "Falls die E-Mail bekannt ist, wurde ein Link gesendet." });
    }
  );

  // ── POST /passwort-reset ───────────────────────────────────────
  app.post<{ Body: { token: string; neuesPasswort: string } }>(
    "/passwort-reset",
    {
      // Token sind 64 Hex-Zeichen und nicht zu erraten – das Limit bremst nur Durchprobieren
      config: {
        rateLimit: { max: 10, timeWindow: "15 minutes" },
      },
      schema: {
        body: {
          type: "object",
          required: ["token", "neuesPasswort"],
          properties: {
            token:         { type: "string", minLength: 1 },
            neuesPasswort: { type: "string", minLength: 8 },
          },
        },
      },
    },
    async (request, reply) => {
      const { token, neuesPasswort } = request.body;

      const reset = await prisma.passwortReset.findUnique({
        where: { token },
        include: { benutzer: { select: { id: true, aktiv: true } } },
      });

      if (!reset || reset.genutzt || reset.gueltigBis < new Date() || !reset.benutzer.aktiv) {
        return reply.status(400).send({ fehler: "Link ungültig oder abgelaufen." });
      }

      const neuerHash = hashPassword(neuesPasswort);

      await prisma.$transaction([
        prisma.benutzer.update({
          where: { id: reset.benutzerId },
          data:  { passwortHash: neuerHash, tokenVersion: { increment: 1 } }, // wer das alte Passwort kannte, fliegt raus
        }),
        prisma.passwortReset.update({
          where: { id: reset.id },
          data:  { genutzt: true },
        }),
      ]);

      return reply.send({ nachricht: "Passwort erfolgreich geändert." });
    }
  );
}
