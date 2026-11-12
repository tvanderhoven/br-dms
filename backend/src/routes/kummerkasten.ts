/**
 * Kummerkasten-Routen
 *
 * POST   /api/kummerkasten        – Anliegen einreichen (ÖFFENTLICH, kein Login, rate-limited)
 * POST   /api/kummerkasten/ticket – Status/Antwort per Ticket-Code abrufen (ÖFFENTLICH, rate-limited)
 * GET    /api/kummerkasten        – alle Einträge (BR-intern)
 * PATCH  /api/kummerkasten/:id    – Status/Notiz/Antwort bearbeiten (BR-intern)
 * DELETE /api/kummerkasten/:id    – Eintrag löschen (BR-intern)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { KummerkastenStatus, Prisma, Role } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { benachrichtigen } from "../lib/benachrichtigung.js";
import { codeNormalisieren, neuerTicketCode, ticketHash, CODE_LAENGE } from "../lib/kummerkastenTicket.js";

const EINTRAG_SELECT = {
  id:              true,
  nachricht:       true,
  absenderName:    true,
  status:          true,
  notiz:           true,
  antwort:         true,
  antwortAm:       true,
  ticketCodeHash:  true,
  bearbeitetVon:   { select: { id: true, name: true } },
  bearbeitetAm:    true,
  erstelltAm:      true,
} as const;

/** Der Hash bleibt im Haus – der BR sieht nur, ob es einen Rückkanal gibt. */
function ohneHash<T extends { ticketCodeHash: string | null }>(e: T) {
  const { ticketCodeHash, ...rest } = e;
  return { ...rest, hatRueckkanal: ticketCodeHash !== null };
}

interface EinreichenBody {
  nachricht:    string;
  absenderName?: string;
  // Honeypot-Feld – für Menschen unsichtbar (CSS in der Public-Seite), Bots
  // füllen sowas oft blind aus. Kein Sicherheitsversprechen, nur ein
  // billiger Filter gegen simple Spam-Bots.
  webseite?: string;
}

export async function kummerkastenRouten(app: FastifyInstance): Promise<void> {

  // ── POST / – Anliegen einreichen (öffentlich, ohne Login) ──────────
  app.post<{ Body: EinreichenBody }>(
    "/",
    {
      // Rate-Limit statt Login-Pflicht als Missbrauchsschutz – die Seite
      // ist bewusst anonym erreichbar (siehe Layout/App.tsx: kein geschuetzt()).
      config: {
        rateLimit: { max: 5, timeWindow: "10 minutes" },
      },
      schema: {
        body: {
          type: "object",
          required: ["nachricht"],
          properties: {
            nachricht:    { type: "string", minLength: 1, maxLength: 5000 },
            absenderName: { type: "string", maxLength: 200 },
            webseite:     { type: "string", maxLength: 200 },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: EinreichenBody }>, reply: FastifyReply) => {
      const { nachricht, absenderName, webseite } = request.body;

      // Honeypot ausgefüllt → stiller Erfolg vortäuschen, nichts speichern
      if (webseite && webseite.trim()) {
        return reply.status(201).send({ ok: true });
      }

      if (!nachricht.trim()) {
        return reply.status(400).send({ fehler: "nachricht ist ein Pflichtfeld" });
      }

      // Rückkanal: Code erzeugen, nur den HMAC speichern. Bei der (sehr
      // unwahrscheinlichen) Kollision des Unique-Hashes einfach neu würfeln.
      let ticketCode = "";
      for (let versuch = 0; ; versuch++) {
        ticketCode = neuerTicketCode();
        try {
          await prisma.kummerkastenEintrag.create({
            data: {
              nachricht:      nachricht.trim(),
              absenderName:   absenderName?.trim() || null,
              ticketCodeHash: ticketHash(ticketCode),
            },
          });
          break;
        } catch (err) {
          const kollision = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
          if (!kollision || versuch >= 4) throw err;
        }
      }

      // Ohne Text des Anliegens – der steht nur in der Kummerkasten-Verwaltung
      const vorsitz = await prisma.benutzer.findMany({
        where: { aktiv: true, rolle: { in: [Role.VORSITZ, Role.STELLVERTRETER] } }, select: { id: true },
      });
      await benachrichtigen({
        art: "KUMMERKASTEN", empfaengerIds: vorsitz.map(v => v.id), link: "/kummerkasten-verwaltung",
        betreff: "Neuer Eintrag im Kummerkasten",
        inhalt:  "Im Kummerkasten ist ein neues Anliegen eingegangen.",
      });

      return reply.status(201).send({ ok: true, ticketCode });
    }
  );

  // ── POST /ticket – Status/Antwort per Code abrufen (öffentlich) ─────
  // Der Code steht im Body, nicht in der URL, damit er in keinem
  // Server-/Proxy-Log landet. Antwort bewusst knapp: Status und BR-Antwort,
  // nie die Originalnachricht oder die interne Notiz – falls ein Code doch
  // einmal in falsche Hände gerät, steht dort nichts Verwertbares.
  app.post<{ Body: { code: string } }>(
    "/ticket",
    {
      config: {
        rateLimit: { max: 15, timeWindow: "10 minutes" },
      },
      schema: {
        body: {
          type: "object",
          required: ["code"],
          properties: {
            code: { type: "string", minLength: 1, maxLength: 32 },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: { code: string } }>, reply: FastifyReply) => {
      const code = codeNormalisieren(request.body.code);
      const eintrag = code.length === CODE_LAENGE
        ? await prisma.kummerkastenEintrag.findUnique({
            where:  { ticketCodeHash: ticketHash(code) },
            select: { status: true, antwort: true, antwortAm: true, erstelltAm: true },
          })
        : null;
      // Einheitliche Meldung, ob der Code falsch, zu kurz oder gelöscht ist
      if (!eintrag) return reply.status(404).send({ fehler: "Kein Eintrag zu diesem Code gefunden" });
      return reply.send(eintrag);
    }
  );

  // ── GET / – alle Einträge (BR-intern) ───────────────────────────
  app.get("/", { preHandler: [authenticate] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const eintraege = await prisma.kummerkastenEintrag.findMany({
        select: EINTRAG_SELECT,
        orderBy: { erstelltAm: "desc" },
      });
      return reply.send(eintraege.map(ohneHash));
    }
  );

  // ── PATCH /:id – Status/Notiz/Antwort bearbeiten (BR-intern) ────────
  app.patch<{ Params: { id: string }; Body: { status?: KummerkastenStatus; notiz?: string | null; antwort?: string | null } }>(
    "/:id",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { id } = request.params;
      const { status, notiz, antwort } = request.body;

      const vorhanden = await prisma.kummerkastenEintrag.findUnique({ where: { id } });
      if (!vorhanden) return reply.status(404).send({ fehler: "Eintrag nicht gefunden" });

      const neueAntwort = antwort !== undefined ? antwort?.trim() || null : undefined;
      const aktualisiert = await prisma.kummerkastenEintrag.update({
        where: { id },
        data: {
          ...(status !== undefined ? { status } : {}),
          ...(notiz  !== undefined ? { notiz: notiz?.trim() || null } : {}),
          ...(neueAntwort !== undefined
            ? { antwort: neueAntwort, antwortAm: neueAntwort === null ? null : new Date() }
            : {}),
          bearbeitetVonId: request.benutzer.sub,
          bearbeitetAm:    new Date(),
        },
        select: EINTRAG_SELECT,
      });

      return reply.send(ohneHash(aktualisiert));
    }
  );

  // ── DELETE /:id – Eintrag löschen (BR-intern) ───────────────────
  app.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const vorhanden = await prisma.kummerkastenEintrag.findUnique({ where: { id: request.params.id } });
      if (!vorhanden) return reply.status(404).send({ fehler: "Eintrag nicht gefunden" });
      await prisma.kummerkastenEintrag.delete({ where: { id: request.params.id } });
      return reply.send({ ok: true });
    }
  );
}
