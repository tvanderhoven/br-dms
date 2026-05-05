import { useState, useEffect, FormEvent } from "react";
import { Plus, Trash2, Search, X, BookOpen, Tag, Loader2, Edit3, FileText, Check } from "lucide-react";
import { api, WissensEintrag, WissensEintragErstellen, formatDatum } from "../lib/api";

export default function Wissensarchiv() {
  const [eintraege, setEintraege] = useState<WissensEintrag[]>([]);
  const [laden, setLaden]         = useState(true);
  const [suche, setSuche]         = useState("");
  const [modal, setModal]         = useState(false);
  const [detail, setDetail]       = useState<WissensEintrag | null>(null);
  const [bearbeitet, setBearbeitet] = useState(false);
  const [form, setForm]           = useState<WissensEintragErstellen & { id?: string }>({ titel: "", inhalt: "", kategorien: [], loesung: "", herkunft: "MANUELL" });
  const [tagInput, setTagInput]   = useState("");
  const [aktivKategorie, setAktivKategorie] = useState<string | null>(null);

  useEffect(() => { laden_(); }, []);

  async function laden_() {
    setLaden(true);
    try {
      const data = await api.wissen.liste();
      setEintraege(data);
    } finally {
      setLaden(false);
    }
  }

  async function suchen() {
    if (suche.trim().length < 2) { laden_(); return; }
    const data = await api.wissen.suche(suche);
    setEintraege(data);
  }

  useEffect(() => {
    const timer = setTimeout(() => { if (suche.trim()) suchen(); else laden_(); }, 300);
    return () => clearTimeout(timer);
  }, [suche]);

  function oeffneModal(eintrag?: WissensEintrag) {
    if (eintrag) {
      setForm({
        id: eintrag.id,
        titel: eintrag.titel,
        inhalt: eintrag.inhalt,
        kategorien: eintrag.kategorien,
        loesung: eintrag.loesung ?? "",
        herkunft: eintrag.herkunft,
        quelle: eintrag.quelle ?? undefined,
      });
      setBearbeitet(true);
    } else {
      setForm({ titel: "", inhalt: "", kategorien: [], loesung: "", herkunft: "MANUELL" });
      setBearbeitet(false);
    }
    setDetail(null);
    setModal(true);
  }

  async function speichern(e: FormEvent) {
    e.preventDefault();
    if (!form.titel.trim() || !form.inhalt.trim()) return;

    const payload = {
      titel: form.titel.trim(),
      inhalt: form.inhalt.trim(),
      kategorien: form.kategorien,
      loesung: form.loesung || undefined,
      herkunft: form.herkunft,
      quelle: form.quelle,
    };

    try {
      if (bearbeitet && form.id) {
        const aktualisiert = await api.wissen.aktualisieren(form.id, payload);
        setEintraege(prev => prev.map(e => e.id === aktualisiert.id ? aktualisiert : e));
        if (detail?.id === aktualisiert.id) setDetail(aktualisiert);
      } else {
        const neu = await api.wissen.erstellen(payload);
        setEintraege(prev => [neu, ...prev]);
      }
      setModal(false);
    } catch {}
  }

  async function loeschen(id: string) {
    if (!confirm("Wissenseintrag wirklich löschen?")) return;
    await api.wissen.loeschen(id);
    setEintraege(prev => prev.filter(e => e.id !== id));
    if (detail?.id === id) setDetail(null);
  }

  function tagHinzufuegen() {
    const t = tagInput.trim();
    if (t && !(form.kategorien ?? []).includes(t)) {
      setForm(f => ({ ...f, kategorien: [...(f.kategorien ?? []), t] }));
    }
    setTagInput("");
  }

  function tagEntfernen(tag: string) {
    setForm(f => ({ ...f, kategorien: (f.kategorien ?? []).filter(k => k !== tag) }));
  }

  const alleKategorien = Array.from(new Set(eintraege.flatMap(e => e.kategorien))).sort();

  const gefiltert = aktivKategorie
    ? eintraege.filter(e => e.kategorien.includes(aktivKategorie))
    : eintraege;

  return (
    <div className="flex flex-col md:flex-row h-full">
      {/* Linke Spalte – Liste */}
      <div className="w-full md:w-96 flex-shrink-0 border-r md:border-b-0 border-b border-gray-200 flex flex-col bg-white">
        <div className="px-4 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <BookOpen className="text-[rgb(var(--accent))]" size={20} />
              Wissensarchiv
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">{eintraege.length} Einträge</p>
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
              placeholder="Durchsuchen…"
              className="bg-transparent text-sm w-full outline-none ml-2 text-gray-700 placeholder-gray-400"
            />
            {suche && (
              <button onClick={() => { setSuche(""); laden_(); }} className="text-gray-400 hover:text-gray-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Kategorie-Filter */}
        {alleKategorien.length > 0 && (
          <div className="px-4 py-2 border-b border-gray-100 flex flex-wrap gap-1.5">
            <button
              onClick={() => setAktivKategorie(null)}
              className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${!aktivKategorie ? "bg-[rgb(var(--accent))] text-white border-[rgb(var(--accent))]" : "bg-white text-gray-600 border-gray-300 hover:border-blue-400"}`}
            >
              Alle
            </button>
            {alleKategorien.map(kat => (
              <button
                key={kat}
                onClick={() => setAktivKategorie(kat === aktivKategorie ? null : kat)}
                className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${aktivKategorie === kat ? "bg-[rgb(var(--accent))] text-white border-[rgb(var(--accent))]" : "bg-white text-gray-600 border-gray-300 hover:border-blue-400"}`}
              >
                {kat}
              </button>
            ))}
          </div>
        )}

        {/* Einträge-Liste */}
        <div className="flex-1 overflow-y-auto">
          {laden ? (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Lade…
            </div>
          ) : gefiltert.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400 text-sm text-center px-4">
              <BookOpen size={32} className="mb-2 opacity-30" />
              {suche ? "Keine Treffer" : "Noch keine Einträge"}
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {gefiltert.map(eintrag => (
                <li
                  key={eintrag.id}
                  onClick={() => setDetail(detail?.id === eintrag.id ? null : eintrag)}
                  className={`px-4 py-3 cursor-pointer transition-colors group ${detail?.id === eintrag.id ? "bg-[rgb(var(--accent)/0.1)] border-r-2 border-[rgb(var(--accent))]" : "hover:bg-gray-50"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{eintrag.titel}</p>
                      <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{eintrag.inhalt}</p>
                      {eintrag.kategorien.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {eintrag.kategorien.map(kat => (
                            <span key={kat} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                              {kat}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        {formatDatum(eintrag.erstelltAm)} · {eintrag.erstelltVon.name}
                        {eintrag.herkunft === "PROTOKOLL_EXTRAKT" && <span className="ml-1">· aus Protokoll</span>}
                      </p>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); loeschen(eintrag.id); }}
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
          <div className="p-6 max-w-3xl">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h1 className="text-xl font-bold text-gray-900">{detail.titel}</h1>
                <p className="text-xs text-gray-400 mt-0.5">
                  {detail.erstelltVon.name} · {formatDatum(detail.erstelltAm)}
                  {detail.herkunft === "PROTOKOLL_EXTRAKT" && " · Aus Protokoll extrahiert"}
                </p>
              </div>
              <div className="flex gap-2">
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

            {detail.kategorien.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                {detail.kategorien.map(kat => (
                  <span key={kat} className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                    {kat}
                  </span>
                ))}
              </div>
            )}

            <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <FileText size={14} /> Situation / Sachverhalt
              </h3>
              <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{detail.inhalt}</div>
            </div>

            {detail.loesung && (
              <div className="bg-green-50 rounded-xl border border-green-200 p-5">
                <h3 className="text-sm font-semibold text-green-800 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" /> Lösung / Ergebnis
                </h3>
                <div className="text-sm text-green-900 whitespace-pre-wrap leading-relaxed">{detail.loesung}</div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <BookOpen size={48} className="mb-3 opacity-20" />
            <p className="text-sm">Eintrag auswählen oder neuen anlegen</p>
          </div>
        )}
      </div>

      {/* Modal – Neu / Bearbeiten */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">
                {bearbeitet ? "Wissenseintrag bearbeiten" : "Neuer Wissenseintrag"}
              </h2>
              <button onClick={() => setModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={speichern} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Titel *</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={form.titel}
                  onChange={e => setForm(f => ({ ...f, titel: e.target.value }))}
                  placeholder="z.B. Anhörung § 102 – Standardablauf"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sachverhalt / Situation *</label>
                <textarea
                  required
                  rows={4}
                  value={form.inhalt}
                  onChange={e => setForm(f => ({ ...f, inhalt: e.target.value }))}
                  placeholder="Beschreibe die Situation oder den Fall…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))] resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Lösung / Ergebnis</label>
                <textarea
                  rows={3}
                  value={form.loesung}
                  onChange={e => setForm(f => ({ ...f, loesung: e.target.value }))}
                  placeholder="Wie wurde das Problem gelöst? Welches Ergebnis wurde erzielt?"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))] resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kategorien / Schlagworte</label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); tagHinzufuegen(); } }}
                    placeholder="Schlagwort eingeben…"
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                  />
                  <button
                    type="button"
                    onClick={tagHinzufuegen}
                    className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-600 transition-colors"
                  >
                    <Tag size={14} />
                  </button>
                </div>
                {(form.kategorien ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {(form.kategorien ?? []).map(kat => (
                      <span key={kat} className="flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                        {kat}
                        <button type="button" onClick={() => tagEntfernen(kat)} className="hover:text-red-600">
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModal(false)}
                  className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-[rgb(var(--accent))] hover:brightness-90 text-white py-2 rounded-lg text-sm font-medium transition-colors"
                >
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
