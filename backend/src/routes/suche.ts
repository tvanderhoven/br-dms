/**
 * Globale Volltextsuche
 * GET /api/suche?q=...
 * Durchsucht: Dokumente (Titel, Alias, Aktenzeichen, Beschreibung, Tags, Textinhalt)
 *             Sitzungen  (Titel, Notizen, TOPs Titel/Inhalt/Ergebnis)
 *             Aufgaben   (Titel, Beschreibung)
 *             Wissenseinträge (Titel, Inhalt, Kategorien, Lösung)
 *             Ressourcen (Titel, URL, Beschreibung, Tags)
 *             Betriebsvereinbarungen (Titel, Geltungsbereich, Bemerkung, verknüpftes Dokument)
 *             Schulungen (Titel, Ort, Anbieter, Bemerkung, Qualifikationsname)
 *             Mitarbeiter (Vorname, Nachname, PNR)
 *             Gesetzestexte (§, Titel, Volltext – z.B. BetrVG, KSchG)
 */

import { FastifyInstance, FastifyRequest } from "fastify";
import prisma from "../lib/prisma.js";
import { dokumentVertraulichFilter } from "../lib/vertraulich.js";
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
        return reply.send({ dokumente: [], sitzungen: [], aufgaben: [], wissen: [], gesetze: [] });
      }

      const suchbegriff = q.trim();

      const vertraulichFilter = dokumentVertraulichFilter(rolle, sub);

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
          id:            true,
          titel:         true,
          prioritaet:    true,
          erledigt:      true,
          faelligAm:     true,
          typ:           true,
          oberProjektId: true,
          kanbanStatus:  true,
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

      // ── Betriebsvereinbarungen ───────────────────────────────────
      const betriebsvereinbarungen = await prisma.betriebsvereinbarung.findMany({
        where: {
          OR: [
            { titel:           { contains: suchbegriff, mode: "insensitive" } },
            { geltungsbereich: { contains: suchbegriff, mode: "insensitive" } },
            { bemerkung:       { contains: suchbegriff, mode: "insensitive" } },
            { dokument: { textinhalt: { contains: suchbegriff, mode: "insensitive" } } },
          ],
        },
        select: { id: true, titel: true, status: true, abschlussdatum: true },
        take: 5,
        orderBy: { abschlussdatum: "desc" },
      });

      // ── Schulungen ────────────────────────────────────────────
      const schulungen = await prisma.schulungstermin.findMany({
        where: {
          OR: [
            { titel:     { contains: suchbegriff, mode: "insensitive" } },
            { ort:       { contains: suchbegriff, mode: "insensitive" } },
            { anbieter:  { contains: suchbegriff, mode: "insensitive" } },
            { bemerkung: { contains: suchbegriff, mode: "insensitive" } },
            { qualifikation: { name: { contains: suchbegriff, mode: "insensitive" } } },
          ],
        },
        select: {
          id: true, titel: true, datum: true, status: true,
          qualifikation: { select: { name: true } },
        },
        take: 5,
        orderBy: { datum: "desc" },
      });

      // ── Gesetzestexte ──────────────────────────────────────────
      // Mehrwort-Suche: jedes eingegebene Wort muss irgendwo vorkommen (§-Nummer,
      // Gesetzeskürzel, Titel oder Text – auch in unterschiedlichen Feldern), z.B.
      // "87 betrvg Arbeitszeit" → § 87 BetrVG, wenn "Arbeitszeit" im Text steht.
      const suchWoerter = suchbegriff.split(/\s+/).filter(Boolean);
      const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      // Größerer Kandidatenpool aus der DB, danach Relevanz-Ranking in JS –
      // sonst fallen bei häufigen Wörtern (z.B. "Arbeitszeit") die eigentlich
      // passenden Treffer aus den (nur alphabetisch sortierten) Top-Ergebnissen.
      const gesetzeKandidaten = await prisma.gesetzParagraph.findMany({
        where: {
          AND: suchWoerter.map(wort => ({
            OR: [
              { paragraph: { contains: wort, mode: "insensitive" as const } },
              { gesetz:    { contains: wort, mode: "insensitive" as const } },
              { titel:     { contains: wort, mode: "insensitive" as const } },
              { text:      { contains: wort, mode: "insensitive" as const } },
            ],
          })),
        },
        select: { id: true, gesetz: true, paragraph: true, titel: true, text: true },
        take: 500, // großzügiger Kandidatenpool – Tabelle ist klein (wenige tausend Paragraphen), Ranking passiert danach in JS
      });

      function gesetzRelevanz(g: typeof gesetzeKandidaten[number]): number {
        let punkte = 0;
        for (const wort of suchWoerter) {
          const wortLower = wort.toLowerCase();
          const wortGrenze = new RegExp(`\\b${escapeRegex(wort)}\\b`, "i");
          if (g.paragraph.toLowerCase().includes(wortLower)) punkte += 5;
          if (g.gesetz.toLowerCase().includes(wortLower))    punkte += 5;
          if (g.titel?.toLowerCase().includes(wortLower))    punkte += 4;
          if (wortGrenze.test(g.text))                       punkte += 2; // ganzes Wort im Text
          if (g.text.toLowerCase().includes(wortLower))      punkte += 1; // Teilstring im Text
        }
        return punkte;
      }

      const gesetze = gesetzeKandidaten
        .map(g => ({ ...g, relevanz: gesetzRelevanz(g) }))
        .sort((a, b) => b.relevanz - a.relevanz || a.text.length - b.text.length)
        .slice(0, 8)
        .map(({ relevanz: _relevanz, ...g }) => g);

      // ── Mitarbeiter (Gehaltstabelle) ──────────────────────────
      const mitarbeiter = await prisma.mitarbeiter.findMany({
        where: {
          OR: [
            { vorname:  { contains: suchbegriff, mode: "insensitive" } },
            { nachname: { contains: suchbegriff, mode: "insensitive" } },
            { pnr:      { contains: suchbegriff, mode: "insensitive" } },
          ],
        },
        select: {
          id: true, vorname: true, nachname: true, pnr: true,
          abteilung: { select: { name: true } },
        },
        take: 5,
        orderBy: [{ nachname: "asc" }, { vorname: "asc" }],
      });

      return reply.send({
        dokumente, sitzungen, aufgaben, wissen, ressourcen,
        betriebsvereinbarungen, schulungen, mitarbeiter, gesetze,
      });
    }
  );
}
