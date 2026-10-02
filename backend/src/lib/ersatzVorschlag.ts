/**
 * Ersatzmitglieder-Nachrück-Vorschlag
 *
 * Schlägt bei Abwesenheit eines ordentlichen Mitglieds das laut Wahlergebnis
 * (wahlReihenfolge, aus dem Wahlprotokoll der letzten BR-Wahl) nächste aktive
 * Ersatzmitglied vor und warnt – ohne zu blockieren –, falls dieser Vorschlag
 * die bei der Wahl festgelegte Mindestsitzzahl des Minderheitengeschlechts
 * (§15 Abs. 2 BetrVG) unterschreiten würde.
 */

import { Role, AnwesenheitsStatus, Geschlecht } from "@prisma/client";
import prisma from "./prisma.js";

export interface BenutzerKurz {
  id:   string;
  name: string;
}

export interface ErsatzVorschlagErgebnis {
  vorschlag:   BenutzerKurz | null;
  warnung:     string | null;
  alternative: BenutzerKurz | null;
}

const ORDENTLICHE_ROLLEN: Role[] = [Role.VORSITZ, Role.STELLVERTRETER, Role.MITGLIED];

export async function ermittleErsatzVorschlag(
  sitzungId: string,
  abwesenderId: string
): Promise<ErsatzVorschlagErgebnis> {
  const [alleBenutzer, anwesenheiten, quoteSettings] = await Promise.all([
    prisma.benutzer.findMany({
      where:  { aktiv: true, rolle: { in: [...ORDENTLICHE_ROLLEN, Role.ERSATZMITGLIED] } },
      select: { id: true, name: true, rolle: true, geschlecht: true, wahlReihenfolge: true },
    }),
    prisma.anwesenheit.findMany({
      where:  { sitzungId },
      select: { benutzerId: true, status: true },
    }),
    prisma.systemEinstellung.findMany({
      where: { schluessel: { in: ["wahl.minderheitengeschlecht", "wahl.mindestsitze_minderheit"] } },
    }),
  ]);

  const quoteMap = new Map(quoteSettings.map(e => [e.schluessel, e.wert]));
  const minderheitengeschlecht = (quoteMap.get("wahl.minderheitengeschlecht") || null) as Geschlecht | null;
  const mindestsitzeMinderheit = parseInt(quoteMap.get("wahl.mindestsitze_minderheit") ?? "0", 10) || 0;

  const anwesenheitMap = new Map(anwesenheiten.map(a => [a.benutzerId, a]));
  const bereitsAlsErsatzEingetragen = new Set(
    anwesenheiten.filter(a => a.status === AnwesenheitsStatus.ERSATZ_FUER).map(a => a.benutzerId)
  );

  // Kandidatenpool: aktive Ersatzmitglieder, die für diese Sitzung noch nicht verplant sind,
  // sortiert nach Wahlreihenfolge (fehlender Rang landet am Ende).
  const kandidaten = alleBenutzer
    .filter(b => b.rolle === Role.ERSATZMITGLIED && !bereitsAlsErsatzEingetragen.has(b.id))
    .sort((a, b) => (a.wahlReihenfolge ?? Infinity) - (b.wahlReihenfolge ?? Infinity));

  const vorschlag = kandidaten[0];
  if (!vorschlag) {
    return { vorschlag: null, warnung: null, alternative: null };
  }

  let warnung: string | null = null;
  let alternative: BenutzerKurz | null = null;

  if (minderheitengeschlecht && mindestsitzeMinderheit > 0) {
    // Besetzung der Sitzung nach Übernahme des Vorschlags: ordentliche Mitglieder,
    // die nicht (unentschuldigt oder entschuldigt) abwesend gemeldet sind, abzüglich
    // des aktuell Abwesenden, zuzüglich bereits bestätigter Ersatzmitglieder + Vorschlag.
    const abwesendStatus: AnwesenheitsStatus[] = [
      AnwesenheitsStatus.ABWESEND_ENTSCHULDIGT,
      AnwesenheitsStatus.ABWESEND_UNENTSCHULDIGT,
    ];

    const ordentlicheBesetzt = alleBenutzer.filter(b => {
      if (!ORDENTLICHE_ROLLEN.includes(b.rolle)) return false;
      if (b.id === abwesenderId) return false;
      const eintrag = anwesenheitMap.get(b.id);
      if (eintrag && abwesendStatus.includes(eintrag.status)) return false;
      return true;
    });

    const bereitsBestaetigteErsatz = alleBenutzer.filter(
      b => b.rolle === Role.ERSATZMITGLIED && bereitsAlsErsatzEingetragen.has(b.id)
    );

    const besetzungMitVorschlag = [...ordentlicheBesetzt, ...bereitsBestaetigteErsatz, vorschlag];
    const minderheitAnzahl = besetzungMitVorschlag.filter(b => b.geschlecht === minderheitengeschlecht).length;

    if (minderheitAnzahl < mindestsitzeMinderheit) {
      const alternativKandidat = kandidaten.find(
        k => k.id !== vorschlag.id && k.geschlecht === minderheitengeschlecht
      );

      if (alternativKandidat) {
        warnung =
          `Der Vorschlag "${vorschlag.name}" würde die gesetzliche Mindestsitzzahl des Minderheitengeschlechts ` +
          `(${mindestsitzeMinderheit}) unterschreiten. "${alternativKandidat.name}" würde die Quote einhalten.`;
        alternative = { id: alternativKandidat.id, name: alternativKandidat.name };
      } else {
        warnung =
          `Dieser Vorschlag unterschreitet die gesetzliche Mindestsitzzahl des Minderheitengeschlechts ` +
          `(${mindestsitzeMinderheit}). Im verbleibenden Ersatzmitglieder-Pool gibt es keine Alternative, die das beheben würde.`;
      }
    }
  }

  return {
    vorschlag: { id: vorschlag.id, name: vorschlag.name },
    warnung,
    alternative,
  };
}
