/**
 * Benutzerverwaltung – nur für VORSITZ und ADMIN
 *
 * GET    /api/benutzer          – alle Benutzer
 * POST   /api/benutzer          – neuen Benutzer anlegen
 * PATCH  /api/benutzer/:id      – Rolle / Status ändern
 * POST   /api/benutzer/:id/passwort-reset – Passwort zurücksetzen
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { Role, AuditAktion, Geschlecht } from "@prisma/client";
import { randomBytes } from "node:crypto";
import prisma from "../lib/prisma.js";
import { hashPassword } from "../lib/password.js";
import { authenticate } from "../middleware/auth.js";
import { erfordert } from "../middleware/rbac.js";
import { istTechnikAdmin } from "../lib/adminZugriff.js";

interface NeuerBenutzer {
  name:     string;
  email:    string;
  rolle:    Role;
  passwort: string;
  einladungEmail?: string | null;
}

const EMAIL_MUSTER = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Leer → null; sonst kleingeschrieben und auf Form geprüft (wirft bei Unsinn) */
function zweitadresse(wert: string | null | undefined): string | null {
  const s = (wert ?? "").trim().toLowerCase();
  if (!s) return null;
  if (!EMAIL_MUSTER.test(s)) throw new Error("Ungültige Einladungs-Adresse");
  return s;
}

interface BenutzerUpdate {
  rolle?:  Role;
  aktiv?:  boolean;
  istVertretungFuer?: string | null;
  geschlecht?: Geschlecht | null;
  wahlReihenfolge?: number | null;
  einladungEmail?: string | null;
}

interface PasswortReset {
  neuesPasswort: string;
}

export async function benutzerRouten(app: FastifyInstance): Promise<void> {

  // ── GET / – alle Benutzer (Lesezugriff für alle eingeloggten Rollen –
  //           wird auch für "Zuweisen an"-Dropdowns o.ä. gebraucht, nicht
  //           nur von der Benutzerverwaltung selbst) ──────────────────
  app.get(
    "/",
    { preHandler: [authenticate] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const benutzer = await prisma.benutzer.findMany({
        select: {
          id:               true,
          name:             true,
          email:            true,
          einladungEmail:   true,
          rolle:            true,
          aktiv:            true,
          letzterLogin:     true,
          erstelltAm:       true,
          istVertretungFuer: true,
          geschlecht:       true,
          wahlReihenfolge:  true,
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

      let einladungEmail: string | null;
      try {
        einladungEmail = zweitadresse(request.body.einladungEmail);
      } catch (err) {
        return reply.status(400).send({ fehler: (err as Error).message });
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
          einladungEmail,
        },
        select: { id: true, name: true, email: true, einladungEmail: true, rolle: true, aktiv: true, erstelltAm: true },
      });

      await prisma.auditLog.create({
        data: {
          benutzerId: request.benutzer.sub,
          aktion:     AuditAktion.BENUTZER_ERSTELLT,
          details:    { neuerBenutzer: benutzer.email, rolle },
        },
      });

      // Ein Admin ohne Inhaltszugriff könnte sich ein Zweitkonto anlegen –
      // das verhindert die App nicht, aber der Vorsitz erfährt es sofort.
      if (await istTechnikAdmin(request.benutzer.rolle)) {
        const vorsitz = await prisma.benutzer.findMany({
          where:  { aktiv: true, rolle: { in: [Role.VORSITZ, Role.STELLVERTRETER] } },
          select: { id: true },
        });
        await prisma.nachricht.createMany({
          data: vorsitz.map(v => ({
            betreff:      `Neues Benutzerkonto: ${benutzer.name}`,
            inhalt:       `Der Admin hat das Konto ${benutzer.name} (${benutzer.email}) mit der Rolle ${rolle} angelegt. ` +
                          `Bitte prüfen, ob das so gewollt ist.`,
            typ:          "SYSTEM",
            empfaengerId: v.id,
          })),
        }).catch(() => {});
      }

      return reply.status(201).send(benutzer);
    }
  );

  // ── PATCH /:id – Rolle oder Status ändern ─────────────────────
  app.patch<{ Params: { id: string }; Body: BenutzerUpdate }>(
    "/:id",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request: FastifyRequest<{ Params: { id: string }; Body: BenutzerUpdate }>, reply: FastifyReply) => {
      const { id } = request.params;
      const { rolle, aktiv, istVertretungFuer, geschlecht, wahlReihenfolge } = request.body;
      let einladungEmail: string | null | undefined;
      try {
        einladungEmail = request.body.einladungEmail === undefined ? undefined : zweitadresse(request.body.einladungEmail);
      } catch (err) {
        return reply.status(400).send({ fehler: (err as Error).message });
      }

      // Schutz: sich selbst nicht deaktivieren
      if (id === request.benutzer.sub && aktiv === false) {
        return reply.status(400).send({ fehler: "Sie können sich nicht selbst deaktivieren" });
      }

      // Admin ohne Inhaltszugriff darf sich nicht selbst eine Gremiumsrolle geben –
      // das würde die Sperre aushebeln
      if (id === request.benutzer.sub && rolle !== undefined && rolle !== request.benutzer.rolle
          && await istTechnikAdmin(request.benutzer.rolle)) {
        return reply.status(403).send({ fehler: "Der Admin kann seine eigene Rolle nicht ändern" });
      }

      if (wahlReihenfolge !== undefined && wahlReihenfolge !== null && (!Number.isInteger(wahlReihenfolge) || wahlReihenfolge < 1)) {
        return reply.status(400).send({ fehler: "wahlReihenfolge muss eine positive Ganzzahl oder null sein" });
      }

      const benutzer = await prisma.benutzer.findUnique({ where: { id } });
      if (!benutzer) return reply.status(404).send({ fehler: "Benutzer nicht gefunden" });

      const aktualisiert = await prisma.benutzer.update({
        where: { id },
        data: {
          ...(rolle !== undefined ? { rolle } : {}),
          ...(aktiv !== undefined ? { aktiv } : {}),
          ...(istVertretungFuer !== undefined ? { istVertretungFuer } : {}),
          ...(geschlecht !== undefined ? { geschlecht } : {}),
          ...(wahlReihenfolge !== undefined ? { wahlReihenfolge } : {}),
          ...(einladungEmail !== undefined ? { einladungEmail } : {}),
        },
        select: { id: true, name: true, email: true, einladungEmail: true, rolle: true, aktiv: true, istVertretungFuer: true, geschlecht: true, wahlReihenfolge: true },
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

  // ── DELETE /:id – Benutzer endgültig löschen (nur ADMIN) ───────
  // Anders als "deaktivieren" (aktiv=false, der normale Weg für echte
  // Mitglieder, die ausscheiden) ist das hier ein echtes Löschen – nur
  // sinnvoll für versehentlich angelegte Test-Accounts ohne echte Historie.
  // Prisma verweigert das Löschen automatisch (Fremdschlüssel-Fehler), wenn
  // der Benutzer bereits Dokumente/Sitzungen/Kommentare/etc. hinterlassen hat.
  app.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [authenticate, erfordert(Role.ADMIN)] },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;

      if (id === request.benutzer.sub) {
        return reply.status(400).send({ fehler: "Sie können sich nicht selbst löschen" });
      }

      const benutzer = await prisma.benutzer.findUnique({ where: { id } });
      if (!benutzer) return reply.status(404).send({ fehler: "Benutzer nicht gefunden" });

      try {
        await prisma.benutzer.delete({ where: { id } });
      } catch (err: any) {
        if (err?.code === "P2003") {
          return reply.status(409).send({
            fehler: "Dieser Benutzer hat bereits Daten im System hinterlassen (z.B. Dokumente, Sitzungen, Kommentare) und kann daher nicht endgültig gelöscht werden – nur deaktivieren.",
          });
        }
        throw err;
      }

      await prisma.auditLog.create({
        data: {
          benutzerId: request.benutzer.sub,
          aktion:     AuditAktion.BENUTZER_GELOESCHT,
          details:    { geloeschterBenutzer: benutzer.email },
        },
      }).catch(() => {});

      return reply.send({ ok: true });
    }
  );

  // ── POST /:id/passwort-reset ───────────────────────────────────
  app.post<{ Params: { id: string }; Body: PasswortReset }>(
    "/:id/passwort-reset",
    { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request: FastifyRequest<{ Params: { id: string }; Body: PasswortReset }>, reply: FastifyReply) => {
      const { id } = request.params;
      const { neuesPasswort } = request.body;

      // Sonst könnte sich ein Admin ohne Inhaltszugriff als Mitglied anmelden
      if (await istTechnikAdmin(request.benutzer.rolle)) {
        return reply.status(403).send({
          fehler: "Passwörter setzt in dieser Installation der Vorsitz zurück – oder die Person selbst über „Passwort vergessen“",
        });
      }

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
