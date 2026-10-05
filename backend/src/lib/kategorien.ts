/**
 * Dokumentkategorien – Bezeichnungen und Standard-Aufbewahrung an einer Stelle.
 * Die Reihenfolge hier ist auch die Anzeigereihenfolge im Frontend (lib/api.ts).
 * Abweichende Aufbewahrung je Kategorie: Einstellungen → Löschfristen (Tabelle aufbewahrungsregeln).
 */

import { Kategorie } from "@prisma/client";

export const KATEGORIE_LABEL: Record<Kategorie, string> = {
  ANHOERUNG_99:         "§ 99 BetrVG – Einstellung/Versetzung",
  ANHOERUNG_102:        "§ 102 BetrVG – Kündigung",
  ABMAHNUNG:            "Abmahnung",
  BEWERBUNG:            "Bewerbung",
  BEWERBUNG_ALTERNATIV: "Alternative Bewerbung (§ 99)",
  ZEITMODELL_87:        "§ 87 BetrVG – Zeitmodelländerung",
  BETRIEBSVEREINBARUNG: "Betriebsvereinbarung",
  ARBEITGEBER_INFO:     "Information des Arbeitgebers",
  ARBEITSSCHUTZ:        "Arbeits- und Gesundheitsschutz",
  SCHRIFTVERKEHR:       "Schriftverkehr",
  PROTOKOLL:            "Sitzungsprotokoll",
  SONSTIGES:            "Sonstiges",
};

/** Standard-Aufbewahrung in Tagen, solange keine eigene Regel gespeichert ist */
export const STANDARD_AUFBEWAHRUNG_TAGE: Record<Kategorie, number> = {
  ANHOERUNG_99:         1825,   // 5 Jahre
  ANHOERUNG_102:        1825,
  ABMAHNUNG:            1095,   // 3 Jahre – üblicher Tilgungszeitraum in der Personalakte
  BEWERBUNG:              90,
  BEWERBUNG_ALTERNATIV:   30,
  ZEITMODELL_87:        1825,
  BETRIEBSVEREINBARUNG: 3650,   // 10 Jahre
  ARBEITGEBER_INFO:     1825,
  ARBEITSSCHUTZ:        1825,
  SCHRIFTVERKEHR:       1825,
  PROTOKOLL:            1460,   // 4 Jahre
  SONSTIGES:            1825,
};

export const ALLE_KATEGORIEN = Object.keys(KATEGORIE_LABEL) as Kategorie[];
