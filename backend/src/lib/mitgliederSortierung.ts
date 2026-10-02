/**
 * Gemeinsame Sortierung für Anwesenheitsliste (UI) und Unterschriftenliste
 * (PDF): ordentliche Mitglieder zuerst (alphabetisch nach Nachname), dann
 * Ersatzmitglieder (nach Wahlrang/Nachrück-Reihenfolge, siehe ersatzVorschlag.ts),
 * zuletzt JAV.
 */

import { Role } from "@prisma/client";

// Kein separates Nachname-Feld im Schema – Nachname wird als letztes Wort
// des "Vorname Nachname"-Strings angenähert (deckt z.B. "van der Hoven" ab,
// da Präfixe wie "van der" konventionell nicht die Sortierposition bestimmen).
function nachname(name: string): string {
  const teile = name.trim().split(/\s+/);
  return teile[teile.length - 1] || name;
}

function gruppenRang(rolle: Role): number {
  if (rolle === Role.ERSATZMITGLIED) return 1;
  if (rolle === Role.JAV) return 2;
  return 0;
}

export function vergleicheNachMitgliederSortierung(
  a: { rolle: Role; name: string; wahlReihenfolge: number | null },
  b: { rolle: Role; name: string; wahlReihenfolge: number | null }
): number {
  const ga = gruppenRang(a.rolle);
  const gb = gruppenRang(b.rolle);
  if (ga !== gb) return ga - gb;
  if (ga === 1) return (a.wahlReihenfolge ?? Infinity) - (b.wahlReihenfolge ?? Infinity);
  return nachname(a.name).localeCompare(nachname(b.name), "de");
}
