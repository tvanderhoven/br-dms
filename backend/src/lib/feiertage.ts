/**
 * Gesetzliche Feiertage in Deutschland, je Bundesland – für die Fristberechnung
 * nach § 193 BGB (Fristende an Samstag, Sonntag oder Feiertag → nächster Werktag).
 *
 * Reine Berechnung ohne Datenbank und ohne externe Daten: bewegliche Feiertage
 * hängen am Ostersonntag (Gaußsche Osterformel), die übrigen sind feste Daten
 * oder – beim Buß- und Bettag – der Mittwoch vor dem 23. November.
 *
 * Nicht landesweite Feiertage (Mariä Himmelfahrt in Bayern nur in überwiegend
 * katholischen Gemeinden, Fronleichnam in Teilen Sachsens und Thüringens,
 * Augsburger Friedensfest) sind als ZUSATZ_FEIERTAGE wählbar – welche davon
 * gelten, weiß nur der Betrieb selbst.
 *
 * Stand: Rechtslage 2026. Neue Landesfeiertage hier nachtragen.
 */

export const BUNDESLAENDER = {
  BW: "Baden-Württemberg",
  BY: "Bayern",
  BE: "Berlin",
  BB: "Brandenburg",
  HB: "Bremen",
  HH: "Hamburg",
  HE: "Hessen",
  MV: "Mecklenburg-Vorpommern",
  NI: "Niedersachsen",
  NW: "Nordrhein-Westfalen",
  RP: "Rheinland-Pfalz",
  SL: "Saarland",
  SN: "Sachsen",
  ST: "Sachsen-Anhalt",
  SH: "Schleswig-Holstein",
  TH: "Thüringen",
} as const;

export type Bundesland = keyof typeof BUNDESLAENDER;

export const ZUSATZ_FEIERTAGE = {
  MARIAE_HIMMELFAHRT:   "Mariä Himmelfahrt (15.08.) – z. B. überwiegend katholische Gemeinden in Bayern",
  FRONLEICHNAM:         "Fronleichnam – z. B. einzelne Gemeinden in Sachsen und Thüringen",
  AUGSBURGER_FRIEDENSFEST: "Augsburger Friedensfest (08.08.) – nur Stadt Augsburg",
} as const;

export type ZusatzFeiertag = keyof typeof ZUSATZ_FEIERTAGE;

export interface Feiertag {
  datum: string;   // JJJJ-MM-TT (Kalendertag, ohne Uhrzeit/Zeitzone)
  name:  string;
}

export function istBundesland(wert: unknown): wert is Bundesland {
  return typeof wert === "string" && Object.hasOwn(BUNDESLAENDER, wert);
}

export function istZusatzFeiertag(wert: unknown): wert is ZusatzFeiertag {
  return typeof wert === "string" && Object.hasOwn(ZUSATZ_FEIERTAGE, wert);
}

const zwei = (n: number) => String(n).padStart(2, "0");
const iso = (j: number, m: number, t: number) => `${j}-${zwei(m)}-${zwei(t)}`;

/** Ostersonntag (Anonymer Gregorianischer Algorithmus) als [Monat, Tag] */
function ostersonntag(j: number): [number, number] {
  const a = j % 19;
  const b = Math.floor(j / 100);
  const c = j % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31);
  const tag = ((h + l - 7 * m + 114) % 31) + 1;
  return [monat, tag];
}

/** Datum relativ zum Ostersonntag (Rechnung in UTC, damit keine Sommerzeit dazwischenfunkt) */
function ostern(j: number, versatz: number): string {
  const [m, t] = ostersonntag(j);
  const d = new Date(Date.UTC(j, m - 1, t + versatz));
  return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Buß- und Bettag: Mittwoch vor dem 23. November (also zwischen 16. und 22.) */
function bussUndBettag(j: number): string {
  const wochentag = new Date(Date.UTC(j, 10, 22)).getUTCDay();   // 0 = Sonntag
  const zurueck = (wochentag - 3 + 7) % 7;
  return iso(j, 11, 22 - zurueck);
}

/**
 * land = null: nur bundesweite Feiertage (solange kein Bundesland eingestellt ist).
 * Das ist die sichere Seite – ein fehlender Landesfeiertag lässt die Frist
 * höchstens früher enden, nie später.
 */
export function feiertage(
  jahr: number,
  land: Bundesland | null,
  zusatz: readonly ZusatzFeiertag[] = [],
): Feiertag[] {
  const liste: Feiertag[] = [];
  const add = (datum: string, name: string, gilt = true) => { if (gilt) liste.push({ datum, name }); };
  const in_ = (...laender: Bundesland[]) => land !== null && laender.includes(land);

  // Bundesweit
  add(iso(jahr, 1, 1),   "Neujahr");
  add(ostern(jahr, -2),  "Karfreitag");
  add(ostern(jahr, 1),   "Ostermontag");
  add(iso(jahr, 5, 1),   "Tag der Arbeit");
  add(ostern(jahr, 39),  "Christi Himmelfahrt");
  add(ostern(jahr, 50),  "Pfingstmontag");
  add(iso(jahr, 10, 3),  "Tag der Deutschen Einheit");
  add(iso(jahr, 12, 25), "1. Weihnachtstag");
  add(iso(jahr, 12, 26), "2. Weihnachtstag");

  // Landesrecht
  add(iso(jahr, 1, 6),   "Heilige Drei Könige", in_("BW", "BY", "ST"));
  add(iso(jahr, 3, 8),   "Internationaler Frauentag",
    (land === "BE" && jahr >= 2019) || (land === "MV" && jahr >= 2023));
  add(ostern(jahr, 0),   "Ostersonntag", in_("BB"));
  add(ostern(jahr, 49),  "Pfingstsonntag", in_("BB"));
  add(ostern(jahr, 60),  "Fronleichnam",
    in_("BW", "BY", "HE", "NW", "RP", "SL") || zusatz.includes("FRONLEICHNAM"));
  add(iso(jahr, 8, 8),   "Augsburger Friedensfest", zusatz.includes("AUGSBURGER_FRIEDENSFEST"));
  add(iso(jahr, 8, 15),  "Mariä Himmelfahrt", in_("SL") || zusatz.includes("MARIAE_HIMMELFAHRT"));
  add(iso(jahr, 9, 20),  "Weltkindertag", land === "TH" && jahr >= 2019);
  add(iso(jahr, 10, 31), "Reformationstag",
    in_("BB", "MV", "SN", "ST", "TH")
    || (in_("HB", "HH", "NI", "SH") && jahr >= 2018)
    || jahr === 2017);   // 500 Jahre Reformation: einmalig bundesweit
  add(iso(jahr, 11, 1),  "Allerheiligen", in_("BW", "BY", "NW", "RP", "SL"));
  add(bussUndBettag(jahr), "Buß- und Bettag", in_("SN"));

  // Einmalige Feiertage
  add(iso(jahr, 5, 8),   "Tag der Befreiung", land === "BE" && (jahr === 2020 || jahr === 2025));

  // Doppelte Daten (z. B. Mariä Himmelfahrt im Saarland + Zusatz) nur einmal
  const gesehen = new Set<string>();
  return liste
    .filter(f => !gesehen.has(f.datum) && gesehen.add(f.datum))
    .sort((a, b) => a.datum.localeCompare(b.datum));
}

/** Name des Feiertags an diesem Kalendertag (JJJJ-MM-TT), sonst null */
export function feiertagAm(
  datum: string,
  land: Bundesland | null,
  zusatz: readonly ZusatzFeiertag[] = [],
): string | null {
  const jahr = Number(datum.slice(0, 4));
  return feiertage(jahr, land, zusatz).find(f => f.datum === datum)?.name ?? null;
}
