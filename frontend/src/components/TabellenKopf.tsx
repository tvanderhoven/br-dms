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

  function ziehenStart(e: ReactMouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    const th = (e.currentTarget as HTMLElement).parentElement!;
    const startX = e.clientX, startBreite = th.offsetWidth;
    let letzte = startBreite;
    const bewegen = (ev: MouseEvent) => { letzte = startBreite + ev.clientX - startX; spalten.breiteSetzen(id, letzte); };
    const loslassen = () => {
      document.removeEventListener("mousemove", bewegen);
      document.removeEventListener("mouseup", loslassen);
      document.body.style.cursor = "";
      spalten.breiteSetzen(id, letzte, true);
    };
    document.body.style.cursor = "col-resize";
    document.addEventListener("mousemove", bewegen);
    document.addEventListener("mouseup", loslassen);
  }

  const ausblendbar = defs.filter(d => !d.pflicht);

  return (
    <thead>
      <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
        {spalten.sichtbar.map(s => (
          <th
            key={s.id}
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
            className={`relative px-3 py-3 font-medium ${ziel === s.id ? "shadow-[inset_3px_0_0_rgb(var(--accent))]" : ""}`}
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
                  className="cursor-grab active:cursor-grabbing select-none"
                >
                  {s.label}
                </span>
                {/* Die flexible Spalte (Titel) nimmt immer den Rest – nur die festen haben einen Griff */}
                {!s.flexibel && (
                  <span
                    onMouseDown={e => ziehenStart(e, s.id)}
                    title="Ziehen für die Spaltenbreite"
                    className="absolute right-0 top-1.5 bottom-1.5 w-1.5 cursor-col-resize rounded bg-gray-200 hover:bg-[rgb(var(--accent)/0.5)]"
                  />
                )}
              </>
            )}
          </th>
        ))}
      </tr>
    </thead>
  );
}
