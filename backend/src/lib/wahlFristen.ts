/**
 * Fristen einer BR- oder JAV-Wahl, rückwärts bzw. vorwärts vom Tag der
 * Stimmabgabe und vom Ende der Amtszeit berechnet.
 *
 * ACHTUNG: Die Fristen sind nach bestem Wissen aus BetrVG und Wahlordnung (WO)
 * abgeleitet, aber nicht juristisch geprüft. Jede Frist trägt ihre Rechtsgrundlage
 * und ist als "gesetzlich" oder "Empfehlung" gekennzeichnet – vor dem Einsatz
 * gegenlesen lassen (Gewerkschaft, Schulung des Wahlvorstands).
 *
 * Die JAV-Wahl folgt über § 38 WO bzw. § 63 BetrVG weitgehend denselben Regeln;
 * abweichend sind die Bestellung des Wahlvorstands und die konstituierende
 * Sitzung (für die JAV gilt § 29 BetrVG nicht, § 65 verweist nicht darauf).
 *
 * Reine Berechnung ohne Datenbank – abgeglichen werden die Fristen in
 * wahlFristenAbgleichen() weiter unten.
 */

import { FristStatus, FristTyp, Prisma, PrismaClient, WahlArt, WahlVerfahren } from "@prisma/client";
import defaultPrisma from "./prisma.js";

export interface WahlEckdaten {
  art:            WahlArt;
  verfahren:      WahlVerfahren;
  stimmabgabeAm:  Date;
  amtszeitEnde?:  Date | null;
  ausschreibenAm?: Date | null;
}

export interface WahlFrist {
  schritt:         string;
  bezeichnung:     string;
  faelligAm:       Date;
  rechtsgrundlage: string;
  gesetzlich:      boolean;   // false = Empfehlung / Annahme, keine gesetzliche Frist
  hinweis?:        string;
}

const TAG = 86_400_000;
const plus = (d: Date, tage: number) => new Date(d.getTime() + tage * TAG);

export function berechneWahlFristen(w: WahlEckdaten): WahlFrist[] {
  const br   = w.art === WahlArt.BR;
  const name = br ? "BR-Wahl" : "JAV-Wahl";
  const S    = w.stimmabgabeAm;
  const f: WahlFrist[] = [];

  // Wahlvorstand: gesetzlich spätestens X Wochen vor Ende der Amtszeit – er muss aber
  // schon vor dem Wahlausschreiben bestehen (er erlässt es). Maßgeblich ist der frühere Termin.
  const wahlvorstand = (A: Date, wochen: number, grundlage: string, ersatz: string) => {
    const gesetzlich = w.amtszeitEnde ? plus(w.amtszeitEnde, -wochen * 7) : null;
    const vorAusschreiben = !gesetzlich || A < gesetzlich;
    f.push({
      schritt: "WAHLVORSTAND", bezeichnung: `${name}: Wahlvorstand bestellen`,
      faelligAm: vorAusschreiben ? A : gesetzlich!, gesetzlich: true,
      rechtsgrundlage: `${grundlage} (${wochen} Wochen vor Ende der Amtszeit)`,
      hinweis: (vorAusschreiben
        ? "Spätestens vor dem Wahlausschreiben, das der Wahlvorstand erlässt – realistisch einige Wochen vorher, damit er die Wählerliste aufstellen kann. "
        : "") + ersatz,
    });
  };

  if (w.verfahren === WahlVerfahren.NORMAL) {
    const A = w.ausschreibenAm ?? plus(S, -42);
    wahlvorstand(A, br ? 10 : 8, br ? "§ 16 Abs. 1 BetrVG" : "§ 63 Abs. 2 BetrVG", br
      ? "Besteht 8 Wochen vor Ende der Amtszeit kein Wahlvorstand, kann ihn das Arbeitsgericht bestellen (§ 16 Abs. 2)."
      : "Besteht 6 Wochen vor Ende der Amtszeit kein Wahlvorstand, kann ihn das Arbeitsgericht bestellen (§ 63 Abs. 3).");
    f.push({
      schritt: "AUSSCHREIBEN", bezeichnung: `${name}: Wahlausschreiben erlassen`,
      faelligAm: A, gesetzlich: true,
      rechtsgrundlage: "§ 3 Abs. 1 WO (spätestens 6 Wochen vor der Stimmabgabe)",
      hinweis: w.ausschreibenAm ? "Tatsächliches Datum des Wahlausschreibens." : "Spätester Termin – das tatsächliche Datum bei der Wahl eintragen, die Folgefristen rechnen dann davon.",
    });
    f.push({
      schritt: "EINSPRUCH_WAEHLERLISTE", bezeichnung: `${name}: Ende Einspruchsfrist Wählerliste`,
      faelligAm: plus(A, 14), gesetzlich: true,
      rechtsgrundlage: "§ 4 Abs. 1 WO (2 Wochen nach Erlass des Wahlausschreibens)",
    });
    f.push({
      schritt: "WAHLVORSCHLAEGE", bezeichnung: `${name}: Ende Einreichung Wahlvorschläge`,
      faelligAm: plus(A, 14), gesetzlich: true,
      rechtsgrundlage: "§ 6 Abs. 1 WO (2 Wochen nach Erlass des Wahlausschreibens)",
      hinweis: "Geht kein gültiger Vorschlag ein, setzt der Wahlvorstand eine Nachfrist von 1 Woche (§ 9 WO).",
    });
    f.push({
      schritt: "BEKANNTMACHUNG", bezeichnung: `${name}: Wahlvorschläge bekannt machen`,
      faelligAm: plus(S, -7), gesetzlich: true,
      rechtsgrundlage: "§ 10 Abs. 2 WO (spätestens 1 Woche vor der Stimmabgabe)",
    });
    f.push({
      schritt: "STIMMABGABE", bezeichnung: `${name}: Stimmabgabe`,
      faelligAm: S, gesetzlich: true, rechtsgrundlage: "laut Wahlausschreiben",
    });
  } else {
    // Für das einstufige Verfahren kennt die WO keinen festen Vorlauf des Wahlausschreibens –
    // 3 Wochen lassen Raum für Einspruchsfrist und Wahlvorschläge (Annahme, gegenlesen!)
    const A = w.ausschreibenAm ?? plus(S, -21);
    wahlvorstand(A, 4, br ? "§ 17a Nr. 1 BetrVG" : "§ 63 Abs. 4 BetrVG",
      "Besteht 3 Wochen vor Ende der Amtszeit kein Wahlvorstand, kann ihn das Arbeitsgericht bestellen.");
    f.push({
      schritt: "AUSSCHREIBEN", bezeichnung: `${name}: Wahlausschreiben erlassen`,
      faelligAm: A, gesetzlich: !!w.ausschreibenAm,
      rechtsgrundlage: "§ 36 WO (einstufiges vereinfachtes Verfahren)",
      hinweis: w.ausschreibenAm
        ? "Tatsächliches Datum des Wahlausschreibens."
        : "Empfehlung: 3 Wochen vor der Wahlversammlung – keine gesetzliche Frist. Tatsächliches Datum bei der Wahl eintragen.",
    });
    f.push({
      schritt: "EINSPRUCH_WAEHLERLISTE", bezeichnung: `${name}: Ende Einspruchsfrist Wählerliste`,
      faelligAm: plus(A, 3), gesetzlich: true,
      rechtsgrundlage: "§ 30 Abs. 2 i. V. m. § 36 Abs. 1 WO (3 Tage nach Erlass des Wahlausschreibens)",
    });
    f.push({
      schritt: "WAHLVORSCHLAEGE", bezeichnung: `${name}: Ende Einreichung Wahlvorschläge`,
      faelligAm: plus(S, -7), gesetzlich: true,
      rechtsgrundlage: "§ 36 Abs. 5 WO (1 Woche vor der Wahlversammlung)",
    });
    f.push({
      schritt: "STIMMABGABE", bezeichnung: `${name}: Wahlversammlung`,
      faelligAm: S, gesetzlich: true, rechtsgrundlage: br ? "§ 14a Abs. 3 BetrVG" : "§ 63 Abs. 4 i. V. m. § 14a BetrVG",
      hinweis: "Bei nachträglicher schriftlicher Stimmabgabe (§ 35 WO) steht das Ergebnis erst danach fest.",
    });
  }

  if (br) {
    f.push({
      schritt: "KONSTITUIERUNG", bezeichnung: `${name}: konstituierende Sitzung einberufen`,
      faelligAm: plus(S, 7), gesetzlich: true,
      rechtsgrundlage: "§ 29 Abs. 1 BetrVG (vor Ablauf einer Woche nach dem Wahltag)",
      hinweis: "Bei mehreren Wahltagen zählt der letzte Tag der Stimmabgabe.",
    });
  }
  f.push({
    schritt: "ANFECHTUNG", bezeichnung: `${name}: Ende der Anfechtungsfrist`,
    faelligAm: plus(S, 14), gesetzlich: true,
    rechtsgrundlage: br ? "§ 19 Abs. 2 BetrVG (2 Wochen ab Bekanntgabe des Ergebnisses)" : "§ 63 Abs. 2 i. V. m. § 19 Abs. 2 BetrVG",
    hinweis: "Gerechnet ab dem Wahltag – maßgeblich ist der Tag, an dem das Ergebnis bekannt gegeben wurde.",
  });

  return f.sort((a, b) => a.faelligAm.getTime() - b.faelligAm.getTime());
}

function fristNotiz(f: WahlFrist): string {
  return [
    f.rechtsgrundlage + (f.gesetzlich ? "" : " – Empfehlung, keine gesetzliche Frist"),
    f.hinweis,
    "Automatisch aus der Wahl berechnet – vor dem Einsatz juristisch gegenlesen.",
  ].filter(Boolean).join("\n");
}

/**
 * Bringt die Fristen einer Wahl auf den Stand ihrer Eckdaten: vorhandene Schritte
 * bekommen neues Datum und Text (Status bleibt erhalten), fehlende werden angelegt,
 * entfallene (z. B. nach Wechsel des Verfahrens) gelöscht. Erweitert außerdem den
 * Zeitraum des verknüpften Vorhabens, sodass er alle Fristen umfasst (verkürzt ihn
 * nie – im Vorhaben können eigene Aufgaben außerhalb der Fristen liegen).
 */
export async function wahlFristenAbgleichen(
  wahlId: string,
  client: PrismaClient | Prisma.TransactionClient = defaultPrisma,
): Promise<void> {
  const wahl = await client.wahl.findUnique({ where: { id: wahlId }, include: { fristen: true } });
  if (!wahl) return;

  const soll = berechneWahlFristen(wahl);
  const sollSchritte = new Set(soll.map(s => s.schritt));

  for (const s of soll) {
    const ist = wahl.fristen.find(f => f.wahlSchritt === s.schritt);
    const daten = { faelligAm: s.faelligAm, bezeichnung: s.bezeichnung, notiz: fristNotiz(s) };
    if (ist) {
      await client.frist.update({ where: { id: ist.id }, data: daten });
    } else {
      await client.frist.create({
        data: { ...daten, typ: FristTyp.WAHL, status: FristStatus.OFFEN, wahlId, wahlSchritt: s.schritt, erstelltVonId: wahl.erstelltVonId },
      });
    }
  }
  const entfallen = wahl.fristen.filter(f => !f.wahlSchritt || !sollSchritte.has(f.wahlSchritt));
  if (entfallen.length > 0) {
    await client.frist.deleteMany({ where: { id: { in: entfallen.map(f => f.id) } } });
  }

  const vorhaben = wahl.vorhabenId && soll.length > 0
    ? await client.aufgabe.findUnique({ where: { id: wahl.vorhabenId }, select: { startDatum: true, endDatum: true } })
    : null;
  if (vorhaben) {
    const erste = soll[0].faelligAm, letzte = soll[soll.length - 1].faelligAm;
    await client.aufgabe.update({
      where: { id: wahl.vorhabenId! },
      data: {
        startDatum: vorhaben.startDatum && vorhaben.startDatum < erste ? vorhaben.startDatum : erste,
        endDatum:   vorhaben.endDatum && vorhaben.endDatum > letzte ? vorhaben.endDatum : letzte,
      },
    });
  }
}
