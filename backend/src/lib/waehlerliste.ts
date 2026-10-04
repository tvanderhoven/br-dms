/**
 * Wählerliste, Gremiumsgröße und Mindestsitze des Minderheitengeschlechts einer
 * Wahl – ein VORSCHLAG aus den Mitarbeiterdaten zum Wahltag. Die verbindliche
 * Wählerliste stellt der Wahlvorstand auf; Korrekturen (z. B. leitende
 * Angestellte) lassen sich je Wahl als Ausschluss festhalten.
 *
 * ACHTUNG: wie bei den Fristen gilt – nach bestem Wissen aus BetrVG und WO,
 * nicht juristisch geprüft. Grenzwerte stehen mit Paragraf direkt im Code.
 */

import { Beschaeftigungsart, Geschlecht, Prisma, PrismaClient, Wahl, WahlArt, WahlVerfahren } from "@prisma/client";
import defaultPrisma from "./prisma.js";

export interface WaehlerEintrag {
  id:                 string;
  nachname:           string;
  vorname:            string;
  geburtsdatum:       Date | null;
  geschlecht:         Geschlecht | null;
  abteilung:          string | null;
  beschaeftigungsart: Beschaeftigungsart;
  wahlberechtigt:     boolean;
  waehlbar:           boolean;
  hinweise:           string[];
}

export interface Waehlerliste {
  stichtag:        Date;
  waehler:         WaehlerEintrag[];   // wahlberechtigt laut Vorschlag (ohne Ausgeschlossene)
  pruefen:         WaehlerEintrag[];   // nicht entscheidbar (z. B. Geburtsdatum fehlt) – nicht in der Liste
  ausgeschlossen:  WaehlerEintrag[];   // von Hand ausgeschlossen
  anzahl:          { gesamt: number; weiblich: number; maennlich: number; ohneAngabe: number };
  belegschaft:     number;             // Bezugsgröße für die Gremiumsgröße (siehe groesse.grundlage)
  groesse:         { sitze: number; grundlage: string };
  minderheit:      { geschlecht: Geschlecht; mindestsitze: number; frauen: number; maenner: number; losentscheid: boolean } | null;
  verfahren:       { empfehlung: WahlVerfahren; pflicht: boolean; text: string };
  // Nur JAV: dual Studierende unter 25, die bei ausgeschaltetem Schalter nicht mitzählen
  dualNichtGezaehlt: number;
}

/** Vollendete Lebensjahre am Stichtag (Geburtstag am Stichtag zählt mit). */
export function alterAm(geburt: Date, stichtag: Date): number {
  let alter = stichtag.getUTCFullYear() - geburt.getUTCFullYear();
  const vorGeburtstag = stichtag.getUTCMonth() < geburt.getUTCMonth()
    || (stichtag.getUTCMonth() === geburt.getUTCMonth() && stichtag.getUTCDate() < geburt.getUTCDate());
  return vorGeburtstag ? alter - 1 : alter;
}

function plusMonate(d: Date, monate: number): Date {
  const x = new Date(d);
  x.setUTCMonth(x.getUTCMonth() + monate);
  return x;
}

/** § 9 BetrVG – bis 50 nach Wahlberechtigten, darüber nach Arbeitnehmern. */
export function brGroesse(wahlberechtigte: number, arbeitnehmer: number): number {
  if (wahlberechtigte < 5)  return 0;   // nicht betriebsratsfähig (§ 1)
  if (wahlberechtigte <= 20) return 1;
  if (wahlberechtigte <= 50) return 3;
  if (arbeitnehmer <= 100)  return 5;
  const stufen: [number, number][] = [
    [200, 7], [400, 9], [700, 11], [1000, 13], [1500, 15], [2000, 17], [2500, 19],
    [3000, 21], [3500, 23], [4000, 25], [4500, 27], [5000, 29], [6000, 31], [7000, 33], [9000, 35],
  ];
  const treffer = stufen.find(([bis]) => arbeitnehmer <= bis);
  return treffer ? treffer[1] : 35 + 2 * Math.ceil((arbeitnehmer - 9000) / 3000);
}

/** § 62 Abs. 1 BetrVG – nach der Zahl der in § 60 Abs. 1 genannten Arbeitnehmer. */
export function javGroesse(anzahl: number): number {
  if (anzahl < 5) return 0;
  const stufen: [number, number][] = [[20, 1], [50, 3], [150, 5], [300, 7], [500, 9], [700, 11], [1000, 13]];
  return stufen.find(([bis]) => anzahl <= bis)?.[1] ?? 15;
}

/**
 * Mindestsitze des Minderheitengeschlechts nach dem Höchstzahlverfahren (§ 15 Abs. 2
 * BetrVG, § 5 WO; für die JAV § 62 Abs. 3). Erst ab 3 Sitzen, nur bei echter Minderheit.
 */
export function mindestsitze(frauen: number, maenner: number, sitze: number) {
  if (sitze < 3 || frauen === maenner || frauen + maenner === 0) return null;
  const geschlecht = frauen < maenner ? Geschlecht.WEIBLICH : Geschlecht.MAENNLICH;
  const zahlen: { wert: number; g: Geschlecht }[] = [];
  for (let teiler = 1; teiler <= sitze; teiler++) {
    zahlen.push({ wert: frauen / teiler, g: Geschlecht.WEIBLICH });
    zahlen.push({ wert: maenner / teiler, g: Geschlecht.MAENNLICH });
  }
  zahlen.sort((a, b) => b.wert - a.wert || (a.g === geschlecht ? 1 : -1)); // bei Gleichstand Minderheit hinten (Mindestwert)
  const vergeben = zahlen.slice(0, sitze);
  // Gleiche Höchstzahl genau an der Grenze → Los (§ 5 Abs. 2 WO)
  const losentscheid = zahlen[sitze] !== undefined && zahlen[sitze].wert === vergeben[sitze - 1].wert
    && zahlen[sitze].g !== vergeben[sitze - 1].g;
  return { geschlecht, mindestsitze: vergeben.filter(z => z.g === geschlecht).length, frauen, maenner, losentscheid };
}

function verfahrenVorschlag(art: WahlArt, anzahl: number) {
  const wer = art === WahlArt.BR ? "Wahlberechtigte" : "JAV-Wahlberechtigte";
  const grundlage = art === WahlArt.BR ? "§ 14a BetrVG" : "§ 63 Abs. 4 und 5 BetrVG";
  if (anzahl <= 100) {
    return { empfehlung: WahlVerfahren.VEREINFACHT, pflicht: true, text: `${anzahl} ${wer}: vereinfachtes Verfahren ist Pflicht (${grundlage}).` };
  }
  if (anzahl <= 200) {
    return { empfehlung: WahlVerfahren.NORMAL, pflicht: false, text: `${anzahl} ${wer}: normales Verfahren; vereinfacht nur nach Vereinbarung zwischen Wahlvorstand und Arbeitgeber (${grundlage}).` };
  }
  return { empfehlung: WahlVerfahren.NORMAL, pflicht: true, text: `${anzahl} ${wer}: normales Verfahren.` };
}

export async function waehlerlisteBerechnen(
  wahl: Pick<Wahl, "art" | "stimmabgabeAm" | "dualStudierendeAlsAzubis" | "ausgeschlossen">,
  client: PrismaClient | Prisma.TransactionClient = defaultPrisma,
): Promise<Waehlerliste> {
  const stichtag = wahl.stimmabgabeAm;
  const br = wahl.art === WahlArt.BR;
  const ausgeschlossenIds = new Set(wahl.ausgeschlossen);

  // Im Betrieb am Wahltag: eingetreten und nicht ausgetreten
  const mitarbeiter = await client.mitarbeiter.findMany({
    where: {
      AND: [
        { OR: [{ eintritt: null }, { eintritt: { lte: stichtag } }] },
        { OR: [{ austritt: null }, { austritt: { gte: stichtag } }] },
      ],
    },
    include: { abteilung: { select: { name: true } } },
    orderBy: [{ nachname: "asc" }, { vorname: "asc" }],
  });

  const waehler: WaehlerEintrag[] = [], pruefen: WaehlerEintrag[] = [], ausgeschlossen: WaehlerEintrag[] = [];
  let arbeitnehmer = 0;   // Bezugsgröße BR über 50 Wahlberechtigte (§ 9: "Arbeitnehmer")
  let anF = 0, anM = 0;   // Geschlechterverteilung der Belegschaft (§ 15 / § 5 WO)
  let dualNichtGezaehlt = 0;

  for (const m of mitarbeiter) {
    const alter = m.geburtsdatum ? alterAm(m.geburtsdatum, stichtag) : null;
    const azubi = m.beschaeftigungsart === Beschaeftigungsart.AZUBI
      || (wahl.dualStudierendeAlsAzubis && m.beschaeftigungsart === Beschaeftigungsart.DUALER_STUDENT);
    const zeitarbeit = m.beschaeftigungsart === Beschaeftigungsart.ZEITARBEITER;
    const hinweise: string[] = [];
    let wahlberechtigt: boolean | null;   // null = nicht entscheidbar
    let waehlbar = false;

    if (br) {
      // § 7: ab 16; Leiharbeitnehmer bei Einsatz von mehr als 3 Monaten
      wahlberechtigt = alter === null ? true : alter >= 16;
      if (alter === null) hinweise.push("Geburtsdatum fehlt – Alter prüfen (wahlberechtigt ab 16)");
      if (zeitarbeit) hinweise.push("Zeitarbeit: nur wahlberechtigt bei Einsatz von mehr als 3 Monaten (§ 7 Satz 2)");
      // § 8: ab 18 und 6 Monate im Betrieb; Leiharbeitnehmer sind nicht wählbar (§ 14 Abs. 2 AÜG)
      waehlbar = !zeitarbeit && alter !== null && alter >= 18
        && (!m.eintritt || m.eintritt <= plusMonate(stichtag, -6));
    } else {
      // § 60 Abs. 1, § 61 Abs. 1: unter 18, oder zur Berufsausbildung Beschäftigte unter 25
      if (alter === null) {
        wahlberechtigt = azubi ? true : null;
        hinweise.push(azubi ? "Geburtsdatum fehlt – als Auszubildende/r aufgenommen, Alter prüfen (unter 25)" : "Geburtsdatum fehlt – unter 18?");
      } else {
        wahlberechtigt = alter < 18 || (azubi && alter < 25);
      }
      if (m.beschaeftigungsart === Beschaeftigungsart.DUALER_STUDENT && !wahl.dualStudierendeAlsAzubis
          && (alter === null || alter < 25) && !ausgeschlossenIds.has(m.id)) {
        dualNichtGezaehlt++;
      }
      // § 61 Abs. 2: wählbar unter 25; BR-Mitglieder sind ausgeschlossen (nicht geprüft)
      waehlbar = alter !== null && alter < 25;
    }

    const eintrag: WaehlerEintrag = {
      id: m.id, nachname: m.nachname, vorname: m.vorname, geburtsdatum: m.geburtsdatum, geschlecht: m.geschlecht,
      abteilung: m.abteilung?.name ?? null, beschaeftigungsart: m.beschaeftigungsart,
      wahlberechtigt: wahlberechtigt === true, waehlbar, hinweise,
    };

    if (ausgeschlossenIds.has(m.id)) { ausgeschlossen.push(eintrag); continue; }
    if (wahlberechtigt === null) { pruefen.push(eintrag); continue; }

    // Belegschaft für Größe und Geschlechterverteilung: BR = alle Arbeitnehmer, JAV = die § 60-Gruppe
    if (br || wahlberechtigt) {
      arbeitnehmer++;
      if (m.geschlecht === Geschlecht.WEIBLICH) anF++;
      if (m.geschlecht === Geschlecht.MAENNLICH) anM++;
    }
    if (wahlberechtigt) waehler.push(eintrag);
  }

  const anzahl = {
    gesamt:     waehler.length,
    weiblich:   waehler.filter(w => w.geschlecht === Geschlecht.WEIBLICH).length,
    maennlich:  waehler.filter(w => w.geschlecht === Geschlecht.MAENNLICH).length,
    ohneAngabe: waehler.filter(w => !w.geschlecht).length,
  };
  const sitze = br ? brGroesse(anzahl.gesamt, arbeitnehmer) : javGroesse(anzahl.gesamt);
  const grundlage = br
    ? (anzahl.gesamt <= 50 ? `§ 9 BetrVG: ${anzahl.gesamt} Wahlberechtigte` : `§ 9 BetrVG: ${arbeitnehmer} Arbeitnehmer`)
    : `§ 62 Abs. 1 BetrVG: ${anzahl.gesamt} Jugendliche und Auszubildende`;

  return {
    stichtag, waehler, pruefen, ausgeschlossen, anzahl,
    belegschaft: arbeitnehmer,
    groesse: { sitze, grundlage: sitze === 0 ? `${grundlage} – unter 5, kein Gremium zu wählen` : grundlage },
    minderheit: mindestsitze(anF, anM, sitze),
    verfahren: verfahrenVorschlag(wahl.art, anzahl.gesamt),
    dualNichtGezaehlt,
  };
}
