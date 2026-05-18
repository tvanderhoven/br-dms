/**
 * Globale Volltextsuche
 * GET /api/suche?q=...
 * Durchsucht: Dokumente (Titel, Alias, Aktenzeichen, Beschreibung, Tags, Textinhalt)
 *             Sitzungen  (Titel, Notizen, TOPs Titel/Inhalt/Ergebnis)
 *             Aufgaben   (Titel, Beschreibung)
 *             Wissenseinträge (Titel, Inhalt, Kategorien, Lösung)
 */

import { FastifyInstance, FastifyRequest } from "fastify";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { DokumentStatus, Role } from "@prisma/client";

export async function sucheRouten(app: FastifyInstance): Promise<void> {

  app.get<{ Querystring: { q?: string } }>(
    "/suche",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply) => {
      const { q } = (request as any).query as { q?: string };
      const { rolle, sub } = (request as any).benutzer;

      if (!q || q.trim().length < 2) {
        return reply.send({ dokumente: [], sitzungen: [], aufgaben: [], wissen: [] });
      }

      const suchbegriff = q.trim();

      const vertraulichFilter =
        rolle === Role.MITGLIED || rolle === Role.ERSATZMITGLIED
          ? { OR: [{ vertraulich: false }, { hochgeladenVonId: sub }] }
          : {};

      const dokumente = await prisma.dokument.findMany({
        where: {
          status: { notIn: [DokumentStatus.GELOESCHT] },
          ...vertraulichFilter,
          OR: [
            { titel:        { contains: suchbegriff, mode: "insensitive" } },
            { alias:        { contains: suchbegriff, mode: "insensitive" } },
            { aktenzeichen: { contains: suchbegriff, mode: "insensitive" } },
            { beschreibung: { contains: suchbegriff, mode: "insensitive" } },
            { textinhalt:   { contains: suchbegriff, mode: "insensitive" } },
            { tags:         { has: suchbegriff } },
          ],
        },
        select: {
          id:         true,
          titel:      true,
          alias:      true,
          kategorie:  true,
          status:     true,
          tags:       true,
          dateiname:  true,
          erstelltAm: true,
        },
        take: 10,
        orderBy: { erstelltAm: "desc" },
      });

      // ── Sitzungen & Protokolle ─────────────────────────────────────
      const sitzungen = await prisma.sitzung.findMany({
        where: {
          OR: [
            { titel:   { contains: suchbegriff, mode: "insensitive" } },
            { notizen: { contains: suchbegriff, mode: "insensitive" } },
            { tops: { some: { OR: [
              { titel:    { contains: suchbegriff, mode: "insensitive" } },
              { inhalt:   { contains: suchbegriff, mode: "insensitive" } },
              { ergebnis: { contains: suchbegriff, mode: "insensitive" } },
            ]}}},
            { tops: { some: { beschluesse: { some: {
              ergebnis: { contains: suchbegriff, mode: "insensitive" },
            }}}}},
          ],
        },
        select: {
          id:            true,
          titel:         true,
          sitzungsdatum: true,
          status:        true,
        },
        take: 8,
        orderBy: { sitzungsdatum: "desc" },
      });

      // ── Aufgaben ──────────────────────────────────────────────
      const aufgaben = await prisma.aufgabe.findMany({
        where: {
          AND: [
            {
              OR: [
                { titel:        { contains: suchbegriff, mode: "insensitive" } },
                { beschreibung: { contains: suchbegriff, mode: "insensitive" } },
              ],
            },
            {
              OR: [
                { sichtbarkeit: "OEFFENTLICH" },
                { sichtbarkeit: "PRIVAT", erstelltVonId: sub },
              ],
            },
          ],
        },
        select: {
          id:          true,
          titel:       true,
          prioritaet:  true,
          erledigt:    true,
          faelligAm:   true,
        },
        take: 8,
        orderBy: { erstelltAm: "desc" },
      });

      // ── Wissenseinträge ────────────────────────────────────────
      const wissen = await prisma.wissensEintrag.findMany({
        where: {
          OR: [
            { titel:      { contains: suchbegriff, mode: "insensitive" } },
            { inhalt:     { contains: suchbegriff, mode: "insensitive" } },
            { kategorien: { has: suchbegriff } },
            { loesung:    { contains: suchbegriff, mode: "insensitive" } },
          ],
        },
        select: {
          id:         true,
          titel:      true,
          kategorien: true,
          erstelltAm: true,
        },
        take: 5,
        orderBy: { erstelltAm: "desc" },
      });

      // ── Ressourcen ─────────────────────────────────────────────
      const ressourcen = await prisma.ressource.findMany({
        where: {
          OR: [
            { titel:        { contains: suchbegriff, mode: "insensitive" } },
            { url:          { contains: suchbegriff, mode: "insensitive" } },
            { beschreibung: { contains: suchbegriff, mode: "insensitive" } },
            { tags:         { has: suchbegriff } },
          ],
        },
        select: {
          id:        true,
          titel:     true,
          url:       true,
          kategorie: true,
          erstelltAm: true,
        },
        take: 5,
        orderBy: { erstelltAm: "desc" },
      });

      return reply.send({ dokumente, sitzungen, aufgaben, wissen, ressourcen });
    }
  );
}
