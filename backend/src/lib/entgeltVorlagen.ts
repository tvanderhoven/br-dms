/**
 * Blaupausen für die Eingruppierung – fertige Entgeltsysteme, die sich unter
 * Einstellungen → System per Klick übernehmen lassen (lib/entgelt.ts).
 *
 * Weitere Tarifverträge einfach als neuen Eintrag ergänzen:
 *  - stufen:  alle Stufen des Tarifs in ihrer Reihenfolge
 *  - gruppen: alle Entgeltgruppen in ihrer Reihenfolge; "stufen" nennt die
 *             Stufen, die es in dieser Gruppe gibt (leer/weggelassen = alle).
 *             Hier gehören die Feinheiten hin, z. B. "E 1 beginnt mit Stufe 2".
 *  - nummer:  stabiler Schlüssel, unter dem die Einträge der Mitarbeiter
 *             gespeichert werden – innerhalb einer Vorlage eindeutig, am
 *             besten die "natürliche" Zahl der Gruppe (EG 7 → 7).
 *  - hinweis: was die Vorlage bewusst weglässt oder vereinfacht
 *
 * Nur die Struktur – keine Geldbeträge. Die Vorlagen sind nach bestem Wissen
 * zusammengestellt, aber nicht juristisch geprüft: Gruppen und Stufen vor dem
 * Einsatz mit dem eigenen Tarifvertrag abgleichen und bei Bedarf in den
 * Einstellungen anpassen.
 */

export interface EntgeltVorlage {
  schluessel:   string;
  name:         string;
  beschreibung: string;
  hinweis?:     string;
  stufen:       { nummer: number; bezeichnung: string }[];
  gruppen:      { nummer: number; bezeichnung: string; stufen?: number[] }[];
}

const zahlen = (von: number, bis: number) => Array.from({ length: bis - von + 1 }, (_, i) => von + i);

export const STANDARD_VORLAGE = "gruppe-1-6";

export const ENTGELT_VORLAGEN: EntgeltVorlage[] = [
  {
    schluessel:   STANDARD_VORLAGE,
    name:         "Eigene Gehaltstabelle (Gruppe 1–6, Stufe 1–4)",
    beschreibung: "Sechs Gruppen mit je vier Stufen – der Ausgangspunkt von BR-DMS, z. B. für einen Haustarif.",
    stufen:       zahlen(1, 4).map(n => ({ nummer: n, bezeichnung: `Stufe ${n}` })),
    gruppen:      zahlen(1, 6).map(n => ({ nummer: n, bezeichnung: `Gruppe ${n}` })),
  },
  {
    schluessel:   "eg-1-17",
    name:         "Entgeltgruppen EG 1–17 mit 3 Stufen",
    beschreibung: "Siebzehn Entgeltgruppen mit je drei Stufen, wie sie in einigen Flächentarifen vorkommen.",
    hinweis:      "Allgemeines Beispiel – Zahl der Gruppen und Stufen je Tarifgebiet unterschiedlich, bitte mit dem eigenen Tarifvertrag abgleichen.",
    stufen:       zahlen(1, 3).map(n => ({ nummer: n, bezeichnung: `Stufe ${n}` })),
    gruppen:      zahlen(1, 17).map(n => ({ nummer: n, bezeichnung: `EG ${n}` })),
  },
  {
    schluessel:   "tvoed",
    name:         "TVöD (E 1–E 15, Stufe 1–6)",
    beschreibung: "Entgeltgruppen E 1 bis E 15 mit den Stufen 1 bis 6; E 1 beginnt mit Stufe 2.",
    hinweis:      "Vereinfacht: ohne Sondergruppen wie E 2Ü, E 9a–c oder E 15Ü und ohne den Sozial- und Erziehungsdienst (S-Tabelle) – bei Bedarf ergänzen.",
    stufen:       zahlen(1, 6).map(n => ({ nummer: n, bezeichnung: `Stufe ${n}` })),
    gruppen:      zahlen(1, 15).map(n => ({ nummer: n, bezeichnung: `E ${n}`, ...(n === 1 ? { stufen: zahlen(2, 6) } : {}) })),
  },
];
