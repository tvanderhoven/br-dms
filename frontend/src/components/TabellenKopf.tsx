// Tabellenkopf mit einstellbaren Spalten (lib/tabellenSpalten.ts):
// Namen packen und verschieben, rechten Rand ziehen für die Breite, Menü zum Ein-/Ausblenden.
import { useEffect, useRef, useState, MouseEvent as ReactMouseEvent } from "react";
import { Columns3, RotateCcw } from "lucide-react";
import type { SpaltenDef, useSpalten } from "../lib/tabellenSpalten";

const DRAG_SPALTE = "application/x-brdms-spalte";

export default function TabellenKopf({ spalten, defs }: {
  spalten: ReturnType<typeof useSpalten>;
  defs: SpaltenDef[];
}) {
  const [menuOffen, setMenuOffen] = useState(false);
  const [ziel, setZiel] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Menü schließen bei Klick daneben
  useEffect(() => {
    if (!menuOffen) return;
    const zu = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuOffen(false); };
    document.addEventListener("mousedown", zu);
    return () => document.removeEventListener("mousedown", zu);
  }, [menuOffen]);

  // Grenze zwischen zwei Spalten ziehen – wie in einer Tabellenkalkulation: die Grenze
  // bleibt unter der Maus, die linke Spalte wächst um genau so viel, wie die rechte
  // schrumpft. Ist eine der beiden die flexible Spalte (Titel), gleicht sie aus.
  function ziehenStart(e: ReactMouseEvent, links: typeof spalten.sichtbar[number], rechts: typeof spalten.sichtbar[number]) {
    e.preventDefault();
    e.stopPropagation();
    const zeile = (e.currentTarget as HTMLElement).closest("tr")!;
    const breite = (id: string) => (zeile.querySelector(`th[data-spalte="${id}"]`) as HTMLElement).offsetWidth;
    const startX = e.clientX;
    const startL = breite(links.id), startR = breite(rechts.id);
    const minL = links.minBreite ?? (links.flexibel ? links.breite : 60);
    const minR = rechts.minBreite ?? (rechts.flexibel ? rechts.breite : 60);
    // Wie weit darf die Grenze wandern, ohne dass eine Seite unter ihre Mindestbreite fällt?
    const dxMin = minL - startL, dxMax = startR - minR;
    let neu: Record<string, number> = {};
    const bewegen = (ev: MouseEvent) => {
      const dx = Math.min(dxMax, Math.max(dxMin, ev.clientX - startX));
      neu = {};
      if (!links.flexibel)  neu[links.id]  = startL + dx;
      if (!rechts.flexibel) neu[rechts.id] = startR - dx;
      spalten.breitenSetzen(neu);
    };
    const loslassen = () => {
      document.removeEventListener("mousemove", bewegen);
      document.removeEventListener("mouseup", loslassen);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      spalten.breitenSetzen(neu, true);
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", bewegen);
    document.addEventListener("mouseup", loslassen);
  }

  const ausblendbar = defs.filter(d => !d.pflicht);

  return (
    <thead>
      <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
        {spalten.sichtbar.map((s, i) => (
          <th
            key={s.id}
            data-spalte={s.id}
            style={s.aktuelleBreite !== undefined ? { width: s.aktuelleBreite } : undefined}
            onDragOver={e => {
              if (s.festAmEnde || !e.dataTransfer.types.includes(DRAG_SPALTE)) return;
              e.preventDefault(); e.dataTransfer.dropEffect = "move"; setZiel(s.id);
            }}
            onDragLeave={() => setZiel(z => (z === s.id ? null : z))}
            onDrop={e => {
              e.preventDefault(); setZiel(null);
              const id = e.dataTransfer.getData(DRAG_SPALTE);
              if (id) spalten.verschieben(id, s.id);
            }}
            className={`relative px-3 py-3 font-medium whitespace-nowrap overflow-visible ${ziel === s.id ? "shadow-[inset_3px_0_0_rgb(var(--accent))]" : ""}`}
          >
            {s.festAmEnde ? (
              <div ref={menuRef} className="relative flex justify-end">
                <button
                  onClick={() => setMenuOffen(o => !o)}
                  title="Spalten ein- und ausblenden"
                  className="p-1 rounded text-gray-400 hover:text-[rgb(var(--accent))] hover:bg-accent/5 normal-case"
                >
                  <Columns3 size={15} />
                </button>
                {menuOffen && (
                  <div className="absolute right-0 top-full mt-1 z-20 w-56 bg-white border border-gray-200 rounded-lg shadow-lg py-1 normal-case tracking-normal text-sm font-normal text-gray-700">
                    <p className="px-3 py-1.5 text-xs text-gray-400">Spalten anzeigen</p>
                    {ausblendbar.map(d => (
                      <label key={d.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!spalten.ausgeblendet.includes(d.id)}
                          onChange={() => spalten.umschalten(d.id)}
                          className="rounded border-gray-300 text-[rgb(var(--accent))]"
                        />
                        <span className="flex-1">{d.label}</span>
                        {spalten.ohnePlatz.includes(d.id) && (
                          <span className="text-[10px] text-gray-400" title="Gerade zu wenig Platz – erscheint bei breiterem Fenster oder geschlossener Vorschau">
                            kein Platz
                          </span>
                        )}
                      </label>
                    ))}
                    <div className="border-t border-gray-100 mt-1 pt-1">
                      <button
                        onClick={() => { spalten.zuruecksetzen(); setMenuOffen(false); }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-gray-600 hover:bg-gray-50"
                      >
                        <RotateCcw size={13} /> Standard wiederherstellen
                      </button>
                    </div>
                    <p className="px-3 pt-1 pb-1.5 text-[11px] text-gray-400 leading-snug">
                      Spaltennamen ziehen zum Verschieben, rechten Rand ziehen für die Breite.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <>
                <span
                  draggable
                  onDragStart={e => { e.dataTransfer.setData(DRAG_SPALTE, s.id); e.dataTransfer.effectAllowed = "move"; }}
                  title="Ziehen zum Verschieben"
                  className="block truncate cursor-grab active:cursor-grabbing select-none"
                >
                  {s.label}
                </span>
                {/* Griff auf der Grenze zur rechten Nachbarspalte (nicht vor der Aktionen-Spalte) */}
                {i + 1 < spalten.sichtbar.length && !spalten.sichtbar[i + 1].festAmEnde && (
                  <span
                    onMouseDown={e => ziehenStart(e, s, spalten.sichtbar[i + 1])}
                    title="Ziehen, um die Grenze zwischen den Spalten zu verschieben"
                    className="group absolute -right-1.5 top-0 bottom-0 w-3 z-10 cursor-col-resize flex justify-center"
                  >
                    <span className="w-px h-full bg-gray-200 group-hover:w-0.5 group-hover:bg-[rgb(var(--accent))]" />
                  </span>
                )}
              </>
            )}
          </th>
        ))}
      </tr>
    </thead>
  );
}
