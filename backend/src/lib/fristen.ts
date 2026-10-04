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
  WIDERSPRUCH:                    "Widerspruch",
  BENUTZERDEFINIERT:              "Individuelle Frist",
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
