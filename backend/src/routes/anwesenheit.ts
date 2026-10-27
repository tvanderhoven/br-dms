/**
 * Anwesenheits-Routen – Verwaltung der Teilnahme an Sitzungen
 *
 * GET    /api/sitzungen/:id/anwesenheit        – Anwesenheitsliste abrufen
 * POST   /api/sitzungen/:id/anwesenheit        – Eintrag erstellen/aktualisieren
 * DELETE /api/sitzungen/:id/anwesenheit/:uid   – Eintrag löschen
 *
 * Teilnahmeart (§ 30 Abs. 2 BetrVG, lib/videoSitzung.ts): vor Ort, per Video oder per Telefon –
 * zugeschaltet nur, wenn die Form der Sitzung es vorsieht und kein Viertel widersprochen hat.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { AnwesenheitsStatus, Role, SitzungStatus, Teilnahmeart } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { erfordert } from "../middleware/rbac.js";
import { ermittleErsatzVorschlag } from "../lib/ersatzVorschlag.js";
import { vergleicheNachMitgliederSortierung } from "../lib/mitgliederSortierung.js";
import { benachrichtigen, sitzungLink } from "../lib/benachrichtigung.js";
import { istTeilnahmeart, istZugeschaltet, teilnahmeBestaetigungAnfordern, zuschaltungGesperrt } from "../lib/videoSitzung.js";

const ANWESENHEIT_SELECT = {
  id: true,
  status: true,
  teilnahmeart: true,
  teilnahmeBestaetigtAm: true,
  vertretungFuer: {
    select: { id: true, name: true },
  },
  benutzer: {
    select: { id: true, name: true, rolle: true },
  },
  erstelltAm: true,
  aktualisiertAm: true,
} as const;

export async function anwesenheitRouten(app: FastifyInstance): Promise<void> {

  // ── GET /:id/anwesenheit – Liste ───────────────────────────────
  app.get(
    "/:id/anwesenheit",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      const anwesenheiten = await prisma.anwesenheit.findMany({
        where: { sitzungId: id },
        select: ANWESENHEIT_SELECT,
        orderBy: { benutzer: { name: "asc" } },
      });

      // Alle BR-Mitglieder laden (für vollständige Liste) – ADMIN ist ein rein
      // funktionaler Zugang, kein echtes Sitzungsmitglied, taucht hier nicht auf.
      const alleMitglieder = await prisma.benutzer.findMany({
        where: { aktiv: true, rolle: { notIn: [Role.ADMIN, Role.EXTERN] } },
        select: { id: true, name: true, rolle: true, istVertretungFuer: true, wahlReihenfolge: true },
      });

      alleMitglieder.sort(vergleicheNachMitgliederSortierung);

      // Anwesenheiten zuordnen
      const anwesendMap = new Map(anwesenheiten.map(a => [a.benutzer.id, a]));
      const liste = alleMitglieder.map(m => ({
        benutzer: m,
        anwesenheit: anwesendMap.get(m.id) ?? null,
      }));

      return reply.send(liste);
    }
  );

  // ── GET /:id/ersatz-vorschlag – Nachrück-Vorschlag für Abwesenden ──
  app.get(
    "/:id/ersatz-vorschlag",
    { preHandler: [authenticate, erfordert(Role.MITGLIED)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const { abwesenderId } = request.query as { abwesenderId?: string };

      if (!abwesenderId) {
        return reply.status(400).send({ fehler: "abwesenderId erforderlich" });
      }

      const sitzung = await prisma.sitzung.findUnique({ where: { id }, select: { id: true } });
      if (!sitzung) {
        return reply.status(404).send({ fehler: "Sitzung nicht gefunden" });
      }

      const ergebnis = await ermittleErsatzVorschlag(id, abwesenderId);
      return reply.send(ergebnis);
    }
  );

  // ── POST /:id/anwesenheit – Eintrag setzen ─────────────────────
  app.post(
    "/:id/anwesenheit",
    { preHandler: [authenticate, erfordert(Role.MITGLIED)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const { benutzerId, status, vertretungFuerId, teilnahmeart } = request.body as {
        benutzerId: string;
        status: AnwesenheitsStatus;
        vertretungFuerId?: string;
        teilnahmeart?: Teilnahmeart;
      };

      const sitzung = await prisma.sitzung.findUnique({
        where: { id },
        select: { id: true, titel: true, sitzungsdatum: true, status: true },
      });

      if (!sitzung) {
        return reply.status(404).send({ fehler: "Sitzung nicht gefunden" });
      }

      const benutzer = await prisma.benutzer.findUnique({
        where: { id: benutzerId },
        select: { id: true, aktiv: true, rolle: true },
      });
      const vorher = await prisma.anwesenheit.findUnique({
        where:  { sitzungId_benutzerId: { sitzungId: id, benutzerId } },
        select: { status: true, vertretungFuerId: true, teilnahmeart: true },
      });

      // Admin und externe Protokollführung gehören nicht zum Gremium – keine Ladung, keine Anwesenheit
      if (!benutzer || !benutzer.aktiv || benutzer.rolle === Role.ADMIN || benutzer.rolle === Role.EXTERN) {
        return reply.status(404).send({ fehler: "Benutzer nicht gefunden" });
      }

      // Nur ERSATZ_FUER braucht vertretungFuerId
      if (status === AnwesenheitsStatus.ERSATZ_FUER && !vertretungFuerId) {
        return reply.status(400).send({ fehler: "vertretungFuerId erforderlich für Ersatzmitglied" });
      }

      if (teilnahmeart !== undefined && !istTeilnahmeart(teilnahmeart)) {
        return reply.status(400).send({ fehler: "Unbekannte Teilnahmeart" });
      }
      // Wer abwesend ist, ist auch nicht zugeschaltet
      const art = status === AnwesenheitsStatus.ANWESEND || status === AnwesenheitsStatus.ERSATZ_FUER
        ? teilnahmeart ?? vorher?.teilnahmeart ?? Teilnahmeart.VOR_ORT
        : Teilnahmeart.VOR_ORT;
      if (istZugeschaltet(art) && art !== vorher?.teilnahmeart) {
        const grund = await zuschaltungGesperrt(id);
        if (grund) return reply.status(409).send({ fehler: grund });
      }
      // Bestätigung gilt nur für die Teilnahmeart, die bestätigt wurde
      const bestaetigungZuruecksetzen = art !== vorher?.teilnahmeart ? { teilnahmeBestaetigtAm: null } : {};

      const anwesenheit = await prisma.anwesenheit.upsert({
        where: {
          sitzungId_benutzerId: {
            sitzungId: id,
            benutzerId: benutzerId,
          },
        },
        update: {
          status,
          vertretungFuerId: vertretungFuerId ?? null,
          teilnahmeart: art,
          ...bestaetigungZuruecksetzen,
        },
        create: {
          sitzungId: id,
          benutzerId: benutzerId,
          status,
          vertretungFuerId: vertretungFuerId ?? null,
          teilnahmeart: art,
        },
        select: ANWESENHEIT_SELECT,
      });

      // Ladung als Ersatzmitglied – nur vor der Sitzung; wer in der Sitzung nachträglich
      // als Ersatz eingetragen wird, sitzt schon im Raum
      const neuGeladen = status === AnwesenheitsStatus.ERSATZ_FUER
        && (vorher?.status !== AnwesenheitsStatus.ERSATZ_FUER || vorher.vertretungFuerId !== vertretungFuerId);
      const vorDerSitzung = sitzung.status === SitzungStatus.ENTWURF || sitzung.status === SitzungStatus.TAGESORDNUNG_FIXIERT;
      if (neuGeladen && vorDerSitzung) {
        const datum = sitzung.sitzungsdatum.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" });
        await benachrichtigen({
          art: "ERSATZ_GELADEN", empfaengerIds: [benutzerId], ausloeserId: request.benutzer.sub,
          sitzungId: id, link: sitzungLink(id),
          betreff: `Ladung als Ersatzmitglied: ${sitzung.titel}`,
          inhalt:  `Du bist als Ersatzmitglied zur Sitzung „${sitzung.titel}“ am ${datum} geladen.`,
        });
      }

      // Nach der Sitzung als zugeschaltet eingetragen → an die Bestätigung (§ 34 Abs. 1) erinnern
      if (istZugeschaltet(art) && art !== vorher?.teilnahmeart && sitzung.status === SitzungStatus.PROTOKOLL_ENTWURF) {
        await teilnahmeBestaetigungAnfordern(id, benutzerId, request.benutzer.sub);
      }

      return reply.status(201).send(anwesenheit);
    }
  );

  // ── DELETE /:id/anwesenheit/:uid ───────────────────────────────
  app.delete(
    "/:id/anwesenheit/:uid",
    { preHandler: [authenticate, erfordert(Role.MITGLIED)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, uid } = request.params as { id: string; uid: string };

      const anwesenheit = await prisma.anwesenheit.findFirst({
        where: { id: uid, sitzungId: id },
      });

      if (!anwesenheit) {
        return reply.status(404).send({ fehler: "Eintrag nicht gefunden" });
      }

      await prisma.anwesenheit.delete({ where: { id: uid } });

      return reply.send({ nachricht: "Eintrag gelöscht" });
    }
  );
}
