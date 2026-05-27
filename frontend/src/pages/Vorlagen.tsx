import { useEffect, useState, FormEvent } from "react";
import { Plus, Trash2, Pencil, ChevronUp, ChevronDown, Loader2, Check, X, LayoutTemplate, FileText } from "lucide-react";
import { api, SitzungsVorlage, VorlageTOP } from "../lib/api";
import SitzungsEditor from "../components/SitzungsEditor";

function tiptapZuText(json: unknown): string {
  if (!json || typeof json !== "object") return "";
  const node = json as { type?: string; text?: string; content?: unknown[] };
  if (node.type === "text") return node.text ?? "";
  if (!node.content) return "";
  return node.content.map(tiptapZuText).join(" ").replace(/\s+/g, " ").trim();
}

// ── Inline-Editor für einen VorlageTOP ───────────────────────────
function TopEditForm({
  top,
  vorlageId,
  onSpeichern,
  onAbbrechen,
}: {
  top: VorlageTOP;
  vorlageId: string;
  onSpeichern: () => void;
  onAbbrechen: () => void;
}) {
  const [titel, setTitel]           = useState(top.titel);
  const [inhaltJson, setInhaltJson] = useState<object | null>(top.inhaltsJson ?? null);
  const [speichern, setSpeichern]   = useState(false);

  async function submit() {
    if (!titel.trim()) return;
    setSpeichern(true);
    try {
      await api.vorlagen.topAktualisieren(vorlageId, top.id, {
        titel:       titel.trim(),
        inhalt:      tiptapZuText(inhaltJson) || undefined,
        inhaltsJson: inhaltJson,
      });
      onSpeichern();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Fehler");
    } finally {
      setSpeichern(false);
    }
  }

  return (
    <div className="mt-2 space-y-2">
      <input
        value={titel}
        onChange={e => setTitel(e.target.value)}
        placeholder="Titel *"
        autoFocus
        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
      />
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <SitzungsEditor
          content={inhaltJson}
          onChange={setInhaltJson}
          placeholder="Beschreibung, Aufzählung, Hintergrund… (optional)"
          minHeight="100px"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={speichern || !titel.trim()}
          className="flex items-center gap-1 px-3 py-1.5 bg-[rgb(var(--accent))] hover:brightness-90 disabled:opacity-50 text-white text-xs rounded-lg"
        >
          {speichern ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
          Speichern
        </button>
        <button
          onClick={onAbbrechen}
          className="px-3 py-1.5 border border-gray-200 text-xs rounded-lg hover:bg-gray-50"
        >
          Abbrechen
        </button>
      </div>
    </div>
  );
}

// ── Formular für neuen TOP ────────────────────────────────────────
function NeuerTopForm({
  vorlageId,
  onHinzugefuegt,
}: {
  vorlageId: string;
  onHinzugefuegt: () => void;
}) {
  const [titel, setTitel]             = useState("");
  const [inhaltJson, setInhaltJson]   = useState<object | null>(null);
  const [mitInhalt, setMitInhalt]     = useState(false);
  const [speichern, setSpeichern]     = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!titel.trim()) return;
    setSpeichern(true);
    try {
      await api.vorlagen.topHinzufuegen(vorlageId, {
        titel:       titel.trim(),
        inhalt:      tiptapZuText(inhaltJson) || undefined,
        inhaltsJson: inhaltJson,
      });
      setTitel(""); setInhaltJson(null); setMitInhalt(false);
      onHinzugefuegt();
    } finally {
      setSpeichern(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2 mt-4 border-t border-gray-100 pt-4">
      <div className="flex gap-2">
        <input
          value={titel}
          onChange={e => setTitel(e.target.value)}
          placeholder="Neuen TOP hinzufügen…"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
        />
        <button
          type="button"
          onClick={() => setMitInhalt(v => !v)}
          title="Inhalt eingeben"
          className={`p-2 rounded-lg border text-xs transition-colors ${mitInhalt ? "border-[rgb(var(--accent))] text-[rgb(var(--accent))] bg-blue-50" : "border-gray-300 text-gray-400 hover:text-gray-600"}`}
        >
          <FileText size={14} />
        </button>
        <button
          type="submit"
          disabled={speichern || !titel.trim()}
          className="flex items-center gap-1.5 px-4 py-2 bg-[rgb(var(--accent))] hover:brightness-90 disabled:opacity-60 text-white text-sm rounded-lg"
        >
          {speichern ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Hinzufügen
        </button>
      </div>
      {mitInhalt && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <SitzungsEditor
            content={inhaltJson}
            onChange={setInhaltJson}
            placeholder="Beschreibung, Aufzählung, Hintergrund… (optional)"
            minHeight="100px"
          />
        </div>
      )}
    </form>
  );
}

// ── Hauptkomponente ───────────────────────────────────────────────
export default function Vorlagen() {
  const [vorlagen, setVorlagen]           = useState<SitzungsVorlage[]>([]);
  const [laden, setLaden]                 = useState(true);
  const [gewählt, setGewählt]             = useState<SitzungsVorlage | null>(null);
  const [neuerName, setNeuerName]         = useState("");
  const [neueBeschr, setNeueBeschr]       = useState("");
  const [neueFormOffen, setNeueFormOffen] = useState(false);
  const [nameBearbeiten, setNameBearbeiten] = useState(false);
  const [editName, setEditName]           = useState("");
  const [editBeschr, setEditBeschr]       = useState("");
  const [editTopId, setEditTopId]         = useState<string | null>(null);

  useEffect(() => { ladeVorlagen(); }, []);

  async function ladeVorlagen() {
    setLaden(true);
    try {
      const data = await api.vorlagen.liste();
      setVorlagen(data);
      if (gewählt) setGewählt(data.find(v => v.id === gewählt.id) ?? null);
    } finally {
      setLaden(false);
    }
  }

  async function vorlageErstellen(e: FormEvent) {
    e.preventDefault();
    if (!neuerName.trim()) return;
    const v = await api.vorlagen.erstellen({ name: neuerName.trim(), beschreibung: neueBeschr || undefined });
    setVorlagen(prev => [...prev, v].sort((a, b) => a.name.localeCompare(b.name)));
    setGewählt(v);
    setNeuerName(""); setNeueBeschr(""); setNeueFormOffen(false);
  }

  async function vorlageLoeschen(id: string) {
    if (!confirm("Vorlage wirklich löschen?")) return;
    await api.vorlagen.loeschen(id);
    setVorlagen(prev => prev.filter(v => v.id !== id));
    if (gewählt?.id === id) setGewählt(null);
  }

  async function nameSpeichern() {
    if (!gewählt || !editName.trim()) return;
    const v = await api.vorlagen.aktualisieren(gewählt.id, { name: editName.trim(), beschreibung: editBeschr || undefined });
    setVorlagen(prev => prev.map(x => x.id === v.id ? v : x).sort((a, b) => a.name.localeCompare(b.name)));
    setGewählt(v);
    setNameBearbeiten(false);
  }

  async function topLoeschen(topId: string) {
    if (!gewählt) return;
    await api.vorlagen.topLoeschen(gewählt.id, topId);
    setEditTopId(null);
    await ladeVorlagen();
  }

  async function topVerschieben(top: VorlageTOP, richtung: "hoch" | "runter") {
    if (!gewählt) return;
    const tops = [...gewählt.tops].sort((a, b) => a.reihenfolge - b.reihenfolge);
    const idx   = tops.findIndex(t => t.id === top.id);
    const tausch = richtung === "hoch" ? tops[idx - 1] : tops[idx + 1];
    if (!tausch) return;
    await Promise.all([
      api.vorlagen.topAktualisieren(gewählt.id, top.id,    { reihenfolge: tausch.reihenfolge }),
      api.vorlagen.topAktualisieren(gewählt.id, tausch.id, { reihenfolge: top.reihenfolge }),
    ]);
    await ladeVorlagen();
  }

  const sortierteTops = gewählt
    ? [...gewählt.tops].sort((a, b) => a.reihenfolge - b.reihenfolge)
    : [];

  return (
    <div className="flex flex-col md:flex-row h-full">
      {/* Linke Spalte – Vorlage-Liste */}
      <div className="w-full md:w-72 flex-shrink-0 border-r md:border-b-0 border-b border-gray-200 flex flex-col bg-white">
        <div className="px-4 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LayoutTemplate className="w-5 h-5 text-[rgb(var(--accent))]" />
            <span className="font-semibold text-gray-900">Sitzungsvorlagen</span>
          </div>
          <button
            onClick={() => setNeueFormOffen(v => !v)}
            className="p-1.5 text-[rgb(var(--accent))] hover:bg-blue-50 rounded-lg transition-colors"
            title="Neue Vorlage"
          >
            <Plus size={18} />
          </button>
        </div>

        {neueFormOffen && (
          <form onSubmit={vorlageErstellen} className="px-4 py-3 border-b border-gray-100 space-y-2 bg-blue-50">
            <input
              value={neuerName}
              onChange={e => setNeuerName(e.target.value)}
              placeholder="Name der Vorlage *"
              required
              autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
            />
            <input
              value={neueBeschr}
              onChange={e => setNeueBeschr(e.target.value)}
              placeholder="Beschreibung (optional)"
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
            />
            <div className="flex gap-2">
              <button type="submit" className="flex-1 py-1.5 text-xs bg-[rgb(var(--accent))] hover:brightness-90 text-white rounded-lg font-medium">Erstellen</button>
              <button type="button" onClick={() => setNeueFormOffen(false)} className="flex-1 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50">Abbrechen</button>
            </div>
          </form>
        )}

        <div className="flex-1 overflow-y-auto">
          {laden ? (
            <div className="flex items-center justify-center h-32 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Lade…
            </div>
          ) : vorlagen.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400 text-sm text-center px-4">
              <LayoutTemplate size={32} className="mb-2 opacity-30" />
              Noch keine Vorlagen.<br />Klicke auf + um eine anzulegen.
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {vorlagen.map(v => (
                <li
                  key={v.id}
                  onClick={() => { setGewählt(v); setNameBearbeiten(false); setEditTopId(null); }}
                  className={`px-4 py-3 cursor-pointer transition-colors group ${gewählt?.id === v.id ? "bg-[rgb(var(--accent)/0.1)] border-r-2 border-[rgb(var(--accent))]" : "hover:bg-gray-50"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{v.name}</p>
                      {v.beschreibung && <p className="text-xs text-gray-400 truncate">{v.beschreibung}</p>}
                      <p className="text-xs text-gray-400 mt-0.5">{v.tops.length} TOP{v.tops.length !== 1 ? "s" : ""}</p>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); vorlageLoeschen(v.id); }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-600 transition-all rounded"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Rechte Seite – Vorlage bearbeiten */}
      <div className="flex-1 flex flex-col bg-white overflow-y-auto">
        {gewählt ? (
          <div className="p-6">
            {/* Vorlage-Name */}
            <div className="mb-6">
              {nameBearbeiten ? (
                <div className="space-y-2">
                  <input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="text-xl font-bold border-b-2 border-blue-500 outline-none w-full bg-transparent"
                    autoFocus
                  />
                  <input
                    value={editBeschr}
                    onChange={e => setEditBeschr(e.target.value)}
                    placeholder="Beschreibung (optional)"
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                  />
                  <div className="flex gap-2">
                    <button onClick={nameSpeichern} className="flex items-center gap-1 px-3 py-1.5 bg-[rgb(var(--accent))] hover:brightness-90 text-white text-sm rounded-lg">
                      <Check size={14} /> Speichern
                    </button>
                    <button onClick={() => setNameBearbeiten(false)} className="px-3 py-1.5 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">
                      Abbrechen
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">{gewählt.name}</h2>
                    {gewählt.beschreibung && <p className="text-sm text-gray-500 mt-0.5">{gewählt.beschreibung}</p>}
                  </div>
                  <button
                    onClick={() => { setEditName(gewählt.name); setEditBeschr(gewählt.beschreibung ?? ""); setNameBearbeiten(true); }}
                    className="p-1.5 text-gray-400 hover:text-[rgb(var(--accent))] hover:bg-blue-50 rounded-lg"
                  >
                    <Pencil size={14} />
                  </button>
                </div>
              )}
            </div>

            {/* TOPs */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
                Tagesordnungspunkte
              </h3>

              {sortierteTops.length === 0 ? (
                <p className="text-sm text-gray-400 mb-4">Noch keine TOPs. Füge den ersten hinzu.</p>
              ) : (
                <ul className="space-y-2 mb-2">
                  {sortierteTops.map((top, idx) => (
                    <li key={top.id} className="bg-gray-50 rounded-lg px-4 py-3 group">
                      {editTopId === top.id ? (
                        <div className="flex items-start gap-3">
                          <span className="text-sm font-medium text-gray-400 w-6 text-right mt-2 shrink-0">{idx + 1}.</span>
                          <div className="flex-1">
                            <TopEditForm
                              top={top}
                              vorlageId={gewählt.id}
                              onSpeichern={async () => { setEditTopId(null); await ladeVorlagen(); }}
                              onAbbrechen={() => setEditTopId(null)}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-3">
                          <span className="text-sm font-medium text-gray-400 w-6 text-right shrink-0">{idx + 1}.</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-900">{top.titel}</p>
                            {(top.inhaltsJson || top.inhalt) && (
                              <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">
                                {top.inhaltsJson ? tiptapZuText(top.inhaltsJson as object) : top.inhalt}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <button
                              onClick={() => topVerschieben(top, "hoch")}
                              disabled={idx === 0}
                              className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 rounded"
                            >
                              <ChevronUp size={14} />
                            </button>
                            <button
                              onClick={() => topVerschieben(top, "runter")}
                              disabled={idx === sortierteTops.length - 1}
                              className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 rounded"
                            >
                              <ChevronDown size={14} />
                            </button>
                            <button
                              onClick={() => setEditTopId(top.id)}
                              className="p-1 text-gray-400 hover:text-[rgb(var(--accent))] rounded"
                              title="Bearbeiten"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => topLoeschen(top.id)}
                              className="p-1 text-gray-400 hover:text-red-600 rounded"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <NeuerTopForm
                vorlageId={gewählt.id}
                onHinzugefuegt={ladeVorlagen}
              />
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <LayoutTemplate size={48} className="mb-3 opacity-20" />
            <p className="text-sm">Vorlage auswählen oder neue anlegen</p>
          </div>
        )}
      </div>
    </div>
  );
}
