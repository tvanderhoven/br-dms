/**
 * Auth-Routen
 * POST /api/auth/login
 * GET  /api/auth/me
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { AuditAktion } from "@prisma/client";
import { randomBytes } from "node:crypto";
import prisma from "../lib/prisma.js";
import { verifyPassword, hashPassword } from "../lib/password.js";
import { authenticate } from "../middleware/auth.js";
import { sendePasswortReset } from "../lib/mailer.js";

interface LoginBody {
  email:    string;
  passwort: string;
}

export async function authRouten(app: FastifyInstance): Promise<void> {

  // ── POST /login ────────────────────────────────────────────────
  app.post<{ Body: LoginBody }>(
    "/login",
    {
      schema: {
        body: {
          type: "object",
          required: ["email", "passwort"],
          properties: {
            email:    { type: "string", format: "email" },
            passwort: { type: "string", minLength: 1 },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: LoginBody }>, reply: FastifyReply) => {
      const { email, passwort } = request.body;

      const benutzer = await prisma.benutzer.findUnique({
        where:  { email: email.toLowerCase().trim() },
        select: { id: true, name: true, email: true, rolle: true, aktiv: true, passwortHash: true },
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

      const token = await reply.jwtSign(
        { sub: benutzer.id, email: benutzer.email, rolle: benutzer.rolle },
        { expiresIn: process.env.JWT_EXPIRES_IN ?? "24h" }
      );

      // Letzten Login aktualisieren
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
          details:    { erfolg: true },
        },
      });

      return reply.send({
        token,
        benutzer: {
          id:    benutzer.id,
          name:  benutzer.name,
          email: benutzer.email,
          rolle: benutzer.rolle,
        },
      });
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
      return reply.send(benutzer);
    }
  );

  // ── POST /passwort-vergessen ───────────────────────────────────
  app.post<{ Body: { email: string } }>(
    "/passwort-vergessen",
    {
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
          data:  { passwortHash: neuerHash },
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
