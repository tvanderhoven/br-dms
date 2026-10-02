/**
 * Gehaltstabelle – Eingruppierungs-Historie (Gruppe+Stufe) je Mitarbeiter.
 * Das Zeitmodell hat eine eigene Historie mit echtem Zeitraum, siehe
 * routes/zeitmodell.ts – die Quelle liefert beides weiterhin als einen
 * kombinierten Code (z.B. "B:3.2"), der Import splittet ihn auf.
 *
 * AT ("außer Tarif"): kein Gruppen-System, sondern ein individuell
 * vereinbartes reales Gehalt. Quelle liefert dafür "AT:<Betrag>" (z.B.
 * "AT:4200") statt "Zeitmodell:Gruppe.Stufe" in derselben Spalte – landet in
 * gehaltAt statt gruppe/stufe, kein Zeitmodell-Eintrag dafür.
 *
 * GET    /api/gehaltstabelle         – Einträge (Filter: abteilungId, mitarbeiterId, von, bis)
 * POST   /api/gehaltstabelle         – neuen Eintrag anlegen
 * GET    /api/gehaltstabelle/vorlage – leere CSV-Vorlage (nur Kopfzeile, keine echten Daten – siehe unten)
 * POST   /api/gehaltstabelle/import  – CSV-Import (?dryRun=true|false, Standard: true)
 * PUT    /api/gehaltstabelle/:id     – Eintrag bearbeiten
 * DELETE /api/gehaltstabelle/:id     – Eintrag löschen
 * DELETE /api/gehaltstabelle/eintraege – nur Gehaltsstufen-Einträge löschen, Mitarbeiter/Abteilungen bleiben (nur ADMIN)
 * DELETE /api/gehaltstabelle/alle    – alle Einträge/Mitarbeiter/Abteilungen löschen (nur ADMIN)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { Prisma, Mitarbeiter, Role, AuditAktion } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { erfordert } from "../middleware/rbac.js";
import { decodeCsvBuffer, parseCsv, parseImportDatum } from "../lib/csv.js";
import { parseGehaltsstufe, zeitmodellPeriodeAnlegen } from "../lib/zeitmodell.js";

// ── CSV-Import: Typen ───────────────────────────────────────────────
interface ImportFehler         { zeile: number; grund: string; }
interface ImportUebersprungen  { zeile: number; grund: string; }
interface ImportGeaendert      { zeile: number; grund: string; }
interface ImportNeuerMitarbeiter { pnr: string | null; name: string; }

interface ImportZusammenfassung {
  neueAbteilungen: string[];
  neueMitarbeiter: ImportNeuerMitarbeiter[];
  neueEintraege:   number;
  geaendert:       ImportGeaendert[];
  uebersprungen:   ImportUebersprungen[];
  fehler:          ImportFehler[];
}

// Erwartete Kopfzeile: PNR;Nachname;Vorname;Abteilung;Eintritt;Austritt;Gehaltsstufe;Gültig ab;Bemerkung
// Spaltennamen (kleingeschrieben) → interner Feldschlüssel
const IMPORT_SPALTEN: Record<string, string> = {
  "pnr":          "pnr",
  "nachname":     "nachname",
  "vorname":      "vorname",
  "abteilung":    "abteilung",
  "eintritt":     "eintritt",
  "austritt":     "austritt",
  "gehaltsstufe": "gehaltsstufe",
  "gültig ab":    "gueltigAb",
  "gueltig ab":   "gueltigAb",
  "bemerkung":    "bemerkung",
};

type ImportClient = Prisma.TransactionClient;

// Führt den eigentlichen Import (oder eine Simulation davon) aus.
async function verarbeiteImport(
  client: ImportClient,
  zeilenRoh: string[][],
  dryRun: boolean
): Promise<ImportZusammenfassung> {
  const zusammenfassung: ImportZusammenfassung = {
    neueAbteilungen: [],
    neueMitarbeiter: [],
    neueEintraege:   0,
    geaendert:       [],
    uebersprungen:   [],
    fehler:          [],
  };

  const kopf = zeilenRoh[0].map(h => h.trim().toLowerCase());
  const idx: Record<string, number> = {};
  kopf.forEach((h, i) => {
    const feld = IMPORT_SPALTEN[h];
    if (feld) idx[feld] = i;
  });

  const pflichtfelder = ["nachname", "vorname", "gehaltsstufe", "gueltigAb"];
  const fehlendeSpalten = pflichtfelder.filter(f => !(f in idx));
  if (fehlendeSpalten.length > 0) {
    throw new Error(`Pflichtspalten fehlen in der CSV-Datei: ${fehlendeSpalten.join(", ")}`);
  }

  const spalte = (zeile: string[], feld: string): string =>
    idx[feld] !== undefined ? (zeile[idx[feld]] ?? "").trim() : "";

  // ── Caches, damit gleiche Abteilungen/Mitarbeiter innerhalb einer Datei
  //    nicht mehrfach angelegt bzw. gemeldet werden ──────────────────────
  const abteilungCache = new Map<string, string>(); // name(lower) -> id
  const abteilungNameProId = new Map<string, string>(); // id -> name, nur für Meldungstexte
  (await client.abteilung.findMany()).forEach(a => {
    abteilungCache.set(a.name.toLowerCase(), a.id);
    abteilungNameProId.set(a.id, a.name);
  });

  // Abgleich bewusst NUR über PNR bzw. Name (ohne Abteilung im Schlüssel) –
  // sonst würde ein Abteilungswechsel im Import dazu führen, dass der/die
  // Mitarbeiter:in nicht wiedererkannt und fälschlich doppelt angelegt wird.
  const mitarbeiterProPnr  = new Map<string, Mitarbeiter>();
  const mitarbeiterProName = new Map<string, Mitarbeiter>(); // nachname|vorname
  (await client.mitarbeiter.findMany()).forEach(m => {
    if (m.pnr) mitarbeiterProPnr.set(m.pnr, m);
    mitarbeiterProName.set(`${m.nachname.toLowerCase()}|${m.vorname.toLowerCase()}`, m);
  });

  const vorhandeneEintragsSchluessel = new Set(
    (await client.gehaltsstufenEintrag.findMany({ select: { mitarbeiterId: true, gruppe: true, stufe: true, gueltigAb: true } }))
      .map(e => `${e.mitarbeiterId}|${e.gruppe}.${e.stufe}|${e.gueltigAb.getTime()}`)
  );

  const gemeldeteNeueMitarbeiter = new Set<string>();

  for (let i = 1; i < zeilenRoh.length; i++) {
    const zeileNr = i + 1; // 1-basiert, inkl. Kopfzeile
    const zeile = zeilenRoh[i];

    const pnr           = spalte(zeile, "pnr") || null;
    const nachname       = spalte(zeile, "nachname");
    const vorname        = spalte(zeile, "vorname");
    const abteilungName  = spalte(zeile, "abteilung");
    const eintrittRoh     = spalte(zeile, "eintritt");
    const austrittRoh     = spalte(zeile, "austritt");
    const gehaltsstufeRoh = spalte(zeile, "gehaltsstufe");
    const gueltigAbRoh    = spalte(zeile, "gueltigAb");
    const bemerkung       = spalte(zeile, "bemerkung") || null;

    // Name ist NICHT zwingend erforderlich – verbindende ID ist die PNR. Nur
    // wenn die PNR fehlt oder zu keinem bestehenden Mitarbeiter passt (also
    // ein komplett neuer Mitarbeiter angelegt werden müsste), braucht es
    // zwingend einen Namen, weil sonst niemand identifizierbar wäre.
    const pnrTreffer = pnr ? mitarbeiterProPnr.get(pnr) : undefined;
    if ((!nachname || !vorname) && !pnrTreffer) {
      zusammenfassung.fehler.push({
        zeile: zeileNr,
        grund: pnr
          ? `Name fehlt und PNR "${pnr}" ist keinem bestehenden Mitarbeiter zugeordnet`
          : "Nachname und/oder Vorname fehlt (und keine Personalnummer angegeben)",
      });
      continue;
    }
    if (!gehaltsstufeRoh) {
      zusammenfassung.fehler.push({ zeile: zeileNr, grund: "Gehaltsstufe fehlt" });
      continue;
    }
    const geparsteStufe = parseGehaltsstufe(gehaltsstufeRoh);
    if (!geparsteStufe) {
      zusammenfassung.fehler.push({
        zeile: zeileNr,
        grund: `Gehaltsstufe "${gehaltsstufeRoh}" passt weder ins Format "Zeitmodell:Gruppe.Stufe" (z.B. B:3.2) noch ins AT-Format "AT:Betrag" (z.B. AT:4200)`,
      });
      continue;
    }

    const gueltigAb = parseImportDatum(gueltigAbRoh);
    if (!gueltigAb) {
      zusammenfassung.fehler.push({ zeile: zeileNr, grund: `Ungültiges Datum in Spalte "Gültig ab": "${gueltigAbRoh}"` });
      continue;
    }

    let eintritt: Date | null = null;
    if (eintrittRoh) {
      eintritt = parseImportDatum(eintrittRoh);
      if (!eintritt) {
        zusammenfassung.fehler.push({ zeile: zeileNr, grund: `Ungültiges Datum in Spalte "Eintritt": "${eintrittRoh}"` });
        continue;
      }
    }

    let austritt: Date | null = null;
    if (austrittRoh) {
      austritt = parseImportDatum(austrittRoh);
      if (!austritt) {
        zusammenfassung.fehler.push({ zeile: zeileNr, grund: `Ungültiges Datum in Spalte "Austritt": "${austrittRoh}"` });
        continue;
      }
    }

    // ── Abteilung auflösen (anlegen falls nötig) ──────────────────────
    let abteilungId: string | null = null;
    if (abteilungName) {
      const schluessel = abteilungName.toLowerCase();
      const vorhandeneId = abteilungCache.get(schluessel);
      if (vorhandeneId) {
        abteilungId = vorhandeneId;
      } else {
        if (dryRun) {
          abteilungId = `__neu__${schluessel}`;
        } else {
          const neu = await client.abteilung.create({ data: { name: abteilungName } });
          abteilungId = neu.id;
        }
        abteilungCache.set(schluessel, abteilungId);
        zusammenfassung.neueAbteilungen.push(abteilungName);
      }
    }

    // ── Mitarbeiter auflösen (per PNR, sonst Name; sonst anlegen) ──
    const hatName = !!(nachname && vorname);
    let mitarbeiter: Mitarbeiter | undefined =
      pnrTreffer ??
      (hatName ? mitarbeiterProName.get(`${nachname.toLowerCase()}|${vorname.toLowerCase()}`) : undefined);

    if (!mitarbeiter) {
      // hatName ist hier immer true (sonst hätte der Fehler-Check oben schon
      // abgebrochen, da ohne PNR-Treffer kein neuer Mitarbeiter ohne Namen
      // angelegt werden kann)
      const meldeSchluessel = pnr ? `pnr:${pnr}` : `name:${nachname.toLowerCase()}|${vorname.toLowerCase()}`;

      if (dryRun) {
        mitarbeiter = {
          id: `__neu__${meldeSchluessel}`,
          vorname, nachname, pnr, eintritt, austritt,
          abteilungId, erstelltAm: new Date(), aktualisiertAm: new Date(),
        } as Mitarbeiter;
      } else {
        mitarbeiter = await client.mitarbeiter.create({
          data: { vorname, nachname, pnr, eintritt, austritt, abteilungId },
        });
      }

      if (!gemeldeteNeueMitarbeiter.has(meldeSchluessel)) {
        gemeldeteNeueMitarbeiter.add(meldeSchluessel);
        zusammenfassung.neueMitarbeiter.push({ pnr, name: `${nachname}, ${vorname}` });
      }

      if (pnr) mitarbeiterProPnr.set(pnr, mitarbeiter);
      mitarbeiterProName.set(`${nachname.toLowerCase()}|${vorname.toLowerCase()}`, mitarbeiter);
    } else {
      // ── vorhandenen Mitarbeiter ergänzen. Abteilung wird bei Abweichung
      //    bewusst überschrieben (Import gilt als aktueller), andere Felder
      //    nur ergänzt, nie überschrieben ────────────────────────────────
      // Anzeigename: bevorzugt aus der CSV-Zeile, sonst der vorhandene
      // Datensatz (falls die Zeile nur die PNR ohne Namen enthielt).
      const anzeigeName = hatName ? `${nachname}, ${vorname}` : `${mitarbeiter.nachname}, ${mitarbeiter.vorname}`;
      const updates: { abteilungId?: string; eintritt?: Date; austritt?: Date; pnr?: string } = {};
      const konflikte: string[] = [];

      if (abteilungId && abteilungId !== mitarbeiter.abteilungId) {
        if (mitarbeiter.abteilungId) {
          const alterName = abteilungNameProId.get(mitarbeiter.abteilungId) ?? "unbekannt";
          zusammenfassung.geaendert.push({
            zeile: zeileNr,
            grund: `${anzeigeName}: Abteilung von "${alterName}" auf "${abteilungName}" aktualisiert`,
          });
        }
        updates.abteilungId = abteilungId;
      }

      if (eintritt && !mitarbeiter.eintritt) {
        updates.eintritt = eintritt;
      } else if (eintritt && mitarbeiter.eintritt && mitarbeiter.eintritt.getTime() !== eintritt.getTime()) {
        konflikte.push("Eintrittsdatum weicht vom vorhandenen Datensatz ab – nicht überschrieben");
      }

      if (austritt && !mitarbeiter.austritt) {
        updates.austritt = austritt;
      } else if (austritt && mitarbeiter.austritt && mitarbeiter.austritt.getTime() !== austritt.getTime()) {
        konflikte.push("Austrittsdatum weicht vom vorhandenen Datensatz ab – nicht überschrieben");
      }

      if (pnr && !mitarbeiter.pnr) {
        updates.pnr = pnr;
      }

      if (konflikte.length > 0) {
        zusammenfassung.uebersprungen.push({ zeile: zeileNr, grund: konflikte.join("; ") });
      }

      if (Object.keys(updates).length > 0) {
        if (dryRun) {
          mitarbeiter = { ...mitarbeiter, ...updates };
        } else {
          mitarbeiter = await client.mitarbeiter.update({ where: { id: mitarbeiter.id }, data: updates });
        }
        if (updates.pnr) mitarbeiterProPnr.set(updates.pnr, mitarbeiter);
        mitarbeiterProName.set(`${nachname.toLowerCase()}|${vorname.toLowerCase()}`, mitarbeiter);
      }
    }

    // ── Gehaltsstufen-Eintrag (Eingruppierung ODER AT) anlegen (Duplikate überspringen) ──
    const wertSchluessel = geparsteStufe.art === "at"
      ? `AT:${geparsteStufe.gehalt}`
      : `${geparsteStufe.gruppe}.${geparsteStufe.stufe}`;
    const eintragsSchluessel = `${mitarbeiter.id}|${wertSchluessel}|${gueltigAb.getTime()}`;
    if (vorhandeneEintragsSchluessel.has(eintragsSchluessel)) {
      zusammenfassung.uebersprungen.push({ zeile: zeileNr, grund: "Identischer Eintrag (Mitarbeiter, Gehaltsstufe, Gültig ab) existiert bereits" });
      continue;
    }
    vorhandeneEintragsSchluessel.add(eintragsSchluessel);

    if (!dryRun) {
      await client.gehaltsstufenEintrag.create({
        data: geparsteStufe.art === "at"
          ? { mitarbeiterId: mitarbeiter.id, gehaltAt: geparsteStufe.gehalt, gueltigAb, bemerkung }
          : { mitarbeiterId: mitarbeiter.id, gruppe: geparsteStufe.gruppe, stufe: geparsteStufe.stufe, gueltigAb, bemerkung },
      });

      // Zeitmodell separat fortschreiben (eigene Historie, eigener Zeitraum) –
      // nur für tarifliche Eingruppierung, AT-Zeilen enthalten kein Zeitmodell.
      // Nur außerhalb des Dry-Runs, da diese Hilfsfunktion direkt schreibt.
      if (geparsteStufe.art === "eingruppierung") {
        const zeitmodellErgebnis = await zeitmodellPeriodeAnlegen(client, {
          mitarbeiterId: mitarbeiter.id,
          zeitmodell:    geparsteStufe.zeitmodell,
          gueltigVon:    gueltigAb,
          bemerkung,
        });
        if (zeitmodellErgebnis.art === "konflikt") {
          zusammenfassung.uebersprungen.push({
            zeile: zeileNr,
            grund: `Zeitmodell konnte nicht übernommen werden: ${zeitmodellErgebnis.grund}`,
          });
        } else if (zeitmodellErgebnis.art === "aktualisiert") {
          zusammenfassung.geaendert.push({
            zeile: zeileNr,
            grund: `Zeitmodell von "${zeitmodellErgebnis.vorherigesZeitmodell}" auf "${zeitmodellErgebnis.eintrag.zeitmodell}" geändert (ab ${gueltigAb.toLocaleDateString("de-DE")})`,
          });
        }
      }
    }
    zusammenfassung.neueEintraege++;
  }

  return zusammenfassung;
}

interface ListenFilter {
  abteilungId?:  string;
  mitarbeiterId?: string;
  von?:          string;
  bis?:          string;
}

// Entweder Gruppe+Stufe (tariflich) ODER gehaltAt (AT/außer Tarif), nie beides.
interface NeuerEintrag {
  mitarbeiterId: string;
  gruppe?:       number;
  stufe?:        number;
  gehaltAt?:     number;
  gueltigAb:     string;
  bemerkung?:    string;
  sitzungId?:    string;
}

interface EintragUpdate {
  gruppe?:     number;
  stufe?:      number;
  gehaltAt?:   number;
  gueltigAb?:  string;
  bemerkung?:  string | null;
}

function gueltigeGruppe(gruppe: unknown): gruppe is number {
  return typeof gruppe === "number" && Number.isInteger(gruppe) && gruppe >= 1 && gruppe <= 6;
}
function gueltigeStufe(stufe: unknown): stufe is number {
  return typeof stufe === "number" && Number.isInteger(stufe) && stufe >= 1 && stufe <= 4;
}
function gueltigerGehaltAt(gehalt: unknown): gehalt is number {
  return typeof gehalt === "number" && Number.isFinite(gehalt) && gehalt > 0;
}

const MITARBEITER_INCLUDE = {
  mitarbeiter: {
    include: { abteilung: { select: { id: true, name: true } } },
  },
  sitzung: {
    select: { id: true, titel: true, sitzungsdatum: true },
  },
};

function baueWhere(filter: ListenFilter): Prisma.GehaltsstufenEintragWhereInput {
  const where: Prisma.GehaltsstufenEintragWhereInput = {};

  if (filter.mitarbeiterId) where.mitarbeiterId = filter.mitarbeiterId;
  if (filter.abteilungId)   where.mitarbeiter = { abteilungId: filter.abteilungId };

  if (filter.von || filter.bis) {
    where.gueltigAb = {
      ...(filter.von ? { gte: new Date(filter.von) } : {}),
      ...(filter.bis ? { lte: new Date(filter.bis) } : {}),
    };
  }

  return where;
}

export async function gehaltstabelleRouten(app: FastifyInstance): Promise<void> {

  // ── GET / – Einträge auflisten ──────────────────────────────────
  app.get<{ Querystring: ListenFilter }>(
    "/",
    { preHandler: [authenticate, erfordert(Role.MITGLIED)] },
    async (request: FastifyRequest<{ Querystring: ListenFilter }>, reply: FastifyReply) => {
      const eintraege = await prisma.gehaltsstufenEintrag.findMany({
        where:   baueWhere(request.query),
        include: MITARBEITER_INCLUDE,
        orderBy: [{ gueltigAb: "desc" }],
      });
      return reply.send(eintraege);
    }
  );

  // ── GET /vorlage – leere CSV-Vorlage für den Import (nur Kopfzeile) ──
  // Bewusst kein Daten-Export: niemand soll echte Mitarbeiter-/Gehaltsdaten
  // aus dem System herausziehen können, nur das erwartete Spaltenformat.
  app.get(
    "/vorlage",
    { preHandler: [authenticate, erfordert(Role.MITGLIED)] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const kopf = ["PNR", "Nachname", "Vorname", "Abteilung", "Eintritt", "Austritt", "Gehaltsstufe", "Gültig ab", "Bemerkung"];
      const csv = "﻿" + kopf.join(";") + "\r\n";

      return reply
        .header("Content-Type", "text/csv; charset=utf-8")
        .header("Content-Disposition", `attachment; filename="gehaltstabelle_vorlage.csv"`)
        .send(csv);
    }
  );

  // ── POST /import – CSV-Import (Dry-Run oder tatsächlich) ────────
  app.post<{ Querystring: { dryRun?: string } }>(
    "/import",
    { preHandler: [authenticate, erfordert(Role.MITGLIED)] },
    async (request: FastifyRequest<{ Querystring: { dryRun?: string } }>, reply: FastifyReply) => {
      const dryRun = request.query.dryRun !== "false"; // Standard: true, Frontend übergibt es immer explizit

      const data = await request.file();
      if (!data) return reply.status(400).send({ fehler: "Keine Datei übermittelt" });

      if (!data.mimetype.includes("csv") && !data.filename?.toLowerCase().endsWith(".csv")) {
        return reply.status(400).send({ fehler: "Nur CSV-Dateien erlaubt" });
      }

      const buffer = await data.toBuffer();
      const zeilenRoh = parseCsv(decodeCsvBuffer(buffer));

      if (zeilenRoh.length < 2) {
        return reply.status(400).send({ fehler: "CSV-Datei enthält keine Datenzeilen" });
      }

      try {
        const zusammenfassung = dryRun
          ? await verarbeiteImport(prisma as unknown as Prisma.TransactionClient, zeilenRoh, true)
          : await prisma.$transaction(tx => verarbeiteImport(tx, zeilenRoh, false));

        return reply.send(zusammenfassung);
      } catch (err) {
        return reply.status(400).send({ fehler: err instanceof Error ? err.message : "Import fehlgeschlagen" });
      }
    }
  );

  // ── POST / – neuen Eintrag anlegen ──────────────────────────────
  app.post<{ Body: NeuerEintrag }>(
    "/",
    { preHandler: [authenticate, erfordert(Role.MITGLIED)] },
    async (request: FastifyRequest<{ Body: NeuerEintrag }>, reply: FastifyReply) => {
      const { mitarbeiterId, gruppe, stufe, gehaltAt, gueltigAb, bemerkung, sitzungId } = request.body;

      if (!mitarbeiterId?.trim()) return reply.status(400).send({ fehler: "mitarbeiterId ist ein Pflichtfeld" });
      if (!gueltigAb)             return reply.status(400).send({ fehler: "gueltigAb ist ein Pflichtfeld" });

      if (gehaltAt !== undefined) {
        if (!gueltigerGehaltAt(gehaltAt)) return reply.status(400).send({ fehler: "gehaltAt muss eine positive Zahl sein" });
      } else {
        if (!gueltigeGruppe(gruppe)) return reply.status(400).send({ fehler: "gruppe muss zwischen 1 und 6 liegen" });
        if (!gueltigeStufe(stufe))   return reply.status(400).send({ fehler: "stufe muss zwischen 1 und 4 liegen" });
      }

      const mitarbeiter = await prisma.mitarbeiter.findUnique({ where: { id: mitarbeiterId } });
      if (!mitarbeiter) {
        return reply.status(404).send({ fehler: "Mitarbeiter nicht gefunden – bitte zuerst über /api/mitarbeiter anlegen" });
      }

      if (sitzungId) {
        const sitzung = await prisma.sitzung.findUnique({ where: { id: sitzungId } });
        if (!sitzung) return reply.status(404).send({ fehler: "Sitzung nicht gefunden" });
      }

      const eintrag = await prisma.gehaltsstufenEintrag.create({
        data: {
          mitarbeiterId,
          ...(gehaltAt !== undefined ? { gehaltAt } : { gruppe, stufe }),
          gueltigAb:  new Date(gueltigAb),
          bemerkung:  bemerkung?.trim() || null,
          sitzungId:  sitzungId || null,
        },
        include: MITARBEITER_INCLUDE,
      });

      return reply.status(201).send(eintrag);
    }
  );

  // ── PUT /:id – Eintrag bearbeiten ───────────────────────────────
  app.put<{ Params: { id: string }; Body: EintragUpdate }>(
    "/:id",
    { preHandler: [authenticate, erfordert(Role.MITGLIED)] },
    async (request: FastifyRequest<{ Params: { id: string }; Body: EintragUpdate }>, reply: FastifyReply) => {
      const { id } = request.params;
      const { gruppe, stufe, gehaltAt, gueltigAb, bemerkung } = request.body;

      if (gehaltAt !== undefined && !gueltigerGehaltAt(gehaltAt)) {
        return reply.status(400).send({ fehler: "gehaltAt muss eine positive Zahl sein" });
      }
      if (gruppe !== undefined && !gueltigeGruppe(gruppe)) {
        return reply.status(400).send({ fehler: "gruppe muss zwischen 1 und 6 liegen" });
      }
      if (stufe !== undefined && !gueltigeStufe(stufe)) {
        return reply.status(400).send({ fehler: "stufe muss zwischen 1 und 4 liegen" });
      }

      const vorhandener = await prisma.gehaltsstufenEintrag.findUnique({ where: { id } });
      if (!vorhandener) return reply.status(404).send({ fehler: "Eintrag nicht gefunden" });

      // Gruppe/Stufe und gehaltAt schließen sich aus – wechselt das Formular
      // den Modus, wird die jeweils andere Seite mit geleert (nie beides gesetzt).
      const modusUpdate = gehaltAt !== undefined
        ? { gehaltAt, gruppe: null, stufe: null }
        : (gruppe !== undefined || stufe !== undefined) ? { gruppe, stufe, gehaltAt: null } : {};

      const aktualisiert = await prisma.gehaltsstufenEintrag.update({
        where: { id },
        data: {
          ...modusUpdate,
          ...(gueltigAb !== undefined ? { gueltigAb: new Date(gueltigAb) } : {}),
          ...(bemerkung !== undefined ? { bemerkung: bemerkung?.trim() || null } : {}),
        },
        include: MITARBEITER_INCLUDE,
      });

      return reply.send(aktualisiert);
    }
  );

  // ── DELETE /eintraege – nur die Gehaltsstufen-Einträge löschen, Mitarbeiter/
  //    Abteilungen bleiben erhalten (nur ADMIN). Für's Bereinigen nach fehlerhaftem
  //    Import (z.B. inkonsistente Stufen-Schreibweise), ohne die Stammdaten zu verlieren.
  app.delete(
    "/eintraege",
    { preHandler: [authenticate, erfordert(Role.ADMIN)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const eintraege = await prisma.gehaltsstufenEintrag.count();

      await prisma.gehaltsstufenEintrag.deleteMany();

      await prisma.auditLog.create({
        data: {
          benutzerId: request.benutzer.sub,
          aktion:     AuditAktion.GEHALTSTABELLE_EINTRAEGE_GELOESCHT,
          ip:         request.ip,
          userAgent:  request.headers["user-agent"] ?? null,
          details:    { eintraege },
        },
      });

      return reply.send({ ok: true, geloescht: { eintraege } });
    }
  );

  // ── DELETE /alle – gesamte Gehaltstabelle löschen (nur ADMIN) ───
  app.delete(
    "/alle",
    { preHandler: [authenticate, erfordert(Role.ADMIN)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const [eintraege, mitarbeiter, abteilungen] = await Promise.all([
        prisma.gehaltsstufenEintrag.count(),
        prisma.mitarbeiter.count(),
        prisma.abteilung.count(),
      ]);

      await prisma.$transaction([
        prisma.gehaltsstufenEintrag.deleteMany(),
        prisma.mitarbeiter.deleteMany(),
        prisma.abteilung.deleteMany(),
      ]);

      await prisma.auditLog.create({
        data: {
          benutzerId: request.benutzer.sub,
          aktion:     AuditAktion.GEHALTSTABELLE_GELOESCHT,
          ip:         request.ip,
          userAgent:  request.headers["user-agent"] ?? null,
          details:    { eintraege, mitarbeiter, abteilungen },
        },
      });

      return reply.send({ ok: true, geloescht: { eintraege, mitarbeiter, abteilungen } });
    }
  );

  // ── DELETE /:id – Eintrag löschen ───────────────────────────────
  app.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [authenticate, erfordert(Role.MITGLIED)] },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;
      const vorhandener = await prisma.gehaltsstufenEintrag.findUnique({ where: { id } });
      if (!vorhandener) return reply.status(404).send({ fehler: "Eintrag nicht gefunden" });

      await prisma.gehaltsstufenEintrag.delete({ where: { id } });
      return reply.send({ ok: true });
    }
  );
}
