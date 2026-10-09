import { useEffect, useState, DragEvent, KeyboardEvent } from "react";
import {
  ChevronRight, ChevronDown, Folder, FolderOpen, FolderPlus, Pencil, Trash2, Layers, FileText, Check, X, ChevronsLeft,
} from "lucide-react";
import { api, Ordner } from "../lib/api";

// "ALLE" = alle Dokumente wie bisher, "OHNE" = Dokumente ohne Ordner, sonst Ordner-ID
export type OrdnerAuswahl = "ALLE" | "OHNE" | string;

export const DRAG_DOKUMENT = "application/x-brdms-dokument";
const DRAG_ORDNER = "application/x-brdms-ordner";
const OFFEN_SPEICHER = "brdms_ordner_offen";

const nachName = (a: Ordner, b: Ordner) => a.name.localeCompare(b.name, "de", { sensitivity: "base" });

/** Kette vom obersten Ordner bis zu `id` (leer, wenn nicht gefunden) */
export function ordnerPfad(ordner: Ordner[], id: string | null | undefined): Ordner[] {
  const kette: Ordner[] = [];
  let aktuell = ordner.find(o => o.id === id);
  while (aktuell && kette.length < 100) {
    kette.unshift(aktuell);
    aktuell = ordner.find(o => o.id === aktuell!.elternId);
  }
  return kette;
}

/** Alle Ordner in Baumreihenfolge mit Pfad als Bezeichnung – für Auswahllisten */
export function ordnerOptionen(ordner: Ordner[]): { id: string; label: string }[] {
  const ergebnis: { id: string; label: string }[] = [];
  const besuche = (elternId: string | null, praefix: string) => {
    for (const o of ordner.filter(x => x.elternId === elternId).sort(nachName)) {
      const label = praefix ? `${praefix} › ${o.name}` : o.name;
      ergebnis.push({ id: o.id, label });
      besuche(o.id, label);
    }
  };
  besuche(null, "");
  return ergebnis;
}

function offeneLaden(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(OFFEN_SPEICHER) ?? "[]")); }
  catch { return new Set(); }
}

type Bearbeitung = { modus: "neu"; elternId: string | null } | { modus: "umbenennen"; id: string } | null;

export default function OrdnerBaum({
  ordner, anzahl, gesamt, auswahl, onAuswahl, onDokumentAblegen, onGeaendert, onEinklappen,
}: {
  ordner: Ordner[];
  /** Dokumente direkt im Ordner (Schlüssel: Ordner-ID bzw. "OHNE") */
  anzahl: Record<string, number>;
  gesamt: number;
  auswahl: OrdnerAuswahl;
  onAuswahl: (a: OrdnerAuswahl) => void;
  onDokumentAblegen: (dokumentId: string, ordnerId: string | null) => void;
  onGeaendert: () => void;
  /** Baum zur schmalen Leiste einklappen (mehr Platz für Liste und Vorschau) */
  onEinklappen?: () => void;
}) {
  const [offen, setOffen]             = useState<Set<string>>(offeneLaden);
  const [bearbeitung, setBearbeitung] = useState<Bearbeitung>(null);
  const [eingabe, setEingabe]         = useState("");
  const [ziel, setZiel]               = useState<string | null>(null); // Drop-Ziel unter dem Mauszeiger

  function offenSetzen(neu: Set<string>) {
    setOffen(neu);
    try { localStorage.setItem(OFFEN_SPEICHER, JSON.stringify([...neu])); } catch { /* egal */ }
  }

  // Gewählten Ordner sichtbar machen (z. B. nach Klick im Pfad oder in der Liste)
  useEffect(() => {
    const vorfahren = ordnerPfad(ordner, auswahl).slice(0, -1).map(o => o.id);
    if (vorfahren.some(id => !offen.has(id))) offenSetzen(new Set([...offen, ...vorfahren]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auswahl, ordner]);

  function umschalten(id: string) {
    const neu = new Set(offen);
    if (neu.has(id)) neu.delete(id); else neu.add(id);
    offenSetzen(neu);
  }

  function neuerOrdner(elternId: string | null) {
    if (elternId) offenSetzen(new Set([...offen, elternId]));
    setBearbeitung({ modus: "neu", elternId });
    setEingabe("");
  }

  async function bearbeitungSpeichern() {
    const name = eingabe.trim();
    if (!bearbeitung || !name) { setBearbeitung(null); return; }
    try {
      if (bearbeitung.modus === "neu") {
        const o = await api.ordner.anlegen(name, bearbeitung.elternId);
        onAuswahl(o.id);
      } else {
        await api.ordner.aktualisieren(bearbeitung.id, { name });
      }
      setBearbeitung(null);
      onGeaendert();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ordner konnte nicht gespeichert werden");
    }
  }

  async function loeschen(o: Ordner) {
    if (!confirm(`Ordner „${o.name}“ löschen?`)) return;
    try {
      await api.ordner.loeschen(o.id);
      if (auswahl === o.id) onAuswahl(o.elternId ?? "ALLE");
      onGeaendert();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ordner konnte nicht gelöscht werden");
    }
  }

  // ── Drag & Drop: Dokumente aus der Liste und Ordner im Baum ─────
  function ueber(e: DragEvent, zielId: string) {
    const typen = e.dataTransfer.types;
    if (!typen.includes(DRAG_DOKUMENT) && !typen.includes(DRAG_ORDNER)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setZiel(zielId);
  }

  async function ablegen(e: DragEvent, zielOrdnerId: string | null) {
    e.preventDefault();
    setZiel(null);
    const dokumentId = e.dataTransfer.getData(DRAG_DOKUMENT);
    if (dokumentId) { onDokumentAblegen(dokumentId, zielOrdnerId); return; }
    const ordnerId = e.dataTransfer.getData(DRAG_ORDNER);
    if (!ordnerId || ordnerId === zielOrdnerId) return;
    const o = ordner.find(x => x.id === ordnerId);
    if (!o || o.elternId === zielOrdnerId) return;
    try {
      await api.ordner.aktualisieren(ordnerId, { elternId: zielOrdnerId });
      if (zielOrdnerId) offenSetzen(new Set([...offen, zielOrdnerId]));
      onGeaendert();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ordner konnte nicht verschoben werden");
    }
  }

  function tasten(e: KeyboardEvent) {
    if (e.key === "Enter") { e.preventDefault(); bearbeitungSpeichern(); }
    if (e.key === "Escape") setBearbeitung(null);
  }

  const eingabeFeld = (einzug: number) => (
    <div className="flex items-center gap-1 py-0.5 pr-1" style={{ paddingLeft: 8 + einzug * 14 }}>
      <Folder size={14} className="text-gray-400 shrink-0" />
      <input
        autoFocus
        value={eingabe}
        onChange={e => setEingabe(e.target.value)}
        onKeyDown={tasten}
        maxLength={100}
        placeholder="Ordnername"
        className="flex-1 min-w-0 text-sm border border-gray-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
      />
      <button onClick={bearbeitungSpeichern} title="Speichern" className="p-0.5 text-gray-500 hover:text-[rgb(var(--accent))]">
        <Check size={14} />
      </button>
      <button onClick={() => setBearbeitung(null)} title="Abbrechen" className="p-0.5 text-gray-400 hover:text-gray-600">
        <X size={14} />
      </button>
    </div>
  );

  const zeilenKlasse = (aktiv: boolean, istZiel: boolean) =>
    `group flex items-center gap-1.5 py-1 pr-1 rounded-md text-sm cursor-pointer select-none transition-colors ${
      istZiel ? "bg-[rgb(var(--accent)/0.15)] ring-1 ring-[rgb(var(--accent))]"
      : aktiv ? "bg-[rgb(var(--accent)/0.1)] text-[rgb(var(--accent))] font-medium"
      : "text-gray-700 hover:bg-gray-100"
    }`;

  function zweig(elternId: string | null, tiefe: number): JSX.Element[] {
    const kinder = ordner.filter(o => o.elternId === elternId).sort(nachName);
    const zeilen: JSX.Element[] = [];
    for (const o of kinder) {
      const hatKinder = ordner.some(x => x.elternId === o.id);
      const istOffen  = offen.has(o.id);
      const leer      = !hatKinder && (anzahl[o.id] ?? 0) === 0;
      if (bearbeitung?.modus === "umbenennen" && bearbeitung.id === o.id) {
        zeilen.push(<div key={o.id}>{eingabeFeld(tiefe)}</div>);
      } else {
        zeilen.push(
          <div
            key={o.id}
            draggable
            onDragStart={e => { e.dataTransfer.setData(DRAG_ORDNER, o.id); e.dataTransfer.effectAllowed = "move"; }}
            onDragOver={e => ueber(e, o.id)}
            onDragLeave={() => setZiel(z => (z === o.id ? null : z))}
            onDrop={e => ablegen(e, o.id)}
            onClick={() => onAuswahl(o.id)}
            className={zeilenKlasse(auswahl === o.id, ziel === o.id)}
            style={{ paddingLeft: 4 + tiefe * 14 }}
          >
            <button
              onClick={e => { e.stopPropagation(); umschalten(o.id); }}
              className={`p-0.5 rounded hover:bg-gray-200 ${hatKinder ? "text-gray-400" : "invisible"}`}
              tabIndex={hatKinder ? 0 : -1}
              aria-label={istOffen ? "Zuklappen" : "Aufklappen"}
            >
              {istOffen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
            {auswahl === o.id || (istOffen && hatKinder)
              ? <FolderOpen size={14} className="shrink-0" />
              : <Folder size={14} className="shrink-0 text-gray-400" />}
            <span className="truncate flex-1" title={o.name}>{o.name}</span>
            <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100" onClick={e => e.stopPropagation()}>
              <button onClick={() => neuerOrdner(o.id)} title="Unterordner anlegen" className="p-0.5 text-gray-400 hover:text-[rgb(var(--accent))]">
                <FolderPlus size={13} />
              </button>
              <button onClick={() => { setBearbeitung({ modus: "umbenennen", id: o.id }); setEingabe(o.name); }} title="Umbenennen" className="p-0.5 text-gray-400 hover:text-[rgb(var(--accent))]">
                <Pencil size={13} />
              </button>
              {leer && (
                <button onClick={() => loeschen(o)} title="Leeren Ordner löschen" className="p-0.5 text-gray-400 hover:text-red-600">
                  <Trash2 size={13} />
                </button>
              )}
            </span>
            {(anzahl[o.id] ?? 0) > 0 && (
              <span className="text-xs text-gray-400 tabular-nums group-hover:hidden">{anzahl[o.id]}</span>
            )}
          </div>
        );
      }
      if (istOffen && hatKinder) zeilen.push(...zweig(o.id, tiefe + 1));
      if (bearbeitung?.modus === "neu" && bearbeitung.elternId === o.id) {
        zeilen.push(<div key={`neu-${o.id}`}>{eingabeFeld(tiefe + 1)}</div>);
      }
    }
    return zeilen;
  }

  return (
    <nav aria-label="Ordner" className="space-y-0.5">
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Ablage</span>
        <span className="flex items-center">
          <button onClick={() => neuerOrdner(null)} title="Neuen Ordner anlegen" className="p-1 text-gray-400 hover:text-[rgb(var(--accent))] hover:bg-accent/5 rounded">
            <FolderPlus size={15} />
          </button>
          {onEinklappen && (
            <button onClick={onEinklappen} title="Ordner ausblenden (mehr Platz für die Liste)" className="p-1 text-gray-400 hover:text-[rgb(var(--accent))] hover:bg-accent/5 rounded">
              <ChevronsLeft size={15} />
            </button>
          )}
        </span>
      </div>

      <div onClick={() => onAuswahl("ALLE")} className={zeilenKlasse(auswahl === "ALLE", false)} style={{ paddingLeft: 6 }}>
        <Layers size={14} className="shrink-0" />
        <span className="flex-1">Alle Dokumente</span>
        <span className="text-xs text-gray-400 tabular-nums">{gesamt}</span>
      </div>
      <div
        onClick={() => onAuswahl("OHNE")}
        onDragOver={e => ueber(e, "OHNE")}
        onDragLeave={() => setZiel(z => (z === "OHNE" ? null : z))}
        onDrop={e => ablegen(e, null)}
        title="Dokumente ohne Ordner – hierher ziehen, um aus einem Ordner zu nehmen"
        className={zeilenKlasse(auswahl === "OHNE", ziel === "OHNE")}
        style={{ paddingLeft: 6 }}
      >
        <FileText size={14} className="shrink-0" />
        <span className="flex-1">Ohne Ordner</span>
        <span className="text-xs text-gray-400 tabular-nums">{anzahl.OHNE ?? 0}</span>
      </div>

      <div className="pt-1 border-t border-gray-100 mt-1">
        {zweig(null, 0)}
        {bearbeitung?.modus === "neu" && bearbeitung.elternId === null && eingabeFeld(0)}
        {ordner.length === 0 && bearbeitung === null && (
          <p className="text-xs text-gray-400 px-2 py-2 leading-relaxed">
            Noch keine Ordner. Mit <FolderPlus size={11} className="inline -mt-0.5" /> anlegen, dann Dokumente aus
            der Liste hineinziehen.
          </p>
        )}
      </div>
    </nav>
  );
}
