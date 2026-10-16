import type { FristDauer } from "./fristRechner.js";

/**
 * Gemeinsame Bezeichnungen für Fristtypen – genutzt von E-Mail-Erinnerung,
 * Amtsübergabe-PDF usw. (Frontend: FRIST_TYP_LABEL in lib/api.ts).
 */

export const FRIST_TYP_LABEL: Record<string, string> = {
  ANHOERUNG_99_WOCHE:             "§ 99 Anhörung (1 Woche)",
  ANHOERUNG_102_ORDENTLICH:       "§ 102 ordentliche Kündigung (1 Woche)",
  ANHOERUNG_102_AUSSERORDENTLICH: "§ 102 außerordentliche Kündigung (3 Tage)",
  ZEITMODELL_87_WOCHE:            "§ 87 Mitbestimmung (1 Woche)",
  BETRIEBSVERSAMMLUNG_43:         "§ 43 Betriebsversammlung im Quartal",
  WAHL:                           "Wahl (BR/JAV)",
  EINBERUFUNG_29:                 "§ 29 Abs. 2 Einberufung auf Antrag (1 Woche)",
  WIDERSPRUCH:                    "Widerspruch",
  BENUTZERDEFINIERT:              "Individuelle Frist",
};

/**
 * Rechtsfolge bei Fristablauf ohne fristgerechte Stellungnahme (Schweigefiktion
 * § 99 Abs. 3 Satz 2 bzw. § 102 Abs. 2 Satz 3 BetrVG) – genutzt in der
 * Erinnerungsmail und im Vorgang-Abschnitt der Dokumentansicht.
 */
export const FRIST_TYP_FOLGE_HINWEIS: Record<string, string> = {
  ANHOERUNG_99_WOCHE:
    "Ohne fristgerechte schriftliche Zustimmungsverweigerung gilt die Zustimmung nach § 99 Abs. 3 Satz 2 BetrVG als erteilt.",
  ANHOERUNG_102_ORDENTLICH:
    "Ohne fristgerechte schriftliche Mitteilung von Bedenken gilt die Kündigung nach § 102 Abs. 2 Satz 3 BetrVG als nicht beanstandet.",
  ANHOERUNG_102_AUSSERORDENTLICH:
    "Ohne fristgerechte schriftliche Mitteilung von Bedenken gilt die Kündigung nach § 102 Abs. 2 Satz 3 BetrVG als nicht beanstandet.",
};

/** Anzeigename einer Frist: eigene Bezeichnung, sonst Dokumenttitel, sonst Fristtyp. */
export function fristTitel(f: {
  typ: string;
  bezeichnung?: string | null;
  dokument?: { titel: string; alias?: string | null } | null;
}): string {
  return f.bezeichnung?.trim()
    || (f.dokument ? (f.dokument.alias ?? f.dokument.titel) : "")
    || (FRIST_TYP_LABEL[f.typ] ?? f.typ);
}

/**
 * Dauer der Fristen, die ab Zugang eines Dokuments laufen (dokument-pipeline.service.ts
 * legt sie an, lib/zugang.ts rechnet sie nach Bestätigung des Zugangs neu).
 * § 87 hat keine gesetzliche Frist – die Woche ist eine interne Bearbeitungsfrist.
 */
export const FRIST_DAUER_AB_ZUGANG: Record<string, FristDauer> = {
  ANHOERUNG_99_WOCHE:             { wochen: 1 },   // § 99 Abs. 3 BetrVG
  WIDERSPRUCH:                    { wochen: 1 },
  ANHOERUNG_102_ORDENTLICH:       { wochen: 1 },   // § 102 Abs. 2 Satz 1 BetrVG
  ANHOERUNG_102_AUSSERORDENTLICH: { tage: 3 },     // § 102 Abs. 2 Satz 3 BetrVG
  ZEITMODELL_87_WOCHE:            { wochen: 1 },
};
