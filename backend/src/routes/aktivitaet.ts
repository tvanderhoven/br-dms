/**
 * Aktivitäts-Feed fürs Dashboard – „Was hat sich getan?“
 *
 * GET /api/aktivitaet – die letzten Änderungen (neue Sitzungen, Themen, Beiträge und
 * Kommentare, Dokumente, Aufgaben, Betriebsvereinbarungen), neueste zuerst.
 *
 * Anders als das Audit-Log (nur Vorsitz) sieht das jede Person mit Inhaltszugriff –
 * deshalb nur Meldungen zu Objekten, die sie auch sonst sehen darf (gleiche Filter wie
 * Dokumentenliste, Themenakte und Aufgaben). Inhalte stehen nicht drin, nur Art, Titel
 * und wer es getan hat. JAV/SBV/Externe kommen über middleware/auth.ts nicht durch.
 */

import { FastifyInstance } from "fastify";
import { DokumentStatus, SitzungStatus } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { dokumentVertraulichFilter } from "../lib/vertraulich.js";
import { themaSichtbarFilter } from "../lib/themenakte.js";
import { aufgabeLink, dokumentLink, sitzungLink } from "../lib/benachrichtigung.js";

export type AktivitaetArt =
  | "SITZUNG" | "THEMA" | "THEMA_BEITRAG" | "KOMMENTAR" | "DOKUMENT" | "AUFGABE" | "BV";

export interface Aktivitaet {
  id:     string;
  art:    AktivitaetArt;
  zeit:   Date;
  von:    string | null;   // null = nicht bekannt, dann steht der Satz ohne Namen da
  text:   string;          // „hat die Sitzung … angelegt“ – der Name steht davor
  ziel:   string;   // Titel des betroffenen Objekts
  link:   string | null;
}

const TAGE = 30;
const MAX  = 40;

export async function aktivitaetRouten(app: FastifyInstance): Promise<void> {
  app.get("/", { preHandler: [authenticate] }, async (request, reply) => {
    const { sub, rolle } = request.benutzer;
    const seit = new Date(Date.now() - TAGE * 86_400_000);
    const neu = { gte: seit };
    const themaFilter = themaSichtbarFilter({ sub, rolle });
    const dokFilter = { status: { not: DokumentStatus.GELOESCHT }, ...dokumentVertraulichFilter(rolle, sub) };

    const [sitzungen, themen, beitraege, kommentare, dokumente, aufgaben, bvs] = await Promise.all([
      prisma.sitzung.findMany({
        where: { erstelltAm: neu, status: { not: SitzungStatus.ABGESAGT } },
        select: { id: true, titel: true, erstelltAm: true, erstelltVon: { select: { name: true } } },
        orderBy: { erstelltAm: "desc" }, take: MAX,
      }),
      prisma.thema.findMany({
        where: { erstelltAm: neu, ...themaFilter },
        select: { id: true, titel: true, erstelltAm: true, erstelltVon: { select: { name: true } } },
        orderBy: { erstelltAm: "desc" }, take: MAX,
      }),
      prisma.themaEintrag.findMany({
        where: { erstelltAm: neu, thema: themaFilter },
        select: { id: true, themaId: true, erstelltAm: true, thema: { select: { titel: true } }, autor: { select: { name: true } } },
        orderBy: { erstelltAm: "desc" }, take: MAX,
      }),
      // Kommentare an Sitzungen, Dokumenten und Beiträgen der Themenakte (nicht an TOPs:
      // dort gibt es vertrauliche, deren Titel hier nicht auftauchen sollen)
      prisma.kommentar.findMany({
        where: {
          erstelltAm: neu,
          OR: [
            { sitzung: { status: { not: SitzungStatus.ABGESAGT } } },
            { dokument: dokFilter },
            { themaEintrag: { thema: themaFilter } },
          ],
        },
        select: {
          id: true, erstelltAm: true, autor: { select: { name: true } },
          sitzung:      { select: { id: true, titel: true } },
          dokument:     { select: { id: true, titel: true, alias: true } },
          themaEintrag: { select: { themaId: true, thema: { select: { titel: true } } } },
        },
        orderBy: { erstelltAm: "desc" }, take: MAX,
      }),
      prisma.dokument.findMany({
        where: { erstelltAm: neu, ...dokFilter },
        select: { id: true, titel: true, alias: true, erstelltAm: true, hochgeladenVon: { select: { name: true } } },
        orderBy: { erstelltAm: "desc" }, take: MAX,
      }),
      // Neu angelegt, erledigt oder geändert (wer geändert hat, speichert die Aufgabe nicht)
      prisma.aufgabe.findMany({
        where: { aktualisiertAm: neu, sichtbarkeit: "OEFFENTLICH" },
        select: {
          id: true, titel: true, erstelltAm: true, aktualisiertAm: true, erledigt: true, erledigtAm: true,
          erstelltVon: { select: { name: true } },
        },
        orderBy: { aktualisiertAm: "desc" }, take: MAX,
      }),
      prisma.betriebsvereinbarung.findMany({
        where: { erstelltAm: neu },
        select: { id: true, titel: true, erstelltAm: true, erstelltVon: { select: { name: true } } },
        orderBy: { erstelltAm: "desc" }, take: MAX,
      }),
    ]);

    const feed: Aktivitaet[] = [
      ...sitzungen.map(s => ({ id: `s-${s.id}`, art: "SITZUNG" as const, zeit: s.erstelltAm, von: s.erstelltVon.name,
        text: "hat eine Sitzung angelegt", ziel: s.titel, link: sitzungLink(s.id) })),
      ...themen.map(t => ({ id: `t-${t.id}`, art: "THEMA" as const, zeit: t.erstelltAm, von: t.erstelltVon.name,
        text: "hat ein Thema angelegt", ziel: t.titel, link: `/themenakte/${t.id}` })),
      ...beitraege.map(b => ({ id: `b-${b.id}`, art: "THEMA_BEITRAG" as const, zeit: b.erstelltAm, von: b.autor.name,
        text: "hat einen Beitrag in der Themenakte geschrieben", ziel: b.thema.titel, link: `/themenakte/${b.themaId}` })),
      ...kommentare.map(k => {
        const ziel = k.sitzung?.titel ?? (k.dokument ? (k.dokument.alias ?? k.dokument.titel) : k.themaEintrag?.thema.titel ?? "");
        const link = k.sitzung ? sitzungLink(k.sitzung.id)
          : k.dokument ? dokumentLink(k.dokument.id)
          : k.themaEintrag ? `/themenakte/${k.themaEintrag.themaId}` : null;
        return { id: `k-${k.id}`, art: "KOMMENTAR" as const, zeit: k.erstelltAm, von: k.autor.name,
          text: k.themaEintrag ? "hat in der Themenakte kommentiert" : "hat kommentiert", ziel, link };
      }),
      ...dokumente.map(d => ({ id: `d-${d.id}`, art: "DOKUMENT" as const, zeit: d.erstelltAm, von: d.hochgeladenVon.name,
        text: "hat ein Dokument hinzugefügt", ziel: d.alias ?? d.titel, link: dokumentLink(d.id) })),
      ...aufgaben.flatMap(a => {
        const e: Aktivitaet[] = [];
        const link = aufgabeLink(a.id);
        if (a.erstelltAm >= seit) {
          e.push({ id: `a-${a.id}`, art: "AUFGABE", zeit: a.erstelltAm, von: a.erstelltVon.name,
            text: "hat eine Aufgabe angelegt", ziel: a.titel, link });
        }
        if (a.erledigt && a.erledigtAm && a.erledigtAm >= seit) {
          e.push({ id: `ae-${a.id}`, art: "AUFGABE", zeit: a.erledigtAm, von: null,
            text: "Aufgabe erledigt:", ziel: a.titel, link });
        } else if (a.aktualisiertAm.getTime() - a.erstelltAm.getTime() > 60_000) {
          // nicht gleich nach dem Anlegen und nicht doppelt zum Erledigen
          e.push({ id: `ag-${a.id}`, art: "AUFGABE", zeit: a.aktualisiertAm, von: null,
            text: "Aufgabe geändert:", ziel: a.titel, link });
        }
        return e;
      }),
      ...bvs.map(b => ({ id: `v-${b.id}`, art: "BV" as const, zeit: b.erstelltAm, von: b.erstelltVon.name,
        text: "hat eine Betriebsvereinbarung angelegt", ziel: b.titel, link: "/betriebsvereinbarungen" })),
    ];

    return reply.send(feed.sort((a, b) => b.zeit.getTime() - a.zeit.getTime()).slice(0, MAX));
  });
}
