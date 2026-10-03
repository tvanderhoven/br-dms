import { useEffect, useState, FormEvent } from "react";
import {
  Plus, Trash2, Pencil, ChevronUp, ChevronDown, Loader2, Check, X,
  LayoutTemplate, FileText,
} from "lucide-react";
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
  const [titel, setTitel]           = useState("");
  const [inhaltJson, setInhaltJson] = useState<object | null>(null);
  const [mitInhalt, setMitInhalt]   = useState(false);
  const [speichern, setSpeichern]   = useState(false);

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
          className={`p-2 rounded-lg border text-xs transition-colors ${mitInhalt ? "border-[rgb(var(--accent))] text-[rgb(var(--accent))] bg-accent/5" : "border-gray-300 text-gray-400 hover:text-gray-600"}`}
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
  const [vorlagen, setVorlagen]               = useState<SitzungsVorlage[]>([]);
  const [laden, setLaden]                     = useState(true);
  const [ausgeklappt, setAusgeklappt]         = useState<string | null>(null);
  const [neueFormOffen, setNeueFormOffen]     = useState(false);
  const [neuerName, setNeuerName]             = useState("");
  const [neueBeschr, setNeueBeschr]           = useState("");
  const [nameBearbeitenId, setNameBearbeitenId] = useState<string | null>(null);
  const [editName, setEditName]               = useState("");
  const [editBeschr, setEditBeschr]           = useState("");
  const [editTopId, setEditTopId]             = useState<string | null>(null);

  useEffect(() => { ladeVorlagen(); }, []);

  async function ladeVorlagen() {
    setLaden(true);
    try { setVorlagen(await api.vorlagen.liste()); }
    finally { setLaden(false); }
  }

  async function vorlageErstellen(e: FormEvent) {
    e.preventDefault();
    if (!neuerName.trim()) return;
    const v = await api.vorlagen.erstellen({ name: neuerName.trim(), beschreibung: neueBeschr || undefined });
    setVorlagen(prev => [...prev, v].sort((a, b) => a.name.localeCompare(b.name)));
    setAusgeklappt(v.id);
    setNeuerName(""); setNeueBeschr(""); setNeueFormOffen(false);
  }

  async function vorlageLoeschen(id: string) {
    if (!confirm("Vorlage wirklich löschen?")) return;
    await api.vorlagen.loeschen(id);
    setVorlagen(prev => prev.filter(v => v.id !== id));
    if (ausgeklappt === id) setAusgeklappt(null);
  }

  async function nameSpeichern(id: string) {
    if (!editName.trim()) return;
    const v = await api.vorlagen.aktualisieren(id, { name: editName.trim(), beschreibung: editBeschr || undefined });
    setVorlagen(prev => prev.map(x => x.id === v.id ? v : x).sort((a, b) => a.name.localeCompare(b.name)));
    setNameBearbeitenId(null);
  }

  async function topLoeschen(vorlageId: string, topId: string) {
    await api.vorlagen.topLoeschen(vorlageId, topId);
    setEditTopId(null);
    await ladeVorlagen();
  }

  async function topVerschieben(vorlage: SitzungsVorlage, top: VorlageTOP, richtung: "hoch" | "runter") {
    const tops   = [...vorlage.tops].sort((a, b) => a.reihenfolge - b.reihenfolge);
    const idx    = tops.findIndex(t => t.id === top.id);
    const tausch = richtung === "hoch" ? tops[idx - 1] : tops[idx + 1];
    if (!tausch) return;
    await Promise.all([
      api.vorlagen.topAktualisieren(vorlage.id, top.id,    { reihenfolge: tausch.reihenfolge }),
      api.vorlagen.topAktualisieren(vorlage.id, tausch.id, { reihenfolge: top.reihenfolge }),
    ]);
    await ladeVorlagen();
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgb(var(--accent) / 0.1)" }}>
            <LayoutTemplate className="w-5 h-5" style={{ color: "rgb(var(--accent))" }} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Sitzungsvorlagen</h1>
            <p className="text-sm text-gray-500">{vorlagen.length} Vorlage{vorlagen.length !== 1 ? "n" : ""}</p>
          </div>
        </div>
        <button
          onClick={() => { setNeueFormOffen(v => !v); setAusgeklappt(null); }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white hover:brightness-90 transition-colors"
          style={{ backgroundColor: "rgb(var(--accent))" }}
        >
          <Plus size={16} /> Neu
        </button>
      </div>

      {/* Inline – Neue Vorlage anlegen */}
      {neueFormOffen && (
        <div className="bg-accent/5 border border-accent/25 rounded-xl p-4 mb-5">
          <h2 className="text-sm font-semibold text-accent mb-3">Neue Vorlage anlegen</h2>
          <form onSubmit={vorlageErstellen} className="space-y-2">
            <input
              value={neuerName}
              onChange={e => setNeuerName(e.target.value)}
              placeholder="Name der Vorlage *"
              required autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
            />
            <input
              value={neueBeschr}
              onChange={e => setNeueBeschr(e.target.value)}
              placeholder="Beschreibung (optional)"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
            />
            <div className="flex gap-2">
              <button type="submit"
                className="px-4 py-1.5 text-sm hover:brightness-90 text-white rounded-lg font-medium"
                style={{ backgroundColor: "rgb(var(--accent))" }}>
                Erstellen
              </button>
              <button type="button" onClick={() => setNeueFormOffen(false)}
                className="px-4 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
                Abbrechen
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Zähler */}
      <p className="text-xs text-gray-500 mb-3">
        {laden ? "Lade…" : `${vorlagen.length} Vorlage${vorlagen.length !== 1 ? "n" : ""}`}
      </p>

      {/* Liste */}
      {laden ? (
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Lade…
        </div>
      ) : vorlagen.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <LayoutTemplate size={40} className="mx-auto mb-3 opacity-20" />
          <p className="font-medium">Noch keine Vorlagen</p>
          <p className="text-sm mt-1">Klicke auf „Neu" um eine Vorlage anzulegen.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {vorlagen.map(v => {
            const sortierteTops = [...v.tops].sort((a, b) => a.reihenfolge - b.reihenfolge);
            const offen = ausgeklappt === v.id;

            return (
              <div key={v.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                {/* Kopfzeile */}
                <button
                  onClick={() => { setAusgeklappt(p => p === v.id ? null : v.id); setEditTopId(null); setNameBearbeitenId(null); }}
                  className="w-full text-left px-5 py-4 flex items-start gap-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900">{v.name}</p>
                    {v.beschreibung && <p className="text-sm text-gray-500 mt-0.5">{v.beschreibung}</p>}
                    <p className="text-xs text-gray-400 mt-0.5">{v.tops.length} TOP{v.tops.length !== 1 ? "s" : ""}</p>
                  </div>
                  {offen
                    ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
                    : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />}
                </button>

                {/* Ausgeklappter Inhalt */}
                {offen && (
                  <div className="px-5 pb-5 border-t border-gray-100 bg-gray-50">
                    {/* Name bearbeiten */}
                    <div className="mt-4 mb-5">
                      {nameBearbeitenId === v.id ? (
                        <div className="space-y-2">
                          <input
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            className="text-lg font-bold border-b-2 border-[rgb(var(--accent))] outline-none w-full bg-transparent"
                            autoFocus
                          />
                          <input
                            value={editBeschr}
                            onChange={e => setEditBeschr(e.target.value)}
                            placeholder="Beschreibung (optional)"
                            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                          />
                          <div className="flex gap-2">
                            <button onClick={() => nameSpeichern(v.id)}
                              className="flex items-center gap-1 px-3 py-1.5 text-sm text-white rounded-lg hover:brightness-90"
                              style={{ backgroundColor: "rgb(var(--accent))" }}>
                              <Check size={13} /> Speichern
                            </button>
                            <button onClick={() => setNameBearbeitenId(null)}
                              className="px-3 py-1.5 border border-gray-300 text-sm rounded-lg hover:bg-white">
                              Abbrechen
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => { setEditName(v.name); setEditBeschr(v.beschreibung ?? ""); setNameBearbeitenId(v.id); }}
                            className="p-1.5 text-gray-400 hover:text-[rgb(var(--accent))] hover:bg-accent/5 rounded-lg"
                            title="Name bearbeiten"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => vorlageLoeschen(v.id)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                            title="Vorlage löschen"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* TOPs */}
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                      Tagesordnungspunkte
                    </p>

                    {sortierteTops.length === 0 ? (
                      <p className="text-sm text-gray-400 mb-4">Noch keine TOPs. Füge den ersten hinzu.</p>
                    ) : (
                      <ul className="space-y-2 mb-2">
                        {sortierteTops.map((top, idx) => (
                          <li key={top.id} className="bg-white rounded-lg px-4 py-3 group border border-gray-100">
                            {editTopId === top.id ? (
                              <div className="flex items-start gap-3">
                                <span className="text-sm font-medium text-gray-400 w-6 text-right mt-2 shrink-0">{idx + 1}.</span>
                                <div className="flex-1">
                                  <TopEditForm
                                    top={top}
                                    vorlageId={v.id}
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
                                    onClick={() => topVerschieben(v, top, "hoch")}
                                    disabled={idx === 0}
                                    className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 rounded"
                                  >
                                    <ChevronUp size={14} />
                                  </button>
                                  <button
                                    onClick={() => topVerschieben(v, top, "runter")}
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
                                    onClick={() => topLoeschen(v.id, top.id)}
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

                    <NeuerTopForm vorlageId={v.id} onHinzugefuegt={ladeVorlagen} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
