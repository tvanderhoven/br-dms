/**
 * Mitarbeiter- und Abteilungsverwaltung (Basis für die Gehaltstabelle)
 *
 * GET    /api/mitarbeiter       – alle Mitarbeiter (inkl. Abteilung)
 * POST   /api/mitarbeiter       – neuen Mitarbeiter anlegen
 * POST   /api/mitarbeiter/import – CSV-Import (?dryRun=true|false, Standard: true)
 * PATCH  /api/mitarbeiter/:id   – Mitarbeiter bearbeiten
 * DELETE /api/mitarbeiter/:id   – Mitarbeiter löschen
 *
 * GET    /api/abteilungen       – alle Abteilungen
 * POST   /api/abteilungen       – neue Abteilung anlegen
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { Prisma, Mitarbeiter as MitarbeiterModell, Beschaeftigungsart, Geschlecht } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { decodeCsvBuffer, parseCsv, parseImportDatum } from "../lib/csv.js";

const BESCHAEFTIGUNGSARTEN = Object.values(Beschaeftigungsart);
const GESCHLECHTER = Object.values(Geschlecht);

// Personallisten schreiben das Geschlecht sehr unterschiedlich (m/w, männlich, Herr/Frau …).
// undefined = nicht erkannt (Fehler), null = leer oder divers (bewusst ohne Zuordnung).
function parseGeschlecht(wert: string): Geschlecht | null | undefined {
  const s = wert.trim().toLowerCase().replace(/\.$/, "");
  if (!s || ["d", "divers", "x", "o", "ohne angabe"].includes(s)) return null;
  if (["m", "männlich", "maennlich", "mann", "herr", "hr"].includes(s)) return Geschlecht.MAENNLICH;
  if (["w", "weiblich", "frau", "fr", "f"].includes(s)) return Geschlecht.WEIBLICH;
  return undefined;
}

interface NeuerMitarbeiter {
  vorname:     string;
  nachname:    string;
  abteilungId?: string | null;
  pnr?:        string | null;
  eintritt?:   string | null;
  austritt?:   string | null;
  standort?:   string | null;
  geburtsdatum?: string | null;
  geschlecht?:  Geschlecht | null;
  beschaeftigungsart?: Beschaeftigungsart;
}

interface MitarbeiterUpdate {
  vorname?:     string;
  nachname?:    string;
  abteilungId?: string | null;
  pnr?:         string | null;
  eintritt?:    string | null;
  austritt?:    string | null;
  standort?:    string | null;
  geburtsdatum?: string | null;
  geschlecht?:  Geschlecht | null;
  gehaltIgnorieren?: boolean;
  beschaeftigungsart?: Beschaeftigungsart;
}

interface StandortBatch {
  ids:      string[];
  standort: string | null;
}

interface NeueAbteilung {
  name: string;
}

const ABTEILUNG_SELECT = { id: true, name: true };

// ── CSV-Import: Typen ───────────────────────────────────────────────
interface ImportFehler        { zeile: number; grund: string; }
interface ImportUebersprungen { zeile: number; grund: string; }
interface ImportGeaendert     { zeile: number; grund: string; }
interface ImportNeuerMitarbeiter { pnr: string | null; name: string; }
interface ImportBereitsVorhanden { pnr: string | null; name: string; }

interface MitarbeiterImportZusammenfassung {
  neueAbteilungen:  string[];
  neueMitarbeiter:  ImportNeuerMitarbeiter[];
  bereitsVorhanden: ImportBereitsVorhanden[];
  geaendert:        ImportGeaendert[];
  uebersprungen:    ImportUebersprungen[];
  fehler:           ImportFehler[];
}

// Erwartete Kopfzeile: PNR;Nachname;Vorname;Abteilung;Eintritt;Austritt;Standort;Geburtsdatum;Geschlecht
// (nur Nachname und Vorname sind Pflicht, die Reihenfolge ist egal)
const IMPORT_SPALTEN: Record<string, string> = {
  "pnr":       "pnr",
  "nachname":  "nachname",
  "vorname":   "vorname",
  "abteilung": "abteilung",
  "eintritt":  "eintritt",
  "austritt":  "austritt",
  "standort":  "standort",
  "geburtsdatum": "geburtsdatum",
  "geburtstag":   "geburtsdatum",
  "geb.-datum":   "geburtsdatum",
  "geb. datum":   "geburtsdatum",
  "geschlecht":   "geschlecht",
  "anrede":       "geschlecht",
};

type ImportClient = Prisma.TransactionClient;

// Führt den Mitarbeiter-Import (oder eine Simulation davon) aus. Legt NUR
// Mitarbeiter/Abteilungen an – anders als der Gehaltstabellen-Import gibt es
// hier keine Gehaltsstufen-Zeile, es geht nur um die Personalliste selbst.
async function verarbeiteMitarbeiterImport(
  client: ImportClient,
  zeilenRoh: string[][],
  dryRun: boolean
): Promise<MitarbeiterImportZusammenfassung> {
  const zusammenfassung: MitarbeiterImportZusammenfassung = {
    neueAbteilungen:  [],
    neueMitarbeiter:  [],
    bereitsVorhanden: [],
    geaendert:        [],
    uebersprungen:    [],
    fehler:           [],
  };

  const kopf = zeilenRoh[0].map(h => h.trim().toLowerCase());
  const idx: Record<string, number> = {};
  kopf.forEach((h, i) => {
    const feld = IMPORT_SPALTEN[h];
    if (feld) idx[feld] = i;
  });

  const fehlendeSpalten = ["nachname", "vorname"].filter(f => !(f in idx));
  if (fehlendeSpalten.length > 0) {
    throw new Error(`Pflichtspalten fehlen in der CSV-Datei: ${fehlendeSpalten.join(", ")}`);
  }

  const spalte = (zeile: string[], feld: string): string =>
    idx[feld] !== undefined ? (zeile[idx[feld]] ?? "").trim() : "";

  const abteilungCache = new Map<string, string>(); // name(lower) -> id
  const abteilungNameProId = new Map<string, string>(); // id -> name, nur für Meldungstexte
  (await client.abteilung.findMany()).forEach(a => {
    abteilungCache.set(a.name.toLowerCase(), a.id);
    abteilungNameProId.set(a.id, a.name);
  });

  // Abgleich bewusst NUR über PNR bzw. Name (ohne Abteilung im Schlüssel) –
  // sonst würde ein Abteilungswechsel im Import dazu führen, dass der/die
  // Mitarbeiter:in nicht wiedererkannt und fälschlich doppelt angelegt wird.
  const mitarbeiterProPnr  = new Map<string, MitarbeiterModell>();
  const mitarbeiterProName = new Map<string, MitarbeiterModell>(); // nachname|vorname
  (await client.mitarbeiter.findMany()).forEach(m => {
    if (m.pnr) mitarbeiterProPnr.set(m.pnr, m);
    mitarbeiterProName.set(`${m.nachname.toLowerCase()}|${m.vorname.toLowerCase()}`, m);
  });

  const gemeldet = new Set<string>();

  for (let i = 1; i < zeilenRoh.length; i++) {
    const zeileNr = i + 1; // 1-basiert, inkl. Kopfzeile
    const zeile = zeilenRoh[i];

    const pnr          = spalte(zeile, "pnr") || null;
    const nachname      = spalte(zeile, "nachname");
    const vorname       = spalte(zeile, "vorname");
    const abteilungName = spalte(zeile, "abteilung");
    const eintrittRoh    = spalte(zeile, "eintritt");
    const austrittRoh    = spalte(zeile, "austritt");
    const standort      = spalte(zeile, "standort") || null;
    const geburtsdatumRoh = spalte(zeile, "geburtsdatum");
    const geschlechtRoh   = spalte(zeile, "geschlecht");

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

    let geburtsdatum: Date | null = null;
    if (geburtsdatumRoh) {
      geburtsdatum = parseImportDatum(geburtsdatumRoh);
      if (!geburtsdatum) {
        zusammenfassung.fehler.push({ zeile: zeileNr, grund: `Ungültiges Datum in Spalte "Geburtsdatum": "${geburtsdatumRoh}"` });
        continue;
      }
    }

    const geschlecht = parseGeschlecht(geschlechtRoh);
    if (geschlecht === undefined) {
      zusammenfassung.fehler.push({ zeile: zeileNr, grund: `Unbekannter Wert in Spalte "Geschlecht": "${geschlechtRoh}" (erwartet z. B. m/w/d oder Herr/Frau)` });
      continue;
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

    // ── Mitarbeiter auflösen: existiert er schon? (per PNR, sonst Name) ──
    const hatName = !!(nachname && vorname);
    let mitarbeiter: MitarbeiterModell | undefined =
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
          vorname, nachname, pnr, eintritt, austritt, standort, geburtsdatum, geschlecht,
          abteilungId, erstelltAm: new Date(), aktualisiertAm: new Date(),
        } as MitarbeiterModell;
      } else {
        mitarbeiter = await client.mitarbeiter.create({
          data: { vorname, nachname, pnr, eintritt, austritt, standort, geburtsdatum, geschlecht, abteilungId },
        });
      }

      if (!gemeldet.has(meldeSchluessel)) {
        gemeldet.add(meldeSchluessel);
        zusammenfassung.neueMitarbeiter.push({ pnr, name: `${nachname}, ${vorname}` });
      }

      if (pnr) mitarbeiterProPnr.set(pnr, mitarbeiter);
      mitarbeiterProName.set(`${nachname.toLowerCase()}|${vorname.toLowerCase()}`, mitarbeiter);
    } else {
      // ── existiert schon: melden, Lücken auffüllen. Abteilung wird bei
      //    Abweichung bewusst überschrieben (Import gilt als aktueller) –
      //    andere Felder (Ein-/Austritt, PNR, Standort) nur ergänzt, nie
      //    überschrieben, da dafür kein "der Import ist aktueller"-Wunsch geäußert wurde. ──
      const anzeigeName = hatName ? `${nachname}, ${vorname}` : `${mitarbeiter.nachname}, ${mitarbeiter.vorname}`;
      const meldeSchluessel = `vorhanden:${mitarbeiter.id}`;
      if (!gemeldet.has(meldeSchluessel)) {
        gemeldet.add(meldeSchluessel);
        zusammenfassung.bereitsVorhanden.push({ pnr: mitarbeiter.pnr, name: `${mitarbeiter.nachname}, ${mitarbeiter.vorname}` });
      }

      const updates: { abteilungId?: string; eintritt?: Date; austritt?: Date; pnr?: string; standort?: string; geburtsdatum?: Date; geschlecht?: Geschlecht } = {};

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

      if (eintritt && !mitarbeiter.eintritt) updates.eintritt = eintritt;
      if (austritt && !mitarbeiter.austritt) updates.austritt = austritt;
      if (pnr && !mitarbeiter.pnr) updates.pnr = pnr;
      if (standort && !mitarbeiter.standort) updates.standort = standort;
      // Geburtsdatum: Die Liste der Personalabteilung gilt als richtig – Abweichungen werden korrigiert und gemeldet
      if (geburtsdatum && mitarbeiter.geburtsdatum?.getTime() !== geburtsdatum.getTime()) {
        if (mitarbeiter.geburtsdatum) {
          zusammenfassung.geaendert.push({ zeile: zeileNr, grund: `${anzeigeName}: Geburtsdatum korrigiert` });
        }
        updates.geburtsdatum = geburtsdatum;
      }
      // Geschlecht: ebenso – eine leere Zelle oder "divers" löscht aber kein vorhandenes
      if (geschlecht && geschlecht !== mitarbeiter.geschlecht) {
        if (mitarbeiter.geschlecht) {
          zusammenfassung.geaendert.push({ zeile: zeileNr, grund: `${anzeigeName}: Geschlecht korrigiert` });
        }
        updates.geschlecht = geschlecht;
      }

      if (Object.keys(updates).length > 0) {
        if (dryRun) {
          mitarbeiter = { ...mitarbeiter, ...updates };
        } else {
          mitarbeiter = await client.mitarbeiter.update({ where: { id: mitarbeiter.id }, data: updates });
        }
        if (updates.pnr) mitarbeiterProPnr.set(updates.pnr, mitarbeiter);
        if (hatName) mitarbeiterProName.set(`${nachname.toLowerCase()}|${vorname.toLowerCase()}`, mitarbeiter);
      }
    }
  }

  return zusammenfassung;
}

export async function mitarbeiterRouten(app: FastifyInstance): Promise<void> {

  // ── GET / – alle Mitarbeiter ───────────────────────────────────
  app.get("/", { preHandler: [authenticate] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const mitarbeiter = await prisma.mitarbeiter.findMany({
        include: { abteilung: { select: ABTEILUNG_SELECT } },
        orderBy: [{ nachname: "asc" }, { vorname: "asc" }],
      });
      return reply.send(mitarbeiter);
    }
  );

  // ── POST /import – CSV-Import (Dry-Run oder tatsächlich) ────────
  app.post<{ Querystring: { dryRun?: string } }>(
    "/import",
    { preHandler: [authenticate] },
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
          ? await verarbeiteMitarbeiterImport(prisma as unknown as Prisma.TransactionClient, zeilenRoh, true)
          : await prisma.$transaction(tx => verarbeiteMitarbeiterImport(tx, zeilenRoh, false));

        return reply.send(zusammenfassung);
      } catch (err) {
        return reply.status(400).send({ fehler: err instanceof Error ? err.message : "Import fehlgeschlagen" });
      }
    }
  );

  // ── POST / – neuen Mitarbeiter anlegen ─────────────────────────
  app.post<{ Body: NeuerMitarbeiter }>(
    "/",
    { preHandler: [authenticate] },
    async (request: FastifyRequest<{ Body: NeuerMitarbeiter }>, reply: FastifyReply) => {
      const { vorname, nachname, abteilungId, pnr, eintritt, austritt, standort, geburtsdatum, geschlecht, beschaeftigungsart } = request.body;

      if (!vorname?.trim() || !nachname?.trim()) {
        return reply.status(400).send({ fehler: "Vorname und Nachname sind Pflicht" });
      }
      if (geschlecht != null && !GESCHLECHTER.includes(geschlecht)) {
        return reply.status(400).send({ fehler: "Ungültiges Geschlecht" });
      }

      if (beschaeftigungsart !== undefined && !BESCHAEFTIGUNGSARTEN.includes(beschaeftigungsart)) {
        return reply.status(400).send({ fehler: "Ungültige Beschäftigungsart" });
      }

      if (abteilungId) {
        const abteilung = await prisma.abteilung.findUnique({ where: { id: abteilungId } });
        if (!abteilung) return reply.status(404).send({ fehler: "Abteilung nicht gefunden" });
      }

      const mitarbeiter = await prisma.mitarbeiter.create({
        data: {
          vorname:     vorname.trim(),
          nachname:    nachname.trim(),
          abteilungId: abteilungId ?? null,
          pnr:         pnr?.trim() || null,
          eintritt:    eintritt ? new Date(eintritt) : null,
          austritt:    austritt ? new Date(austritt) : null,
          standort:    standort?.trim() || null,
          geburtsdatum: geburtsdatum ? new Date(geburtsdatum) : null,
          geschlecht:  geschlecht ?? null,
          beschaeftigungsart: beschaeftigungsart ?? Beschaeftigungsart.MITARBEITER,
        },
        include: { abteilung: { select: ABTEILUNG_SELECT } },
      });

      return reply.status(201).send(mitarbeiter);
    }
  );

  // ── PATCH /:id – Mitarbeiter bearbeiten ────────────────────────
  app.patch<{ Params: { id: string }; Body: MitarbeiterUpdate }>(
    "/:id",
    { preHandler: [authenticate] },
    async (request: FastifyRequest<{ Params: { id: string }; Body: MitarbeiterUpdate }>, reply: FastifyReply) => {
      const { id } = request.params;
      const { vorname, nachname, abteilungId, pnr, eintritt, austritt, standort, geburtsdatum, geschlecht, gehaltIgnorieren, beschaeftigungsart } = request.body;

      if (beschaeftigungsart !== undefined && !BESCHAEFTIGUNGSARTEN.includes(beschaeftigungsart)) {
        return reply.status(400).send({ fehler: "Ungültige Beschäftigungsart" });
      }
      if (geschlecht != null && !GESCHLECHTER.includes(geschlecht)) {
        return reply.status(400).send({ fehler: "Ungültiges Geschlecht" });
      }

      const vorhandener = await prisma.mitarbeiter.findUnique({ where: { id } });
      if (!vorhandener) return reply.status(404).send({ fehler: "Mitarbeiter nicht gefunden" });

      if (abteilungId) {
        const abteilung = await prisma.abteilung.findUnique({ where: { id: abteilungId } });
        if (!abteilung) return reply.status(404).send({ fehler: "Abteilung nicht gefunden" });
      }

      const aktualisiert = await prisma.mitarbeiter.update({
        where: { id },
        data: {
          ...(vorname     !== undefined ? { vorname: vorname.trim() }   : {}),
          ...(nachname    !== undefined ? { nachname: nachname.trim() } : {}),
          ...(abteilungId !== undefined ? { abteilungId: abteilungId || null } : {}),
          ...(pnr         !== undefined ? { pnr: pnr?.trim() || null } : {}),
          ...(eintritt    !== undefined ? { eintritt: eintritt ? new Date(eintritt) : null } : {}),
          ...(austritt    !== undefined ? { austritt: austritt ? new Date(austritt) : null } : {}),
          ...(standort    !== undefined ? { standort: standort?.trim() || null } : {}),
          ...(geburtsdatum !== undefined ? { geburtsdatum: geburtsdatum ? new Date(geburtsdatum) : null } : {}),
          ...(geschlecht  !== undefined ? { geschlecht: geschlecht || null } : {}),
          ...(gehaltIgnorieren !== undefined ? { gehaltIgnorieren } : {}),
          ...(beschaeftigungsart !== undefined ? { beschaeftigungsart } : {}),
        },
        include: { abteilung: { select: ABTEILUNG_SELECT } },
      });

      return reply.send(aktualisiert);
    }
  );

  // ── PATCH /standort-batch – Standort für mehrere MA auf einmal setzen ──
  app.patch<{ Body: StandortBatch }>(
    "/standort-batch",
    { preHandler: [authenticate] },
    async (request: FastifyRequest<{ Body: StandortBatch }>, reply: FastifyReply) => {
      const { ids, standort } = request.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return reply.status(400).send({ fehler: "ids ist ein Pflichtfeld" });
      }

      const ergebnis = await prisma.mitarbeiter.updateMany({
        where: { id: { in: ids } },
        data:  { standort: standort?.trim() || null },
      });

      return reply.send({ aktualisiert: ergebnis.count });
    }
  );

  // ── DELETE /:id – Mitarbeiter löschen ──────────────────────────
  app.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [authenticate] },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;
      const vorhandener = await prisma.mitarbeiter.findUnique({ where: { id } });
      if (!vorhandener) return reply.status(404).send({ fehler: "Mitarbeiter nicht gefunden" });

      await prisma.mitarbeiter.delete({ where: { id } });
      return reply.send({ ok: true });
    }
  );
}

export async function abteilungenRouten(app: FastifyInstance): Promise<void> {

  // ── GET / – alle Abteilungen ────────────────────────────────────
  app.get("/", { preHandler: [authenticate] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const abteilungen = await prisma.abteilung.findMany({
        orderBy: { name: "asc" },
      });
      return reply.send(abteilungen);
    }
  );

  // ── POST / – neue Abteilung anlegen ────────────────────────────
  app.post<{ Body: NeueAbteilung }>(
    "/",
    { preHandler: [authenticate] },
    async (request: FastifyRequest<{ Body: NeueAbteilung }>, reply: FastifyReply) => {
      const { name } = request.body;
      if (!name?.trim()) return reply.status(400).send({ fehler: "name ist ein Pflichtfeld" });

      const vorhanden = await prisma.abteilung.findUnique({ where: { name: name.trim() } });
      if (vorhanden) return reply.status(409).send({ fehler: "Abteilung existiert bereits" });

      const abteilung = await prisma.abteilung.create({ data: { name: name.trim() } });
      return reply.status(201).send(abteilung);
    }
  );
}
