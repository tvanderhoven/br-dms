/**
 * Sitzungsarten und ihre Unterschiede (Frontend: SITZUNGSTYP_LABEL in lib/api.ts).
 *
 * Der Ablauf Tagesordnung → Protokoll → PDF ist für alle Arten gleich. Die
 * Betriebsversammlung (§§ 42–46 BetrVG) weicht ab: keine Anwesenheitsliste
 * (stattdessen Teilnehmerzahl), keine Beschlüsse, Protokoll heißt
 * „Niederschrift“, die Tagesordnung dient als Einladung/Aushang.
 */

export const SITZUNGSTYP_LABEL: Record<string, string> = {
  ORDENTLICH:          "Ordentliche Sitzung",
  AUSSERORDENTLICH:    "Außerordentliche Sitzung",
  KONSTITUIEREND:      "Konstituierende Sitzung",
  BETRIEBSVERSAMMLUNG: "Betriebsversammlung",
};

export const SITZUNGSTYPEN = Object.keys(SITZUNGSTYP_LABEL);

export function istBetriebsversammlung(sitzungstyp: string | null | undefined): boolean {
  return sitzungstyp === "BETRIEBSVERSAMMLUNG";
}

/**
 * Standard-Tagesordnung, wenn beim Anlegen keine Vorlage gewählt wird.
 * Ordentliche/außerordentliche Sitzungen starten wie bisher leer.
 */
export const STANDARD_TOPS: Record<string, string[]> = {
  // § 29 Abs. 1 BetrVG: Wahlvorstand lädt ein und leitet, bis ein Wahlleiter bestimmt ist
  KONSTITUIEREND: [
    "Eröffnung durch den Vorsitz des Wahlvorstands",
    "Wahl einer Wahlleitung",
    "Wahl der/des Vorsitzenden (§ 26 Abs. 1 BetrVG)",
    "Wahl der/des stellvertretenden Vorsitzenden (§ 26 Abs. 1 BetrVG)",
    "Bildung des Betriebsausschusses (§ 27 BetrVG)",
    "Verschiedenes",
  ],
  BETRIEBSVERSAMMLUNG: [
    "Eröffnung und Begrüßung",
    "Tätigkeitsbericht des Betriebsrats (§ 43 Abs. 1 BetrVG)",
    "Bericht des Arbeitgebers (§ 43 Abs. 2 BetrVG)",
    "Fragen aus der Belegschaft",
    "Anträge an den Betriebsrat (§ 45 BetrVG)",
    "Verschiedenes",
  ],
};
