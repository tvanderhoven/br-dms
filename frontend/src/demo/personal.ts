/**
 * Personal-Beispieldaten für die Online-Demo: eine kleine, erfundene Belegschaft
 * (36 Beschäftigte statt der rund 250 der lokalen Demo) mit Eingruppierungs-Historie,
 * AT-Gehältern, Zeitmodellen, Überstunden-Regelungen und Schulungen.
 *
 * Erzeugt mit festem Startwert – jeder Aufruf der Demo zeigt dieselben Daten.
 * Alle Namen, Personalnummern und Beträge sind frei erfunden.
 */

const TAG_MS = 24 * 60 * 60 * 1000;
const tag = (n: number) => new Date(Date.now() + n * TAG_MS).toISOString();
const datum = (iso: string) => iso.slice(0, 10) + "T00:00:00.000Z";

// Einfacher deterministischer Zufall (mulberry32), damit die Demo stabil bleibt
function zufall(startwert: number) {
  let a = startwert;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r = zufall(20261012);
const zahl = (min: number, max: number) => min + Math.floor(r() * (max - min + 1));
const wahl = <T,>(liste: T[]): T => liste[Math.floor(r() * liste.length)];

export const DEMO_ABTEILUNGEN = ["Montage", "Produktion", "Logistik", "Verwaltung", "Vertrieb"].map((name, i) => ({
  id: `demo-abt${i + 1}`, name, erstelltAm: tag(-900), aktualisiertAm: tag(-900),
}));

const VORNAMEN_W = ["Sabine", "Julia", "Katrin", "Anna", "Lena", "Miriam", "Petra", "Sandra", "Elif", "Nicole", "Jana", "Sophie",
  "Melanie", "Ayse", "Laura", "Carina", "Hanna", "Tanja", "Vanessa", "Ines"];
const VORNAMEN_M = ["Thomas", "Mehmet", "Andreas", "Stefan", "Dirk", "Markus", "Jan", "Lukas", "Kevin", "Sven", "Daniel", "Murat",
  "Tobias", "Oliver", "Felix", "Marco", "Ralf", "Benjamin", "Nils", "Patrick", "Uwe", "Dennis"];
// Vornamen ohne Zurücklegen ziehen, damit sich keiner wiederholt
const ziehe = (liste: string[]) => liste.splice(Math.floor(r() * liste.length), 1)[0];
const NACHNAMEN = ["Becker", "Schulz", "Hoffmann", "Wagner", "Krüger", "Vogel", "Arslan", "Lorenz", "Brandt", "Kaiser", "Peters", "Winter",
  "Schreiber", "Neumann", "Hartmann", "Yilmaz", "Böhm", "Seidel", "Fuchs", "Lang", "Kowalski", "Engel", "Franke", "Busch", "Roth",
  "Sommer", "Albrecht", "Graf", "Haas", "Jung", "Ludwig", "Pohl", "Simon", "Thiel", "Ernst", "Kraus"];

type Art = "MITARBEITER" | "AZUBI" | "STUDENT" | "DUALER_STUDENT" | "ZEITARBEITER";
// 26 Mitarbeitende, 4 Azubis, 2 dual Studierende, 2 studentische Hilfskräfte, 2 Zeitarbeitskräfte
const ARTEN: Art[] = [
  ...Array<Art>(26).fill("MITARBEITER"), "AZUBI", "AZUBI", "AZUBI", "AZUBI",
  "DUALER_STUDENT", "DUALER_STUDENT", "STUDENT", "STUDENT", "ZEITARBEITER", "ZEITARBEITER",
];
// Index der Mitarbeitenden mit AT-Vertrag (außer Tarif)
const AT_INDEX = new Set([2, 9, 17, 23]);

export const DEMO_MITARBEITER = ARTEN.map((art, i) => {
  const weiblich = r() < 0.42;
  const abt = art === "STUDENT" || art === "DUALER_STUDENT" ? DEMO_ABTEILUNGEN[3]
    : art === "ZEITARBEITER" ? DEMO_ABTEILUNGEN[2] : DEMO_ABTEILUNGEN[i % DEMO_ABTEILUNGEN.length];
  const alter = art === "AZUBI" ? zahl(17, 21) : art === "MITARBEITER" ? zahl(24, 62) : zahl(20, 27);
  const jahre = art === "MITARBEITER" ? zahl(1, Math.min(30, alter - 18)) : art === "AZUBI" ? zahl(0, 2) : zahl(0, 1);
  const eintritt = datum(tag(-(jahre * 365 + zahl(20, 300))));
  return {
    id: `demo-ma${i + 1}`,
    vorname: weiblich ? ziehe(VORNAMEN_W) : ziehe(VORNAMEN_M),
    nachname: NACHNAMEN[i],
    pnr: String(10230 + i * 7),
    eintritt,
    austritt: i === 14 ? datum(tag(45)) : null,
    standort: i % 4 === 3 ? "Werk 2" : "Werk 1",
    geburtsdatum: datum(tag(-(alter * 365 + zahl(0, 360)))),
    geschlecht: weiblich ? "WEIBLICH" : "MAENNLICH",
    abteilungId: abt.id,
    abteilung: { id: abt.id, name: abt.name },
    gehaltIgnorieren: art === "STUDENT" || art === "ZEITARBEITER",
    beschaeftigungsart: art,
    erstelltAm: tag(-400),
    aktualisiertAm: tag(-30),
  };
});

const kurz = (m: typeof DEMO_MITARBEITER[number]) => ({
  id: m.id, vorname: m.vorname, nachname: m.nachname, pnr: m.pnr, eintritt: m.eintritt, austritt: m.austritt,
  standort: m.standort, abteilung: m.abteilung, beschaeftigungsart: m.beschaeftigungsart,
});

// Eingruppierung: Gruppe 1–6, Stufe 1–4 mit Stufenaufstiegen bzw. AT-Gehalt mit Anpassungen
export const DEMO_GEHALT = DEMO_MITARBEITER.flatMap((m, i) => {
  if (m.gehaltIgnorieren) return [];
  const eintraege: Record<string, unknown>[] = [];
  const neu = (felder: Record<string, unknown>, ab: string, bemerkung: string) => eintraege.push({
    id: `demo-g${i + 1}-${eintraege.length + 1}`, mitarbeiterId: m.id, gruppe: null, stufe: null, gehaltAt: null,
    gueltigAb: ab, bemerkung, sitzungId: null, sitzung: null, mitarbeiter: kurz(m), erstelltAm: ab, aktualisiertAm: ab, ...felder,
  });
  if (AT_INDEX.has(i)) {
    let gehalt = zahl(62, 84) * 1000;
    neu({ gehaltAt: gehalt.toFixed(2) }, m.eintritt, "Einstellung (AT-Vertrag)");
    for (const jahr of [2, 1]) {
      gehalt = Math.round(gehalt * (1 + zahl(25, 45) / 1000) / 10) * 10;
      neu({ gehaltAt: gehalt.toFixed(2) }, datum(tag(-jahr * 365 + zahl(-60, 60))), "Gehaltsanpassung");
    }
    return eintraege;
  }
  const gruppe = m.beschaeftigungsart === "AZUBI" || m.beschaeftigungsart === "DUALER_STUDENT" ? 1 : zahl(2, 6);
  neu({ gruppe, stufe: 1 }, m.eintritt, "Einstellung");
  const jahre = Math.floor((Date.now() - new Date(m.eintritt).getTime()) / (365 * TAG_MS));
  for (let stufe = 2; stufe <= Math.min(4, 1 + Math.floor(jahre / 3)); stufe++) {
    neu({ gruppe, stufe }, datum(new Date(new Date(m.eintritt).getTime() + (stufe - 1) * 3 * 365 * TAG_MS).toISOString()), "Stufenaufstieg");
  }
  // Zwei Höhergruppierungen im laufenden Jahr – mit Zustimmung des Betriebsrats (§ 99)
  if (i === 5 || i === 12) neu({ gruppe: Math.min(6, gruppe + 1), stufe: 1 }, datum(tag(-zahl(20, 90))), "Höhergruppierung – Zustimmung BR (§ 99)");
  return eintraege;
});

// Zeitmodelle: frei konfigurierbare Stammdaten (siehe Einstellungen → Zeitmodelle),
// die Demo zeigt vier realistische Stundenmodelle statt bloßer Buchstaben.
export const DEMO_ZEITMODELLE = [
  { id: "demo-zm1", bezeichnung: "Vollzeit Gleitzeit", wochenstunden: 38, sortierung: 0, aktiv: true, standard: true, erstelltAm: tag(-900), aktualisiertAm: tag(-900) },
  { id: "demo-zm2", bezeichnung: "Schicht", wochenstunden: 35, sortierung: 1, aktiv: true, standard: false, erstelltAm: tag(-900), aktualisiertAm: tag(-900) },
  { id: "demo-zm3", bezeichnung: "Teilzeit", wochenstunden: 20, sortierung: 2, aktiv: true, standard: false, erstelltAm: tag(-900), aktualisiertAm: tag(-900) },
  { id: "demo-zm4", bezeichnung: "Vertrauensarbeitszeit", wochenstunden: 40, sortierung: 3, aktiv: true, standard: false, erstelltAm: tag(-900), aktualisiertAm: tag(-900) },
];
const zmKurz = (z: typeof DEMO_ZEITMODELLE[number]) => ({ id: z.id, bezeichnung: z.bezeichnung, wochenstunden: z.wochenstunden });

export const DEMO_ZEITMODELL = DEMO_MITARBEITER.flatMap((m, i) => {
  if (m.beschaeftigungsart === "STUDENT") return [];
  const modell = m.abteilung.name === "Produktion" || m.abteilung.name === "Montage" ? DEMO_ZEITMODELLE[1]
    : AT_INDEX.has(i) ? DEMO_ZEITMODELLE[3] : i % 7 === 0 ? DEMO_ZEITMODELLE[2] : DEMO_ZEITMODELLE[0];
  const eintraege = [{
    id: `demo-z${i + 1}-1`, mitarbeiterId: m.id, zeitmodell: zmKurz(modell), gueltigVon: m.eintritt, gueltigBis: null as string | null,
    bemerkung: null as string | null, sitzungId: null, sitzung: null, mitarbeiter: kurz(m), erstelltAm: m.eintritt, aktualisiertAm: m.eintritt,
  }];
  // Befristete Teilzeit, die bald endet – erscheint unter „Läuft bald ab“
  if (i === 7 || i === 20) {
    eintraege[0].gueltigBis = datum(tag(-180));
    eintraege.push({ ...eintraege[0], id: `demo-z${i + 1}-2`, zeitmodell: zmKurz(DEMO_ZEITMODELLE[2]), gueltigVon: datum(tag(-179)), gueltigBis: datum(tag(zahl(10, 25))),
      bemerkung: "Befristete Teilzeit (Elternzeit)" });
  }
  return eintraege;
});

export const DEMO_UEBERSTUNDEN = DEMO_MITARBEITER.filter(m => m.beschaeftigungsart === "MITARBEITER").map((m, i) => ({
  id: `demo-u${i + 1}`, mitarbeiterId: m.id,
  regelung: AT_INDEX.has(DEMO_MITARBEITER.indexOf(m)) ? "Mit AT-Gehalt pauschal abgegolten"
    : wahl(["Ausgleich in Freizeit", "Auszahlung ab 20 h/Monat", "Gleitzeitkonto, Kappung bei 60 h"]),
  gueltigVon: m.eintritt, gueltigBis: i === 3 ? datum(tag(18)) : null, bemerkung: i === 3 ? "Sonderregelung Projekt, befristet" : null,
  sitzungId: null, sitzung: null, mitarbeiter: kurz(m), erstelltAm: m.eintritt, aktualisiertAm: m.eintritt,
}));

export const DEMO_QUALIFIKATIONEN = [
  { id: "demo-q1", name: "Ersthelfer/in", beschreibung: "Erste-Hilfe-Ausbildung nach DGUV Grundsatz 304-001", gueltigkeitsdauerMonate: 24 },
  { id: "demo-q2", name: "Brandschutzhelfer/in", beschreibung: "Nach ASR A2.2", gueltigkeitsdauerMonate: 36 },
  { id: "demo-q3", name: "Staplerschein", beschreibung: "Fahrausweis für Flurförderzeuge (DGUV Grundsatz 308-001)", gueltigkeitsdauerMonate: null },
  { id: "demo-q4", name: "Sicherheitsbeauftragte/r", beschreibung: "Nach § 22 SGB VII", gueltigkeitsdauerMonate: 48 },
].map(q => ({ ...q, erstelltAm: tag(-700), aktualisiertAm: tag(-700) }));

const ma = (nr: number) => DEMO_MITARBEITER[nr - 1];
function termin(id: string, qualiNr: number, tageAb: number, status: string, teilnehmerNr: number[], felder: Record<string, unknown> = {}) {
  const q = DEMO_QUALIFIKATIONEN[qualiNr - 1];
  return {
    id, qualifikationId: q.id, qualifikation: q, titel: null, datum: tag(tageAb), ort: "Schulungsraum Werk 1",
    anbieter: "Fiktiv Akademie GmbH", kosten: 95 * teilnehmerNr.length, status, bemerkung: null,
    teilnehmer: teilnehmerNr.map(n => ({ id: `${id}-t${n}`, mitarbeiterId: ma(n).id, teilgenommen: status === "ABSOLVIERT", mitarbeiter: ma(n) })),
    erstelltAm: tag(tageAb - 60), aktualisiertAm: tag(tageAb), ...felder,
  };
}

export const DEMO_SCHULUNGEN = [
  // Erste Hilfe vor gut zwei Jahren – inzwischen abgelaufen, deshalb der neue Termin unten
  termin("demo-st1", 1, -790, "ABSOLVIERT", [1, 4, 8, 13]),
  termin("demo-st2", 1, -200, "ABSOLVIERT", [2, 6, 11, 19, 25]),
  termin("demo-st3", 2, -400, "ABSOLVIERT", [3, 7, 16, 22]),
  termin("demo-st4", 3, -300, "ABSOLVIERT", [5, 10, 15, 35, 36], { ort: "Lager Werk 1", kosten: 180 * 5 }),
  termin("demo-st5", 4, -500, "ABSOLVIERT", [9, 18]),
  termin("demo-st6", 1, 14, "GEPLANT", [1, 4, 8, 13, 27]),
  termin("demo-st7", 2, 40, "GEPLANT", [12, 20, 24]),
];

// Entgeltsystem (Stammdaten der Eingruppierung) – wie der Standard im echten
// Backend: Gruppe 1–6, Stufe 1–4 (siehe backend/src/lib/entgeltVorlagen.ts)
export const DEMO_ENTGELT = {
  gruppen: [1, 2, 3, 4, 5, 6].map(n => ({ id: `demo-eg-${n}`, nummer: n, bezeichnung: `Gruppe ${n}`, sortierung: n - 1, aktiv: true, stufen: [] as number[] })),
  stufen:  [1, 2, 3, 4].map(n => ({ id: `demo-es-${n}`, nummer: n, bezeichnung: `Stufe ${n}`, sortierung: n - 1, aktiv: true })),
  belegt:  { gruppen: [1, 2, 3, 4, 5, 6], stufen: [1, 2, 3, 4] },
  vorlagen: [],
};
