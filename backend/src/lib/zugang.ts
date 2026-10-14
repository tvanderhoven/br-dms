/**
 * Zugang eines Dokuments beim Betriebsrat – Beginn der Beteiligungsfristen.
 *
 * Ablauf (Issues #25/#26):
 *  1. Import (dokument-pipeline.service.ts): zugangAm = Vorschlag, Fristen werden
 *     vorläufig ab diesem Zeitpunkt berechnet.
 *  2. Vorsitz/Stellvertretung bestätigen oder korrigieren den Zugang im Eingang;
 *     die offenen Fristen werden ab dem bestätigten Zugang neu berechnet.
 *     Bei § 102 ohne Kündigungsart fällt dabei die unpassende der beiden Fristen weg.
 *
 * Ob ein Schreiben rechtlich zugegangen ist (z. B. Einwurf ins BR-Postfach am
 * Samstag oder nach Dienstschluss), beurteilt der Mensch – das System schlägt nur vor.
 */

import { AuditAktion, FristStatus, FristTyp, Kategorie } from "@prisma/client";
import prisma from "./prisma.js";
import { FRIST_DAUER_AB_ZUGANG, FRIST_TYP_LABEL } from "./fristen.js";
import { berechneFristende } from "./fristRechner.js";
import { ladeFeiertagsKalender } from "./fristKalender.js";

export type KuendigungsArt = "ORDENTLICH" | "AUSSERORDENTLICH";

const FRIST_102: Record<KuendigungsArt, string> = {
  ORDENTLICH:       "ANHOERUNG_102_ORDENTLICH",
  AUSSERORDENTLICH: "ANHOERUNG_102_AUSSERORDENTLICH",
};

/**
 * Vorgeschlagener Zugang: bei E-Mails das Sendedatum, sonst der Eingang im System –
 * jeweils der frühere Zeitpunkt, damit die vorläufige Frist eher zu früh als zu spät endet.
 */
export function zugangVorschlag(eingang: Date, emailDatum?: string | null): Date {
  const gesendet = emailDatum ? new Date(emailDatum) : null;
  return gesendet && !Number.isNaN(gesendet.getTime()) && gesendet < eingang ? gesendet : eingang;
}

export interface ZugangsFrist {
  id:           string | null;        // null = wird beim Bestätigen neu angelegt
  typ:          string;
  bezeichnung:  string;
  faelligAm:    Date | null;          // aktuell gespeichert (null = noch nicht vorhanden)
  neuFaelligAm: Date | null;          // nach Bestätigung (null = entfällt)
  verschoben:   Array<{ tag: string; grund: string }>;
}

export class ZugangFehler extends Error {}

async function ladeDokument(dokumentId: string) {
  return prisma.dokument.findUnique({
    where:   { id: dokumentId },
    include: {
      // alle Status: eine schon erledigte § 102-Frist soll nicht neu angelegt werden
      fristen:            { orderBy: { faelligAm: "asc" } },
      anhoerungsVorgang:  { select: { id: true, kuendigungsArt: true } },
      zugangBestaetigtVon: { select: { name: true } },
    },
  });
}

/** Welche offenen Fristen ändern sich (oder entfallen), wenn der Zugang so bestätigt wird? */
export async function zugangVorschau(
  dokumentId: string,
  zugangAm: Date,
  kuendigungsArt?: KuendigungsArt | null,
): Promise<ZugangsFrist[]> {
  const dok = await ladeDokument(dokumentId);
  if (!dok) throw new ZugangFehler("Dokument nicht gefunden");
  return berechne(dok, zugangAm, kuendigungsArt ?? (dok.anhoerungsVorgang?.kuendigungsArt as KuendigungsArt | null));
}

async function berechne(
  dok: NonNullable<Awaited<ReturnType<typeof ladeDokument>>>,
  zugangAm: Date,
  kuendigungsArt: KuendigungsArt | null | undefined,
): Promise<ZugangsFrist[]> {
  const k = await ladeFeiertagsKalender();
  const ergebnis: ZugangsFrist[] = dok.fristen
    .filter(f => f.status === FristStatus.OFFEN && FRIST_DAUER_AB_ZUGANG[f.typ])
    .map(f => {
      const entfaellt = dok.kategorie === Kategorie.ANHOERUNG_102 && !!kuendigungsArt
        && f.typ !== FRIST_102[kuendigungsArt] && Object.values(FRIST_102).includes(f.typ);
      const ende = entfaellt ? null : berechneFristende(zugangAm, FRIST_DAUER_AB_ZUGANG[f.typ]!, k);
      return {
        id:           f.id,
        typ:          f.typ,
        bezeichnung:  FRIST_TYP_LABEL[f.typ] ?? f.typ,
        faelligAm:    f.faelligAm,
        neuFaelligAm: ende?.ende ?? null,
        verschoben:   ende?.verschoben ?? [],
      };
    });

  // § 102: Kündigungsart gewählt, deren Frist es noch nicht gibt (z. B. Ordner
  // anhoerung_102 = ordentlich, tatsächlich aber außerordentlich) → neu anlegen
  if (dok.kategorie === Kategorie.ANHOERUNG_102 && kuendigungsArt
      && !dok.fristen.some(f => f.typ === FRIST_102[kuendigungsArt])) {
    const typ = FRIST_102[kuendigungsArt];
    const ende = berechneFristende(zugangAm, FRIST_DAUER_AB_ZUGANG[typ]!, k);
    ergebnis.unshift({
      id: null, typ, bezeichnung: FRIST_TYP_LABEL[typ] ?? typ,
      faelligAm: null, neuFaelligAm: ende.ende, verschoben: ende.verschoben,
    });
  }
  return ergebnis;
}

export interface ZugangBestaetigung {
  zugangAm:                Date;
  kuendigungsArt?:         KuendigungsArt | null;
  unterlagenVollstaendig?: boolean | null;
}

export async function zugangBestaetigen(
  dokumentId: string,
  eingabe: ZugangBestaetigung,
  kontext: { benutzerId: string; ip?: string; userAgent?: string | null },
): Promise<ZugangsFrist[]> {
  const dok = await ladeDokument(dokumentId);
  if (!dok) throw new ZugangFehler("Dokument nicht gefunden");

  const { zugangAm } = eingabe;
  if (Number.isNaN(zugangAm.getTime())) throw new ZugangFehler("Ungültiger Zugangszeitpunkt");
  // Etwas Spielraum für abweichende Uhren zwischen Browser und Server
  if (zugangAm.getTime() > Date.now() + 10 * 60_000) throw new ZugangFehler("Der Zugang kann nicht in der Zukunft liegen");

  const kuendigungsArt = eingabe.kuendigungsArt ?? (dok.anhoerungsVorgang?.kuendigungsArt as KuendigungsArt | null) ?? null;
  if (dok.kategorie === Kategorie.ANHOERUNG_102 && !kuendigungsArt) {
    throw new ZugangFehler("Bitte angeben, ob es sich um eine ordentliche oder außerordentliche Kündigung handelt");
  }

  const fristen = await berechne(dok, zugangAm, kuendigungsArt);

  await prisma.$transaction([
    ...fristen.map(f => !f.id
      ? prisma.frist.create({ data: { dokumentId, typ: f.typ as FristTyp, faelligAm: f.neuFaelligAm! } })
      : f.neuFaelligAm
        ? prisma.frist.update({ where: { id: f.id }, data: { faelligAm: f.neuFaelligAm } })
        : prisma.frist.delete({ where: { id: f.id } })),
    prisma.dokument.update({
      where: { id: dokumentId },
      data:  {
        zugangAm,
        zugangBestaetigtAm:     new Date(),
        zugangBestaetigtVonId:  kontext.benutzerId,
        unterlagenVollstaendig: eingabe.unterlagenVollstaendig ?? null,
      },
    }),
    ...(dok.anhoerungsVorgang && dok.kategorie === Kategorie.ANHOERUNG_102
      ? [prisma.anhoerungsVorgang.update({ where: { id: dok.anhoerungsVorgang.id }, data: { kuendigungsArt } })]
      : []),
    prisma.auditLog.create({
      data: {
        benutzerId: kontext.benutzerId,
        dokumentId,
        aktion:     AuditAktion.ZUGANG_BESTAETIGT,
        ip:         kontext.ip ?? null,
        userAgent:  kontext.userAgent ?? null,
        details:    JSON.parse(JSON.stringify({
          zugangAm,
          vorherZugangAm:         dok.zugangAm,
          kuendigungsArt,
          unterlagenVollstaendig: eingabe.unterlagenVollstaendig ?? null,
          fristen: fristen.map(f => ({ typ: f.typ, vorher: f.faelligAm, nachher: f.neuFaelligAm })),
        })),
      },
    }),
  ]);

  return fristen;
}
