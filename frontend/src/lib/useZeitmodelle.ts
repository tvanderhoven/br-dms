import { useEffect, useState } from "react";
import { api, Zeitmodell } from "./api";

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
