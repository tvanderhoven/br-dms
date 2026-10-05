/**
 * BR-DMS – Demodaten für Vorführungen
 *
 * Befüllt eine LEERE Instanz mit einer komplett erfundenen Firma
 * ("Nordwerk Maschinenbau GmbH", ~250 Beschäftigte, 9er-Gremium):
 * Benutzer aller Rollen, Mitarbeiter mit Gehalts-/Zeitmodell-Historie,
 * 5 Sitzungen (3 final, 1 Protokoll in Arbeit, 1 geplant), Fake-Dokumente
 * als echte (verschlüsselte) PDFs, Fristen, Aufgaben, BVs, Schulungen usw.
 *
 * Bricht ab, sobald schon echte Daten vorhanden sind – kann also nie
 * eine Produktiv-Datenbank "verschmutzen".
 *
 * Aufruf im Container: node dist/demo/demo-daten.js
 * Alle Daten sind relativ zum Ausführungsdatum, damit Fristen und die
 * nächste Sitzung in der Demo immer "aktuell" wirken.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import PDFDocument from "pdfkit";
import {
  Prisma, Role, Geschlecht, Kategorie, FristTyp, SitzungStatus, TopStatus,
  AnwesenheitsStatus, Beschaeftigungsart, Zeitmodell, BVStatus, SchulungsStatus,
  KummerkastenStatus, AufgabenStatus, KanbanStatus, Prioritaet, AufgabeTyp, AuditAktion,
  WahlArt, WahlVerfahren,
} from "@prisma/client";
import prisma from "../lib/prisma.js";
import { STANDARD_AUFBEWAHRUNG_TAGE } from "../lib/kategorien.js";
import { hashPassword } from "../lib/password.js";
import { encryptFile } from "../lib/encryption.js";
import { pdfAutomatischGenerieren } from "../routes/pdf.js";
import { betriebsversammlungFristAbgleichen } from "../lib/betriebsversammlungFrist.js";
import { wahlFristenAbgleichen } from "../lib/wahlFristen.js";

const STORAGE     = process.env.STORAGE_PATH ?? "/data/storage";
const MASTER_KEY  = process.env.ENCRYPTION_KEY!;
const DEMO_PW     = process.env.DEMO_PASSWORD ?? "Demo2026!";
const DEMO_DOMAIN = "nordwerk-demo.lokal";

// ── Hilfsfunktionen ──────────────────────────────────────────────

// Deterministischer Zufall, damit jede Demo-Instanz gleich aussieht
let seed = 20261003;
function zufall(): number {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const zahl  = (min: number, max: number) => Math.floor(zufall() * (max - min + 1)) + min;
const wahl  = <T>(liste: readonly T[]): T => liste[Math.floor(zufall() * liste.length)];
const chance = (p: number) => zufall() < p;

const HEUTE = new Date();
HEUTE.setHours(0, 0, 0, 0);

function tage(n: number, basis = HEUTE): Date {
  const d = new Date(basis);
  d.setDate(d.getDate() + n);
  return d;
}
function datum(j: number, m: number, t: number): Date {
  return new Date(Date.UTC(j, m - 1, t));
}
function monatsErster(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1));
}
// Nächster Donnerstag (Sitzungstag) ab einem Datum, 09:00 Uhr
function donnerstag(basis: Date): Date {
  const d = new Date(basis);
  d.setDate(d.getDate() + ((4 - d.getDay() + 7) % 7));
  d.setHours(9, 0, 0, 0);
  return d;
}
function fmt(d: Date): string {
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// TipTap-JSON (Rich-Text-Editor der App)
type Knoten = Record<string, unknown>;
const absatz = (text: string): Knoten => ({ type: "paragraph", content: [{ type: "text", text }] });
const liste  = (punkte: string[]): Knoten => ({
  type: "bulletList",
  content: punkte.map(p => ({ type: "listItem", content: [absatz(p)] })),
});
const tiptap = (...inhalt: (string | Knoten)[]): Prisma.InputJsonValue =>
  ({ type: "doc", content: inhalt.map(i => (typeof i === "string" ? absatz(i) : i)) }) as Prisma.InputJsonValue;
const tiptapText = (...inhalt: string[]) => inhalt.join("\n");

// ── Fake-PDF erzeugen + wie ein Upload verschlüsselt ablegen ─────

function pdfErzeugen(kopf: string, titel: string, abschnitte: [string, string][]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 60 });
    const teile: Buffer[] = [];
    doc.on("data", (c: Buffer) => teile.push(c));
    doc.on("end", () => resolve(Buffer.concat(teile)));
    doc.on("error", reject);

    doc.fillColor("#C8102E").fontSize(9).text("NORDWERK MASCHINENBAU GMBH", { characterSpacing: 1 });
    doc.fillColor("#6B6D72").fontSize(9).text(kopf);
    doc.moveDown(0.5);
    doc.strokeColor("#E1E2E4").moveTo(60, doc.y).lineTo(535, doc.y).stroke();
    doc.moveDown(1.2);
    doc.fillColor("#222327").fontSize(17).font("Helvetica-Bold").text(titel);
    doc.moveDown(1);
    for (const [ueberschrift, text] of abschnitte) {
      if (ueberschrift) {
        doc.font("Helvetica-Bold").fontSize(11).fillColor("#222327").text(ueberschrift);
        doc.moveDown(0.3);
      }
      doc.font("Helvetica").fontSize(10.5).fillColor("#333333").text(text, { align: "justify", lineGap: 2 });
      doc.moveDown(0.9);
    }
    doc.moveDown(2);
    doc.font("Helvetica-Oblique").fontSize(8).fillColor("#86888A")
      .text("DEMO-DOKUMENT – alle Namen, Daten und Inhalte sind frei erfunden.", { align: "center" });
    doc.end();
  });
}

const STANDARD_AUFBEWAHRUNG = STANDARD_AUFBEWAHRUNG_TAGE;

async function dokumentAnlegen(opts: {
  titel: string;
  kategorie: Kategorie;
  dateiname: string;
  kopf: string;
  abschnitte: [string, string][];
  erstelltAm: Date;
  vonId: string;
  aktenzeichen?: string;
  tags?: string[];
  vertraulich?: boolean;
  ungelesen?: boolean;
  quelle?: string;
}) {
  const id      = randomUUID();
  const relPfad = opts.kategorie.toLowerCase();
  const encName = `${id}.enc`;
  const tmpPfad = path.join(STORAGE, "tmp", `${id}.tmp`);

  const pdf = await pdfErzeugen(opts.kopf, opts.titel, opts.abschnitte);
  await fs.mkdir(path.join(STORAGE, "tmp"), { recursive: true });
  await fs.writeFile(tmpPfad, pdf);
  const { checksum } = await encryptFile({
    sourcePath: tmpPfad,
    destPath:   path.join(STORAGE, relPfad, encName),
    masterKey:  MASTER_KEY,
    documentId: id,
  });
  await fs.unlink(tmpPfad);

  const regel = await prisma.aufbewahrungsregel.findUnique({ where: { kategorie: opts.kategorie } });

  const dok = await prisma.dokument.create({
    data: {
      id,
      titel:          opts.titel,
      kategorie:      opts.kategorie,
      dateiname:      opts.dateiname,
      speicherpfad:   relPfad,
      verschlPfad:    encName,
      dateigroesse:   pdf.length,
      mimeTyp:        "application/pdf",
      pruefsumme:     checksum,
      aktenzeichen:   opts.aktenzeichen ?? null,
      tags:           opts.tags ?? [],
      vertraulich:    opts.vertraulich ?? false,
      textinhalt:     [opts.titel, ...opts.abschnitte.map(([u, t]) => `${u}\n${t}`)].join("\n\n"),
      inboxQuelle:    opts.quelle ?? "UPLOAD",
      inboxGelesen:   !opts.ungelesen,
      inboxGelesenAm: opts.ungelesen ? null : opts.erstelltAm,
      deleteAt:       tage(regel?.tage ?? STANDARD_AUFBEWAHRUNG[opts.kategorie], opts.erstelltAm),
      hochgeladenVonId: opts.vonId,
      erstelltAm:     opts.erstelltAm,
    },
  });
  await prisma.auditLog.create({
    data: {
      benutzerId: opts.vonId, dokumentId: id, aktion: AuditAktion.DOKUMENT_ERSTELLT,
      details: { kategorie: opts.kategorie, dateiname: opts.dateiname, groesse: pdf.length, quelle: opts.quelle ?? "UPLOAD" },
      zeitpunkt: opts.erstelltAm,
    },
  });
  return dok;
}

// ── Sicherheitsprüfung ──────────────────────────────────────────

async function pruefeLeereDatenbank() {
  const [benutzer, sitzungen, dokumente, mitarbeiter] = await Promise.all([
    prisma.benutzer.count({ where: { rolle: { not: Role.ADMIN } } }),
    prisma.sitzung.count(),
    prisma.dokument.count(),
    prisma.mitarbeiter.count(),
  ]);
  if (benutzer + sitzungen + dokumente + mitarbeiter > 0) {
    console.error(
      "[Demo] ABBRUCH: Die Datenbank enthält bereits Daten " +
      `(Benutzer: ${benutzer}, Sitzungen: ${sitzungen}, Dokumente: ${dokumente}, Mitarbeiter: ${mitarbeiter}).\n` +
      "[Demo] Demodaten werden nur in eine frische, leere Instanz geschrieben."
    );
    process.exit(1);
  }
  if (!MASTER_KEY) {
    console.error("[Demo] ABBRUCH: ENCRYPTION_KEY ist nicht gesetzt.");
    process.exit(1);
  }
}

// ── Stammdaten ──────────────────────────────────────────────────

const VORNAMEN_M = ["Thomas", "Michael", "Andreas", "Stefan", "Markus", "Christian", "Frank", "Jürgen", "Martin", "Daniel", "Sven", "Jan", "Tobias", "Dennis", "Sebastian", "Patrick", "Kevin", "Florian", "Matthias", "Ralf", "Uwe", "Holger", "Dirk", "Oliver", "Marco", "Timo", "Lukas", "Jonas", "Niklas", "Mehmet", "Ali", "Piotr", "Marek", "Dimitri", "Luca", "Hendrik", "Bernd", "Klaus", "Rainer", "Nils"];
const VORNAMEN_W = ["Sabine", "Andrea", "Claudia", "Petra", "Nicole", "Stefanie", "Katrin", "Julia", "Anna", "Laura", "Sarah", "Lisa", "Melanie", "Sandra", "Tanja", "Birgit", "Monika", "Jessica", "Kathrin", "Nadine", "Miriam", "Elena", "Ayşe", "Agnieszka", "Svenja", "Lena", "Jana", "Franziska", "Heike", "Ute"];
const NACHNAMEN  = ["Müller", "Schmidt", "Schneider", "Fischer", "Weber", "Meyer", "Wagner", "Becker", "Schulz", "Hoffmann", "Koch", "Richter", "Klein", "Wolf", "Schröder", "Neumann", "Schwarz", "Zimmermann", "Braun", "Krüger", "Hofmann", "Hartmann", "Lange", "Schmitt", "Werner", "Krause", "Meier", "Lehmann", "Schmid", "Schulze", "Maier", "Köhler", "Herrmann", "König", "Walter", "Mayer", "Huber", "Kaiser", "Fuchs", "Peters", "Lang", "Scholz", "Möller", "Weiß", "Jung", "Hahn", "Schubert", "Vogel", "Friedrich", "Keller", "Günther", "Frank", "Berger", "Winkler", "Roth", "Beck", "Lorenz", "Baumann", "Franke", "Albrecht", "Brinkmann", "Janßen", "Hinrichs", "Kowalski", "Nowak", "Yılmaz", "Kaya", "Demir", "Popescu", "Ivanov", "Rossi", "Brandt", "Wiese", "Pohl", "Engel", "Vogt", "Kröger", "Schulte", "Albers", "Tiedemann"];

const ABTEILUNGEN: { name: string; anzahl: number; gruppe: [number, number]; standort: string }[] = [
  { name: "Produktion",          anzahl: 78, gruppe: [2, 3], standort: "Werk 1" },
  { name: "Montage",             anzahl: 38, gruppe: [2, 4], standort: "Werk 2" },
  { name: "Logistik",            anzahl: 22, gruppe: [1, 2], standort: "Werk 1" },
  { name: "Konstruktion",        anzahl: 18, gruppe: [4, 5], standort: "Verwaltung" },
  { name: "Qualitätssicherung",  anzahl: 12, gruppe: [3, 4], standort: "Werk 1" },
  { name: "Service",             anzahl: 16, gruppe: [3, 4], standort: "Werk 2" },
  { name: "Vertrieb",            anzahl: 14, gruppe: [4, 5], standort: "Verwaltung" },
  { name: "Einkauf",             anzahl: 7,  gruppe: [3, 4], standort: "Verwaltung" },
  { name: "IT",                  anzahl: 7,  gruppe: [4, 5], standort: "Verwaltung" },
  { name: "Personal & Verwaltung", anzahl: 10, gruppe: [3, 4], standort: "Verwaltung" },
  { name: "Ausbildung",          anzahl: 20, gruppe: [1, 1], standort: "Werk 1" },
  { name: "Geschäftsführung",    anzahl: 2,  gruppe: [6, 6], standort: "Verwaltung" },
];

// Betriebsrat (9er-Gremium, § 9 BetrVG bei 201–400 Beschäftigten) + Ersatz + JAV
const GREMIUM: { name: string; rolle: Role; geschlecht: Geschlecht; rang: number | null; abteilung: string; login: string }[] = [
  { name: "Sabine Kröger",   rolle: Role.VORSITZ,        geschlecht: Geschlecht.WEIBLICH,  rang: 1,  abteilung: "Montage",               login: "s.kroeger" },
  { name: "Thomas Brandt",   rolle: Role.STELLVERTRETER, geschlecht: Geschlecht.MAENNLICH, rang: 2,  abteilung: "Produktion",            login: "t.brandt" },
  { name: "Mehmet Yılmaz",   rolle: Role.MITGLIED,       geschlecht: Geschlecht.MAENNLICH, rang: 3,  abteilung: "Logistik",              login: "m.yilmaz" },
  { name: "Julia Hoffmann",  rolle: Role.MITGLIED,       geschlecht: Geschlecht.WEIBLICH,  rang: 4,  abteilung: "Personal & Verwaltung", login: "j.hoffmann" },
  { name: "Andreas Wiese",   rolle: Role.MITGLIED,       geschlecht: Geschlecht.MAENNLICH, rang: 5,  abteilung: "Konstruktion",          login: "a.wiese" },
  { name: "Katrin Lehmann",  rolle: Role.MITGLIED,       geschlecht: Geschlecht.WEIBLICH,  rang: 6,  abteilung: "Qualitätssicherung",    login: "k.lehmann" },
  { name: "Stefan Pohl",     rolle: Role.MITGLIED,       geschlecht: Geschlecht.MAENNLICH, rang: 7,  abteilung: "Service",               login: "s.pohl" },
  { name: "Dirk Meyer",      rolle: Role.MITGLIED,       geschlecht: Geschlecht.MAENNLICH, rang: 8,  abteilung: "Produktion",            login: "d.meyer" },
  { name: "Anna Schulte",    rolle: Role.MITGLIED,       geschlecht: Geschlecht.WEIBLICH,  rang: 9,  abteilung: "Vertrieb",              login: "a.schulte" },
  { name: "Markus Engel",    rolle: Role.ERSATZMITGLIED, geschlecht: Geschlecht.MAENNLICH, rang: 10, abteilung: "Montage",               login: "m.engel" },
  { name: "Lena Vogt",       rolle: Role.ERSATZMITGLIED, geschlecht: Geschlecht.WEIBLICH,  rang: 11, abteilung: "Einkauf",               login: "l.vogt" },
  { name: "Peter Krause",    rolle: Role.ERSATZMITGLIED, geschlecht: Geschlecht.MAENNLICH, rang: 12, abteilung: "Produktion",            login: "p.krause" },
  { name: "Finn Albers",     rolle: Role.JAV,            geschlecht: Geschlecht.MAENNLICH, rang: null, abteilung: "Ausbildung",          login: "f.albers" },
];

// ── Hauptablauf ─────────────────────────────────────────────────

async function main() {
  await pruefeLeereDatenbank();
  console.log("[Demo] Leere Datenbank bestätigt – lege Demodaten an …");

  // Aufbewahrungsregeln (wie im normalen Seed)
  for (const [kategorie, tage] of Object.entries(STANDARD_AUFBEWAHRUNG)) {
    await prisma.aufbewahrungsregel.upsert({
      where: { kategorie: kategorie as Kategorie },
      update: {},
      create: { kategorie: kategorie as Kategorie, tage },
    });
  }

  // ── Einstellungen ────────────────────────────────────────────
  const einstellungen: Record<string, string> = {
    "wahl.minderheitengeschlecht": "WEIBLICH",
    "wahl.mindestsitze_minderheit": "3",
    "design.sidebar_farbe": "#222327",
    "design.akzent_farbe":  "#222327",
    "design.text_farbe":    "#222327",
    "design.hintergrund":   "#f3f3f4",
    "protokoll.kopfzeile":  "Betriebsrat der Nordwerk Maschinenbau GmbH",
    "protokoll.unterzeile": "Werk 1 · Werk 2 · Verwaltung",
    "protokoll.farbe":      "#c8102e",
    "protokoll.fusszeile":  "DEMO – alle Inhalte frei erfunden",
    "mail.absender_name":   "Betriebsrat Nordwerk",
    "mail.absender_adresse": `betriebsrat@${DEMO_DOMAIN}`,
    "mail.signatur":        "Betriebsrat Nordwerk · Werk 1, Raum 104\nTel. 0123 456-78",
  };
  for (const [schluessel, wert] of Object.entries(einstellungen)) {
    await prisma.systemEinstellung.upsert({ where: { schluessel }, update: { wert }, create: { schluessel, wert } });
  }

  // ── Benutzer ─────────────────────────────────────────────────
  const pwHash = hashPassword(DEMO_PW);
  const user: Record<string, string> = {};
  for (const g of GREMIUM) {
    const b = await prisma.benutzer.create({
      data: {
        email: `${g.login}@${DEMO_DOMAIN}`,
        // Zweitadresse für Einladungen wie im echten Betrieb: br-… bzw. jav-…
        einladungEmail: `${g.rolle === Role.JAV ? "jav" : "br"}-${g.login}@${DEMO_DOMAIN}`,
        name: g.name,
        passwortHash: pwHash,
        rolle: g.rolle,
        geschlecht: g.geschlecht,
        wahlReihenfolge: g.rang,
        letzterLogin: tage(-zahl(0, 6)),
        erstelltAm: datum(2026, 4, 28),
      },
    });
    user[g.login] = b.id;
  }
  const vorsitz = user["s.kroeger"];
  const stv     = user["t.brandt"];
  const mitglieder = GREMIUM.filter(g => g.rang !== null && g.rang <= 9).map(g => user[g.login]);
  console.log(`[Demo] ${GREMIUM.length} Benutzer angelegt (Passwort für alle: ${DEMO_PW})`);

  // ── Abteilungen + Mitarbeiter mit Historie ───────────────────
  const abteilungIds: Record<string, string> = {};
  for (const a of ABTEILUNGEN) {
    abteilungIds[a.name] = (await prisma.abteilung.create({ data: { name: a.name } })).id;
  }

  type MA = { id: string; abteilung: string; name: string; art: Beschaeftigungsart; gruppe: number; stufe: number; at: boolean };
  const alleMA: MA[] = [];
  let pnr = 10001;
  const vergeben = new Set<string>();

  function neuerName(): [string, string, boolean] {
    for (;;) {
      const weiblich = chance(0.32);
      const vorname  = wahl(weiblich ? VORNAMEN_W : VORNAMEN_M);
      const nachname = wahl(NACHNAMEN);
      if (!vergeben.has(`${vorname} ${nachname}`)) {
        vergeben.add(`${vorname} ${nachname}`);
        return [vorname, nachname, weiblich];
      }
    }
  }

  // Gremium zuerst als echte Mitarbeiter (gleiche Namen wie die Benutzer)
  const gremiumMA = new Map(GREMIUM.map(g => [g.name, g.abteilung]));
  for (const g of GREMIUM) vergeben.add(g.name);

  const HISTORIE_AB = datum(2016, 1, 1);
  const ZEITMODELLE = [Zeitmodell.A, Zeitmodell.A, Zeitmodell.A, Zeitmodell.A, Zeitmodell.A, Zeitmodell.A, Zeitmodell.B, Zeitmodell.B, Zeitmodell.C, Zeitmodell.D];

  async function mitarbeiterAnlegen(vorname: string, nachname: string, abteilung: string, artVorgabe?: Beschaeftigungsart) {
    const def = ABTEILUNGEN.find(a => a.name === abteilung)!;
    let art: Beschaeftigungsart = artVorgabe ?? Beschaeftigungsart.MITARBEITER;
    if (!artVorgabe && abteilung === "Ausbildung") {
      art = chance(0.75) ? Beschaeftigungsart.AZUBI : Beschaeftigungsart.DUALER_STUDENT;
    } else if (!artVorgabe && ["Produktion", "Logistik", "Montage"].includes(abteilung) && chance(0.08)) {
      art = Beschaeftigungsart.ZEITARBEITER;
    } else if (!artVorgabe && ["IT", "Konstruktion"].includes(abteilung) && chance(0.15)) {
      art = Beschaeftigungsart.STUDENT;
    }

    const tarifIgnoriert = art !== Beschaeftigungsart.MITARBEITER || abteilung === "Geschäftsführung";
    const kurz = art === Beschaeftigungsart.AZUBI || art === Beschaeftigungsart.DUALER_STUDENT || art === Beschaeftigungsart.STUDENT || art === Beschaeftigungsart.ZEITARBEITER;
    const eintritt = kurz
      ? datum(zahl(2023, 2026), wahl([8, 9, 1, 4]), 1)
      : datum(zahl(1992, 2025), zahl(1, 12), wahl([1, 1, 15]));
    if (eintritt > HEUTE) eintritt.setUTCFullYear(eintritt.getUTCFullYear() - 1);

    // Geburtsdatum passend zum Alter beim Eintritt; heute höchstens 65 (für JAV-/BR-Wahlberechtigung)
    const alterBeiEintritt = art === Beschaeftigungsart.AZUBI ? zahl(16, 21)
      : art === Beschaeftigungsart.DUALER_STUDENT ? zahl(18, 22)
      : art === Beschaeftigungsart.STUDENT ? zahl(20, 26)
      : zahl(18, 38);
    const geburtsdatum = datum(eintritt.getUTCFullYear() - alterBeiEintritt, zahl(1, 12), zahl(1, 28));
    const aeltestesJahr = HEUTE.getUTCFullYear() - 65;
    if (geburtsdatum.getUTCFullYear() < aeltestesJahr) geburtsdatum.setUTCFullYear(aeltestesJahr + zahl(0, 4));

    const ma = await prisma.mitarbeiter.create({
      data: {
        vorname, nachname,
        pnr: String(pnr++),
        eintritt,
        standort: def.standort,
        geburtsdatum,
        geschlecht: VORNAMEN_W.includes(vorname) ? Geschlecht.WEIBLICH : Geschlecht.MAENNLICH,
        abteilungId: abteilungIds[abteilung],
        beschaeftigungsart: art,
        gehaltIgnorieren: tarifIgnoriert,
      },
    });

    let gruppe = zahl(def.gruppe[0], def.gruppe[1]);
    let stufe  = 1;
    const at   = !tarifIgnoriert && ["Konstruktion", "IT", "Vertrieb"].includes(abteilung) && chance(0.2);

    if (!tarifIgnoriert) {
      // Eingruppierungs-Historie: Start beim Eintritt (frühestens 2016),
      // Stufenaufstieg alle ~3 Jahre, gelegentlich Höhergruppierung
      let stichtag = eintritt > HISTORIE_AB ? monatsErster(eintritt) : HISTORIE_AB;
      const jahreVorher = Math.max(0, (HISTORIE_AB.getTime() - eintritt.getTime()) / (365.25 * 864e5));
      stufe = Math.min(4, 1 + Math.floor(jahreVorher / 3));
      const eintraege: Prisma.GehaltsstufenEintragCreateManyInput[] = [];
      let atGehalt = zahl(58, 78) * 100;

      eintraege.push(at
        ? { mitarbeiterId: ma.id, gehaltAt: atGehalt, gueltigAb: stichtag, bemerkung: eintritt >= HISTORIE_AB ? "Einstellung (AT-Vertrag)" : "Übernahme Altbestand" }
        : { mitarbeiterId: ma.id, gruppe, stufe, gueltigAb: stichtag, bemerkung: eintritt >= HISTORIE_AB ? "Ersteingruppierung bei Einstellung" : "Übernahme Altbestand" });

      for (;;) {
        const naechster = new Date(stichtag);
        naechster.setUTCMonth(naechster.getUTCMonth() + (at ? zahl(12, 24) : zahl(30, 40)));
        if (naechster > tage(-120)) break;
        stichtag = naechster;
        if (at) {
          atGehalt = Math.round(atGehalt * (1 + zahl(25, 45) / 1000) / 10) * 10;
          eintraege.push({ mitarbeiterId: ma.id, gehaltAt: atGehalt, gueltigAb: stichtag, bemerkung: "Gehaltsanpassung" });
        } else if (gruppe < 6 && chance(0.22)) {
          gruppe++;
          stufe = Math.max(1, stufe - 1);
          eintraege.push({ mitarbeiterId: ma.id, gruppe, stufe, gueltigAb: stichtag, bemerkung: "Höhergruppierung (§ 99 BetrVG)" });
        } else if (stufe < 4) {
          stufe++;
          eintraege.push({ mitarbeiterId: ma.id, gruppe, stufe, gueltigAb: stichtag, bemerkung: "Stufenaufstieg nach Betriebszugehörigkeit" });
        }
      }
      await prisma.gehaltsstufenEintrag.createMany({ data: eintraege });

      // Zeitmodell-Historie: meist ein unbefristetes Modell, teils befristete Wechsel
      const basisModell = wahl(ZEITMODELLE);
      const zm: Prisma.ZeitmodellEintragCreateManyInput[] = [
        { mitarbeiterId: ma.id, zeitmodell: basisModell, gueltigVon: eintraege[0].gueltigAb as Date, gueltigBis: null },
      ];
      if (chance(0.18)) {
        const von = tage(-zahl(60, 900));
        const bis = tage(zahl(1, 10) * 30, von);
        const anderes = wahl([Zeitmodell.B, Zeitmodell.C, Zeitmodell.D].filter(z => z !== basisModell));
        zm[0].gueltigBis = tage(-1, von);
        zm.push({ mitarbeiterId: ma.id, zeitmodell: anderes, gueltigVon: von, gueltigBis: bis, bemerkung: wahl(["Befristet auf Wunsch (Kinderbetreuung)", "Befristet – Pflege Angehöriger", "Befristete Teilzeit (§ 9a TzBfG)", "Projektphase"]) });
        if (bis < HEUTE) zm.push({ mitarbeiterId: ma.id, zeitmodell: basisModell, gueltigVon: tage(1, bis), gueltigBis: null, bemerkung: "Rückkehr ins ursprüngliche Modell" });
      }
      await prisma.zeitmodellEintrag.createMany({ data: zm });

      if (at || chance(0.12)) {
        await prisma.ueberstundenEintrag.create({
          data: {
            mitarbeiterId: ma.id,
            regelung: at ? "Mit AT-Gehalt pauschal abgegolten" : wahl(["Ausgleich in Freizeit", "Auszahlung ab 20 h/Monat", "Gleitzeitkonto, Kappung bei 60 h"]),
            gueltigVon: tage(-zahl(100, 1500)),
          },
        });
      }
    }

    // Ein paar ehemalige Kolleg:innen
    if (!kurz && chance(0.03)) {
      await prisma.mitarbeiter.update({ where: { id: ma.id }, data: { austritt: tage(-zahl(30, 700)) } });
    }

    const eintrag: MA = { id: ma.id, abteilung, name: `${vorname} ${nachname}`, art, gruppe, stufe, at };
    alleMA.push(eintrag);
    return eintrag;
  }

  for (const [name, abteilung] of gremiumMA) {
    const [vorname, ...rest] = name.split(" ");
    await mitarbeiterAnlegen(vorname, rest.join(" "), abteilung,
      abteilung === "Ausbildung" ? Beschaeftigungsart.AZUBI : Beschaeftigungsart.MITARBEITER);
  }
  for (const a of ABTEILUNGEN) {
    const schonDa = alleMA.filter(m => m.abteilung === a.name).length;
    for (let i = schonDa; i < a.anzahl; i++) {
      const [vorname, nachname] = neuerName();
      await mitarbeiterAnlegen(vorname, nachname, a.name);
    }
  }
  console.log(`[Demo] ${alleMA.length} Mitarbeiter mit Gehalts- und Zeitmodell-Historie angelegt`);

  // ── Dokumente (Fake-PDFs) ────────────────────────────────────
  const tarifMA = alleMA.filter(m => m.art === Beschaeftigungsart.MITARBEITER && !m.at && m.abteilung !== "Geschäftsführung");
  const personal = user["j.hoffmann"];
  const pKopf = (az: string) => `Personalabteilung · Az. ${az}`;

  const dokBV: Record<string, string> = {};
  const bvTexte: [string, string, string, [string, string][]][] = [
    ["mobiles-arbeiten", "Betriebsvereinbarung Mobiles Arbeiten", "BV_Mobiles_Arbeiten_2024.pdf", [
      ["§ 1 Geltungsbereich", "Diese Betriebsvereinbarung gilt für alle Beschäftigten der Nordwerk Maschinenbau GmbH, deren Tätigkeit sich ganz oder teilweise für mobiles Arbeiten eignet."],
      ["§ 2 Umfang", "Mobiles Arbeiten ist bis zu drei Tage pro Woche möglich. Die Teilnahme ist freiwillig und kann von beiden Seiten mit einer Ankündigungsfrist von vier Wochen beendet werden."],
      ["§ 3 Arbeitszeit und Erreichbarkeit", "Es gelten die Regelungen der BV Arbeitszeit. Eine Erreichbarkeit außerhalb der vereinbarten Kernzeiten wird nicht erwartet."],
      ["§ 4 Ausstattung", "Der Arbeitgeber stellt die notwendige IT-Ausstattung. Für die Nutzung privater Räume wird eine monatliche Pauschale von 20 € gezahlt."],
    ]],
    ["arbeitszeit", "Betriebsvereinbarung Arbeitszeit und Gleitzeit", "BV_Arbeitszeit_Gleitzeit.pdf", [
      ["§ 1 Rahmenzeit", "Die Rahmenarbeitszeit liegt montags bis freitags zwischen 06:00 und 20:00 Uhr. Die Kernzeit beträgt 09:00 bis 14:00 Uhr (freitags bis 12:00 Uhr)."],
      ["§ 2 Zeitkonto", "Plusstunden werden auf einem Gleitzeitkonto geführt. Das Konto darf 60 Plus- und 20 Minusstunden nicht überschreiten."],
      ["§ 3 Mehrarbeit", "Angeordnete Mehrarbeit bedarf der vorherigen Zustimmung des Betriebsrats nach § 87 Abs. 1 Nr. 3 BetrVG."],
    ]],
    ["bem", "Betriebsvereinbarung Betriebliches Eingliederungsmanagement (BEM)", "BV_BEM.pdf", [
      ["§ 1 Ziel", "Ziel des BEM ist es, Arbeitsunfähigkeit zu überwinden, erneuter Arbeitsunfähigkeit vorzubeugen und den Arbeitsplatz zu erhalten (§ 167 Abs. 2 SGB IX)."],
      ["§ 2 Integrationsteam", "Das Integrationsteam besteht aus je einer Vertretung von Personalabteilung und Betriebsrat sowie bei Bedarf der Schwerbehindertenvertretung und dem Betriebsarzt."],
    ]],
    ["videoueberwachung", "Betriebsvereinbarung Videoüberwachung Außengelände", "BV_Videoueberwachung.pdf", [
      ["§ 1 Zweck", "Die Videoüberwachung dient ausschließlich dem Schutz des Betriebsgeländes vor Diebstahl und Vandalismus. Eine Leistungs- und Verhaltenskontrolle ist ausgeschlossen."],
      ["§ 2 Speicherdauer", "Aufzeichnungen werden nach 72 Stunden automatisch gelöscht, sofern kein Vorfall dokumentiert wurde."],
    ]],
    ["schichtarbeit", "Betriebsvereinbarung Schichtarbeit Werk 1", "BV_Schichtarbeit_Werk1.pdf", [
      ["§ 1 Schichtmodell", "In der Produktion Werk 1 wird im Drei-Schicht-System gearbeitet (Früh 06–14 Uhr, Spät 14–22 Uhr, Nacht 22–06 Uhr)."],
      ["§ 2 Schichtpläne", "Schichtpläne werden spätestens vier Wochen im Voraus bekannt gegeben und bedürfen der Zustimmung des Betriebsrats."],
    ]],
  ];
  for (const [key, titel, datei, abschnitte] of bvTexte) {
    const d = await dokumentAnlegen({
      titel, kategorie: Kategorie.BETRIEBSVEREINBARUNG, dateiname: datei,
      kopf: "Betriebsvereinbarung zwischen Geschäftsführung und Betriebsrat",
      abschnitte, erstelltAm: tage(-zahl(200, 900)), vonId: vorsitz, tags: ["BV"],
    });
    dokBV[key] = d.id;
  }

  // § 99 Einstellungen / Umgruppierungen
  const anh99: { dok: string; titel: string; frist: Date; erledigt: boolean; az: string }[] = [];
  const faelle99: [string, string, number, boolean][] = [
    ["Einstellung Konstrukteur/in Sondermaschinenbau", "Konstruktion", -38, true],
    ["Einstellung Fachkraft für Lagerlogistik", "Logistik", -33, true],
    ["Höhergruppierung Schichtleitung Montage", "Montage", -9, true],
    ["Einstellung Servicetechniker/in Außendienst", "Service", -4, false],
    ["Versetzung QS-Prüfer/in nach Werk 2", "Qualitätssicherung", -2, false],
    ["Einstellung Industriemechaniker/in (befristet)", "Produktion", -1, false],
  ];
  for (const [i, [titel, abt, tageZurueck, erledigt]] of faelle99.entries()) {
    const az = `P-99-2026-${String(41 + i).padStart(3, "0")}`;
    const [vn, nn] = neuerName();
    const erstellt = tage(tageZurueck);
    const d = await dokumentAnlegen({
      titel: `Anhörung § 99 – ${titel}`, kategorie: Kategorie.ANHOERUNG_99,
      dateiname: `Anhoerung_99_${az}.pdf`, kopf: pKopf(az), aktenzeichen: az,
      abschnitte: [
        ["Unterrichtung des Betriebsrats gemäß § 99 BetrVG", `Wir beabsichtigen folgende personelle Maßnahme: ${titel} in der Abteilung ${abt}.`],
        ["Betroffene Person", `${vn} ${nn}, vorgesehener Beginn: ${fmt(tage(30, erstellt))}.`],
        ["Eingruppierung", `Vorgesehen ist die Eingruppierung in Gruppe ${zahl(2, 5)}, Stufe 1 nach dem Haustarif.`],
        ["Auswirkungen", "Nachteile für andere Beschäftigte sind nicht zu erwarten. Die Stelle war intern ausgeschrieben; interne Bewerbungen lagen nicht vor."],
        ["Bitte um Zustimmung", "Wir bitten den Betriebsrat, die Zustimmung innerhalb einer Woche zu erteilen."],
      ],
      erstelltAm: erstellt, vonId: personal, vertraulich: true, tags: [abt],
      ungelesen: tageZurueck > -3, quelle: tageZurueck > -3 ? "WATCHFOLDER" : "UPLOAD",
    });
    const frist = tage(7, erstellt);
    await prisma.frist.create({
      data: {
        dokumentId: d.id, typ: FristTyp.ANHOERUNG_99_WOCHE, faelligAm: frist,
        status: erledigt ? "ERLEDIGT" : "OFFEN",
        erledigtAm: erledigt ? tage(zahl(2, 6), erstellt) : null,
        erledigtVonId: erledigt ? vorsitz : null,
        bezeichnung: titel,
        erstelltAm: erstellt,
      },
    });
    anh99.push({ dok: d.id, titel, frist, erledigt, az });
  }

  // § 102 Kündigung
  const az102 = "P-102-2026-007";
  const dok102 = await dokumentAnlegen({
    titel: "Anhörung § 102 – Ordentliche Kündigung (Probezeit)", kategorie: Kategorie.ANHOERUNG_102,
    dateiname: `Anhoerung_102_${az102}.pdf`, kopf: pKopf(az102), aktenzeichen: az102,
    abschnitte: [
      ["Anhörung des Betriebsrats gemäß § 102 BetrVG", "Wir beabsichtigen, das Arbeitsverhältnis mit dem unten genannten Beschäftigten ordentlich innerhalb der Probezeit zu kündigen."],
      ["Sozialdaten", "Eintritt vor 4 Monaten, 27 Jahre, ledig, keine Unterhaltspflichten, keine Schwerbehinderung."],
      ["Kündigungsgründe", "Wiederholte unentschuldigte Fehlzeiten trotz Gespräch und schriftlicher Ermahnung."],
    ],
    erstelltAm: tage(-36), vonId: personal, vertraulich: true, tags: ["Probezeit"],
  });
  await prisma.frist.create({
    data: { dokumentId: dok102.id, typ: FristTyp.ANHOERUNG_102_ORDENTLICH, faelligAm: tage(-29), status: "ERLEDIGT", erledigtAm: tage(-31), erledigtVonId: vorsitz, erstelltAm: tage(-36) },
  });

  // § 87 Zeitmodell / Mehrarbeit – Frist läuft gerade
  const dok87 = await dokumentAnlegen({
    titel: "Antrag Mehrarbeit Montage KW 44–46 (§ 87 Abs. 1 Nr. 3)", kategorie: Kategorie.ZEITMODELL_87,
    dateiname: "Antrag_Mehrarbeit_Montage_KW44-46.pdf", kopf: "Werksleitung Werk 2",
    abschnitte: [
      ["Antrag auf Zustimmung", "Für den Kundenauftrag 'Linienanlage Lindqvist AB' wird für die Montage in den KW 44 bis 46 Mehrarbeit beantragt."],
      ["Umfang", "Samstagsschichten (06:00–12:00 Uhr) für bis zu 14 Beschäftigte, freiwillige Teilnahme, Zuschlag 25 %."],
    ],
    erstelltAm: tage(-3), vonId: personal, ungelesen: true, tags: ["Mehrarbeit", "Montage"],
  });
  await prisma.frist.create({ data: { dokumentId: dok87.id, typ: FristTyp.ZEITMODELL_87_WOCHE, faelligAm: tage(4), erstelltAm: tage(-3) } });

  // Bewerbungen + Sonstiges
  const dokBewerbung = await dokumentAnlegen({
    titel: "Bewerbungsunterlagen Servicetechniker/in (Sammelmappe)", kategorie: Kategorie.BEWERBUNG,
    dateiname: "Bewerbungen_Servicetechnik.pdf", kopf: "Personalabteilung · Ausschreibung 2026-17",
    abschnitte: [["Übersicht", "3 Bewerbungen auf die Stelle Servicetechniker/in Außendienst. Unterlagen zur Einsicht für den Betriebsrat im Rahmen des § 99-Verfahrens."]],
    erstelltAm: tage(-4), vonId: personal, vertraulich: true,
  });
  const dokGBU = await dokumentAnlegen({
    titel: "Gefährdungsbeurteilung psychische Belastung – Ergebnisbericht", kategorie: Kategorie.ARBEITSSCHUTZ,
    dateiname: "GBU_Psyche_Ergebnisbericht.pdf", kopf: "Arbeitssicherheit · Fachkraft für Arbeitssicherheit",
    abschnitte: [
      ["Zusammenfassung", "Die Befragung (Rücklauf 64 %) zeigt erhöhte Belastung durch Termindruck in Montage und Service sowie durch Unterbrechungen im Büro."],
      ["Empfohlene Maßnahmen", "Personalbemessung Service prüfen, Ruhezonen in Werk 2 einrichten, Führungskräfteschulung 'Gesund führen'."],
    ],
    erstelltAm: tage(-70), vonId: vorsitz, tags: ["Arbeitsschutz", "GBU"],
  });
  const dokPraemie = await dokumentAnlegen({
    titel: "Entwurf GF: Neue Prämienregelung Produktion", kategorie: Kategorie.ARBEITGEBER_INFO,
    dateiname: "Entwurf_Praemienregelung_2027.pdf", kopf: "Geschäftsführung",
    abschnitte: [
      ["Ziel", "Einführung einer Gruppenprämie in der Produktion ab 01.01.2027, abhängig von Termintreue und Ausschussquote."],
      ["Hinweis", "Mitbestimmungspflichtig nach § 87 Abs. 1 Nr. 10 und 11 BetrVG – Verhandlungsaufnahme mit dem Betriebsrat erbeten."],
    ],
    erstelltAm: tage(-12), vonId: stv, tags: ["Entgelt", "Verhandlung"],
  });
  await dokumentAnlegen({
    titel: "Abmahnung (Abschrift) – wiederholte Verspätung, Lager", kategorie: Kategorie.ABMAHNUNG,
    dateiname: "Abmahnung_Abschrift_Lager.pdf", kopf: "Personalabteilung · Abschrift zur Kenntnis des Betriebsrats",
    abschnitte: [
      ["Sachverhalt", "Der Mitarbeiter hat an drei Tagen im September den Schichtbeginn um 20 bis 35 Minuten verpasst, ohne sich rechtzeitig zu melden."],
      ["Hinweis", "Der Mitarbeiter hat um Unterstützung durch den Betriebsrat gebeten; eine Gegendarstellung zur Personalakte ist in Vorbereitung."],
    ],
    erstelltAm: tage(-9), vonId: personal, vertraulich: true, tags: ["Personalakte"],
  });
  await dokumentAnlegen({
    titel: "Schreiben an die GF: Auskunftsverlangen Leiharbeit (§ 80 Abs. 2)", kategorie: Kategorie.SCHRIFTVERKEHR,
    dateiname: "Schreiben_GF_Auskunft_Leiharbeit.pdf", kopf: "Betriebsrat · an die Geschäftsführung",
    abschnitte: [
      ["Anliegen", "Der Betriebsrat bittet um eine Aufstellung aller Leiharbeitnehmerinnen und Leiharbeitnehmer mit Einsatzbereich und voraussichtlicher Einsatzdauer."],
      ["Frist", "Wir bitten um Antwort innerhalb von zwei Wochen."],
    ],
    erstelltAm: tage(-20), vonId: vorsitz, tags: ["Leiharbeit"],
  });
  console.log("[Demo] Demo-Dokumente als verschlüsselte PDFs abgelegt");

  // ── Betriebsvereinbarungen (Register) ────────────────────────
  const bvRegister: [string, string, Date, BVStatus, Date | null, string | null][] = [
    ["mobiles-arbeiten",  "Alle Beschäftigten mit geeigneter Tätigkeit", datum(2024, 3, 1),  BVStatus.AKTIV, null, null],
    ["arbeitszeit",       "Alle Beschäftigten außer Schichtbetrieb",     datum(2019, 7, 1),  BVStatus.AKTIV, null, "Nachverhandlung Zeitkonto-Kappung geplant"],
    ["bem",               "Alle Beschäftigten",                          datum(2021, 1, 15), BVStatus.AKTIV, null, null],
    ["videoueberwachung", "Außengelände Werk 1 und Werk 2",              datum(2020, 5, 1),  BVStatus.AKTIV, tage(95), "Befristet – Verlängerung prüfen"],
    ["schichtarbeit",     "Produktion Werk 1",                           datum(2018, 10, 1), BVStatus.GEKUENDIGT, tage(40), "Gekündigt durch GF, Nachwirkung – Neuverhandlung läuft"],
  ];
  for (const [key, geltung, abschluss, status, ende, bemerkung] of bvRegister) {
    await prisma.betriebsvereinbarung.create({
      data: {
        titel: bvTexte.find(b => b[0] === key)![1].replace("Betriebsvereinbarung ", "BV "),
        abschlussdatum: abschluss, geltungsbereich: geltung, status, laufzeitEnde: ende, bemerkung,
        dokumentId: dokBV[key], erstelltVonId: vorsitz,
      },
    });
  }
  await prisma.betriebsvereinbarung.create({
    data: { titel: "BV Kantinenbetrieb (alt)", abschlussdatum: datum(2012, 4, 1), status: BVStatus.ABGELOEST, bemerkung: "Abgelöst durch Dienstleistervertrag 2022", erstelltVonId: vorsitz },
  });

  // ── Sitzungen ────────────────────────────────────────────────
  const plan = [
    { titel: "Ordentliche Betriebsratssitzung", datum: donnerstag(tage(-84)), status: SitzungStatus.PROTOKOLL_FINAL },
    { titel: "Ordentliche Betriebsratssitzung", datum: donnerstag(tage(-56)), status: SitzungStatus.PROTOKOLL_FINAL },
    { titel: "Ordentliche Betriebsratssitzung", datum: donnerstag(tage(-28)), status: SitzungStatus.PROTOKOLL_FINAL },
    { titel: "Ordentliche Betriebsratssitzung", datum: donnerstag(tage(-8)),  status: SitzungStatus.PROTOKOLL_ENTWURF },
    { titel: "Ordentliche Betriebsratssitzung", datum: donnerstag(tage(6)),   status: SitzungStatus.TAGESORDNUNG_FIXIERT },
    // Weitere Sitzungsarten – hinten angehängt, damit die Indizes oben (sitzungIds[3] usw.) stabil bleiben
    { titel: "Konstituierende Sitzung", datum: datum(2026, 5, 7), status: SitzungStatus.PROTOKOLL_FINAL, sitzungstyp: "KONSTITUIEREND" },
    { titel: "Betriebsversammlung", datum: donnerstag(tage(-70)), status: SitzungStatus.PROTOKOLL_FINAL, sitzungstyp: "BETRIEBSVERSAMMLUNG",
      ort: "Kantine Werk 1", teilnehmerzahl: 164 },
    { titel: "Betriebsversammlung", datum: donnerstag(tage(23)), status: SitzungStatus.ENTWURF, sitzungstyp: "BETRIEBSVERSAMMLUNG",
      ort: "Kantine Werk 1" },
  ];

  type TopDef = {
    titel: string;
    inhalt: string[];
    ergebnis?: string[];
    status?: TopStatus;
    vertraulich?: boolean;
    dokumente?: string[];
    beschluesse?: { antrag: string; grundlage: string; ja: number; nein: number; enth: number }[];
  };

  const topsJeSitzung: TopDef[][] = [
    [
      { titel: "Begrüßung, Feststellung der Beschlussfähigkeit", inhalt: ["Feststellung der ordnungsgemäßen Ladung und der Beschlussfähigkeit."], ergebnis: ["Die Sitzung wurde ordnungsgemäß geladen. Der Betriebsrat ist beschlussfähig."], status: TopStatus.ZUR_KENNTNIS },
      { titel: "Gefährdungsbeurteilung psychische Belastung", inhalt: ["Vorstellung des Ergebnisberichts durch die Fachkraft für Arbeitssicherheit."], ergebnis: ["Der Bericht wurde vorgestellt. Der Betriebsrat fordert einen Maßnahmenplan bis Ende des Quartals.", "Ein Arbeitskreis (Kröger, Lehmann, Pohl) begleitet die Umsetzung."], dokumente: [dokGBU.id],
        beschluesse: [{ antrag: "Der Betriebsrat bildet einen Arbeitskreis 'Psychische Belastung' mit den Mitgliedern Kröger, Lehmann und Pohl.", grundlage: "§ 87 BetrVG – Mitbestimmung", ja: 9, nein: 0, enth: 0 }] },
      { titel: "BV Schichtarbeit – Kündigung durch die Geschäftsführung", inhalt: ["Die Geschäftsführung hat die BV Schichtarbeit Werk 1 fristgerecht gekündigt."], ergebnis: ["Die BV wirkt nach. Der Betriebsrat nimmt Verhandlungen auf; Verhandlungskommission: Brandt, Meyer, Yılmaz."], dokumente: [dokBV["schichtarbeit"]],
        beschluesse: [{ antrag: "Der Betriebsrat benennt Thomas Brandt, Dirk Meyer und Mehmet Yılmaz als Verhandlungskommission für eine neue BV Schichtarbeit.", grundlage: "Sonstige Beschlussfassung", ja: 8, nein: 0, enth: 1 }] },
      { titel: "Verschiedenes", inhalt: ["Termine, Informationen, Sonstiges."], ergebnis: ["Sommerfest am 2. Augustwochenende – der Betriebsrat beteiligt sich mit einem Infostand."], status: TopStatus.ZUR_KENNTNIS },
    ],
    [
      { titel: "Genehmigung des Protokolls der letzten Sitzung", inhalt: ["Das Protokoll wurde mit der Einladung versandt."], ergebnis: ["Das Protokoll wurde ohne Änderungen genehmigt."],
        beschluesse: [{ antrag: "Das Protokoll der letzten Sitzung wird genehmigt.", grundlage: "Sonstige Beschlussfassung", ja: 9, nein: 0, enth: 0 }] },
      { titel: "Personelle Einzelmaßnahmen nach § 99 BetrVG", inhalt: ["Höhergruppierungen nach Abschluss der Weiterbildung zum Industriemeister (3 Fälle)."], ergebnis: ["Den Höhergruppierungen wird zugestimmt. Die Eingruppierung wurde in der Gehaltstabelle hinterlegt."], vertraulich: true,
        beschluesse: [{ antrag: "Der Betriebsrat stimmt den drei beantragten Höhergruppierungen zu.", grundlage: "§ 99 BetrVG – Einstellung / Versetzung", ja: 9, nein: 0, enth: 0 }] },
      { titel: "Anhörung § 102 – Kündigung in der Probezeit", inhalt: ["Anhörung zur ordentlichen Kündigung eines Beschäftigten in der Probezeit (Logistik)."], ergebnis: ["Der Betriebsrat äußert Bedenken, sieht aber von einem Widerspruch ab. Er regt an, künftig früher Gespräche zu führen."], vertraulich: true, dokumente: [dok102.id],
        beschluesse: [{ antrag: "Der Betriebsrat erhebt gegen die Kündigung Bedenken gemäß § 102 Abs. 2 BetrVG, widerspricht jedoch nicht.", grundlage: "§ 102 BetrVG – Kündigung", ja: 6, nein: 2, enth: 1 }] },
      { titel: "Mobiles Arbeiten – Auswertung nach 2 Jahren", inhalt: ["Bericht aus der Beschäftigtenbefragung und Rückmeldungen aus den Abteilungen."], ergebnis: ["Die BV hat sich bewährt. Nachbesserungsbedarf bei der Pauschale und der Ausstattung."], status: TopStatus.ZUR_KENNTNIS, dokumente: [dokBV["mobiles-arbeiten"]] },
      { titel: "Verschiedenes", inhalt: ["Termine, Informationen, Sonstiges."], ergebnis: ["Schulungsanfragen BR-Grundlagen (Lehmann, Schulte) – siehe Beschluss nächste Sitzung."], status: TopStatus.ZUR_KENNTNIS },
    ],
    [
      { titel: "Genehmigung des Protokolls der letzten Sitzung", inhalt: ["Das Protokoll wurde mit der Einladung versandt."], ergebnis: ["Das Protokoll wurde mit einer redaktionellen Änderung genehmigt."],
        beschluesse: [{ antrag: "Das Protokoll der letzten Sitzung wird mit der besprochenen Änderung genehmigt.", grundlage: "Sonstige Beschlussfassung", ja: 8, nein: 0, enth: 1 }] },
      { titel: "Personelle Einzelmaßnahmen nach § 99 BetrVG", inhalt: ["Einstellung Konstrukteur/in Sondermaschinenbau", "Einstellung Fachkraft für Lagerlogistik"], ergebnis: ["Beiden Einstellungen wird zugestimmt."], vertraulich: true, dokumente: [anh99[0].dok, anh99[1].dok],
        beschluesse: [
          { antrag: "Der Betriebsrat stimmt der Einstellung Konstrukteur/in Sondermaschinenbau (Az. " + anh99[0].az + ") zu.", grundlage: "§ 99 BetrVG – Einstellung / Versetzung", ja: 9, nein: 0, enth: 0 },
          { antrag: "Der Betriebsrat stimmt der Einstellung Fachkraft für Lagerlogistik (Az. " + anh99[1].az + ") zu.", grundlage: "§ 99 BetrVG – Einstellung / Versetzung", ja: 9, nein: 0, enth: 0 },
        ] },
      { titel: "Schulungen nach § 37 Abs. 6 BetrVG", inhalt: ["Entsendung von Katrin Lehmann und Anna Schulte zum Seminar 'BR-Grundlagen Teil 1'."], ergebnis: ["Die Entsendung wird beschlossen, Kosten trägt der Arbeitgeber nach § 40 BetrVG."],
        beschluesse: [{ antrag: "Der Betriebsrat entsendet Katrin Lehmann und Anna Schulte zum Seminar 'BR-Grundlagen Teil 1'.", grundlage: "§ 37 BetrVG – Freistellung", ja: 7, nein: 0, enth: 2 }] },
      { titel: "Neue Prämienregelung Produktion – Entwurf der GF", inhalt: ["Erste Vorstellung des Entwurfs der Geschäftsführung."], ergebnis: ["Der Betriebsrat lehnt den Entwurf in der vorliegenden Form ab und fordert Gespräche über Kennzahlen und Absicherung nach unten."], dokumente: [dokPraemie.id],
        beschluesse: [{ antrag: "Der Betriebsrat stimmt dem Entwurf der Prämienregelung in der vorliegenden Form zu.", grundlage: "§ 87 BetrVG – Mitbestimmung", ja: 1, nein: 7, enth: 1 }] },
      { titel: "Verschiedenes", inhalt: ["Termine, Informationen, Sonstiges."], ergebnis: ["Kummerkasten: Hinweise zur Hitze in Halle 3 wurden an die Werksleitung weitergegeben."], status: TopStatus.ZUR_KENNTNIS },
    ],
    [
      { titel: "Genehmigung des Protokolls der letzten Sitzung", inhalt: ["Das Protokoll wurde mit der Einladung versandt."], ergebnis: ["Das Protokoll wurde genehmigt."],
        beschluesse: [{ antrag: "Das Protokoll der letzten Sitzung wird genehmigt.", grundlage: "Sonstige Beschlussfassung", ja: 9, nein: 0, enth: 0 }] },
      { titel: "Personelle Einzelmaßnahmen nach § 99 BetrVG", inhalt: ["Höhergruppierung Schichtleitung Montage"], ergebnis: ["Der Höhergruppierung wird zugestimmt."], vertraulich: true, dokumente: [anh99[2].dok],
        beschluesse: [{ antrag: "Der Betriebsrat stimmt der Höhergruppierung Schichtleitung Montage (Az. " + anh99[2].az + ") zu.", grundlage: "§ 99 BetrVG – Einstellung / Versetzung", ja: 9, nein: 0, enth: 0 }] },
      { titel: "Verhandlungsstand BV Schichtarbeit", inhalt: ["Bericht der Verhandlungskommission (Brandt)."], ergebnis: ["Zweiter Verhandlungstermin hat stattgefunden. Strittig sind Vorlaufzeiten und Nachtschichtzuschläge."], status: TopStatus.ZUR_KENNTNIS },
      { titel: "Verschiedenes", inhalt: ["Termine, Informationen, Sonstiges."] },
    ],
    [
      { titel: "Genehmigung des Protokolls der letzten Sitzung", inhalt: ["Das Protokoll wird mit der Einladung versandt."] },
      { titel: "Personelle Einzelmaßnahmen nach § 99 BetrVG", inhalt: ["Einstellung Servicetechniker/in Außendienst", "Versetzung QS-Prüfer/in nach Werk 2", "Einstellung Industriemechaniker/in (befristet)"], vertraulich: true, dokumente: [anh99[3].dok, anh99[4].dok, anh99[5].dok, dokBewerbung.id] },
      { titel: "Mehrarbeit Montage KW 44–46 (§ 87 Abs. 1 Nr. 3 BetrVG)", inhalt: ["Antrag der Werksleitung auf Samstagsschichten für den Auftrag Lindqvist."], dokumente: [dok87.id] },
      { titel: "Neue Prämienregelung – Gegenvorschlag des Betriebsrats", inhalt: ["Beratung des Gegenvorschlags (Entwurf Kröger/Brandt)."] },
      { titel: "Verschiedenes", inhalt: ["Termine, Informationen, Sonstiges."] },
    ],
    [
      { titel: "Eröffnung durch den Vorsitz des Wahlvorstands", inhalt: ["Der Vorsitzende des Wahlvorstands eröffnet die Sitzung und stellt die Beschlussfähigkeit fest."], ergebnis: ["Alle neun gewählten Mitglieder sind anwesend."], status: TopStatus.ZUR_KENNTNIS },
      { titel: "Wahl einer Wahlleitung", inhalt: ["Aus der Mitte des Betriebsrats wird eine Wahlleitung bestimmt (§ 29 Abs. 1 BetrVG)."], ergebnis: ["Andreas Wiese übernimmt die Wahlleitung."],
        beschluesse: [{ antrag: "Andreas Wiese wird zum Wahlleiter für die Wahl des Vorsitzes bestimmt.", grundlage: "Sonstige Beschlussfassung", ja: 8, nein: 0, enth: 1 }] },
      { titel: "Wahl der/des Vorsitzenden (§ 26 Abs. 1 BetrVG)", inhalt: ["Vorgeschlagen: Sabine Kröger."], ergebnis: ["Sabine Kröger ist zur Vorsitzenden gewählt und nimmt die Wahl an."],
        beschluesse: [{ antrag: "Sabine Kröger wird zur Vorsitzenden des Betriebsrats gewählt.", grundlage: "§ 26 BetrVG – Vorsitz", ja: 8, nein: 0, enth: 1 }] },
      { titel: "Wahl der/des stellvertretenden Vorsitzenden (§ 26 Abs. 1 BetrVG)", inhalt: ["Vorgeschlagen: Thomas Brandt."], ergebnis: ["Thomas Brandt ist zum Stellvertreter gewählt und nimmt die Wahl an."],
        beschluesse: [{ antrag: "Thomas Brandt wird zum stellvertretenden Vorsitzenden gewählt.", grundlage: "§ 26 BetrVG – Vorsitz", ja: 8, nein: 0, enth: 1 }] },
      { titel: "Bildung des Betriebsausschusses (§ 27 BetrVG)", inhalt: ["Bei neun Mitgliedern ist ein Betriebsausschuss zu bilden: Vorsitz, Stellvertretung und drei weitere Mitglieder."], ergebnis: ["Gewählt: Mehmet Yılmaz, Julia Hoffmann, Katrin Lehmann."],
        beschluesse: [{ antrag: "Mehmet Yılmaz, Julia Hoffmann und Katrin Lehmann werden in den Betriebsausschuss gewählt.", grundlage: "Sonstige Beschlussfassung", ja: 9, nein: 0, enth: 0 }] },
      { titel: "Verschiedenes", inhalt: ["Termine, Informationen, Sonstiges."], ergebnis: ["Erste ordentliche Sitzung in zwei Wochen; Schulungsbedarf wird gesammelt."], status: TopStatus.ZUR_KENNTNIS },
    ],
    [
      { titel: "Eröffnung und Begrüßung", inhalt: ["Sabine Kröger eröffnet die Versammlung und begrüßt die Beschäftigten sowie die Geschäftsführung."], ergebnis: ["Die Versammlung wurde um 9:05 Uhr eröffnet."], status: TopStatus.ZUR_KENNTNIS },
      { titel: "Tätigkeitsbericht des Betriebsrats (§ 43 Abs. 1 BetrVG)", inhalt: ["Rückblick auf die ersten Monate der Amtszeit", "Stand der Verhandlungen BV Schichtarbeit", "Auswertung Mobiles Arbeiten"], ergebnis: ["Bericht vorgetragen; Nachfragen zur Schichtplanung und zu den Vorlaufzeiten."], status: TopStatus.ZUR_KENNTNIS },
      { titel: "Bericht des Arbeitgebers (§ 43 Abs. 2 BetrVG)", inhalt: ["Wirtschaftliche Lage und Auftragsentwicklung, Personalplanung, Arbeitsschutz."], ergebnis: ["Auftragslage stabil, zwei Neueinstellungen in der Konstruktion geplant. Hitzeschutz Halle 3 wird umgesetzt."], status: TopStatus.ZUR_KENNTNIS },
      { titel: "Fragen aus der Belegschaft", inhalt: ["Hitze in Halle 3", "Aushang der Schichtpläne"], ergebnis: ["Fragen wurden von Betriebsrat und Werksleitung beantwortet."], status: TopStatus.ZUR_KENNTNIS },
      { titel: "Anträge an den Betriebsrat (§ 45 BetrVG)", inhalt: ["Anträge aus der Versammlung."], ergebnis: ["Antrag: überdachte Fahrradstellplätze an Werk 1 – vom Betriebsrat ins Themen-Backlog übernommen."], status: TopStatus.ZUR_KENNTNIS },
      { titel: "Verschiedenes", inhalt: ["Termine, Informationen, Sonstiges."], ergebnis: ["Nächste Betriebsversammlung im vierten Quartal."], status: TopStatus.ZUR_KENNTNIS },
    ],
    [
      { titel: "Eröffnung und Begrüßung", inhalt: ["Begrüßung durch die Vorsitzende."] },
      { titel: "Tätigkeitsbericht des Betriebsrats (§ 43 Abs. 1 BetrVG)", inhalt: ["Neue Prämienregelung", "BV Schichtarbeit", "JAV-Wahl 2026"] },
      { titel: "Bericht des Arbeitgebers (§ 43 Abs. 2 BetrVG)", inhalt: ["Wirtschaftliche Lage, Personalentwicklung, Arbeitsschutz."] },
      { titel: "Fragen aus der Belegschaft", inhalt: ["Vorab eingereichte Fragen (Kummerkasten) und Fragen aus der Versammlung."] },
      { titel: "Anträge an den Betriebsrat (§ 45 BetrVG)", inhalt: ["Anträge aus der Versammlung."] },
      { titel: "Verschiedenes", inhalt: ["Termine, Informationen, Sonstiges."] },
    ],
  ];

  const sitzungIds: string[] = [];
  const mitgliederOhne = (abwesend: string[]) => mitglieder.filter(m => !abwesend.includes(m));

  for (const [si, p] of plan.entries()) {
    const erstellt = tage(-14, p.datum);
    const sitzung = await prisma.sitzung.create({
      data: {
        titel: `${p.titel} am ${fmt(p.datum)}`,
        sitzungsdatum: p.datum,
        ort: p.ort ?? "Besprechungsraum BR, Verwaltungsgebäude",
        sitzungstyp: p.sitzungstyp ?? "ORDENTLICH",
        teilnehmerzahl: p.teilnehmerzahl ?? null,
        status: p.status,
        erstelltVonId: vorsitz,
        erstelltAm: erstellt,
      },
    });
    sitzungIds.push(sitzung.id);

    // Versionen gemäß Status (wie die echten Status-Übergänge)
    const imEntwurf = p.status === SitzungStatus.ENTWURF;
    const versionen: Prisma.SitzungVersionCreateManyInput[] = imEntwurf
      ? [{ sitzungId: sitzung.id, versionNummer: "1.0", typ: "TAGESORDNUNG_ENTWURF", readonly: false, erstelltVonId: vorsitz, erstelltAm: erstellt }]
      : [
          { sitzungId: sitzung.id, versionNummer: "1.0", typ: "TAGESORDNUNG_ENTWURF", readonly: true, erstelltVonId: vorsitz, erstelltAm: erstellt },
          { sitzungId: sitzung.id, versionNummer: "1.1", typ: "TAGESORDNUNG_FIXIERT", readonly: true, erstelltVonId: vorsitz, erstelltAm: tage(-8, p.datum), einladungVersendetAm: tage(-7, p.datum) },
        ];
    if (p.status === SitzungStatus.PROTOKOLL_ENTWURF || p.status === SitzungStatus.PROTOKOLL_FINAL) {
      const final = p.status === SitzungStatus.PROTOKOLL_FINAL;
      versionen.push({ sitzungId: sitzung.id, versionNummer: "2.0", typ: "PROTOKOLL_ENTWURF", readonly: final, erstelltVonId: vorsitz, erstelltAm: p.datum, finalisiertAm: final ? tage(3, p.datum) : null, finalisiertVonId: final ? vorsitz : null });
      if (final) versionen.push({ sitzungId: sitzung.id, versionNummer: "2.1", typ: "PROTOKOLL_FINAL", readonly: true, erstelltVonId: vorsitz, erstelltAm: tage(3, p.datum), finalisiertAm: tage(3, p.datum), finalisiertVonId: vorsitz });
    }
    await prisma.sitzungVersion.createMany({ data: versionen });

    // Anwesenheit: gelegentlich fehlt jemand entschuldigt, Ersatz rückt nach Wahlrang nach
    const istVergangen = p.status !== SitzungStatus.TAGESORDNUNG_FIXIERT && !imEntwurf;
    const istBV = p.sitzungstyp === "BETRIEBSVERSAMMLUNG";
    // Bei der kommenden Sitzung hat sich Dirk Meyer schon abgemeldet → Ersatz vorab geladen
    const abwesend = istVergangen
      ? ([[], [user["a.wiese"]], [], [user["k.lehmann"], user["s.pohl"]]][si] ?? [])
      : p.status === SitzungStatus.TAGESORDNUNG_FIXIERT ? [user["d.meyer"]] : [];
    const ersatzReihenfolge = [user["m.engel"], user["l.vogt"], user["p.krause"]];
    const anwesenheiten: Prisma.AnwesenheitCreateManyInput[] = [];
    for (const m of mitglieder) {
      anwesenheiten.push({ sitzungId: sitzung.id, benutzerId: m, status: abwesend.includes(m) ? AnwesenheitsStatus.ABWESEND_ENTSCHULDIGT : AnwesenheitsStatus.ANWESEND });
    }
    abwesend.forEach((fehlt, i) => {
      anwesenheiten.push({ sitzungId: sitzung.id, benutzerId: ersatzReihenfolge[i], status: AnwesenheitsStatus.ERSATZ_FUER, vertretungFuerId: fehlt });
    });
    if (istVergangen) anwesenheiten.push({ sitzungId: sitzung.id, benutzerId: user["f.albers"], status: si % 2 === 0 ? AnwesenheitsStatus.ANWESEND : AnwesenheitsStatus.ABWESEND_ENTSCHULDIGT });
    // Betriebsversammlung: keine Anwesenheitsliste, nur die Teilnehmerzahl
    if (!istBV) await prisma.anwesenheit.createMany({ data: anwesenheiten });
    const stimmberechtigt = mitgliederOhne(abwesend).length + abwesend.length;

    // TOPs + Beschlüsse
    for (const [ti, t] of topsJeSitzung[si].entries()) {
      const mitErgebnis = istVergangen && t.ergebnis;
      const hatBeschluss = istVergangen && t.beschluesse && t.beschluesse.length > 0;
      const angenommen = hatBeschluss && t.beschluesse!.every(b => b.ja > b.nein);
      const top = await prisma.tOP.create({
        data: {
          sitzungId: sitzung.id,
          nummer: ti + 1,
          titel: t.titel,
          inhalt: tiptapText(...t.inhalt),
          inhaltsJson: t.inhalt.length > 1 ? tiptap(liste(t.inhalt)) : tiptap(...t.inhalt),
          ergebnis: mitErgebnis ? tiptapText(...t.ergebnis!) : null,
          ergebnisJson: mitErgebnis ? tiptap(...t.ergebnis!) : undefined,
          status: !istVergangen ? TopStatus.OFFEN
            : t.status ?? (hatBeschluss ? (angenommen ? TopStatus.BESCHLOSSEN : TopStatus.ABGELEHNT) : TopStatus.ZUR_KENNTNIS),
          vertraulich: t.vertraulich ?? false,
        },
      });
      for (const dokId of t.dokumente ?? []) {
        await prisma.topDokument.create({ data: { topId: top.id, dokumentId: dokId, verknuepftVonId: vorsitz } });
      }
      if (hatBeschluss) {
        for (const [bi, b] of t.beschluesse!.entries()) {
          const ja = Math.min(b.ja, stimmberechtigt);
          await prisma.beschluss.create({
            data: {
              topId: top.id, antragstext: b.antrag, rechtsgrundlage: b.grundlage, reihenfolge: bi,
              jaStimmen: ja, neinStimmen: b.nein, enthaltungen: b.enth, anwesend: stimmberechtigt,
              ergebnis: ja > b.nein ? "ANGENOMMEN" : "ABGELEHNT",
              finalisiert: true, finalisiertAm: p.datum, finalisiertVonId: vorsitz, erstelltVonId: vorsitz,
            },
          });
        }
      }
    }

    await prisma.auditLog.createMany({
      data: [
        { benutzerId: vorsitz, sitzungId: sitzung.id, aktion: AuditAktion.SITZUNG_ERSTELLT, zeitpunkt: erstellt },
        ...(imEntwurf ? [] : [{ benutzerId: vorsitz, sitzungId: sitzung.id, aktion: AuditAktion.SITZUNG_FIXIERT, zeitpunkt: tage(-8, p.datum) }]),
        ...(p.status === SitzungStatus.PROTOKOLL_FINAL
          ? [{ benutzerId: vorsitz, sitzungId: sitzung.id, aktion: AuditAktion.SITZUNG_FINALISIERT, zeitpunkt: tage(3, p.datum) }]
          : []),
      ],
    });
  }

  // Kommentare an der laufenden Protokoll-Sitzung
  await prisma.kommentar.createMany({
    data: [
      { autorId: stv, sitzungId: sitzungIds[3], inhalt: "Bitte im Protokoll zu TOP 3 noch den nächsten Verhandlungstermin ergänzen." },
      { autorId: user["d.meyer"], sitzungId: sitzungIds[3], inhalt: "Termin ist der 23. – ich trage es ein." },
      { autorId: user["a.schulte"], sitzungId: sitzungIds[4], inhalt: "Zum Prämien-Gegenvorschlag habe ich Vergleichszahlen aus der IG-Metall-Auswertung, bringe ich mit." },
    ],
  });

  // Mit Sitzungen verknüpfte Gehaltsänderungen (Höhergruppierungen aus Sitzung 2 und 4)
  const kandidaten = tarifMA.filter(m => ["Produktion", "Montage"].includes(m.abteilung) && m.gruppe < 6 && !gremiumMA.has(m.name));
  const gueltig2 = monatsErster(tage(35, plan[1].datum));
  const gueltig4 = monatsErster(tage(35, plan[3].datum));
  for (const [i, m] of kandidaten.slice(0, 4).entries()) {
    await prisma.gehaltsstufenEintrag.create({
      data: {
        mitarbeiterId: m.id, gruppe: m.gruppe + 1, stufe: Math.max(1, m.stufe - 1),
        gueltigAb: i < 3 ? gueltig2 : gueltig4,
        bemerkung: i < 3 ? "Höhergruppierung nach Industriemeister-Abschluss" : "Höhergruppierung Schichtleitung Montage",
        sitzungId: i < 3 ? sitzungIds[1] : sitzungIds[3],
      },
    });
  }
  // Neueinstellungen aus Sitzung 3 (beginnen in Kürze)
  for (const [titel, abt, gruppe] of [["Konstrukteur", "Konstruktion", 4], ["Lagerlogistik", "Logistik", 2]] as const) {
    const [vn, nn] = neuerName();
    const start = monatsErster(tage(40, plan[2].datum));
    const ma = await prisma.mitarbeiter.create({
      data: { vorname: vn, nachname: nn, pnr: String(pnr++), eintritt: start, geburtsdatum: datum(zahl(1984, 2001), zahl(1, 12), zahl(1, 28)), geschlecht: VORNAMEN_W.includes(vn) ? Geschlecht.WEIBLICH : Geschlecht.MAENNLICH, standort: abt === "Logistik" ? "Werk 1" : "Verwaltung", abteilungId: abteilungIds[abt] },
    });
    await prisma.gehaltsstufenEintrag.create({ data: { mitarbeiterId: ma.id, gruppe, stufe: 1, gueltigAb: start, bemerkung: `Einstellung ${titel} – Zustimmung BR`, sitzungId: sitzungIds[2] } });
    await prisma.zeitmodellEintrag.create({ data: { mitarbeiterId: ma.id, zeitmodell: Zeitmodell.A, gueltigVon: start, sitzungId: sitzungIds[2] } });
  }
  console.log(`[Demo] ${plan.length} Sitzungen mit TOPs, Anwesenheit, Beschlüssen und Gehalts-Verknüpfungen angelegt`);

  // ── Nachrichten ──────────────────────────────────────────────
  const empfaenger = Object.values(user);
  await prisma.nachricht.createMany({
    data: [
      ...empfaenger.map(id => ({
        betreff: `Tagesordnung fixiert: ${fmt(plan[4].datum)}`, inhalt: "Die Tagesordnung zur nächsten Sitzung wurde fixiert. Bitte die Unterlagen zu TOP 2 vorab sichten.",
        typ: "TAGESORDNUNG" as const, absenderId: vorsitz, empfaengerId: id, sitzungId: sitzungIds[4], erstelltAm: tage(-2), gelesen: id === vorsitz,
      })),
      ...empfaenger.map(id => ({
        betreff: `Protokoll finalisiert: ${fmt(plan[2].datum)}`, inhalt: "Das Protokoll der Sitzung wurde finalisiert und steht als PDF zur Verfügung.",
        typ: "PROTOKOLL" as const, absenderId: vorsitz, empfaengerId: id, sitzungId: sitzungIds[2], erstelltAm: tage(3, plan[2].datum), gelesen: true, gelesenAm: tage(4, plan[2].datum),
      })),
      { betreff: "Verhandlungstermin Schichtarbeit", inhalt: "Hallo Sabine, die GF schlägt den 23. um 10 Uhr vor. Passt das? Gruß Thomas", absenderId: stv, empfaengerId: vorsitz, erstelltAm: tage(-1) },
      { betreff: "Vertretung nächste Woche", inhalt: "Ich bin nächste Woche im Urlaub – Markus Engel ist informiert.", absenderId: user["s.pohl"], empfaengerId: vorsitz, erstelltAm: tage(-5), gelesen: true, gelesenAm: tage(-5) },
    ],
  });

  // ── Aufgaben, Themen-Backlog, Zeiträume ──────────────────────
  const aufgaben: Prisma.AufgabeCreateManyInput[] = [
    { titel: "Stellungnahme § 99 Servicetechniker vorbereiten", prioritaet: Prioritaet.HOCH, faelligAm: anh99[3].frist, zugewiesenAnId: user["s.pohl"], erstelltVonId: vorsitz, dokumentId: anh99[3].dok, aufgabenStatus: AufgabenStatus.IN_BEARBEITUNG },
    { titel: "Mehrarbeitsantrag Montage mit Werksleitung klären", prioritaet: Prioritaet.HOCH, faelligAm: tage(3), zugewiesenAnId: user["m.engel"], erstelltVonId: vorsitz, dokumentId: dok87.id },
    { titel: "Gegenvorschlag Prämienregelung ausarbeiten", prioritaet: Prioritaet.MITTEL, faelligAm: tage(5), zugewiesenAnId: stv, erstelltVonId: vorsitz, aufgabenStatus: AufgabenStatus.IN_BEARBEITUNG },
    { titel: "Maßnahmenplan GBU Psyche bei GF anfordern", prioritaet: Prioritaet.MITTEL, faelligAm: tage(-3), zugewiesenAnId: user["k.lehmann"], erstelltVonId: vorsitz, dokumentId: dokGBU.id, aufgabenStatus: AufgabenStatus.AUF_HOLD },
    { titel: "Seminaranmeldung BR-Grundlagen bestätigen", prioritaet: Prioritaet.NIEDRIG, faelligAm: tage(10), zugewiesenAnId: user["a.schulte"], erstelltVonId: vorsitz },
    { titel: "Aushang Betriebsversammlung Q4 entwerfen", prioritaet: Prioritaet.MITTEL, faelligAm: tage(14), zugewiesenAnId: user["j.hoffmann"], erstelltVonId: vorsitz },
    { titel: "Protokoll der letzten Sitzung fertigstellen", prioritaet: Prioritaet.HOCH, faelligAm: tage(2), zugewiesenAnId: user["d.meyer"], erstelltVonId: vorsitz, aufgabenStatus: AufgabenStatus.IN_BEARBEITUNG },
    { titel: "Hitzeschutz Halle 3 – Rückmeldung Werksleitung nachhalten", prioritaet: Prioritaet.MITTEL, erstelltVonId: vorsitz, zugewiesenAnId: user["m.yilmaz"], erledigt: true, erledigtAm: tage(-6), aufgabenStatus: AufgabenStatus.ERLEDIGT },
    { titel: "Unterlagen Kündigung Probezeit prüfen", prioritaet: Prioritaet.HOCH, erstelltVonId: vorsitz, zugewiesenAnId: stv, dokumentId: dok102.id, erledigt: true, erledigtAm: tage(-31), aufgabenStatus: AufgabenStatus.ERLEDIGT },
    { titel: "Eigene Notiz: Fragen für Verhandlung sammeln", prioritaet: Prioritaet.NIEDRIG, erstelltVonId: vorsitz, zugewiesenAnId: vorsitz, sichtbarkeit: "PRIVAT" },
  ];
  await prisma.aufgabe.createMany({ data: aufgaben.map(a => ({ typ: AufgabeTyp.AUFGABE, ...a, erstelltAm: tage(-zahl(3, 20)) })) });

  const themen: [string, KanbanStatus, string, Prioritaet][] = [
    ["Neue BV Schichtarbeit verhandeln", KanbanStatus.IN_BEARBEITUNG, stv, Prioritaet.HOCH],
    ["Prämienregelung Produktion", KanbanStatus.IN_BEARBEITUNG, vorsitz, Prioritaet.HOCH],
    ["Nachbesserung BV Mobiles Arbeiten (Pauschale)", KanbanStatus.BACKLOG, user["a.schulte"], Prioritaet.MITTEL],
    ["Ruhezonen Werk 2 (aus GBU Psyche)", KanbanStatus.BACKLOG, user["k.lehmann"], Prioritaet.MITTEL],
    ["E-Bike-Leasing für Beschäftigte", KanbanStatus.BACKLOG, user["m.yilmaz"], Prioritaet.NIEDRIG],
    ["KI-Einsatz im Vertrieb – Rahmen-BV prüfen", KanbanStatus.BACKLOG, user["a.wiese"], Prioritaet.MITTEL],
    ["Überdachte Fahrradstellplätze Werk 1 (Antrag Betriebsversammlung)", KanbanStatus.BACKLOG, user["d.meyer"], Prioritaet.NIEDRIG],
    ["Arbeitskreis psychische Belastung einrichten", KanbanStatus.ERLEDIGT, vorsitz, Prioritaet.MITTEL],
  ];
  await prisma.aufgabe.createMany({
    data: themen.map(([titel, status, zu, prio]) => ({
      titel, kanbanStatus: status, prioritaet: prio, zugewiesenAnId: zu, erstelltVonId: vorsitz,
      erledigt: status === KanbanStatus.ERLEDIGT, erledigtAm: status === KanbanStatus.ERLEDIGT ? tage(-40) : null,
      erstelltAm: tage(-zahl(20, 120)),
    })),
  });

  const projekt = await prisma.aufgabe.create({
    data: { titel: "JAV-Wahl 2026", typ: AufgabeTyp.PROJEKT, startDatum: tage(-30), endDatum: tage(50), farbe: "#C8102E", erstelltVonId: vorsitz, zugewiesenAnId: user["f.albers"],
            beschreibung: "Begleitung der JAV-Wahl durch den Betriebsrat. Den Ablauf verantwortet der Wahlvorstand." },
  });
  const versammlung = await prisma.aufgabe.create({
    data: { titel: "Betriebsversammlung Q4", typ: AufgabeTyp.PROJEKT, startDatum: tage(-5), endDatum: tage(34), farbe: "#222327", erstelltVonId: vorsitz, zugewiesenAnId: vorsitz },
  });
  await prisma.aufgabe.createMany({
    data: [
      { titel: "Tagesordnung mit der Geschäftsführung abstimmen", typ: AufgabeTyp.AUFGABE, oberProjektId: versammlung.id, faelligAm: tage(6), prioritaet: Prioritaet.HOCH, zugewiesenAnId: vorsitz, aufgabenStatus: AufgabenStatus.IN_BEARBEITUNG, erstelltVonId: vorsitz },
      { titel: "Tätigkeitsbericht schreiben", typ: AufgabeTyp.AUFGABE, oberProjektId: versammlung.id, faelligAm: tage(19), startDatum: tage(8), endDatum: tage(19), zugewiesenAnId: stv, erstelltVonId: vorsitz },
      { titel: "Kantine und Technik reservieren", typ: AufgabeTyp.AUFGABE, oberProjektId: versammlung.id, faelligAm: tage(2), prioritaet: Prioritaet.NIEDRIG, zugewiesenAnId: user["j.hoffmann"], erledigt: true, erledigtAm: tage(-1), aufgabenStatus: AufgabenStatus.ERLEDIGT, erstelltVonId: vorsitz },
      { titel: "Fragen aus dem Kummerkasten sammeln", typ: AufgabeTyp.AUFGABE, oberProjektId: versammlung.id, faelligAm: tage(14), zugewiesenAnId: user["m.yilmaz"], erstelltVonId: vorsitz },
    ],
  });
  await prisma.aufgabe.createMany({
    data: [
      { titel: "Verhandlungsphase BV Schichtarbeit", typ: AufgabeTyp.PROJEKT, startDatum: tage(-60), endDatum: tage(45), farbe: "#86888A", erstelltVonId: stv, zugewiesenAnId: stv },
      { titel: "Wahlvorstand bestellen (Beschluss BR)", typ: AufgabeTyp.AUFGABE, faelligAm: tage(-21), oberProjektId: projekt.id, erledigt: true, erledigtAm: tage(-24), aufgabenStatus: AufgabenStatus.ERLEDIGT, prioritaet: Prioritaet.HOCH, erstelltVonId: vorsitz },
      { titel: "Wahlvorstand mit Azubi-Liste unterstützen", typ: AufgabeTyp.AUFGABE, startDatum: tage(-10), endDatum: tage(10), faelligAm: tage(10), oberProjektId: projekt.id, zugewiesenAnId: user["j.hoffmann"], aufgabenStatus: AufgabenStatus.IN_BEARBEITUNG, erstelltVonId: vorsitz },
      { titel: "Wahlversammlung/Wahltag: Freistellung der Wahlhelfer klären", typ: AufgabeTyp.AUFGABE, faelligAm: tage(25), oberProjektId: projekt.id, zugewiesenAnId: user["f.albers"], erstelltVonId: vorsitz },
      { titel: "Konstituierende Sitzung der neuen JAV vorbereiten", typ: AufgabeTyp.AUFGABE, startDatum: tage(40), endDatum: tage(50), oberProjektId: projekt.id, prioritaet: Prioritaet.NIEDRIG, erstelltVonId: vorsitz },
    ],
  });

  // ── Schulungen / Qualifikationen ─────────────────────────────
  const quali: Record<string, string> = {};
  for (const [name, monate, beschreibung] of [
    ["Ersthelfer/in", 24, "Erste-Hilfe-Ausbildung nach DGUV Vorschrift 1"],
    ["Brandschutzhelfer/in", 36, "Nach ASR A2.2, mind. 5 % der Beschäftigten"],
    ["Staplerschein", 12, "Jährliche Unterweisung nach DGUV Grundsatz 308-001"],
    ["Sicherheitsbeauftragte/r", null, "Grundausbildung bei der BG Holz und Metall"],
    ["BR-Grundlagen Teil 1", null, "Betriebsverfassungsrecht für neue BR-Mitglieder (§ 37 Abs. 6 BetrVG)"],
  ] as const) {
    quali[name] = (await prisma.qualifikation.create({ data: { name, gueltigkeitsdauerMonate: monate, beschreibung } })).id;
  }
  const aktive = alleMA.filter(m => m.art !== Beschaeftigungsart.STUDENT);
  const termine: [string, Date, SchulungsStatus, number, string, number][] = [
    ["Ersthelfer/in", tage(-700), SchulungsStatus.ABSOLVIERT, 14, "DRK Kreisverband", 980],
    ["Ersthelfer/in", tage(-180), SchulungsStatus.ABSOLVIERT, 12, "DRK Kreisverband", 840],
    ["Ersthelfer/in", tage(25), SchulungsStatus.GEPLANT, 10, "DRK Kreisverband", 700],
    ["Brandschutzhelfer/in", tage(-400), SchulungsStatus.ABSOLVIERT, 16, "Brandschutz Nord GmbH", 1200],
    ["Staplerschein", tage(-330), SchulungsStatus.ABSOLVIERT, 18, "Intern (Logistik)", 0],
    ["Staplerschein", tage(-15), SchulungsStatus.ABSOLVIERT, 15, "Intern (Logistik)", 0],
    ["Sicherheitsbeauftragte/r", tage(-90), SchulungsStatus.ABSOLVIERT, 4, "BG Holz und Metall", 0],
    ["BR-Grundlagen Teil 1", tage(18), SchulungsStatus.GEPLANT, 0, "ifb / W.A.F. Seminar", 2380],
  ];
  for (const [name, wann, status, anzahl, anbieter, kosten] of termine) {
    const termin = await prisma.schulungstermin.create({
      data: { qualifikationId: quali[name], datum: wann, status, anbieter, kosten, ort: anbieter.startsWith("Intern") ? "Werk 1, Halle 2" : "Schulungszentrum", erstelltVonId: vorsitz },
    });
    const pool = name === "Staplerschein" ? aktive.filter(m => m.abteilung === "Logistik") : aktive;
    const teilnehmer = new Set<string>();
    while (teilnehmer.size < Math.min(anzahl, pool.length)) teilnehmer.add(wahl(pool).id);
    if (name === "BR-Grundlagen Teil 1") {
      for (const n of ["Katrin Lehmann", "Anna Schulte"]) teilnehmer.add(alleMA.find(m => m.name === n)!.id);
    }
    await prisma.schulungsTeilnahme.createMany({ data: [...teilnehmer].map(id => ({ schulungsterminId: termin.id, mitarbeiterId: id })) });
  }

  // ── Wissensarchiv, Ressourcen, Vorlagen ──────────────────────
  const wissen: [string, string, string[], string][] = [
    ["Zustimmungsverweigerung § 99 – Formerfordernisse", "Die Zustimmungsverweigerung muss innerhalb einer Woche schriftlich und unter Angabe von Gründen erfolgen, die sich einem der Tatbestände des § 99 Abs. 2 BetrVG zuordnen lassen.", ["§ 99", "Fristen"], "Musterschreiben liegt unter Vorlagen. Frist im Fristenkalender immer am Tag des Eingangs anlegen."],
    ["Ersatzmitglieder richtig laden", "Bei zeitweiliger Verhinderung eines Mitglieds rückt das Ersatzmitglied nach der Reihenfolge der Wahlliste nach (§ 25 BetrVG). Geschlechterquote beachten.", ["§ 25", "Sitzung"], "Die Anwesenheitsliste schlägt das richtige Ersatzmitglied automatisch vor."],
    ["Mehrarbeit ohne Zustimmung – was tun?", "Ordnet der Arbeitgeber Mehrarbeit ohne Zustimmung an, kann der Betriebsrat Unterlassung verlangen und ggf. ein Beschlussverfahren einleiten.", ["§ 87", "Arbeitszeit"], "2025 einmal vorgekommen (Logistik) – Klärung im Gespräch mit Werksleitung, danach nicht wieder."],
    ["Schulungsanspruch neuer BR-Mitglieder", "Neue Mitglieder haben Anspruch auf Grundlagenschulungen nach § 37 Abs. 6 BetrVG. Entsendung per Beschluss, Kosten trägt der Arbeitgeber (§ 40).", ["§ 37", "Schulung"], "Beschluss immer vor Anmeldung fassen und protokollieren."],
  ];
  for (const [titel, inhalt, kategorien, loesung] of wissen) {
    await prisma.wissensEintrag.create({
      data: { titel, inhalt, inhaltJson: tiptap(inhalt), kategorien, loesung, loesungJson: tiptap(loesung), erstelltVonId: wahl([vorsitz, stv, user["j.hoffmann"]]), erstelltAm: tage(-zahl(30, 400)) },
    });
  }
  await prisma.ressource.createMany({
    data: [
      { titel: "Betriebsverfassungsgesetz (BetrVG)", url: "https://www.gesetze-im-internet.de/betrvg/", kategorie: "GESETZ", erstelltVonId: vorsitz },
      { titel: "Arbeitszeitgesetz (ArbZG)", url: "https://www.gesetze-im-internet.de/arbzg/", kategorie: "GESETZ", erstelltVonId: vorsitz },
      { titel: "Bundesanstalt für Arbeitsschutz und Arbeitsmedizin", url: "https://www.baua.de", kategorie: "BEHOERDE", erstelltVonId: user["k.lehmann"] },
      { titel: "Hans-Böckler-Stiftung – Betriebsvereinbarungen", url: "https://www.boeckler.de", kategorie: "VORLAGE", erstelltVonId: stv },
      { titel: "BG Holz und Metall", url: "https://www.bghm.de", kategorie: "BEHOERDE", erstelltVonId: user["s.pohl"] },
    ],
  });
  await prisma.sitzungsVorlage.create({
    data: {
      name: "Ordentliche Sitzung", beschreibung: "Standard-Tagesordnung für die monatliche Sitzung",
      tops: { create: [
        { titel: "Begrüßung, Feststellung der Beschlussfähigkeit", reihenfolge: 0 },
        { titel: "Genehmigung des Protokolls der letzten Sitzung", reihenfolge: 1 },
        { titel: "Personelle Einzelmaßnahmen nach § 99 BetrVG", reihenfolge: 2 },
        { titel: "Berichte aus den Ausschüssen", reihenfolge: 3 },
        // Statt eines eigenen ASA-Bereichs (siehe ROADMAP.md): Bericht des BR-Mitglieds im Arbeitsschutzausschuss
        { titel: "Bericht aus dem Arbeitsschutzausschuss", reihenfolge: 4,
          inhalt: "Bericht des BR-Mitglieds aus der letzten Sitzung des Arbeitsschutzausschusses (§ 11 ASiG): Gefährdungsbeurteilungen, Unfälle, Maßnahmen." },
        { titel: "Verschiedenes", reihenfolge: 5 },
      ] },
    },
  });

  // ── Kummerkasten ─────────────────────────────────────────────
  await prisma.kummerkastenEintrag.createMany({
    data: [
      { nachricht: "In Halle 3 ist es seit Wochen über 30 Grad. Können da nicht mal Ventilatoren hin?", status: KummerkastenStatus.ERLEDIGT, notiz: "An Werksleitung weitergegeben, mobile Kühlgeräte aufgestellt.", bearbeitetVonId: user["m.yilmaz"], bearbeitetAm: tage(-20), erstelltAm: tage(-45) },
      { nachricht: "Die Schichtpläne für November hängen immer noch nicht aus. Wie soll man da planen?", absenderName: "Ein Kollege aus Werk 1", status: KummerkastenStatus.IN_BEARBEITUNG, notiz: "Thema in Verhandlung BV Schichtarbeit aufnehmen (Vorlaufzeiten).", bearbeitetVonId: stv, bearbeitetAm: tage(-4), erstelltAm: tage(-6) },
      { nachricht: "Danke für den Einsatz beim Sommerfest, war richtig schön!", status: KummerkastenStatus.ERLEDIGT, bearbeitetVonId: vorsitz, bearbeitetAm: tage(-50), erstelltAm: tage(-52) },
      { nachricht: "Gibt es eine Möglichkeit für ein Jobrad? Andere Firmen in der Gegend haben das auch.", status: KummerkastenStatus.NEU, erstelltAm: tage(-2) },
      { nachricht: "Mein Vorgesetzter ruft regelmäßig nach Feierabend an. Ist das erlaubt?", status: KummerkastenStatus.NEU, erstelltAm: tage(-1) },
    ],
  });

  // ── Fristen ohne Dokument (Wahl, Betriebsversammlung, Erinnerungen) ──
  await prisma.frist.createMany({
    data: [
      { typ: FristTyp.BENUTZERDEFINIERT, bezeichnung: "Aushang Einladung Betriebsversammlung Q4", faelligAm: tage(9),
        notiz: "Spätestens zwei Wochen vor der Versammlung aushängen, Tagesordnung mit GF abstimmen.", erstelltVonId: vorsitz },
      { typ: FristTyp.BENUTZERDEFINIERT, bezeichnung: "Tätigkeitsbericht für die Betriebsversammlung fertigstellen", faelligAm: tage(19), erstelltVonId: vorsitz },
      { typ: FristTyp.BENUTZERDEFINIERT, bezeichnung: "BV Videoüberwachung: Verlängerung verhandeln", faelligAm: tage(60),
        notiz: "BV läuft befristet aus – Gespräch mit GF rechtzeitig terminieren.", erstelltVonId: stv },
    ],
  });

  // ── Abgeschlossene BR-Wahl 2026 als Historie (Ergebnis = Wahlrang des Gremiums) ──
  const brWahl = await prisma.wahl.create({
    data: {
      titel: "Betriebsratswahl 2026", art: WahlArt.BR, verfahren: WahlVerfahren.NORMAL,
      stimmabgabeAm: datum(2026, 4, 30), amtszeitEnde: datum(2026, 5, 31), ausschreibenAm: datum(2026, 3, 18),
      notiz: "Wahlvorstand: Andreas Wiese (BR), zwei Beschäftigte aus Produktion und Verwaltung.",
      erstelltVonId: vorsitz, konstituierendeSitzungId: sitzungIds[5],
      ergebnisUebernommenAm: datum(2026, 5, 4),
      ergebnis: GREMIUM.filter(g => g.rang !== null).map((g, i) => ({
        rang: g.rang, name: g.name, gewaehlt: g.rolle === Role.ERSATZMITGLIED ? "ERSATZ" : "MITGLIED",
        stimmen: 148 - i * 9, geschlecht: g.geschlecht, benutzerId: user[g.login],
      })),
    },
  });
  await wahlFristenAbgleichen(brWahl.id, prisma);
  await prisma.frist.updateMany({
    where: { wahlId: brWahl.id },
    data:  { status: "ERLEDIGT", erledigtAm: datum(2026, 5, 15), erledigtVonId: vorsitz },
  });

  // ── Laufende JAV-Wahl (vereinfachtes Verfahren, 20 Auszubildende) ──
  // Fristen entstehen wie in der App über wahlFristenAbgleichen; was schon vorbei ist, gilt als erledigt
  const javWahl = await prisma.wahl.create({
    data: {
      titel: "JAV-Wahl 2026", art: WahlArt.JAV, verfahren: WahlVerfahren.VEREINFACHT,
      stimmabgabeAm: tage(25), amtszeitEnde: tage(45), ausschreibenAm: tage(-4),
      notiz: "Wahlvorstand: Julia Hoffmann (BR), zwei Auszubildende.", vorhabenId: projekt.id, erstelltVonId: vorsitz,
    },
  });
  await wahlFristenAbgleichen(javWahl.id, prisma);
  await prisma.frist.updateMany({
    where: { wahlId: javWahl.id, faelligAm: { lt: HEUTE } },
    data:  { status: "ERLEDIGT", erledigtAm: tage(-3), erledigtVonId: user["j.hoffmann"] },
  });

  // ── Audit-Log: ein paar Logins für die Übersicht ─────────────
  await prisma.auditLog.createMany({
    data: Array.from({ length: 30 }, () => ({
      benutzerId: wahl(Object.values(user)), aktion: AuditAktion.LOGIN, ip: `192.168.10.${zahl(20, 80)}`,
      zeitpunkt: new Date(tage(-zahl(0, 20)).getTime() + zahl(7, 17) * 36e5),
    })),
  });

  // ── PDFs für fixierte Tagesordnungen und finale Protokolle ───
  const versionen = await prisma.sitzungVersion.findMany({
    where: { typ: { in: ["TAGESORDNUNG_FIXIERT", "PROTOKOLL_FINAL"] } },
  });
  for (const v of versionen) {
    await pdfAutomatischGenerieren(v.sitzungId, v.id, v.versionNummer, v.typ, v.erstelltAm, v.finalisiertAm);
  }
  console.log(`[Demo] ${versionen.length} Sitzungs-PDFs erzeugt`);

  // Quartals-Frist § 43: beim Backend-Start schon angelegt, jetzt gibt es eine Betriebsversammlung im Quartal
  await betriebsversammlungFristAbgleichen(prisma);

  console.log("\n[Demo] Fertig. Anmeldung z.B. als Vorsitzende:");
  console.log(`[Demo]   Benutzer: s.kroeger   Passwort: ${DEMO_PW}`);
  console.log(`[Demo]   Weitere: t.brandt (Stellv.), m.yilmaz (Mitglied), m.engel (Ersatz), f.albers (JAV)`);
}

main()
  .catch(err => { console.error("[Demo] Fehler:", err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
