/**
 * Benutzerverwaltung – nur für VORSITZ und ADMIN
 *
 * GET    /api/benutzer          – alle Benutzer
 * POST   /api/benutzer          – neuen Benutzer anlegen
 * PATCH  /api/benutzer/:id      – Rolle / Status ändern
 * POST   /api/benutzer/:id/passwort-reset – Passwort zurücksetzen
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { Role, AuditAktion } from "@prisma/client";
import { randomBytes } from "node:crypto";
import prisma from "../lib/prisma.js";
import { hashPassword } from "../lib/password.js";
import { authenticate } from "../middleware/auth.js";
import { erfordert } from "../middleware/rbac.js";

interface NeuerBenutzer {
  name:     string;
  email:    string;
  rolle:    Role;
  passwort: string;
}

interface BenutzerUpdate {
  rolle?:  Role;
  aktiv?:  boolean;
  istVertretungFuer?: string | null;
}

interface PasswortReset {
  neuesPasswort: string;
}

export async function benutzerRouten(app: FastifyInstance): Promise<void> {

  // ── GET / – alle Benutzer ──────────────────────────────────────
  app.get(
    "/",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const benutzer = await prisma.benutzer.findMany({
        select: {
          id:               true,
          name:             true,
          email:            true,
          rolle:            true,
          aktiv:            true,
          letzterLogin:     true,
          erstelltAm:       true,
          istVertretungFuer: true,
        },
        orderBy: [{ rolle: "asc" }, { name: "asc" }],
      });
      return reply.send(benutzer);
    }
  );

  // ── POST / – neuen Benutzer anlegen ───────────────────────────
  app.post<{ Body: NeuerBenutzer }>(
    "/",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request: FastifyRequest<{ Body: NeuerBenutzer }>, reply: FastifyReply) => {
      const { name, email, rolle, passwort } = request.body;

      if (!name?.trim() || !email?.trim() || !rolle || !passwort) {
        return reply.status(400).send({ fehler: "Alle Felder sind Pflicht" });
      }

      if (passwort.length < 8) {
        return reply.status(400).send({ fehler: "Passwort muss mindestens 8 Zeichen haben" });
      }

      // VORSITZ darf keinen ADMIN anlegen
      if (rolle === Role.ADMIN && request.benutzer.rolle !== Role.ADMIN) {
        return reply.status(403).send({ fehler: "Nur Admins dürfen Admins anlegen" });
      }

      const vorhanden = await prisma.benutzer.findUnique({
        where: { email: email.toLowerCase().trim() },
      });
      if (vorhanden) {
        return reply.status(409).send({ fehler: "E-Mail bereits vergeben" });
      }

      const benutzer = await prisma.benutzer.create({
        data: {
          name:         name.trim(),
          email:        email.toLowerCase().trim(),
          passwortHash: hashPassword(passwort),
          rolle,
          aktiv:        true,
        },
        select: { id: true, name: true, email: true, rolle: true, aktiv: true, erstelltAm: true },
      });

      await prisma.auditLog.create({
        data: {
          benutzerId: request.benutzer.sub,
          aktion:     AuditAktion.BENUTZER_ERSTELLT,
          details:    { neuerBenutzer: benutzer.email, rolle },
        },
      });

      return reply.status(201).send(benutzer);
    }
  );

  // ── PATCH /:id – Rolle oder Status ändern ─────────────────────
  app.patch<{ Params: { id: string }; Body: BenutzerUpdate }>(
    "/:id",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request: FastifyRequest<{ Params: { id: string }; Body: BenutzerUpdate }>, reply: FastifyReply) => {
      const { id } = request.params;
      const { rolle, aktiv, istVertretungFuer } = request.body;

      // Schutz: sich selbst nicht deaktivieren
      if (id === request.benutzer.sub && aktiv === false) {
        return reply.status(400).send({ fehler: "Sie können sich nicht selbst deaktivieren" });
      }

      const benutzer = await prisma.benutzer.findUnique({ where: { id } });
      if (!benutzer) return reply.status(404).send({ fehler: "Benutzer nicht gefunden" });

      const aktualisiert = await prisma.benutzer.update({
        where: { id },
        data: {
          ...(rolle !== undefined ? { rolle } : {}),
          ...(aktiv !== undefined ? { aktiv } : {}),
          ...(istVertretungFuer !== undefined ? { istVertretungFuer } : {}),
        },
        select: { id: true, name: true, email: true, rolle: true, aktiv: true, istVertretungFuer: true },
      });

      await prisma.auditLog.create({
        data: {
          benutzerId: request.benutzer.sub,
          aktion:     aktiv === false ? AuditAktion.BENUTZER_DEAKTIVIERT : AuditAktion.BENUTZER_ERSTELLT,
          details:    JSON.parse(JSON.stringify({ betroffener: benutzer.email, aenderung: request.body })),
        },
      });

      return reply.send(aktualisiert);
    }
  );

  // ── POST /:id/passwort-reset ───────────────────────────────────
  app.post<{ Params: { id: string }; Body: PasswortReset }>(
    "/:id/passwort-reset",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request: FastifyRequest<{ Params: { id: string }; Body: PasswortReset }>, reply: FastifyReply) => {
      const { id } = request.params;
      const { neuesPasswort } = request.body;

      if (!neuesPasswort || neuesPasswort.length < 8) {
        return reply.status(400).send({ fehler: "Passwort muss mindestens 8 Zeichen haben" });
      }

      const benutzer = await prisma.benutzer.findUnique({ where: { id } });
      if (!benutzer) return reply.status(404).send({ fehler: "Benutzer nicht gefunden" });

      await prisma.benutzer.update({
        where: { id },
        data:  { passwortHash: hashPassword(neuesPasswort) },
      });

      await prisma.auditLog.create({
        data: {
          benutzerId: request.benutzer.sub,
          aktion:     AuditAktion.PASSWORT_GEAENDERT,
          details:    { betroffener: benutzer.email, durchVorsitz: true },
        },
      });

      return reply.send({ nachricht: "Passwort erfolgreich zurückgesetzt" });
    }
  );
}
