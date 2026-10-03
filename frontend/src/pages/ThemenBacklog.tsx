import { useState, useEffect, useMemo } from "react";
import {
  Trash2, User, X, Pencil, ChevronLeft, ChevronRight, Lightbulb,
  Link2, Unlink, Kanban, Loader2,
} from "lucide-react";
import {
  api, Aufgabe, Benutzer, Prioritaet, KanbanStatus,
  SitzungListItem, Sitzung, formatDatum,
} from "../lib/api";
import SitzungsEditor from "../components/SitzungsEditor";
import { tiptapZuText, tiptapZuHtml, textZuTiptap } from "../lib/tiptap";

const PRIO_LABEL: Record<Prioritaet, string> = {
  HOCH: "Hoch", MITTEL: "Mittel", NIEDRIG: "Niedrig",
};

const KANBAN_SPALTEN: { status: KanbanStatus; label: string }[] = [
  { status: "BACKLOG",        label: "Backlog" },
  { status: "IN_BEARBEITUNG", label: "In Bearbeitung" },
  { status: "ERLEDIGT",       label: "Erledigt" },
];

// ── TOP-Verknüpfungs-Modal ───────────────────────────────────────────
function TopVerknuepfenModal({
  aufgabe,
  onVerknuepfen,
  onEntfernen,
  onSchliessen,
}: {
  aufgabe: Aufgabe;
  onVerknuepfen: (topId: string) => void;
  onEntfernen: () => void;
  onSchliessen: () => void;
}) {
  const [sitzungen, setSitzungen] = useState<SitzungListItem[]>([]);
  const [sitzungId, setSitzungId] = useState("");
  const [sitzung,   setSitzung]   = useState<Sitzung | null>(null);
  const [topId,     setTopId]     = useState("");
  const [laedt,     setLaedt]     = useState(false);

  useEffect(() => { api.sitzungen.liste().then(setSitzungen); }, []);

  useEffect(() => {
    if (!sitzungId) { setSitzung(null); setTopId(""); return; }
    setLaedt(true);
    api.sitzungen.einzel(sitzungId)
      .then(s => { setSitzung(s); setTopId(""); })
      .finally(() => setLaedt(false));
  }, [sitzungId]);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Link2 size={18} className="text-[rgb(var(--accent))]" />
            Mit TOP verknüpfen
          </h2>
          <button onClick={onSchliessen} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {aufgabe.top && (
          <div className="mb-4 flex items-center justify-between gap-2 bg-accent/5 border border-accent/25 rounded-lg px-3 py-2 text-sm">
            <span className="text-accent truncate">
              Aktuell: {aufgabe.top.sitzung.titel} · TOP {aufgabe.top.nummer} – {aufgabe.top.titel}
            </span>
            <button
              onClick={onEntfernen}
              title="Verknüpfung entfernen"
              className="text-accent/60 hover:text-red-500 shrink-0"
            >
              <Unlink size={15} />
            </button>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sitzung</label>
            <select
              value={sitzungId}
              onChange={e => setSitzungId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
            >
              <option value="">– auswählen –</option>
              {sitzungen.map(s => (
                <option key={s.id} value={s.id}>
                  {s.titel} ({formatDatum(s.sitzungsdatum)})
                </option>
              ))}
            </select>
          </div>

          {sitzungId && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">TOP</label>
              <select
                value={topId}
                onChange={e => setTopId(e.target.value)}
                disabled={laedt || !sitzung}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))] disabled:opacity-50"
              >
                <option value="">{laedt ? "lädt…" : "– auswählen –"}</option>
                {sitzung?.tops.map(t => (
                  <option key={t.id} value={t.id}>TOP {t.nummer} – {t.titel}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-5">
          <button
            type="button"
            onClick={onSchliessen}
            className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
          >
            Abbrechen
          </button>
          <button
            type="button"
            disabled={!topId}
            onClick={() => onVerknuepfen(topId)}
            className="flex-1 bg-[rgb(var(--accent))] hover:brightness-90 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Verknüpfen
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Thema bearbeiten (schlankes Formular – kein voller Aufgaben-Dialog) ──
function ThemaBearbeitenModal({
  thema,
  benutzer,
  onSpeichern,
  onSchliessen,
}: {
  thema: Aufgabe;
  benutzer: Benutzer[];
  onSpeichern: (daten: { titel: string; beschreibungJson: object | null; prioritaet: Prioritaet; zugewiesenAnId: string }) => Promise<void>;
  onSchliessen: () => void;
}) {
  const [titel, setTitel]                 = useState(thema.titel);
  const [beschreibungJson, setBeschreibungJson] = useState<object | null>(thema.beschreibungJson ?? textZuTiptap(thema.beschreibung));
  const [prioritaet, setPrioritaet]       = useState<Prioritaet>(thema.prioritaet);
  const [zugewiesenAnId, setZugewiesenAnId] = useState(thema.zugewiesenAn?.id ?? "");
  const [laden, setLaden]                 = useState(false);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">Thema bearbeiten</h2>
          <button onClick={onSchliessen} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <form
          onSubmit={async e => {
            e.preventDefault();
            if (!titel.trim()) return;
            setLaden(true);
            try {
              await onSpeichern({ titel: titel.trim(), beschreibungJson, prioritaet, zugewiesenAnId });
            } finally {
              setLaden(false);
            }
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Titel *</label>
            <input
              type="text"
              required
              autoFocus
              value={titel}
              onChange={e => setTitel(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Beschreibung / Fortschritt</label>
            <SitzungsEditor
              content={beschreibungJson}
              onChange={setBeschreibungJson}
              placeholder="Idee, Stand, nächste Schritte…"
              minHeight="110px"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priorität</label>
              <select
                value={prioritaet}
                onChange={e => setPrioritaet(e.target.value as Prioritaet)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
              >
                {(Object.keys(PRIO_LABEL) as Prioritaet[]).map(p => (
                  <option key={p} value={p}>{PRIO_LABEL[p]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Zugewiesen an</label>
              <select
                value={zugewiesenAnId}
                onChange={e => setZugewiesenAnId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
              >
                <option value="">– niemand –</option>
                {benutzer.filter(b => b.aktiv).map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onSchliessen}
              className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={laden}
              className="flex-1 bg-[rgb(var(--accent))] hover:brightness-90 disabled:opacity-60 text-white py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {laden ? <Loader2 size={14} className="animate-spin mx-auto" /> : "Speichern"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Kanban-Ansicht ────────────────────────────────────────────────────
function KanbanAnsicht({
  themen,
  onSchnellErstellen,
  onStatusAendern,
  onBearbeiten,
  onLoeschen,
  onVerknuepfen,
}: {
  themen: Aufgabe[];
  onSchnellErstellen: (titel: string, status: KanbanStatus) => void;
  onStatusAendern: (aufgabe: Aufgabe, status: KanbanStatus) => void;
  onBearbeiten: (a: Aufgabe) => void;
  onLoeschen: (id: string) => void;
  onVerknuepfen: (a: Aufgabe) => void;
}) {
  const [neuTitel, setNeuTitel] = useState<Record<string, string>>({});
  const [ziehtUeber, setZiehtUeber] = useState<KanbanStatus | null>(null);

  function absenden(status: KanbanStatus) {
    const titel = (neuTitel[status] ?? "").trim();
    if (!titel) return;
    onSchnellErstellen(titel, status);
    setNeuTitel(s => ({ ...s, [status]: "" }));
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {KANBAN_SPALTEN.map((spalte, spaltenIdx) => {
        const karten = themen.filter(t => t.kanbanStatus === spalte.status);
        return (
          <div
            key={spalte.status}
            onDragOver={e => { e.preventDefault(); setZiehtUeber(spalte.status); }}
            onDragLeave={() => setZiehtUeber(s => (s === spalte.status ? null : s))}
            onDrop={e => {
              e.preventDefault();
              setZiehtUeber(null);
              const id = e.dataTransfer.getData("text/aufgabe-id");
              const aufgabe = themen.find(t => t.id === id);
              if (aufgabe && aufgabe.kanbanStatus !== spalte.status) {
                onStatusAendern(aufgabe, spalte.status);
              }
            }}
            className={`rounded-xl border transition-colors ${
              ziehtUeber === spalte.status
                ? "border-[rgb(var(--accent))] bg-[rgb(var(--accent))]/5"
                : "border-gray-200 bg-gray-50"
            }`}
          >
            <div className="px-3 py-2.5 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">{spalte.label}</h3>
              <span className="text-xs text-gray-400 bg-gray-200 px-1.5 py-0.5 rounded-full">
                {karten.length}
              </span>
            </div>

            <div className="p-2.5 space-y-2 min-h-[80px]">
              {karten.map(karte => (
                <div
                  key={karte.id}
                  draggable
                  onDragStart={e => e.dataTransfer.setData("text/aufgabe-id", karte.id)}
                  className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 cursor-grab active:cursor-grabbing group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-gray-800 flex-1 min-w-0 break-words">
                      {karte.titel}
                    </p>
                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => onBearbeiten(karte)} title="Bearbeiten" className="text-gray-300 hover:text-accent">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => onLoeschen(karte.id)} title="Löschen" className="text-gray-300 hover:text-red-500">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {karte.beschreibungJson ? (
                    <div
                      className="text-xs text-gray-500 mt-1 line-clamp-3 [&_p]:my-0 [&_strong]:font-semibold [&_em]:italic"
                      dangerouslySetInnerHTML={{ __html: tiptapZuHtml(karte.beschreibungJson) }}
                    />
                  ) : karte.beschreibung && (
                    <p className="text-xs text-gray-500 mt-1 line-clamp-3">{karte.beschreibung}</p>
                  )}

                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    {karte.zugewiesenAn && (
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <User size={10} />
                        {karte.zugewiesenAn.name}
                      </span>
                    )}
                  </div>

                  {/* TOP-Verknüpfung */}
                  <button
                    onClick={() => onVerknuepfen(karte)}
                    title={karte.top ? "Verknüpfung anzeigen/ändern" : "Mit TOP verknüpfen"}
                    className={`mt-2 w-full text-left flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border transition-colors ${
                      karte.top
                        ? "bg-accent/5 text-accent border-accent/25 hover:bg-accent/10"
                        : "text-gray-400 border-dashed border-gray-300 hover:border-gray-400 hover:text-gray-600"
                    }`}
                  >
                    <Link2 size={11} className="shrink-0" />
                    <span className="truncate">
                      {karte.top
                        ? `TOP ${karte.top.nummer} – ${karte.top.titel}`
                        : "Mit TOP verknüpfen"}
                    </span>
                  </button>

                  {/* Spalten-Wechsel per Klick (Alternative zu Drag & Drop) */}
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                    <button
                      disabled={spaltenIdx === 0}
                      onClick={() => onStatusAendern(karte, KANBAN_SPALTEN[spaltenIdx - 1].status)}
                      className="text-gray-300 hover:text-gray-600 disabled:opacity-0 disabled:pointer-events-none"
                      title={spaltenIdx > 0 ? `Zurück zu „${KANBAN_SPALTEN[spaltenIdx - 1].label}"` : undefined}
                    >
                      <ChevronLeft size={15} />
                    </button>
                    <span className="text-[11px] text-gray-300">{spalte.label}</span>
                    <button
                      disabled={spaltenIdx === KANBAN_SPALTEN.length - 1}
                      onClick={() => onStatusAendern(karte, KANBAN_SPALTEN[spaltenIdx + 1].status)}
                      className="text-gray-300 hover:text-gray-600 disabled:opacity-0 disabled:pointer-events-none"
                      title={spaltenIdx < KANBAN_SPALTEN.length - 1 ? `Weiter zu „${KANBAN_SPALTEN[spaltenIdx + 1].label}"` : undefined}
                    >
                      <ChevronRight size={15} />
                    </button>
                  </div>
                </div>
              ))}

              {karten.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">Keine Themen</p>
              )}

              {/* Schnell-Erfassung – auch nur eine grobe Idee reicht */}
              <div className="flex items-center gap-1.5 pt-1">
                <Lightbulb size={13} className="text-gray-300 shrink-0" />
                <input
                  type="text"
                  value={neuTitel[spalte.status] ?? ""}
                  onChange={e => setNeuTitel(s => ({ ...s, [spalte.status]: e.target.value }))}
                  onKeyDown={e => { if (e.key === "Enter") absenden(spalte.status); }}
                  placeholder="+ Thema / Idee…"
                  className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Hauptkomponente ──────────────────────────────────────────────────
export default function ThemenBacklog() {
  const [aufgaben, setAufgaben] = useState<Aufgabe[]>([]);
  const [benutzer, setBenutzer] = useState<Benutzer[]>([]);
  const [bearbeiten, setBearbeiten] = useState<Aufgabe | null>(null);
  const [verknuepfen, setVerknuepfen] = useState<Aufgabe | null>(null);

  useEffect(() => { laden(); }, []);

  async function laden() {
    // Getrennt statt gemeinsam scheitern lassen, damit ein fehlschlagender
    // Aufruf nicht auch die eigentlich erfolgreiche Aufgabenliste mitreißt.
    const [a, b] = await Promise.all([
      api.aufgaben.liste().catch(() => [] as Aufgabe[]),
      api.get<Benutzer[]>("/api/benutzer").catch(() => [] as Benutzer[]),
    ]);
    setAufgaben(a);
    setBenutzer(b);
  }

  const themen = useMemo(
    () => aufgaben.filter(a => a.kanbanStatus != null),
    [aufgaben],
  );

  async function themaSchnellErstellen(titel: string, kanbanStatus: KanbanStatus) {
    const neu = await api.aufgaben.erstellen({
      titel,
      typ: "AUFGABE",
      sichtbarkeit: "OEFFENTLICH",
      kanbanStatus,
    });
    setAufgaben(a => [neu, ...a]);
  }

  async function themaStatusAendern(aufgabe: Aufgabe, kanbanStatus: KanbanStatus) {
    const aktualisiert = await api.aufgaben.aktualisieren(aufgabe.id, { kanbanStatus });
    setAufgaben(a => a.map(x => x.id === aufgabe.id ? aktualisiert : x));
  }

  async function themaSpeichern(daten: { titel: string; beschreibungJson: object | null; prioritaet: Prioritaet; zugewiesenAnId: string }) {
    if (!bearbeiten) return;
    const aktualisiert = await api.aufgaben.aktualisieren(bearbeiten.id, {
      titel:            daten.titel,
      beschreibung:     tiptapZuText(daten.beschreibungJson) || undefined,
      beschreibungJson: daten.beschreibungJson ?? undefined,
      prioritaet:       daten.prioritaet,
      zugewiesenAnId:   daten.zugewiesenAnId || undefined,
    });
    setAufgaben(a => a.map(x => x.id === bearbeiten.id ? aktualisiert : x));
    setBearbeiten(null);
  }

  async function themaLoeschen(id: string) {
    if (!confirm("Thema wirklich löschen?")) return;
    await api.aufgaben.loeschen(id);
    setAufgaben(a => a.filter(x => x.id !== id));
  }

  async function topVerknuepfen(topId: string) {
    if (!verknuepfen) return;
    const aktualisiert = await api.aufgaben.aktualisieren(verknuepfen.id, { topId });
    setAufgaben(a => a.map(x => x.id === verknuepfen.id ? aktualisiert : x));
    setVerknuepfen(null);
  }

  async function topEntfernen() {
    if (!verknuepfen) return;
    const aktualisiert = await api.aufgaben.aktualisieren(verknuepfen.id, { topId: null });
    setAufgaben(a => a.map(x => x.id === verknuepfen.id ? aktualisiert : x));
    setVerknuepfen(null);
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Kanban className="text-[rgb(var(--accent))]" size={26} />
          Themen-Backlog
        </h1>
        <p className="text-gray-500 text-sm mt-0.5">
          {themen.length} {themen.length === 1 ? "Thema" : "Themen"} · Ideen, aktive Themen & bereits behandelte TOPs
        </p>
      </div>

      <KanbanAnsicht
        themen={themen}
        onSchnellErstellen={themaSchnellErstellen}
        onStatusAendern={themaStatusAendern}
        onBearbeiten={setBearbeiten}
        onLoeschen={themaLoeschen}
        onVerknuepfen={setVerknuepfen}
      />

      {bearbeiten && (
        <ThemaBearbeitenModal
          thema={bearbeiten}
          benutzer={benutzer}
          onSpeichern={themaSpeichern}
          onSchliessen={() => setBearbeiten(null)}
        />
      )}

      {verknuepfen && (
        <TopVerknuepfenModal
          aufgabe={verknuepfen}
          onVerknuepfen={topVerknuepfen}
          onEntfernen={topEntfernen}
          onSchliessen={() => setVerknuepfen(null)}
        />
      )}
    </div>
  );
}
