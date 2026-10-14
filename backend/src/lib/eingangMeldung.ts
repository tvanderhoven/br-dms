/**
 * Mails an Vorsitz und Stellvertretung über neue Eingänge (Issue #25/#26):
 *
 *  - Sofortmeldung, wenn eine Fristsache eingeht – bei § 99/§ 102 zählt jeder
 *    Tag, deshalb nicht erst in der Fristen-Erinnerung um 07:00 Uhr.
 *  - Stündliche Sammelmail über alle übrigen neuen Eingänge (workers/eingang.worker.ts),
 *    nur wenn tatsächlich etwas eingegangen ist.
 *
 * Wer ein Dokument selbst von Hand hochgeladen hat, weiß schon Bescheid und
 * bekommt dazu keine Mail. Beides abschaltbar unter Einstellungen → Löschfristen.
 */

import { DokumentStatus, FristStatus, Role } from "@prisma/client";
import prisma from "./prisma.js";
import { KATEGORIE_LABEL } from "./kategorien.js";
import { type EingangEintrag, sendeEingangSammelmail, sendeFristsacheEingang } from "./mailer.js";

export const EINGANG_SOFORTMAIL_AKTIV = "eingang.sofortmail_aktiv";
export const EINGANG_SAMMELMAIL_AKTIV = "eingang.sammelmail_aktiv";
/** Bis zu welchem Zeitpunkt (ISO) Eingänge schon gemeldet wurden */
const EINGANG_SAMMELMAIL_STAND = "eingang.sammelmail_stand";

async function schalter(schluessel: string): Promise<boolean> {
  const e = await prisma.systemEinstellung.findUnique({ where: { schluessel } });
  return e?.wert !== "false";
}

export const sofortmailAktiv = () => schalter(EINGANG_SOFORTMAIL_AKTIV);
export const sammelmailAktiv = () => schalter(EINGANG_SAMMELMAIL_AKTIV);

const quelleText = (d: { inboxQuelle: string | null; hochgeladenVon: { name: string } }) =>
  d.inboxQuelle === "WATCHFOLDER" ? "Watch-Folder" : `hochgeladen von ${d.hochgeladenVon.name}`;

/** Empfänger der Sofortmeldung für dieses Dokument (ohne Mailversand) */
export async function fristsacheEmpfaenger(dokument: { hochgeladenVonId: string; inboxQuelle: string | null }) {
  const empfaenger = await prisma.benutzer.findMany({
    where:  { aktiv: true, rolle: { in: [Role.VORSITZ, Role.STELLVERTRETER] } },
    select: { id: true, email: true, name: true },
  });
  return dokument.inboxQuelle === "UPLOAD"
    ? empfaenger.filter(e => e.id !== dokument.hochgeladenVonId)
    : empfaenger;
}

/** Fehler landen nur im Log – der Import selbst darf daran nie scheitern. */
export async function meldeFristsache(dokumentId: string): Promise<void> {
  if (!process.env.SMTP_HOST || !(await sofortmailAktiv())) return;

  const dok = await prisma.dokument.findUnique({
    where:   { id: dokumentId },
    include: {
      fristen:        { where: { status: FristStatus.OFFEN }, orderBy: { faelligAm: "asc" } },
      hochgeladenVon: { select: { name: true } },
    },
  });
  if (!dok || dok.fristen.length === 0) return;

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const mail = {
    titel:           dok.alias ?? dok.titel,
    kategorie:       KATEGORIE_LABEL[dok.kategorie],
    quelle:          quelleText(dok),
    zugangVorschlag: dok.zugangAm ?? dok.erstelltAm,
    fristen:         dok.fristen.map(f => ({ typ: f.typ, faelligAm: f.faelligAm })),
    url:             `${appUrl}/eingang`,
  };

  for (const e of await fristsacheEmpfaenger(dok)) {
    try {
      await sendeFristsacheEingang(e.email, e.name, mail);
    } catch (err) {
      console.error(`[Eingang] Sofortmail an ${e.email} fehlgeschlagen:`, err);
    }
  }
}

export interface SammelmeldungErgebnis {
  dokumente:  number;
  gesendetAn: string[];
}

type Sender = (email: string, name: string, eintraege: EingangEintrag[], url: string) => Promise<void>;

/**
 * Meldet alle Dokumente, die seit dem letzten Lauf eingegangen und noch ungelesen
 * sind – ohne E-Mail-Anhänge und ohne Fristsachen, solange es dafür die
 * Sofortmail gibt. Der Stand rückt immer vor, auch wenn die Mail aus ist oder
 * fehlschlägt: Beim Einschalten kommt keine Flut alter Eingänge.
 */
export async function sammelmeldungSenden(
  optionen: { jetzt?: Date; senden?: Sender } = {},
): Promise<SammelmeldungErgebnis> {
  const jetzt  = optionen.jetzt ?? new Date();
  const senden = optionen.senden ?? sendeEingangSammelmail;
  const ergebnis: SammelmeldungErgebnis = { dokumente: 0, gesendetAn: [] };

  const stand = await prisma.systemEinstellung.findUnique({ where: { schluessel: EINGANG_SAMMELMAIL_STAND } });
  await prisma.systemEinstellung.upsert({
    where:  { schluessel: EINGANG_SAMMELMAIL_STAND },
    update: { wert: jetzt.toISOString() },
    create: { schluessel: EINGANG_SAMMELMAIL_STAND, wert: jetzt.toISOString() },
  });

  // Erster Lauf: nur den Stand setzen
  const seit = stand ? new Date(stand.wert) : null;
  if (!seit || Number.isNaN(seit.getTime())) return ergebnis;
  if (!(await sammelmailAktiv())) return ergebnis;
  if (!optionen.senden && !process.env.SMTP_HOST) return ergebnis;

  const fristsachenAusnehmen = await sofortmailAktiv();
  const dokumente = await prisma.dokument.findMany({
    where: {
      erstelltAm:       { gt: seit, lte: jetzt },
      inboxGelesen:     false,
      quelleDokumentId: null,
      status:           { not: DokumentStatus.GELOESCHT },
      ...(fristsachenAusnehmen ? { fristen: { none: {} } } : {}),
    },
    include: { hochgeladenVon: { select: { name: true } } },
    orderBy: { erstelltAm: "asc" },
  });
  ergebnis.dokumente = dokumente.length;
  if (dokumente.length === 0) return ergebnis;

  const empfaenger = await prisma.benutzer.findMany({
    where:  { aktiv: true, rolle: { in: [Role.VORSITZ, Role.STELLVERTRETER] } },
    select: { id: true, email: true, name: true },
  });
  const url = `${process.env.APP_URL ?? "http://localhost:3000"}/eingang`;

  for (const e of empfaenger) {
    const eintraege = dokumente
      .filter(d => !(d.inboxQuelle === "UPLOAD" && d.hochgeladenVonId === e.id))
      .map(d => ({ titel: d.alias ?? d.titel, kategorie: KATEGORIE_LABEL[d.kategorie], quelle: quelleText(d), eingangAm: d.erstelltAm }));
    if (eintraege.length === 0) continue;
    try {
      await senden(e.email, e.name, eintraege, url);
      ergebnis.gesendetAn.push(e.email);
    } catch (err) {
      console.error(`[Eingang] Sammelmail an ${e.email} fehlgeschlagen:`, err);
    }
  }
  return ergebnis;
}
