import { useCallback, useEffect, useMemo, useState } from "react";
import { api, EntgeltsystemAntwort } from "./api";

/**
 * Entgeltsystem der Eingruppierung (Einstellungen → System): Gruppen und Stufen
 * mit Bezeichnung und Reihenfolge. Einträge speichern die Nummern, Anzeige und
 * Auswahllisten kommen von hier (Backend: lib/entgelt.ts).
 */
export function useEntgelt() {
  const [daten, setDaten] = useState<EntgeltsystemAntwort | null>(null);
  const laden = useCallback(() => { api.entgelt.liste().then(setDaten).catch(() => {}); }, []);
  useEffect(laden, [laden]);

  return useMemo(() => {
    const gruppen = daten?.gruppen ?? [];
    const stufen  = daten?.stufen ?? [];
    const gruppeName = (n: number) => gruppen.find(g => g.nummer === n)?.bezeichnung ?? `Gruppe ${n}`;
    const stufeName  = (n: number) => stufen.find(s => s.nummer === n)?.bezeichnung ?? `Stufe ${n}`;
    return {
      daten,
      laden,
      geladen: daten !== null,
      gruppen,
      stufen,
      gruppeName,
      stufeName,
      /** "EG 7 Stufe 3" */
      text: (gruppe: number, stufe: number) => `${gruppeName(gruppe)} ${stufeName(stufe)}`,
      /** Auswahl für neue Einträge: aktive Gruppen (plus die gerade gewählte, falls inzwischen inaktiv) */
      gruppenAuswahl: (aktuell?: number | null) => gruppen.filter(g => g.aktiv || g.nummer === aktuell),
      /** Stufen, die es in dieser Gruppe gibt (leere Liste an der Gruppe = alle) */
      stufenAuswahl: (gruppe: number | null, aktuell?: number | null) => {
        const erlaubt = gruppen.find(g => g.nummer === gruppe)?.stufen ?? [];
        return stufen.filter(s => (s.aktiv || s.nummer === aktuell) && (erlaubt.length === 0 || erlaubt.includes(s.nummer)));
      },
    };
  }, [daten, laden]);
}
