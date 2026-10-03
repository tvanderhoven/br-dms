import { useState, useEffect, FormEvent } from "react";
import {
  Globe, Plus, Trash2, Search, X, ExternalLink, Tag,
  Loader2, Edit3, Scale, Brain, Building2, FileText, Link2,
  ChevronDown, ChevronUp,
} from "lucide-react";
import {
  api, Ressource, RessourceErstellen, RessourceKategorie,
  RESSOURCE_KATEGORIE_LABEL, RESSOURCE_KATEGORIE_FARBE, formatDatum,
} from "../lib/api";

const KATEGORIEN: RessourceKategorie[] = ["GESETZ", "KI_WERKZEUG", "BEHOERDE", "VORLAGE", "SONSTIGES"];

const KATEGORIE_ICON: Record<RessourceKategorie, React.ReactNode> = {
  GESETZ:      <Scale size={14} />,
  KI_WERKZEUG: <Brain size={14} />,
  BEHOERDE:    <Building2 size={14} />,
  VORLAGE:     <FileText size={14} />,
  SONSTIGES:   <Link2 size={14} />,
};

// Favicon direkt von der verlinkten Seite selbst laden (nicht über einen Drittanbieter-Dienst
// wie Google – die Ressource wird ohnehin schon extern aufgerufen, sonst keine Zusatzabfrage).
function favicon(url: string): string | null {
  try { return `https://${new URL(url).hostname}/favicon.ico`; }
  catch { return null; }
}

function Favicon({ url }: { url: string }) {
  const [fehler, setFehler] = useState(false);
  const src = favicon(url);
  if (!src || fehler) return null;
  return (
    <img
      src={src}
      onError={() => setFehler(true)}
      className="w-4 h-4 rounded-sm shrink-0 object-contain"
      alt=""
    />
  );
}

export default function Ressourcen() {
  const [liste, setListe]             = useState<Ressource[]>([]);
  const [laden, setLaden]             = useState(true);
  const [suche, setSuche]             = useState("");
  const [aktivKat, setAktivKat]       = useState<RessourceKategorie | null>(null);
  const [ausgeklappt, setAusgeklappt] = useState<string | null>(null);
  const [modal, setModal]             = useState(false);
  const [bearbeitet, setBearbeitet]   = useState(false);
  const [tagInput, setTagInput]       = useState("");
  const [form, setForm]               = useState<RessourceErstellen & { id?: string }>({
    titel: "", url: "", beschreibung: "", kategorie: "SONSTIGES", tags: [],
  });

  useEffect(() => { laden_(); }, []);

  async function laden_() {
    setLaden(true);
    try { setListe(await api.ressourcen.liste()); }
    finally { setLaden(false); }
  }

  function oeffneModal(r?: Ressource) {
    if (r) {
      setForm({ id: r.id, titel: r.titel, url: r.url, beschreibung: r.beschreibung ?? "", kategorie: r.kategorie, tags: r.tags });
      setBearbeitet(true);
    } else {
      setForm({ titel: "", url: "", beschreibung: "", kategorie: "SONSTIGES", tags: [] });
      setBearbeitet(false);
    }
    setModal(true);
  }

  async function speichern(e: FormEvent) {
    e.preventDefault();
    if (!form.titel.trim() || !form.url.trim()) return;
    let url = form.url.trim();
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    const payload: RessourceErstellen = {
      titel: form.titel.trim(), url,
      beschreibung: form.beschreibung || undefined,
      kategorie: form.kategorie, tags: form.tags,
    };
    try {
      if (bearbeitet && form.id) {
        const r = await api.ressourcen.aktualisieren(form.id, payload);
        setListe(prev => prev.map(x => x.id === r.id ? r : x));
      } else {
        const r = await api.ressourcen.erstellen(payload);
        setListe(prev => [r, ...prev]);
      }
      setModal(false);
    } catch {}
  }

  async function loeschen(id: string) {
    if (!confirm("Ressource wirklich löschen?")) return;
    await api.ressourcen.loeschen(id);
    setListe(prev => prev.filter(x => x.id !== id));
    if (ausgeklappt === id) setAusgeklappt(null);
  }

  function tagHinzufuegen() {
    const t = tagInput.trim();
    if (t && !(form.tags ?? []).includes(t))
      setForm(f => ({ ...f, tags: [...(f.tags ?? []), t] }));
    setTagInput("");
  }

  const gefiltert = liste.filter(r => {
    const matchKat  = !aktivKat || r.kategorie === aktivKat;
    const matchSuch = !suche.trim() ||
      r.titel.toLowerCase().includes(suche.toLowerCase()) ||
      r.url.toLowerCase().includes(suche.toLowerCase()) ||
      r.beschreibung?.toLowerCase().includes(suche.toLowerCase()) ||
      r.tags.some(t => t.toLowerCase().includes(suche.toLowerCase()));
    return matchKat && matchSuch;
  });

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgb(var(--accent) / 0.1)" }}>
            <Globe className="w-5 h-5" style={{ color: "rgb(var(--accent))" }} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Ressourcen</h1>
            <p className="text-sm text-gray-500">Links, Werkzeuge &amp; Referenzen</p>
          </div>
        </div>
        <button
          onClick={() => oeffneModal()}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white hover:brightness-90 transition-colors"
          style={{ backgroundColor: "rgb(var(--accent))" }}
        >
          <Plus size={16} /> Neu
        </button>
      </div>

      {/* Filter */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5 flex flex-wrap gap-3 items-center">
        <div className="flex items-center bg-gray-100 rounded-lg px-2.5 py-1.5 flex-1 min-w-[180px]">
          <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          <input
            type="text"
            value={suche}
            onChange={e => setSuche(e.target.value)}
            placeholder="Suchen…"
            className="bg-transparent text-sm w-full outline-none ml-2 text-gray-700 placeholder-gray-400"
          />
          {suche && (
            <button onClick={() => setSuche("")} className="text-gray-400 hover:text-gray-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setAktivKat(null)}
            className={`text-xs px-2 py-1 rounded-full border transition-colors ${!aktivKat ? "bg-[rgb(var(--accent))] text-white border-[rgb(var(--accent))]" : "bg-white text-gray-600 border-gray-300 hover:border-accent/60"}`}
          >
            Alle
          </button>
          {KATEGORIEN.map(kat => (
            <button
              key={kat}
              onClick={() => setAktivKat(kat === aktivKat ? null : kat)}
              className={`text-xs px-2 py-1 rounded-full border transition-colors flex items-center gap-1 ${aktivKat === kat ? "bg-[rgb(var(--accent))] text-white border-[rgb(var(--accent))]" : "bg-white text-gray-600 border-gray-300 hover:border-accent/60"}`}
            >
              {RESSOURCE_KATEGORIE_LABEL[kat]}
            </button>
          ))}
        </div>
      </div>

      {/* Zähler */}
      <p className="text-xs text-gray-500 mb-3">
        {laden ? "Lade…" : `${gefiltert.length} Eintrag${gefiltert.length !== 1 ? "ige" : ""} gefunden`}
      </p>

      {/* Liste */}
      {laden ? (
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Lade…
        </div>
      ) : gefiltert.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Globe size={40} className="mx-auto mb-3 opacity-20" />
          <p className="font-medium">{suche || aktivKat ? "Keine Treffer" : "Noch keine Ressourcen"}</p>
          {!suche && !aktivKat && <p className="text-sm mt-1">Klicke auf „Neu" um eine Ressource anzulegen.</p>}
        </div>
      ) : (
        <div className="space-y-2">
          {gefiltert.map(r => (
            <div key={r.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <button
                onClick={() => setAusgeklappt(p => p === r.id ? null : r.id)}
                className="w-full text-left px-5 py-4 flex items-start gap-3 hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${RESSOURCE_KATEGORIE_FARBE[r.kategorie]}`}>
                      {KATEGORIE_ICON[r.kategorie]}
                      {RESSOURCE_KATEGORIE_LABEL[r.kategorie]}
                    </span>
                    <span className="text-xs text-gray-400">{r.erstelltVon.name} · {formatDatum(r.erstelltAm)}</span>
                  </div>
                  <p className="font-semibold text-gray-900 flex items-center gap-1.5">
                    <Favicon url={r.url} />
                    {r.titel}
                  </p>
                  <p className="text-xs text-accent/80 truncate mt-0.5">{r.url}</p>
                  {r.beschreibung && (
                    <p className="text-xs text-gray-400 line-clamp-1 mt-0.5">{r.beschreibung}</p>
                  )}
                </div>
                {ausgeklappt === r.id
                  ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
                  : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />}
              </button>

              {ausgeklappt === r.id && (
                <div className="px-5 pb-5 border-t border-gray-100 bg-gray-50">
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 mt-4 mb-4 px-4 py-2.5 text-white rounded-xl text-sm font-medium hover:brightness-90 transition-colors group"
                    style={{ backgroundColor: "rgb(var(--accent))" }}
                  >
                    <ExternalLink size={14} />
                    <span className="flex-1 truncate">{r.url}</span>
                    <span className="text-xs opacity-70 group-hover:opacity-100">Öffnen →</span>
                  </a>
                  {r.beschreibung && (
                    <p className="text-sm text-gray-700 mb-3 whitespace-pre-wrap leading-relaxed">{r.beschreibung}</p>
                  )}
                  {r.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {r.tags.map(tag => (
                        <span key={tag} className="flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                          <Tag size={10} /> {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setAusgeklappt(null); oeffneModal(r); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors text-gray-700"
                    >
                      <Edit3 size={14} /> Bearbeiten
                    </button>
                    <button
                      onClick={() => loeschen(r.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-red-200 rounded-lg hover:bg-red-50 transition-colors text-red-600"
                    >
                      <Trash2 size={14} /> Löschen
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal – Neu / Bearbeiten */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">
                {bearbeitet ? "Ressource bearbeiten" : "Neue Ressource"}
              </h2>
              <button onClick={() => setModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={speichern} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Titel *</label>
                <input
                  type="text" required autoFocus
                  value={form.titel}
                  onChange={e => setForm(f => ({ ...f, titel: e.target.value }))}
                  placeholder="z.B. NotebookLM – BR-Wissensdatenbank"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL *</label>
                <input
                  type="text" required
                  value={form.url}
                  onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                  placeholder="https://..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))] font-mono"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kategorie</label>
                <select
                  value={form.kategorie}
                  onChange={e => setForm(f => ({ ...f, kategorie: e.target.value as RessourceKategorie }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                >
                  {KATEGORIEN.map(k => (
                    <option key={k} value={k}>{RESSOURCE_KATEGORIE_LABEL[k]}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Beschreibung</label>
                <textarea
                  rows={3}
                  value={form.beschreibung}
                  onChange={e => setForm(f => ({ ...f, beschreibung: e.target.value }))}
                  placeholder="Wofür wird diese Ressource genutzt?"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))] resize-y"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tags</label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); tagHinzufuegen(); } }}
                    placeholder="Schlagwort eingeben…"
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                  />
                  <button type="button" onClick={tagHinzufuegen}
                    className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-600">
                    <Tag size={14} />
                  </button>
                </div>
                {(form.tags ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {(form.tags ?? []).map(t => (
                      <span key={t} className="flex items-center gap-1 text-xs bg-accent/10 text-accent px-2 py-0.5 rounded-full">
                        {t}
                        <button type="button"
                          onClick={() => setForm(f => ({ ...f, tags: (f.tags ?? []).filter(x => x !== t) }))}
                          className="hover:text-red-600">
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setModal(false)}
                  className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
                  Abbrechen
                </button>
                <button type="submit"
                  className="flex-1 hover:brightness-90 text-white py-2 rounded-lg text-sm font-medium transition-colors"
                  style={{ backgroundColor: "rgb(var(--accent))" }}>
                  {bearbeitet ? "Speichern" : "Erstellen"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
