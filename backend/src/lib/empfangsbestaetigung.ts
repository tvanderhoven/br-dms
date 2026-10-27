/**
 * Empfangsbestätigung an den Arbeitgeber (Issue #26): Nach bestätigtem Zugang
 * (lib/zugang.ts) schickt Vorsitz/Stellvertretung per Knopfdruck eine Bestätigung
 * mit dem Zugangszeitpunkt – damit ist der Fristbeginn auch für die Gegenseite
 * dokumentiert. Der Text ist ein Vorschlag und wird vor dem Senden bearbeitet.
 *
 * Empfänger: Einstellung "eingang.hr_adresse" (Einstellungen → Löschfristen),
 * im Dialog änderbar. Die absendende Person bekommt eine Kopie.
 */

import { AuditAktion, DokumentStatus } from "@prisma/client";
import prisma from "./prisma.js";
import { KATEGORIE_LABEL } from "./kategorien.js";
import { istEmailAdresse } from "./emailAdresse.js";
import { sendeEmpfangsbestaetigung } from "./mailer.js";
import { signaturenLaden, signaturText } from "./signaturen.js";

export const EINGANG_HR_ADRESSE = "eingang.hr_adresse";

const ROLLE_TITEL: Record<string, string> = {
  VORSITZ:        "Vorsitz des Betriebsrats",
  STELLVERTRETER: "Stellv. Vorsitz des Betriebsrats",
};

export class EmpfangsbestaetigungFehler extends Error {}

export async function hrAdresse(): Promise<string> {
  return (await prisma.systemEinstellung.findUnique({ where: { schluessel: EINGANG_HR_ADRESSE } }))?.wert.trim() ?? "";
}

export interface EntwurfDaten {
  titel:                  string;
  kategorie:              string;
  zugangAm:               Date;
  unterlagenVollstaendig: boolean | null;
  absender:               { name: string; rolle: string };
  signatur:               string | null;
}

/** Vorschlag für Betreff und Text (reine Funktion) */
export function entwurf(d: EntwurfDaten): { betreff: string; text: string } {
  const zugang = d.zugangAm.toLocaleString("de-DE", {
    timeZone: "Europe/Berlin", weekday: "short", day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
  return {
    betreff: `Empfangsbestätigung: ${d.titel}`,
    text: [
      "Sehr geehrte Damen und Herren,",
      "",
      "der Betriebsrat bestätigt den Eingang folgender Unterlagen:",
      "",
      `  ${d.titel} (${d.kategorie})`,
      `  zugegangen am ${zugang} Uhr`,
      "",
      ...(d.unterlagenVollstaendig === false ? [
        "Die Unterrichtung ist aus Sicht des Betriebsrats noch nicht vollständig. Wir bitten darum, "
          + "die fehlenden Angaben nachzureichen; die Frist zur Stellungnahme beginnt erst mit der "
          + "vollständigen Unterrichtung.",
        "",
      ] : []),
      "Mit freundlichen Grüßen",
      "",
      d.absender.name,
      ROLLE_TITEL[d.absender.rolle] ?? "für den Betriebsrat",
      ...(d.signatur ? ["", "-- ", d.signatur] : []),
    ].join("\n"),
  };
}

async function ladeDokument(dokumentId: string) {
  const dok = await prisma.dokument.findUnique({ where: { id: dokumentId } });
  if (!dok || dok.status === DokumentStatus.GELOESCHT) throw new EmpfangsbestaetigungFehler("Dokument nicht gefunden");
  if (!dok.zugangAm || !dok.zugangBestaetigtAm) {
    throw new EmpfangsbestaetigungFehler("Bitte zuerst den Zugang beim Betriebsrat bestätigen");
  }
  return { ...dok, zugangAm: dok.zugangAm };
}

/** Vorbelegung für den Dialog: Empfänger aus den Einstellungen, Text-Vorschlag */
export async function vorbelegung(dokumentId: string, benutzerId: string, signaturId?: string) {
  const dok = await ladeDokument(dokumentId);
  const [ich, signatur, an, { signaturen, standard }] = await Promise.all([
    prisma.benutzer.findUniqueOrThrow({ where: { id: benutzerId }, select: { name: true, rolle: true } }),
    signaturText("empfang", signaturId),
    hrAdresse(),
    signaturenLaden(),
  ]);
  return {
    an,
    // Signaturen zur Auswahl im Dialog; ausgewählt ist die Standardsignatur für Empfangsbestätigungen
    signaturen,
    signaturId: signaturId ?? standard.empfang,
    ...entwurf({
      titel:                  dok.alias ?? dok.titel,
      kategorie:              KATEGORIE_LABEL[dok.kategorie],
      zugangAm:               dok.zugangAm,
      unterlagenVollstaendig: dok.unterlagenVollstaendig,
      absender:               ich,
      signatur,
    }),
    gesendetAm: dok.empfangsbestaetigungAm,
    gesendetAn: dok.empfangsbestaetigungAn,
    smtpAktiv:  !!process.env.SMTP_HOST,
  };
}

export async function senden(
  dokumentId: string,
  eingabe: { an: string; betreff: string; text: string },
  kontext: { benutzerId: string; ip?: string; userAgent?: string | null },
): Promise<{ gesendetAm: Date; gesendetAn: string }> {
  await ladeDokument(dokumentId);
  const an = eingabe.an.trim().toLowerCase();
  const betreff = eingabe.betreff.trim().slice(0, 300);
  const text = eingabe.text.trim().slice(0, 20_000);
  if (!istEmailAdresse(an)) throw new EmpfangsbestaetigungFehler("Bitte eine gültige Empfängeradresse angeben");
  if (!betreff || !text) throw new EmpfangsbestaetigungFehler("Betreff und Text dürfen nicht leer sein");
  if (!process.env.SMTP_HOST) throw new EmpfangsbestaetigungFehler("Es ist kein Mailserver eingerichtet (SMTP_HOST in der .env)");

  const ich = await prisma.benutzer.findUniqueOrThrow({ where: { id: kontext.benutzerId }, select: { email: true } });
  await sendeEmpfangsbestaetigung({ an, kopieAn: ich.email !== an ? ich.email : null, betreff, text });

  const gesendetAm = new Date();
  await prisma.$transaction([
    prisma.dokument.update({ where: { id: dokumentId }, data: { empfangsbestaetigungAm: gesendetAm, empfangsbestaetigungAn: an } }),
    prisma.auditLog.create({
      data: {
        benutzerId: kontext.benutzerId,
        dokumentId,
        aktion:     AuditAktion.EMPFANGSBESTAETIGUNG_VERSENDET,
        ip:         kontext.ip ?? null,
        userAgent:  kontext.userAgent ?? null,
        details:    { an, betreff, text },
      },
    }),
  ]);
  return { gesendetAm, gesendetAn: an };
}
