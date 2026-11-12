/**
 * Kummerkasten-Routen
 *
 * POST   /api/kummerkasten                  – Anliegen einreichen (ÖFFENTLICH, kein Login, rate-limited)
 * POST   /api/kummerkasten/ticket           – Verlauf per Ticket-Code abrufen (ÖFFENTLICH, rate-limited)
 * POST   /api/kummerkasten/ticket/nachricht – Rückfrage per Ticket-Code schreiben (ÖFFENTLICH, rate-limited)
 * GET    /api/kummerkasten                  – alle Einträge mit Verlauf (BR-intern)
 * PATCH  /api/kummerkasten/:id              – Status/Notiz bearbeiten (BR-intern)
 * POST   /api/kummerkasten/:id/nachrichten  – dem Einreicher antworten (BR-intern)
 * DELETE /api/kummerkasten/:id              – Eintrag löschen (BR-intern)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { KummerkastenAbsender, KummerkastenStatus, Prisma, Role } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { benachrichtigen } from "../lib/benachrichtigung.js";
import { codeNormalisieren, neuerTicketCode, ticketHash, CODE_LAENGE } from "../lib/kummerkastenTicket.js";

/** Länge einer Chat-Nachricht und Obergrenze je Ticket (ohne die ursprüngliche Nachricht) –
 *  die schreibende Route ist öffentlich, nur der Ticket-Code schützt sie. */
const NACHRICHT_MAX = 2000;
const NACHRICHTEN_PRO_TICKET_MAX = 50;

const EINTRAG_SELECT = {
  id:              true,
  nachricht:       true,
  absenderName:    true,
  status:          true,
  notiz:           true,
  ticketCodeHash:  true,
  nachrichten: {
    orderBy: { erstelltAm: "asc" },
    select:  { id: true, absender: true, text: true, erstelltAm: true, bearbeitetVon: { select: { id: true, name: true } } },
  },
  bearbeitetVon:   { select: { id: true, name: true } },
  bearbeitetAm:    true,
  erstelltAm:      true,
} as const satisfies Prisma.KummerkastenEintragSelect;

/** Der Hash bleibt im Haus – der BR sieht nur, ob es einen Rückkanal gibt und ob der Einreicher zuletzt geschrieben hat. */
function ohneHash<T extends { ticketCodeHash: string | null; nachrichten: { absender: KummerkastenAbsender }[] }>(e: T) {
  const { ticketCodeHash, ...rest } = e;
  const letzte = e.nachrichten[e.nachrichten.length - 1];
  return { ...rest, hatRueckkanal: ticketCodeHash !== null, offeneRueckfrage: letzte?.absender === KummerkastenAbsender.EINREICHER };
}

const TICKET_SELECT = {
  id:         true,
  status:     true,
  nachricht:  true,
  erstelltAm: true,
  nachrichten: { orderBy: { erstelltAm: "asc" }, select: { absender: true, text: true, erstelltAm: true } },
} as const satisfies Prisma.KummerkastenEintragSelect;

type TicketEintrag = Prisma.KummerkastenEintragGetPayload<{ select: typeof TICKET_SELECT }>;

/** Öffentliche Sicht: die ursprüngliche Nachricht als erste Blase des Einreichers, dann der Verlauf.
 *  Nie die interne Notiz, nie der Name eines BR-Mitglieds – der Einreicher sieht nur "Betriebsrat". */
function ticketAnsicht(e: TicketEintrag) {
  return {
    status:     e.status,
    erstelltAm: e.erstelltAm,
    nachrichten: [
      { absender: KummerkastenAbsender.EINREICHER, text: e.nachricht, erstelltAm: e.erstelltAm },
      ...e.nachrichten,
    ],
  };
}

async function eintragZuCode(eingabe: string): Promise<TicketEintrag | null> {
  const code = codeNormalisieren(eingabe);
  if (code.length !== CODE_LAENGE) return null;
  return prisma.kummerkastenEintrag.findUnique({ where: { ticketCodeHash: ticketHash(code) }, select: TICKET_SELECT });
}

/** Meldung an Vorsitz/Stellvertretung – bewusst ohne den Text des Anliegens, der steht nur in der Verwaltung. */
async function vorsitzBenachrichtigen(betreff: string, inhalt: string): Promise<void> {
  const vorsitz = await prisma.benutzer.findMany({
    where: { aktiv: true, rolle: { in: [Role.VORSITZ, Role.STELLVERTRETER] } }, select: { id: true },
  });
  await benachrichtigen({
    art: "KUMMERKASTEN", empfaengerIds: vorsitz.map(v => v.id), link: "/kummerkasten-verwaltung", betreff, inhalt,
  });
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

      await vorsitzBenachrichtigen("Neuer Eintrag im Kummerkasten", "Im Kummerkasten ist ein neues Anliegen eingegangen.");

      return reply.status(201).send({ ok: true, ticketCode });
    }
  );

  // ── POST /ticket – Verlauf per Code abrufen (öffentlich) ────────────
  // Der Code steht im Body, nicht in der URL, damit er in keinem
  // Server-/Proxy-Log landet. Wer den Code kennt, sieht den Verlauf – das ist
  // bei jedem anonymen Ticket so, deshalb gilt der Code wie ein Passwort.
  app.post<{ Body: { code: string } }>(
    "/ticket",
    {
      // Großzügiger als das Einreichen: die Ticket-Seite lädt den Verlauf bei offenem Fenster
      // einmal pro Minute nach. Bei ~1 Mrd. möglichen Codes bleibt Raten damit aussichtslos.
      config: {
        rateLimit: { max: 60, timeWindow: "10 minutes" },
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
      const eintrag = await eintragZuCode(request.body.code);
      // Einheitliche Meldung, ob der Code falsch, zu kurz oder gelöscht ist
      if (!eintrag) return reply.status(404).send({ fehler: "Kein Eintrag zu diesem Code gefunden" });
      return reply.send(ticketAnsicht(eintrag));
    }
  );

  // ── POST /ticket/nachricht – Rückfrage des Einreichers (öffentlich) ──
  // Ein erledigtes Ticket öffnet sich damit wieder, und der BR bekommt eine
  // Meldung (ohne Text). Der Einreicher selbst wird nie benachrichtigt – das
  // würde eine Kontaktadresse voraussetzen und die Anonymität brechen.
  app.post<{ Body: { code: string; text: string } }>(
    "/ticket/nachricht",
    {
      config: {
        rateLimit: { max: 10, timeWindow: "10 minutes" },
      },
      schema: {
        body: {
          type: "object",
          required: ["code", "text"],
          properties: {
            code: { type: "string", minLength: 1, maxLength: 32 },
            text: { type: "string", minLength: 1, maxLength: NACHRICHT_MAX },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: { code: string; text: string } }>, reply: FastifyReply) => {
      const text = request.body.text.trim();
      if (!text) return reply.status(400).send({ fehler: "Nachricht darf nicht leer sein" });

      const eintrag = await eintragZuCode(request.body.code);
      if (!eintrag) return reply.status(404).send({ fehler: "Kein Eintrag zu diesem Code gefunden" });
      if (eintrag.nachrichten.length >= NACHRICHTEN_PRO_TICKET_MAX) {
        return reply.status(409).send({ fehler: "Dieses Ticket hat die maximale Zahl an Nachrichten erreicht. Bitte reiche ein neues Anliegen ein." });
      }

      await prisma.$transaction([
        prisma.kummerkastenNachricht.create({ data: { eintragId: eintrag.id, absender: KummerkastenAbsender.EINREICHER, text } }),
        // Rückfrage zu einem erledigten Anliegen: wieder offen
        ...(eintrag.status === KummerkastenStatus.ERLEDIGT
          ? [prisma.kummerkastenEintrag.update({ where: { id: eintrag.id }, data: { status: KummerkastenStatus.IN_BEARBEITUNG } })]
          : []),
      ]);

      await vorsitzBenachrichtigen("Neue Rückfrage im Kummerkasten", "Im Kummerkasten hat jemand auf ein Anliegen geantwortet oder nachgefragt.");

      const aktuell = await eintragZuCode(request.body.code);
      return reply.status(201).send(ticketAnsicht(aktuell!));
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

  // ── PATCH /:id – Status/Notiz bearbeiten (BR-intern) ────────────
  app.patch<{ Params: { id: string }; Body: { status?: KummerkastenStatus; notiz?: string | null } }>(
    "/:id",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { id } = request.params;
      const { status, notiz } = request.body;

      const vorhanden = await prisma.kummerkastenEintrag.findUnique({ where: { id } });
      if (!vorhanden) return reply.status(404).send({ fehler: "Eintrag nicht gefunden" });

      const aktualisiert = await prisma.kummerkastenEintrag.update({
        where: { id },
        data: {
          ...(status !== undefined ? { status } : {}),
          ...(notiz  !== undefined ? { notiz: notiz?.trim() || null } : {}),
          bearbeitetVonId: request.benutzer.sub,
          bearbeitetAm:    new Date(),
        },
        select: EINTRAG_SELECT,
      });

      return reply.send(ohneHash(aktualisiert));
    }
  );

  // ── POST /:id/nachrichten – dem Einreicher antworten (BR-intern) ─────
  // Der Einreicher sieht nur "Betriebsrat"; wer geschrieben hat, steht nur hier im BR.
  app.post<{ Params: { id: string }; Body: { text: string } }>(
    "/:id/nachrichten",
    {
      preValidation: [authenticate], // vor der Schema-Prüfung: Unangemeldete bekommen 401, nicht 400
      schema: {
        body: {
          type: "object",
          required: ["text"],
          properties: {
            text: { type: "string", minLength: 1, maxLength: NACHRICHT_MAX },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const text = request.body.text.trim();
      if (!text) return reply.status(400).send({ fehler: "Nachricht darf nicht leer sein" });

      const vorhanden = await prisma.kummerkastenEintrag.findUnique({
        where:  { id },
        select: { ticketCodeHash: true, _count: { select: { nachrichten: true } } },
      });
      if (!vorhanden) return reply.status(404).send({ fehler: "Eintrag nicht gefunden" });
      if (vorhanden.ticketCodeHash === null) {
        return reply.status(400).send({ fehler: "Dieser Eintrag hat keinen Rückkanal – er wurde vor Einführung der Ticket-Codes eingereicht" });
      }
      if (vorhanden._count.nachrichten >= NACHRICHTEN_PRO_TICKET_MAX) {
        return reply.status(409).send({ fehler: "Dieses Ticket hat die maximale Zahl an Nachrichten erreicht" });
      }

      const aktualisiert = await prisma.kummerkastenEintrag.update({
        where: { id },
        data: {
          nachrichten: { create: { absender: KummerkastenAbsender.BETRIEBSRAT, text, bearbeitetVonId: request.benutzer.sub } },
          bearbeitetVonId: request.benutzer.sub,
          bearbeitetAm:    new Date(),
        },
        select: EINTRAG_SELECT,
      });

      return reply.status(201).send(ohneHash(aktualisiert));
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
