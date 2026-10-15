import { useEffect, useState } from "react";
import { api, Mitarbeiter, Zeitmodell } from "./api";

// Lädt die in dieser Installation konfigurierten Zeitmodell-Bezeichnungen
// (Stammdaten, siehe api.zeitmodelle) – gemeinsam genutzt von allen Stellen,
// die bisher eine eigene hartkodierte Liste ("A","B","C","D") gepflegt haben.
export function useZeitmodelle() {
  const [zeitmodelle, setZeitmodelle] = useState<Zeitmodell[]>([]);
  useEffect(() => {
    api.zeitmodelle.liste().then(setZeitmodelle).catch(() => {});
  }, []);
  const aktive = zeitmodelle.filter(z => z.aktiv);
  return { zeitmodelle, aktive };
}

/**
 * Vorauswahl für einen neuen Zeitmodell-Zeitraum eines Mitarbeiters:
 *  1. Zeitmodell laut Vertrag (Personaldaten), wenn gesetzt und aktiv
 *  2. sonst sein aktuell offenes, unbefristetes Zeitmodell aus der Historie
 *  3. sonst das als Standard markierte, sonst das erste aktive
 */
export async function zeitmodellVorschlag(
  mitarbeiter: Pick<Mitarbeiter, "id" | "vertragsZeitmodellId"> | undefined,
  aktive: Zeitmodell[],
): Promise<string> {
  const standard = aktive.find(z => z.standard)?.id ?? aktive[0]?.id ?? "";
  if (!mitarbeiter) return standard;
  const vertrag = mitarbeiter.vertragsZeitmodellId;
  if (vertrag && aktive.some(z => z.id === vertrag)) return vertrag;
  try {
    const offen = (await api.zeitmodell.liste({ mitarbeiterId: mitarbeiter.id })).find(z => z.gueltigBis === null);
    return offen?.zeitmodell.id ?? standard;
  } catch {
    return standard;
  }
}
