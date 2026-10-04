/**
 * Wahlen (BR / JAV) – Werkzeug des Betriebsrats: Wahl anlegen, Fristen überwachen.
 * Die Fristen entstehen automatisch (lib/wahlFristen.ts) und erscheinen im
 * Fristenkalender; dazu optional ein Vorhaben im Zeitplan.
 *
 * GET    /api/wahlen        – alle Wahlen (neueste zuerst)
 * GET    /api/wahlen/:id    – eine Wahl mit Fristen
 * POST   /api/wahlen        – Wahl anlegen (VORSITZ/STELLVERTRETER)
 * PATCH  /api/wahlen/:id    – Eckdaten ändern, Fristen werden nachgezogen
 * DELETE /api/wahlen/:id    – Wahl samt Fristen löschen (Vorhaben bleibt)
 *
 * GET    /api/wahlen/:id/waehlerliste      – Vorschlag Wählerliste, Größe, Mindestsitze
 * GET    /api/wahlen/:id/waehlerliste.pdf  – Abdruck zum Aushang (ohne Geburtsdaten)
 * GET    /api/wahlen/:id/waehlerliste.csv  – vollständige Liste für den Wahlvorstand
 *
 * POST   /api/wahlen/:id/ergebnis?vorschau=true|false – Ergebnis übernehmen (Standard: Vorschau)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { AufgabeTyp, Beschaeftigungsart, Role, WahlArt, WahlVerfahren } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { erfordert } from "../middleware/rbac.js";
import { wahlFristenAbgleichen } from "../lib/wahlFristen.js";
import { waehlerlisteBerechnen } from "../lib/waehlerliste.js";
import { ErgebnisEingabe, ergebnisPlanen, ergebnisUebernehmen } from "../lib/wahlErgebnis.js";
import { waehlerlistePdfGenerieren } from "../services/pdf.service.js";

interface WahlEingabe {
  titel?:          string;
  art?:            WahlArt;
  verfahren?:      WahlVerfahren;
  stimmabgabeAm?:  string;
  amtszeitEnde?:   string | null;
  ausschreibenAm?: string | null;
  notiz?:          string | null;
  mitVorhaben?:    boolean;
  dualStudierendeAlsAzubis?: boolean;
  ausgeschlossen?: string[];
}

const WAHL_INCLUDE = {
  fristen: {
    orderBy: { faelligAm: "asc" as const },
    include: { erledigtVon: { select: { name: true } } },
  },
};

/** "2026-11-12" → 12.11.2026 00:00 UTC; ungültig → "ungueltig" */
function datum(wert: string | null | undefined): Date | null | undefined | "ungueltig" {
  if (wert === undefined) return undefined;
  if (wert === null || wert === "") return null;
  const d = new Date(wert.length === 10 ? `${wert}T00:00:00.000Z` : wert);
  return isNaN(d.getTime()) ? "ungueltig" : d;
}

export async function wahlRouten(app: FastifyInstance): Promise<void> {

  app.get("/", { preHandler: [authenticate] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const wahlen = await prisma.wahl.findMany({ include: WAHL_INCLUDE, orderBy: { stimmabgabeAm: "desc" } });
      return reply.send(wahlen);
    });

  app.get<{ Params: { id: string } }>("/:id", { preHandler: [authenticate] },
    async (request, reply) => {
      const wahl = await prisma.wahl.findUnique({ where: { id: request.params.id }, include: WAHL_INCLUDE });
      if (!wahl) return reply.status(404).send({ fehler: "Wahl nicht gefunden" });
      return reply.send(wahl);
    });

  app.post<{ Body: WahlEingabe }>("/", { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request, reply) => {
      const b = request.body ?? {};
      if (!b.art || !Object.values(WahlArt).includes(b.art)) return reply.status(400).send({ fehler: "Art der Wahl fehlt (BR oder JAV)" });
      if (!b.verfahren || !Object.values(WahlVerfahren).includes(b.verfahren)) return reply.status(400).send({ fehler: "Verfahren fehlt (normal oder vereinfacht)" });

      const stimmabgabeAm  = datum(b.stimmabgabeAm);
      const amtszeitEnde   = datum(b.amtszeitEnde);
      const ausschreibenAm = datum(b.ausschreibenAm);
      if (!stimmabgabeAm || stimmabgabeAm === "ungueltig") return reply.status(400).send({ fehler: "Tag der Stimmabgabe fehlt oder ist ungültig" });
      if (amtszeitEnde === "ungueltig" || ausschreibenAm === "ungueltig") return reply.status(400).send({ fehler: "Ungültiges Datum" });

      const titel = b.titel?.trim() || `${b.art === WahlArt.BR ? "Betriebsratswahl" : "JAV-Wahl"} ${stimmabgabeAm.getUTCFullYear()}`;

      const wahl = await prisma.$transaction(async tx => {
        const vorhaben = b.mitVorhaben === false ? null : await tx.aufgabe.create({
          data: {
            titel, typ: AufgabeTyp.PROJEKT, erstelltVonId: request.benutzer.sub,
            beschreibung: "Begleitung der Wahl durch den Betriebsrat. Die Fristen stehen im Fristenkalender und auf der Seite „Wahlen“.",
          },
        });
        const neu = await tx.wahl.create({
          data: {
            titel, art: b.art!, verfahren: b.verfahren!, stimmabgabeAm,
            amtszeitEnde: amtszeitEnde ?? null, ausschreibenAm: ausschreibenAm ?? null,
            notiz: b.notiz?.trim() || null, vorhabenId: vorhaben?.id ?? null,
            erstelltVonId: request.benutzer.sub,
          },
        });
        await wahlFristenAbgleichen(neu.id, tx);
        return tx.wahl.findUnique({ where: { id: neu.id }, include: WAHL_INCLUDE });
      });
      return reply.status(201).send(wahl);
    });

  app.patch<{ Params: { id: string }; Body: WahlEingabe }>("/:id", { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request, reply) => {
      const alt = await prisma.wahl.findUnique({ where: { id: request.params.id } });
      if (!alt) return reply.status(404).send({ fehler: "Wahl nicht gefunden" });

      const b = request.body ?? {};
      if (b.art !== undefined && !Object.values(WahlArt).includes(b.art)) return reply.status(400).send({ fehler: "Ungültige Art" });
      if (b.verfahren !== undefined && !Object.values(WahlVerfahren).includes(b.verfahren)) return reply.status(400).send({ fehler: "Ungültiges Verfahren" });
      const stimmabgabeAm  = datum(b.stimmabgabeAm);
      const amtszeitEnde   = datum(b.amtszeitEnde);
      const ausschreibenAm = datum(b.ausschreibenAm);
      if (stimmabgabeAm === null) return reply.status(400).send({ fehler: "Tag der Stimmabgabe darf nicht leer sein" });
      if ([stimmabgabeAm, amtszeitEnde, ausschreibenAm].includes("ungueltig")) return reply.status(400).send({ fehler: "Ungültiges Datum" });
      if (b.titel !== undefined && !b.titel.trim()) return reply.status(400).send({ fehler: "Titel darf nicht leer sein" });
      if (b.ausgeschlossen !== undefined && (!Array.isArray(b.ausgeschlossen) || b.ausgeschlossen.some(x => typeof x !== "string"))) {
        return reply.status(400).send({ fehler: "ausgeschlossen muss eine Liste von Mitarbeiter-IDs sein" });
      }

      const wahl = await prisma.$transaction(async tx => {
        await tx.wahl.update({
          where: { id: alt.id },
          data: {
            ...(b.titel !== undefined && { titel: b.titel.trim() }),
            ...(b.art !== undefined && { art: b.art }),
            ...(b.verfahren !== undefined && { verfahren: b.verfahren }),
            ...(stimmabgabeAm instanceof Date && { stimmabgabeAm }),
            ...(amtszeitEnde !== undefined && { amtszeitEnde: amtszeitEnde as Date | null }),
            ...(ausschreibenAm !== undefined && { ausschreibenAm: ausschreibenAm as Date | null }),
            ...(b.notiz !== undefined && { notiz: b.notiz?.trim() || null }),
            ...(b.dualStudierendeAlsAzubis !== undefined && { dualStudierendeAlsAzubis: !!b.dualStudierendeAlsAzubis }),
            ...(b.ausgeschlossen !== undefined && { ausgeschlossen: [...new Set(b.ausgeschlossen)] }),
          },
        });
        await wahlFristenAbgleichen(alt.id, tx);
        return tx.wahl.findUnique({ where: { id: alt.id }, include: WAHL_INCLUDE });
      });
      return reply.send(wahl);
    });

  app.delete<{ Params: { id: string } }>("/:id", { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request, reply) => {
      const wahl = await prisma.wahl.findUnique({ where: { id: request.params.id } });
      if (!wahl) return reply.status(404).send({ fehler: "Wahl nicht gefunden" });
      // Fristen hängen per onDelete: Cascade an der Wahl; das Vorhaben bleibt mit seinen Aufgaben stehen
      await prisma.wahl.delete({ where: { id: wahl.id } });
      return reply.send({ ok: true });
    });

  // ── Wählerliste ────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>("/:id/waehlerliste", { preHandler: [authenticate] },
    async (request, reply) => {
      const wahl = await prisma.wahl.findUnique({ where: { id: request.params.id } });
      if (!wahl) return reply.status(404).send({ fehler: "Wahl nicht gefunden" });
      return reply.send(await waehlerlisteBerechnen(wahl));
    });

  app.get<{ Params: { id: string } }>("/:id/waehlerliste.pdf", { preHandler: [authenticate] },
    async (request, reply) => {
      const wahl = await prisma.wahl.findUnique({ where: { id: request.params.id } });
      if (!wahl) return reply.status(404).send({ fehler: "Wahl nicht gefunden" });
      const liste = await waehlerlisteBerechnen(wahl);
      const buffer = await waehlerlistePdfGenerieren(wahl, liste);
      return reply
        .header("Content-Type", "application/pdf")
        .header("Content-Disposition", `attachment; filename="waehlerliste-${dateinameTeil(wahl.titel)}.pdf"`)
        .send(buffer);
    });

  app.get<{ Params: { id: string } }>("/:id/waehlerliste.csv", { preHandler: [authenticate] },
    async (request, reply) => {
      const wahl = await prisma.wahl.findUnique({ where: { id: request.params.id } });
      if (!wahl) return reply.status(404).send({ fehler: "Wahl nicht gefunden" });
      const liste = await waehlerlisteBerechnen(wahl);
      const zelle = (v: string) => /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
      const datumDe = (d: Date | null) => d ? d.toISOString().slice(0, 10).split("-").reverse().join(".") : "";
      const zeilen = [
        ["Nachname", "Vorname", "Geburtsdatum", "Geschlecht", "Abteilung", "Beschäftigungsart", "Wählbar", "Hinweise"],
        ...liste.waehler.map(w => [
          w.nachname, w.vorname, datumDe(w.geburtsdatum),
          w.geschlecht === "WEIBLICH" ? "w" : w.geschlecht === "MAENNLICH" ? "m" : "",
          w.abteilung ?? "", ART_LABEL[w.beschaeftigungsart], w.waehlbar ? "ja" : "nein", w.hinweise.join(" | "),
        ]),
      ];
      // BOM, damit Excel die Umlaute richtig liest
      const csv = "\uFEFF" + zeilen.map(z => z.map(zelle).join(";")).join("\r\n");
      return reply
        .header("Content-Type", "text/csv; charset=utf-8")
        .header("Content-Disposition", `attachment; filename="waehlerliste-${dateinameTeil(wahl.titel)}.csv"`)
        .send(csv);
    });

  // ── Ergebnis übernehmen (Vorschau, dann tatsächlich) ───────────
  app.post<{ Params: { id: string }; Querystring: { vorschau?: string }; Body: ErgebnisEingabe }>(
    "/:id/ergebnis", { preHandler: [authenticate, erfordert(Role.VORSITZ)] },
    async (request, reply) => {
      const wahl = await prisma.wahl.findUnique({ where: { id: request.params.id } });
      if (!wahl) return reply.status(404).send({ fehler: "Wahl nicht gefunden" });

      const b = request.body;
      if (!b || !Array.isArray(b.zeilen) || b.zeilen.some(z => !z || typeof z.name !== "string" || !["MITGLIED", "ERSATZ"].includes(z.gewaehlt))) {
        return reply.status(400).send({ fehler: "Ungültige Ergebnisliste" });
      }
      if (b.konstituierendeSitzungAm && isNaN(new Date(b.konstituierendeSitzungAm).getTime())) {
        return reply.status(400).send({ fehler: "Ungültiges Datum für die konstituierende Sitzung" });
      }
      const eingabe: ErgebnisEingabe = {
        zeilen: b.zeilen, nichtGewaehlteDeaktivieren: !!b.nichtGewaehlteDeaktivieren,
        quoteUebernehmen: !!b.quoteUebernehmen, konstituierendeSitzungAm: b.konstituierendeSitzungAm || null,
      };

      if (request.query.vorschau !== "false") {
        return reply.send(await ergebnisPlanen(wahl, eingabe, request.benutzer.sub));
      }
      const plan = await prisma.$transaction(tx => ergebnisUebernehmen(wahl, eingabe, request.benutzer.sub, tx));
      if (!plan.fehlerfrei) return reply.status(422).send({ fehler: "Die Liste enthält noch Fehler", plan });
      const aktualisiert = await prisma.wahl.findUnique({ where: { id: wahl.id }, include: WAHL_INCLUDE });
      return reply.send({ plan, wahl: aktualisiert });
    });
}

const ART_LABEL: Record<Beschaeftigungsart, string> = {
  MITARBEITER: "Mitarbeiter/in", AZUBI: "Auszubildende/r", STUDENT: "Studentische Hilfskraft",
  DUALER_STUDENT: "Dual Studierende/r", ZEITARBEITER: "Zeitarbeit",
};

function dateinameTeil(titel: string): string {
  return titel.replace(/[^a-zA-Z0-9äöüÄÖÜß]+/g, "-").replace(/^-|-$/g, "");
}
