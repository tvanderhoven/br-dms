/**
 * Fristberechnung nach BGB für Beteiligungsfristen des Betriebsrats
 * (§ 99 Abs. 3, § 102 Abs. 2 BetrVG u. a.):
 *
 *  - § 187 Abs. 1 BGB: Der Tag des Zugangs zählt nicht mit.
 *  - § 188 Abs. 1/2 BGB: Die Frist endet mit Ablauf (24:00 Uhr) des letzten Tages;
 *    eine Wochenfrist am gleichnamigen Wochentag der letzten Woche.
 *  - § 193 BGB: Fällt das Fristende auf einen Samstag, Sonntag oder einen am
 *    Erklärungsort gesetzlichen Feiertag, endet die Frist am nächsten Werktag.
 *
 * Alle Kalendertage werden in Europe/Berlin bestimmt – der Server läuft im
 * Container meist in UTC, angezeigt wird im Browser in deutscher Zeit.
 *
 * ACHTUNG: Nach bestem Wissen umgesetzt, nicht juristisch geprüft. Wann ein
 * Schreiben dem Betriebsrat rechtlich *zugegangen* ist (z. B. Einwurf ins
 * BR-Postfach am Samstag), entscheidet nicht dieser Rechner – er bekommt den
 * Zugangszeitpunkt übergeben.
 */

import { type Bundesland, type ZusatzFeiertag, feiertagAm } from "./feiertage.js";

const ZEITZONE = "Europe/Berlin";

const kalendertagFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZEITZONE, year: "numeric", month: "2-digit", day: "2-digit",
});

/** Kalendertag (JJJJ-MM-TT) eines Zeitpunkts in deutscher Zeit */
export function berlinerTag(zeitpunkt: Date): string {
  return kalendertagFormat.format(zeitpunkt);   // en-CA liefert JJJJ-MM-TT
}

/** Kalendertag + n Tage (reine Datumsrechnung, ohne Uhrzeit) */
export function tagPlus(tag: string, n: number): string {
  const [j, m, t] = tag.split("-").map(Number);
  return new Date(Date.UTC(j!, m! - 1, t! + n)).toISOString().slice(0, 10);
}

/** 0 = Sonntag … 6 = Samstag */
function wochentag(tag: string): number {
  const [j, m, t] = tag.split("-").map(Number);
  return new Date(Date.UTC(j!, m! - 1, t!)).getUTCDay();
}

/** Zeitpunkt 23:59:59.999 deutscher Zeit an diesem Kalendertag */
export function tagesende(tag: string): Date {
  const [j, m, t] = tag.split("-").map(Number);
  const alsUtc = Date.UTC(j!, m! - 1, t!, 23, 59, 59, 999);
  // Abstand Berlin ↔ UTC zu diesem Zeitpunkt (um Mitternacht gibt es keine Zeitumstellung)
  const teile = new Intl.DateTimeFormat("en-US", {
    timeZone: ZEITZONE, hourCycle: "h23",
    year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric",
  }).formatToParts(new Date(alsUtc));
  const w = (typ: string) => Number(teile.find(p => p.type === typ)!.value);
  const wandzeit = Date.UTC(w("year"), w("month") - 1, w("day"), w("hour"), w("minute"), w("second"), 999);
  return new Date(alsUtc - (wandzeit - alsUtc));
}

export interface FeiertagsKalender {
  bundesland: Bundesland | null;   // null = nur bundesweite Feiertage
  zusatz?:    readonly ZusatzFeiertag[];
}

/** Grund, warum an diesem Tag keine Frist enden kann – null bei Werktag */
export function keinWerktag(tag: string, kalender: FeiertagsKalender): string | null {
  const wt = wochentag(tag);
  if (wt === 6) return "Samstag";
  if (wt === 0) return "Sonntag";
  return feiertagAm(tag, kalender.bundesland, kalender.zusatz);
}

export interface FristDauer {
  tage?:   number;
  wochen?: number;
}

export interface Fristende {
  ende:            Date;     // 23:59:59.999 deutscher Zeit am letzten Tag
  letzterTag:      string;   // JJJJ-MM-TT nach Verschiebung
  rechnerischerTag: string;  // JJJJ-MM-TT vor Verschiebung nach § 193 BGB
  /** Übersprungene Tage mit Grund, z. B. [{ tag: "2026-10-31", grund: "Samstag" }] */
  verschoben:      Array<{ tag: string; grund: string }>;
}

/**
 * Fristende für eine Ereignisfrist ab Zugang.
 * Beispiel: Zugang Donnerstag, 3 Tage → rechnerisch Sonntag → Ende Montag 24:00 Uhr.
 */
export function berechneFristende(
  zugang: Date,
  dauer: FristDauer,
  kalender: FeiertagsKalender,
): Fristende {
  const tage = (dauer.tage ?? 0) + 7 * (dauer.wochen ?? 0);
  if (!Number.isInteger(tage) || tage <= 0) throw new Error(`Ungültige Fristdauer: ${JSON.stringify(dauer)}`);

  // § 187 Abs. 1 + § 188 Abs. 1/2: Zugangstag + n Kalendertage (bei Wochen gleichnamiger Wochentag)
  const rechnerischerTag = tagPlus(berlinerTag(zugang), tage);

  // § 193: auf den nächsten Werktag schieben
  const verschoben: Fristende["verschoben"] = [];
  let tag = rechnerischerTag;
  for (let grund = keinWerktag(tag, kalender); grund; grund = keinWerktag(tag, kalender)) {
    verschoben.push({ tag, grund });
    tag = tagPlus(tag, 1);
  }

  return { ende: tagesende(tag), letzterTag: tag, rechnerischerTag, verschoben };
}
