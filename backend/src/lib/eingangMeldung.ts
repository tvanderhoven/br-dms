/**
 * Sofortmeldung an Vorsitz und Stellvertretung, wenn eine Fristsache eingeht
 * (Issue #25/#26): Bei § 99/§ 102 zählt jeder Tag, deshalb nicht erst in der
 * täglichen Fristen-Erinnerung um 07:00 Uhr.
 *
 * Wer das Dokument selbst von Hand hochgeladen hat, weiß schon Bescheid und
 * bekommt keine Mail. Abschaltbar unter Einstellungen → Löschfristen.
 */

import { FristStatus, Role } from "@prisma/client";
import prisma from "./prisma.js";
import { KATEGORIE_LABEL } from "./kategorien.js";
import { sendeFristsacheEingang } from "./mailer.js";

export const EINGANG_SOFORTMAIL_AKTIV = "eingang.sofortmail_aktiv";

export async function sofortmailAktiv(): Promise<boolean> {
  const e = await prisma.systemEinstellung.findUnique({ where: { schluessel: EINGANG_SOFORTMAIL_AKTIV } });
  return e?.wert !== "false";
}

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
    quelle:          dok.inboxQuelle === "WATCHFOLDER" ? "Watch-Folder" : `hochgeladen von ${dok.hochgeladenVon.name}`,
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
