// Einstellbare Tabellenspalten: Breite ziehen, Reihenfolge verschieben, ein-/ausblenden –
// je Tabelle im Browser gemerkt. Passt nicht alles in die verfügbare Breite (etwa bei
// offener Vorschau), fallen die unwichtigsten Spalten automatisch weg, statt den Titel
// zu quetschen.
import { useCallback, useEffect, useRef, useState } from "react";

export interface SpaltenDef {
  id: string;
  label: string;
  /** Standardbreite in px; bei der flexiblen Spalte (Titel) die Mindestbreite – sie nimmt immer den Rest */
  breite: number;
  minBreite?: number;
  /** Immer sichtbar, nicht ausblendbar (Titel, Aktionen) */
  pflicht?: boolean;
  /** Nimmt den restlichen Platz (genau eine Spalte, z. B. Titel) */
  flexibel?: boolean;
  /** Bleibt bei festem Platz am Ende stehen und wird nicht verschoben (Aktionen) */
  festAmEnde?: boolean;
  /** Bei Platzmangel: kleinere Zahl = bleibt länger sichtbar */
  prioritaet?: number;
}

interface Einstellung {
  reihenfolge: string[];
  breiten: Record<string, number>;
  ausgeblendet: string[];
}

function laden(schluessel: string, defs: SpaltenDef[]): Einstellung {
  const standard: Einstellung = { reihenfolge: defs.filter(d => !d.festAmEnde).map(d => d.id), breiten: {}, ausgeblendet: [] };
  try {
    const roh = localStorage.getItem(schluessel);
    if (!roh) return standard;
    const e = JSON.parse(roh) as Partial<Einstellung>;
    const bekannt = new Set(standard.reihenfolge);
    // Neue Spalten (nach einem Update) hinten anhängen, entfernte vergessen
    const reihenfolge = (e.reihenfolge ?? []).filter(id => bekannt.has(id));
    for (const id of standard.reihenfolge) if (!reihenfolge.includes(id)) reihenfolge.push(id);
    return { reihenfolge, breiten: e.breiten ?? {}, ausgeblendet: (e.ausgeblendet ?? []).filter(id => bekannt.has(id)) };
  } catch {
    return standard;
  }
}

export function useSpalten(schluessel: string, defs: SpaltenDef[]) {
  const [einstellung, setEinstellung] = useState<Einstellung>(() => laden(schluessel, defs));
  const [platz, setPlatz] = useState(0);
  const beobachter = useRef<ResizeObserver | null>(null);

  // Breite des Tabellen-Containers messen (Callback-Ref, damit es auch nach dem Laden greift)
  const containerRef = useCallback((el: HTMLElement | null) => {
    beobachter.current?.disconnect();
    if (!el) return;
    setPlatz(el.clientWidth);
    beobachter.current = new ResizeObserver(([eintrag]) => setPlatz(eintrag.contentRect.width));
    beobachter.current.observe(el);
  }, []);
  useEffect(() => () => beobachter.current?.disconnect(), []);

  function speichern(neu: Einstellung) {
    setEinstellung(neu);
    try { localStorage.setItem(schluessel, JSON.stringify(neu)); } catch { /* egal */ }
  }

  const breiteVon = (d: SpaltenDef) => (d.flexibel ? d.breite : einstellung.breiten[d.id] ?? d.breite);

  // Was passt in den Platz? Pflichtspalten immer, dann nach Priorität
  const gewuenscht = defs.filter(d => d.pflicht || !einstellung.ausgeblendet.includes(d.id));
  let summe = gewuenscht.filter(d => d.pflicht).reduce((s, d) => s + breiteVon(d), 0);
  const passt = new Set(gewuenscht.filter(d => d.pflicht).map(d => d.id));
  const ohnePlatz: string[] = [];
  for (const d of gewuenscht.filter(d => !d.pflicht).sort((a, b) => (a.prioritaet ?? 99) - (b.prioritaet ?? 99))) {
    // Solange noch nicht gemessen (platz = 0), alles zeigen
    if (platz === 0 || summe + breiteVon(d) <= platz) { passt.add(d.id); summe += breiteVon(d); }
    else ohnePlatz.push(d.id);
  }

  const sichtbar = [
    ...einstellung.reihenfolge.map(id => defs.find(d => d.id === id)!).filter(d => d && passt.has(d.id)),
    ...defs.filter(d => d.festAmEnde && passt.has(d.id)),
  ].map(d => ({ ...d, aktuelleBreite: d.flexibel ? undefined : breiteVon(d) }));

  return {
    containerRef,
    sichtbar,
    ohnePlatz,
    ausgeblendet: einstellung.ausgeblendet,
    /** Breiten live setzen (beim Ziehen), dauerhaft=true beim Loslassen */
    breitenSetzen(breiten: Record<string, number>, dauerhaft = false) {
      const neu = { ...einstellung, breiten: { ...einstellung.breiten } };
      for (const [id, b] of Object.entries(breiten)) {
        const d = defs.find(x => x.id === id);
        if (d && !d.flexibel) neu.breiten[id] = Math.max(d.minBreite ?? 60, Math.round(b));
      }
      if (dauerhaft) speichern(neu); else setEinstellung(neu);
    },
    /** Spalte `id` vor `vorId` einsortieren */
    verschieben(id: string, vorId: string) {
      if (id === vorId) return;
      const r = einstellung.reihenfolge.filter(x => x !== id);
      const i = r.indexOf(vorId);
      r.splice(i < 0 ? r.length : i, 0, id);
      speichern({ ...einstellung, reihenfolge: r });
    },
    umschalten(id: string) {
      const aus = einstellung.ausgeblendet.includes(id)
        ? einstellung.ausgeblendet.filter(x => x !== id)
        : [...einstellung.ausgeblendet, id];
      speichern({ ...einstellung, ausgeblendet: aus });
    },
    zuruecksetzen() {
      try { localStorage.removeItem(schluessel); } catch { /* egal */ }
      setEinstellung(laden("", defs));
    },
  };
}
