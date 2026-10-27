/**
 * Sitzung per Video/Telefon (§ 30 Abs. 2 BetrVG, Roadmap Paket 6)
 *
 *  - Die Geschäftsordnung legt fest, ob und unter welchen Bedingungen zugeschaltet werden darf
 *    (Nr. 1, Vorrang der Präsenzsitzung). Maßgeblich ist die neueste Fassung.
 *  - Form der Sitzung: Präsenz · Präsenz mit Zuschaltung · reine Video-/Telefonsitzung –
 *    anders als Präsenz nur, wenn die Geschäftsordnung es erlaubt.
 *  - Widerspruch (Nr. 2): Widerspricht mindestens ein Viertel der Mitglieder binnen der vom
 *    Vorsitz bestimmten Frist, ist die Zuschaltung für diese Sitzung gesperrt.
 *  - Zugeschaltete gelten als anwesend (§ 33 Abs. 1 S. 2) und bestätigen ihre Teilnahme in
 *    Textform (§ 34 Abs. 1 S. 4) – hier per Klick, die Bestätigungen kommen als Anlage ins Protokoll.
 *
 * Nicht juristisch geprüft – offen: Reicht der Klick als Textform? Gelten Widerspruch und
 * Vorrang der Präsenz auch für die konstituierende Sitzung?
 */

import { Role, SitzungForm, Teilnahmeart } from "@prisma/client";
import prisma from "./prisma.js";
import { sollStaerkeErmitteln } from "./beschlussfaehigkeit.js";
import { benachrichtigen, sitzungLink } from "./benachrichtigung.js";

export const SITZUNG_FORM_LABEL: Record<SitzungForm, string> = {
  PRAESENZ:    "Präsenzsitzung",
  ZUSCHALTUNG: "Präsenzsitzung mit Zuschaltung per Video/Telefon",
  VIDEO:       "Sitzung per Video-/Telefonkonferenz",
};

export const TEILNAHMEART_LABEL: Record<Teilnahmeart, string> = {
  VOR_ORT: "vor Ort",
  VIDEO:   "per Video",
  TELEFON: "per Telefon",
};

/** Vermerk im Protokoll, sobald jemand zugeschaltet war */
export const PROTOKOLL_VERMERK =
  "Teilnahme per Video- bzw. Telefonkonferenz nach § 30 Abs. 2 BetrVG. Eine Aufzeichnung der Sitzung erfolgte nicht; "
  + "es war sichergestellt, dass Dritte vom Inhalt der Sitzung keine Kenntnis nehmen konnten.";

export const istZugeschaltet = (art: Teilnahmeart) => art === Teilnahmeart.VIDEO || art === Teilnahmeart.TELEFON;

export const istSitzungForm = (wert: unknown): wert is SitzungForm =>
  typeof wert === "string" && (Object.values(SitzungForm) as string[]).includes(wert);

export const istTeilnahmeart = (wert: unknown): wert is Teilnahmeart =>
  typeof wert === "string" && (Object.values(Teilnahmeart) as string[]).includes(wert);

export interface VideoRegeln {
  /** Gibt es überhaupt eine Geschäftsordnung? */
  goVorhanden:     boolean;
  erlaubt:         boolean;
  nichtVertraulich: boolean;
  bedingungen:     string | null;
  beschlossenAm:   Date | null;
}

/** Regeln aus der neuesten Fassung der Geschäftsordnung */
export async function videoRegeln(): Promise<VideoRegeln> {
  const go = await prisma.geschaeftsordnung.findFirst({
    orderBy: { beschlossenAm: "desc" },
    select:  { beschlossenAm: true, videoErlaubt: true, videoNichtVertraulich: true, videoBedingungen: true },
  });
  return {
    goVorhanden:      !!go,
    erlaubt:          go?.videoErlaubt ?? false,
    nichtVertraulich: go?.videoNichtVertraulich ?? false,
    bedingungen:      go?.videoBedingungen ?? null,
    beschlossenAm:    go?.beschlossenAm ?? null,
  };
}

/** „Mindestens ein Viertel der Mitglieder“ – bei 9 Mitgliedern also 3 */
export function widerspruchSchwelle(sollStaerke: number): number {
  return Math.max(1, Math.ceil(sollStaerke / 4));
}

/**
 * Jetzt als Ortszeit in den UTC-Feldern – so liegen Sitzungszeit und Widerspruchsfrist in der
 * Datenbank ("wie eingegeben", siehe lib/kalender.ts), nur so lassen sie sich vergleichen.
 */
export function ortszeitJetzt(jetzt = new Date()): Date {
  const t = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(jetzt).map(p => [p.type, p.value]));
  return new Date(Date.UTC(+t.year!, +t.month! - 1, +t.day!, +t.hour!, +t.minute!, +t.second!));
}

/** Wer darf widersprechen? Mitglieder des Betriebsrats – geladene Ersatzmitglieder treten an ihre Stelle */
export async function darfWidersprechen(sitzungId: string, benutzer: { sub: string; rolle: Role }): Promise<boolean> {
  if (benutzer.rolle === Role.VORSITZ || benutzer.rolle === Role.STELLVERTRETER || benutzer.rolle === Role.MITGLIED) return true;
  if (benutzer.rolle !== Role.ERSATZMITGLIED) return false;
  const geladen = await prisma.anwesenheit.findFirst({
    where:  { sitzungId, benutzerId: benutzer.sub, status: "ERSATZ_FUER" },
    select: { id: true },
  });
  return !!geladen;
}

export interface WiderspruchStand {
  anzahl:      number;
  sollStaerke: number;
  schwelle:    number;
  /** Zuschaltung wegen Widerspruchs gesperrt */
  gesperrt:    boolean;
}

export async function widerspruchStand(sitzungId: string): Promise<WiderspruchStand> {
  const [anzahl, sollStaerke] = await Promise.all([
    prisma.sitzungWiderspruch.count({ where: { sitzungId } }),
    sollStaerkeErmitteln(),
  ]);
  const schwelle = widerspruchSchwelle(sollStaerke);
  return { anzahl, sollStaerke, schwelle, gesperrt: anzahl >= schwelle };
}

/** Darf in dieser Sitzung (noch) jemand zugeschaltet werden? null = ja, sonst der Grund */
export async function zuschaltungGesperrt(sitzungId: string): Promise<string | null> {
  const sitzung = await prisma.sitzung.findUnique({ where: { id: sitzungId }, select: { form: true } });
  if (!sitzung) return "Sitzung nicht gefunden";
  if (sitzung.form === SitzungForm.PRAESENZ) return "Die Sitzung ist als Präsenzsitzung angesetzt – Zuschaltung ist nicht vorgesehen";
  const stand = await widerspruchStand(sitzungId);
  if (stand.gesperrt) {
    return `Mindestens ein Viertel der Mitglieder hat der Zuschaltung widersprochen (${stand.anzahl} von ${stand.sollStaerke}) – Teilnahme nur vor Ort (§ 30 Abs. 2 Nr. 2 BetrVG)`;
  }
  return null;
}

/**
 * Zugeschaltete an die Bestätigung in Textform erinnern (§ 34 Abs. 1 S. 4) – beim Start des Protokolls
 * für alle, sonst für die eine Person, die gerade als zugeschaltet eingetragen wurde.
 */
export async function teilnahmeBestaetigungAnfordern(sitzungId: string, benutzerId: string | null, ausloeserId: string): Promise<void> {
  const offen = await prisma.anwesenheit.findMany({
    where: {
      sitzungId,
      ...(benutzerId ? { benutzerId } : {}),
      status:       { in: ["ANWESEND", "ERSATZ_FUER"] },
      teilnahmeart: { in: [Teilnahmeart.VIDEO, Teilnahmeart.TELEFON] },
      teilnahmeBestaetigtAm: null,
    },
    select: { benutzerId: true, sitzung: { select: { titel: true } } },
  });
  if (offen.length === 0) return;
  await benachrichtigen({
    art: "TEILNAHME_BESTAETIGEN", empfaengerIds: offen.map(o => o.benutzerId), ausloeserId, sitzungId,
    link: sitzungLink(sitzungId),
    betreff: `Teilnahme bestätigen: ${offen[0]!.sitzung.titel}`,
    inhalt:  `Du warst zur Sitzung „${offen[0]!.sitzung.titel}“ zugeschaltet. Bitte bestätige deine Teilnahme in BR-DMS `
      + "(§ 34 Abs. 1 BetrVG) – die Bestätigung kommt als Anlage ins Protokoll.",
  });
}

// ── Standardlinks (Einstellungen → System) ──────────────────────────
// Der Sitzungslink gilt für die Mitglieder, der Gästelink ist ein getrennter Raum: Gäste sind nur
// bei ihrem TOP dabei und dürfen den Rest der nicht öffentlichen Sitzung (§ 30 Abs. 1) nicht hören.
export const VIDEO_STANDARD_LINK = "video.standard_link";
export const VIDEO_GAESTE_LINK   = "video.gaeste_link";

export const istEinwahlLink = (wert: string) => /^https?:\/\/\S+$/.test(wert.trim());

export async function videoLinks(): Promise<{ sitzungLink: string; gaesteLink: string }> {
  const e = await prisma.systemEinstellung.findMany({ where: { schluessel: { in: [VIDEO_STANDARD_LINK, VIDEO_GAESTE_LINK] } } });
  const wert = (k: string) => e.find(x => x.schluessel === k)?.wert.trim() ?? "";
  return { sitzungLink: wert(VIDEO_STANDARD_LINK), gaesteLink: wert(VIDEO_GAESTE_LINK) };
}

/**
 * Link in der Gästemail: nur bei virtueller Sitzung und solange die Zuschaltung nicht gesperrt ist.
 * eingabe: undefined = Standardgästelink, "" = bewusst keiner. Nie der Sitzungslink.
 */
export function gastEinwahl(
  sitzung: { form: SitzungForm; zuschaltungGesperrt: boolean },
  eingabe: string | undefined,
  standardGaesteLink: string,
): string | null {
  if (sitzung.form === SitzungForm.PRAESENZ || sitzung.zuschaltungGesperrt) return null;
  return (eingabe ?? standardGaesteLink).trim() || null;
}
