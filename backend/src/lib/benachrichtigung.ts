/**
 * Benachrichtigungen im System, E-Mail als Rückfall (Roadmap Paket 2)
 *
 *  - Jede Benachrichtigung entsteht als interne Nachricht (Modell Nachricht, art gesetzt).
 *  - Ist sie nach 15 Minuten noch ungelesen und war die Person seitdem nicht in BR-DMS,
 *    geht eine E-Mail raus (workers/benachrichtigung.worker.ts). Mehrere fällige
 *    Benachrichtigungen kommen als eine Sammelmail, höchstens eine Mail pro Stunde.
 *  - Die Mail nennt nur Art und Link, keine Inhalte – wie die datensparsame Einladung.
 *  - "Zuletzt aktiv" schreibt das Frontend über POST /api/konto/aktiv mit (nur bei
 *    sichtbarem Tab). Das bleibt intern: kein Online-Status für andere (§ 87 Abs. 1 Nr. 6).
 *  - JAV, SBV und Externe erreichen den Posteingang nicht (middleware/auth.ts) –
 *    bei ihnen ist die Mail sofort fällig.
 *
 * Je Art wählt jede Person in "Mein Konto": aus / nur im System / mit E-Mail.
 */

import { BenachrichtigungArt, Prisma, Role } from "@prisma/client";
import prisma from "./prisma.js";
import { istTechnikAdmin } from "./adminZugriff.js";
import { berlinerTag, tagesende, tagPlus } from "./fristRechner.js";
import { sendeBenachrichtigungMail, type BenachrichtigungMailEintrag } from "./mailer.js";

export type BenachrichtigungStufe = "AUS" | "SYSTEM" | "EMAIL";
export const STANDARD_STUFE: BenachrichtigungStufe = "EMAIL";

export const BENACHRICHTIGUNG_LABEL: Record<BenachrichtigungArt, string> = {
  AUFGABE_ZUGEWIESEN:     "Aufgabe zugewiesen",
  AUFGABE_FAELLIG:        "Aufgabe heute fällig",
  ERSATZ_GELADEN:         "Ladung als Ersatzmitglied",
  PROTOKOLL_UNTERSCHRIFT: "Protokoll zur Unterschrift bereit",
  PROTOKOLLFUEHRUNG:      "Als Protokollführung eingetragen",
  ERWAEHNUNG:             "Erwähnung in einem Kommentar",
  KOMMENTAR_ANTWORT:      "Neuer Kommentar, wo du mitdiskutierst",
  KUMMERKASTEN:           "Neuer Kummerkasten-Eintrag",
};

/** Welche Arten eine Rolle überhaupt bekommen kann (für "Mein Konto" und als Schutz beim Anlegen) */
export function artenFuerRolle(rolle: Role): BenachrichtigungArt[] {
  const alle = Object.keys(BENACHRICHTIGUNG_LABEL) as BenachrichtigungArt[];
  if (rolle === Role.EXTERN) return [BenachrichtigungArt.PROTOKOLLFUEHRUNG];
  return alle.filter(a => a !== BenachrichtigungArt.KUMMERKASTEN || rolle === Role.VORSITZ || rolle === Role.STELLVERTRETER);
}

/** Rollen ohne Posteingang – dort ist die Mail der einzige Weg */
const OHNE_POSTEINGANG: Role[] = [Role.JAV, Role.SBV, Role.EXTERN];

export const MAIL_WARTEZEIT_MS  = 15 * 60_000;
export const MAIL_ABSTAND_MS    = 60 * 60_000;
/** So oft schreibt das Frontend höchstens "zuletzt aktiv" in die Datenbank */
const AKTIV_SCHREIBEN_AB_MS     = 2 * 60_000;

export function stufeLesen(einstellungen: Prisma.JsonValue | null | undefined, art: BenachrichtigungArt): BenachrichtigungStufe {
  const wert = einstellungen && typeof einstellungen === "object" && !Array.isArray(einstellungen)
    ? (einstellungen as Record<string, unknown>)[art]
    : undefined;
  return wert === "AUS" || wert === "SYSTEM" || wert === "EMAIL" ? wert : STANDARD_STUFE;
}

export interface BenachrichtigungEingabe {
  art:          BenachrichtigungArt;
  empfaengerIds: string[];
  betreff:      string;
  inhalt:       string;
  /** Pfad in der App, z. B. /sitzungen?id=… */
  link:         string;
  /** Wer die Benachrichtigung ausgelöst hat – bekommt selbst keine */
  ausloeserId?: string | null;
  sitzungId?:   string | null;
}

/**
 * Legt die Benachrichtigungen an. Fehler landen nur im Log – die auslösende
 * Aktion (Aufgabe speichern, Kommentar schreiben …) darf daran nie scheitern.
 * Rückgabe: IDs der Empfänger, die tatsächlich eine bekommen haben.
 */
export async function benachrichtigen(e: BenachrichtigungEingabe, jetzt = new Date()): Promise<string[]> {
  try {
    const ids = [...new Set(e.empfaengerIds)].filter(id => id && id !== e.ausloeserId);
    if (ids.length === 0) return [];

    const empfaenger = await prisma.benutzer.findMany({
      where:  { id: { in: ids }, aktiv: true },
      select: { id: true, rolle: true, benachrichtigungen: true },
    });

    const daten: Prisma.NachrichtCreateManyInput[] = [];
    for (const b of empfaenger) {
      if (!artenFuerRolle(b.rolle).includes(e.art)) continue;
      if (await istTechnikAdmin(b.rolle)) continue; // Admin ohne Inhaltszugriff: keine Inhaltsereignisse
      const stufe = stufeLesen(b.benachrichtigungen, e.art);
      if (stufe === "AUS") continue;
      const mailFaelligAb = stufe === "EMAIL"
        ? (OHNE_POSTEINGANG.includes(b.rolle) ? jetzt : new Date(jetzt.getTime() + MAIL_WARTEZEIT_MS))
        : null;
      daten.push({
        betreff:      e.betreff,
        inhalt:       e.inhalt,
        typ:          "SYSTEM",
        art:          e.art,
        link:         e.link,
        empfaengerId: b.id,
        absenderId:   e.ausloeserId ?? null,
        sitzungId:    e.sitzungId ?? null,
        mailFaelligAb,
        erstelltAm:   jetzt,
      });
    }
    if (daten.length) await prisma.nachricht.createMany({ data: daten });
    return daten.map(d => d.empfaengerId);
  } catch (err) {
    console.error(`[Benachrichtigung] ${e.art} fehlgeschlagen:`, err);
    return [];
  }
}

/** "Zuletzt aktiv" mitschreiben – höchstens alle zwei Minuten ein Schreibzugriff */
export async function aktivMelden(benutzerId: string, jetzt = new Date()): Promise<void> {
  await prisma.benutzer.updateMany({
    where: {
      id: benutzerId,
      OR: [{ zuletztAktiv: null }, { zuletztAktiv: { lt: new Date(jetzt.getTime() - AKTIV_SCHREIBEN_AB_MS) } }],
    },
    data: { zuletztAktiv: jetzt },
  });
}

export interface MailRueckfallErgebnis {
  gesendetAn:  string[];
  /** Nachrichten, deren Mail entfallen ist (gelesen oder Person war inzwischen da) */
  entfallen:   number;
}

type Sender = (email: string, name: string, eintraege: BenachrichtigungMailEintrag[]) => Promise<void>;

/**
 * Verschickt die fälligen Rückfall-Mails (Aufruf aus dem Worker alle 5 Minuten).
 *
 * Eine Mail entfällt, wenn die Nachricht inzwischen gelesen ist oder die Person nach
 * dem Eingang in BR-DMS war – sie hat die Benachrichtigung dann im System gesehen.
 * Wer in der letzten Stunde schon eine Mail bekommen hat, wartet bis zur nächsten;
 * bis dahin fällige Benachrichtigungen kommen gesammelt in einer Mail.
 */
export async function mailRueckfallSenden(
  optionen: { jetzt?: Date; senden?: Sender } = {},
): Promise<MailRueckfallErgebnis> {
  const jetzt  = optionen.jetzt ?? new Date();
  const senden = optionen.senden ?? sendeBenachrichtigungMail;
  const ergebnis: MailRueckfallErgebnis = { gesendetAn: [], entfallen: 0 };
  if (!optionen.senden && !process.env.SMTP_HOST) return ergebnis;

  const faellig = await prisma.nachricht.findMany({
    where:   { mailFaelligAb: { lte: jetzt }, mailGesendetAm: null, art: { not: null } },
    select:  {
      id: true, art: true, link: true, gelesen: true, erstelltAm: true,
      empfaenger: { select: { id: true, name: true, email: true, rolle: true, aktiv: true, zuletztAktiv: true } },
    },
    orderBy: { erstelltAm: "asc" },
  });

  const entfallen: string[] = [];
  const jePerson = new Map<string, typeof faellig>();
  for (const n of faellig) {
    const p = n.empfaenger;
    const warDa = !OHNE_POSTEINGANG.includes(p.rolle) && p.zuletztAktiv != null && p.zuletztAktiv > n.erstelltAm;
    if (n.gelesen || !p.aktiv || warDa) { entfallen.push(n.id); continue; }
    jePerson.set(p.id, [...(jePerson.get(p.id) ?? []), n]);
  }
  if (entfallen.length) {
    await prisma.nachricht.updateMany({ where: { id: { in: entfallen } }, data: { mailFaelligAb: null } });
    ergebnis.entfallen = entfallen.length;
  }

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  for (const [personId, nachrichten] of jePerson) {
    const letzte = await prisma.nachricht.findFirst({
      where:   { empfaengerId: personId, mailGesendetAm: { not: null } },
      orderBy: { mailGesendetAm: "desc" },
      select:  { mailGesendetAm: true },
    });
    if (letzte?.mailGesendetAm && jetzt.getTime() - letzte.mailGesendetAm.getTime() < MAIL_ABSTAND_MS) continue;

    const p = nachrichten[0].empfaenger;
    const eintraege = nachrichten.map(n => ({
      art:  BENACHRICHTIGUNG_LABEL[n.art!],
      url:  `${appUrl}${n.link ?? "/posteingang"}`,
      zeit: n.erstelltAm,
    }));
    try {
      await senden(p.email, p.name, eintraege);
      await prisma.nachricht.updateMany({
        where: { id: { in: nachrichten.map(n => n.id) } },
        data:  { mailGesendetAm: jetzt },
      });
      ergebnis.gesendetAn.push(p.email);
    } catch (err) {
      // Bleibt fällig – der nächste Lauf versucht es erneut
      console.error(`[Benachrichtigung] Mail an ${p.email} fehlgeschlagen:`, err);
    }
  }
  return ergebnis;
}

/**
 * Morgendliche Benachrichtigung für Aufgaben, die heute fällig sind (Worker um 07:00).
 * Empfänger: wem die Aufgabe zugewiesen ist, sonst wer sie angelegt hat. Läuft der
 * Worker doppelt (Neustart), verhindert der Abgleich mit den heutigen Nachrichten Dubletten.
 */
export async function faelligeAufgabenMelden(jetzt = new Date()): Promise<number> {
  const heute = berlinerTag(jetzt);
  const von = tagesende(tagPlus(heute, -1));
  const bis = tagesende(heute);
  const aufgaben = await prisma.aufgabe.findMany({
    where:  { erledigt: false, typ: "AUFGABE", faelligAm: { gt: von, lte: bis } },
    select: { id: true, titel: true, zugewiesenAnId: true, erstelltVonId: true },
  });
  if (aufgaben.length === 0) return 0;

  const schon = await prisma.nachricht.findMany({
    where:  { art: BenachrichtigungArt.AUFGABE_FAELLIG, erstelltAm: { gt: von, lte: bis } },
    select: { empfaengerId: true, link: true },
  });
  const gemeldet = new Set(schon.map(n => `${n.empfaengerId}|${n.link}`));

  let anzahl = 0;
  for (const a of aufgaben) {
    const empfaenger = a.zugewiesenAnId ?? a.erstelltVonId;
    const link = aufgabeLink(a.id);
    if (!empfaenger || gemeldet.has(`${empfaenger}|${link}`)) continue;
    const r = await benachrichtigen({
      art: BenachrichtigungArt.AUFGABE_FAELLIG, empfaengerIds: [empfaenger], link,
      betreff: `Aufgabe heute fällig: ${a.titel}`,
      inhalt:  `Die Aufgabe „${a.titel}“ ist heute fällig.`,
    }, jetzt);
    anzahl += r.length;
  }
  return anzahl;
}

export const aufgabeLink  = (id: string) => `/aufgaben?aufgabe=${id}`;
export const sitzungLink  = (id: string) => `/sitzungen?id=${id}`;
export const dokumentLink = (id: string) => `/dokumente?dokument=${id}`;
