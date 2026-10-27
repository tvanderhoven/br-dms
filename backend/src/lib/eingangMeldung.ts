/**
 * Meldung neuer Eingänge an Vorsitz und Stellvertretung – über das Benachrichtigungssystem
 * (lib/benachrichtigung.ts), einstellbar je Person unter "Mein Konto":
 *
 *  - FRIST_EINGANG: eine Fristsache geht ein (§ 99/§ 102/§ 87). Bei Fristen zählt jeder Tag,
 *    deshalb geht die Mail sofort raus und nicht erst nach 15 Minuten.
 *  - EINGANG: jedes andere neue Dokument. Die Mail kommt nur, wenn die Benachrichtigung
 *    nach 15 Minuten ungelesen ist, gesammelt und höchstens einmal pro Stunde.
 *
 * Wer ein Dokument selbst von Hand hochgeladen hat, weiß schon Bescheid und
 * bekommt dazu keine Benachrichtigung. E-Mail-Anhänge zählen nicht einzeln.
 */

import { BenachrichtigungArt, FristStatus, Role } from "@prisma/client";
import prisma from "./prisma.js";
import { KATEGORIE_LABEL } from "./kategorien.js";
import { benachrichtigen, mailRueckfallSenden } from "./benachrichtigung.js";

/** Empfänger für dieses Dokument: Vorsitz und Stellvertretung, ohne den eigenen Upload */
export async function eingangEmpfaenger(dokument: { hochgeladenVonId: string; inboxQuelle: string | null }) {
  const empfaenger = await prisma.benutzer.findMany({
    where:  { aktiv: true, rolle: { in: [Role.VORSITZ, Role.STELLVERTRETER] } },
    select: { id: true },
  });
  return dokument.inboxQuelle === "UPLOAD"
    ? empfaenger.filter(e => e.id !== dokument.hochgeladenVonId)
    : empfaenger;
}

/**
 * Meldet ein neu eingegangenes Dokument. Fehler landen nur im Log – der Import
 * selbst darf daran nie scheitern.
 */
export async function meldeEingang(dokumentId: string): Promise<void> {
  try {
    const dok = await prisma.dokument.findUnique({
      where:   { id: dokumentId },
      include: {
        fristen:        { where: { status: FristStatus.OFFEN }, select: { id: true } },
        hochgeladenVon: { select: { name: true } },
      },
    });
    if (!dok) return;

    const fristsache = dok.fristen.length > 0;
    const titel      = dok.alias ?? dok.titel;
    const quelle     = dok.inboxQuelle === "WATCHFOLDER" ? "Watch-Folder" : `hochgeladen von ${dok.hochgeladenVon.name}`;
    const empfaenger = await eingangEmpfaenger(dok);

    const gemeldet = await benachrichtigen({
      art:           fristsache ? BenachrichtigungArt.FRIST_EINGANG : BenachrichtigungArt.EINGANG,
      empfaengerIds: empfaenger.map(e => e.id),
      link:          "/eingang",
      betreff:       fristsache ? `Fristsache eingegangen: ${titel}` : `Neu im Dokumenteneingang: ${titel}`,
      inhalt:        `${KATEGORIE_LABEL[dok.kategorie]} · ${quelle}${fristsache ? " – vorläufige Frist angelegt, bitte den Zugang bestätigen." : ""}`,
    });

    // Fristsache: die fällige Mail gleich verschicken, nicht erst im nächsten 5-Minuten-Lauf
    if (fristsache && gemeldet.length > 0) await mailRueckfallSenden();
  } catch (err) {
    console.error("[Eingang] Meldung fehlgeschlagen:", err);
  }
}
