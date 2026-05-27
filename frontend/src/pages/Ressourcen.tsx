import { useState, useEffect, FormEvent } from "react";
import {
  Globe, Plus, Trash2, Search, X, ExternalLink, Tag,
  Loader2, Edit3, Scale, Brain, Building2, FileText, Link2,
} from "lucide-react";
import {
  api, Ressource, RessourceErstellen, RessourceKategorie,
  RESSOURCE_KATEGORIE_LABEL, RESSOURCE_KATEGORIE_FARBE, formatDatum,
} from "../lib/api";

const KATEGORIEN: RessourceKategorie[] = ["GESETZ", "KI_WERKZEUG", "BEHOERDE", "VORLAGE", "SONSTIGES"];

const KATEGORIE_ICON: Record<RessourceKategorie, React.ReactNode> = {
  GESETZ:      <Scale size={15} />,
  KI_WERKZEUG: <Brain size={15} />,
  BEHOERDE:    <Building2 size={15} />,
  VORLAGE:     <FileText size={15} />,
  SONSTIGES:   <Link2 size={15} />,
};

export default function Ressourcen() {
  const [liste, setListe]           = useState<Ressource[]>([]);
  const [laden, setLaden]           = useState(true);
  const [suche, setSuche]           = useState("");
  const [aktivKat, setAktivKat]     = useState<RessourceKategorie | null>(null);
  const [detail, setDetail]         = useState<Ressource | null>(null);
  const [modal, setModal]           = useState(false);
  const [bearbeitet, setBearbeitet] = useState(false);
  const [tagInput, setTagInput]     = useState("");
  const [form, setForm]             = useState<RessourceErstellen & { id?: string }>({
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
    setDetail(null);
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
        if (detail?.id === r.id) setDetail(r);
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
    if (detail?.id === id) setDetail(null);
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
    <div className="flex flex-col md:flex-row h-full">

      {/* Linke Spalte – Liste */}
      <div className="w-full md:w-96 flex-shrink-0 border-r md:border-b-0 border-b border-gray-200 flex flex-col bg-white">
        <div className="px-4 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Globe className="text-[rgb(var(--accent))]" size={20} />
              Ressourcen
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">{liste.length} Links</p>
          </div>
          <button
            onClick={() => oeffneModal()}
            className="flex items-center gap-1.5 bg-[rgb(var(--accent))] hover:brightness-90 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={15} /> Neu
          </button>
        </div>

        {/* Suche */}
        <div className="px-4 py-2 border-b border-gray-100">
          <div className="flex items-center bg-gray-100 rounded-lg px-2.5 py-1.5">
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
        </div>

        {/* Kategorie-Filter */}
        <div className="px-4 py-2 border-b border-gray-100 flex flex-wrap gap-1.5">
          <button
            onClick={() => setAktivKat(null)}
            className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${!aktivKat ? "bg-[rgb(var(--accent))] text-white border-[rgb(var(--accent))]" : "bg-white text-gray-600 border-gray-300 hover:border-blue-400"}`}
          >
            Alle
          </button>
          {KATEGORIEN.map(kat => (
            <button
              key={kat}
              onClick={() => setAktivKat(kat === aktivKat ? null : kat)}
              className={`text-xs px-2 py-0.5 rounded-full border transition-colors flex items-center gap-1 ${aktivKat === kat ? "bg-[rgb(var(--accent))] text-white border-[rgb(var(--accent))]" : "bg-white text-gray-600 border-gray-300 hover:border-blue-400"}`}
            >
              {RESSOURCE_KATEGORIE_LABEL[kat]}
            </button>
          ))}
        </div>

        {/* Liste */}
        <div className="flex-1 overflow-y-auto">
          {laden ? (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Lade…
            </div>
          ) : gefiltert.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400 text-sm text-center px-4">
              <Globe size={32} className="mb-2 opacity-30" />
              {suche || aktivKat ? "Keine Treffer" : "Noch keine Ressourcen"}
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {gefiltert.map(r => (
                <li
                  key={r.id}
                  onClick={() => setDetail(detail?.id === r.id ? null : r)}
                  className={`px-4 py-3 cursor-pointer transition-colors group ${detail?.id === r.id ? "bg-[rgb(var(--accent)/0.1)] border-r-2 border-[rgb(var(--accent))]" : "hover:bg-gray-50"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${RESSOURCE_KATEGORIE_FARBE[r.kategorie]}`}>
                          {RESSOURCE_KATEGORIE_LABEL[r.kategorie]}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-gray-900 truncate">{r.titel}</p>
                      <p className="text-xs text-blue-500 truncate">{r.url}</p>
                      {r.beschreibung && (
                        <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">{r.beschreibung}</p>
                      )}
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); loeschen(r.id); }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-600 transition-all rounded shrink-0"
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

      {/* Rechte Seite – Detail */}
      <div className="flex-1 flex flex-col bg-gray-50 overflow-y-auto">
        {detail ? (
          <div className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${RESSOURCE_KATEGORIE_FARBE[detail.kategorie]}`}>
                    {KATEGORIE_ICON[detail.kategorie]}
                    {RESSOURCE_KATEGORIE_LABEL[detail.kategorie]}
                  </span>
                </div>
                <h1 className="text-xl font-bold text-gray-900">{detail.titel}</h1>
                <p className="text-xs text-gray-400 mt-0.5">
                  {detail.erstelltVon.name} · {formatDatum(detail.erstelltAm)}
                </p>
              </div>
              <div className="flex gap-2 ml-4 flex-shrink-0">
                <button
                  onClick={() => oeffneModal(detail)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors text-gray-700"
                >
                  <Edit3 size={14} /> Bearbeiten
                </button>
                <button
                  onClick={() => loeschen(detail.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-red-200 rounded-lg hover:bg-red-50 transition-colors text-red-600"
                >
                  <Trash2 size={14} /> Löschen
                </button>
              </div>
            </div>

            {/* Öffnen-Button */}
            <a
              href={detail.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 w-full px-4 py-3 bg-[rgb(var(--accent))] hover:brightness-90 text-white rounded-xl font-medium transition-colors mb-5 group"
            >
              <ExternalLink size={18} />
              <span className="flex-1 truncate text-sm">{detail.url}</span>
              <span className="text-xs opacity-70 group-hover:opacity-100">Öffnen →</span>
            </a>

            {detail.beschreibung && (
              <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
                <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{detail.beschreibung}</p>
              </div>
            )}

            {detail.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {detail.tags.map(tag => (
                  <span key={tag} className="flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                    <Tag size={10} /> {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <Globe size={48} className="mb-3 opacity-20" />
            <p className="text-sm">Ressource auswählen oder neue anlegen</p>
          </div>
        )}
      </div>

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
                      <span key={t} className="flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
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
                  className="flex-1 bg-[rgb(var(--accent))] hover:brightness-90 text-white py-2 rounded-lg text-sm font-medium transition-colors">
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
