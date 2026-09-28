import { useState, useEffect, FormEvent } from "react";
import {
  Plus, Trash2, Search, X, BookOpen, Tag, Loader2, Edit3,
  FileText, Check, ChevronDown, ChevronUp,
} from "lucide-react";
import { api, WissensEintrag, WissensEintragErstellen, formatDatum } from "../lib/api";
import SitzungsEditor from "../components/SitzungsEditor";
import { tiptapZuText, tiptapZuHtml, textZuTiptap } from "../lib/tiptap";

export default function Wissensarchiv() {
  const [eintraege, setEintraege]       = useState<WissensEintrag[]>([]);
  const [laden, setLaden]               = useState(true);
  const [suche, setSuche]               = useState("");
  const [modal, setModal]               = useState(false);
  const [ausgeklappt, setAusgeklappt]   = useState<string | null>(null);
  const [bearbeitet, setBearbeitet]     = useState(false);
  const [form, setForm]                 = useState<WissensEintragErstellen & { id?: string }>({
    titel: "", inhalt: "", inhaltJson: null, kategorien: [], loesung: "", loesungJson: null, herkunft: "MANUELL",
  });
  const [tagInput, setTagInput]         = useState("");
  const [aktivKategorie, setAktivKategorie] = useState<string | null>(null);

  useEffect(() => { laden_(); }, []);

  async function laden_() {
    setLaden(true);
    try { setEintraege(await api.wissen.liste()); }
    finally { setLaden(false); }
  }

  async function suchen() {
    if (suche.trim().length < 2) { laden_(); return; }
    setEintraege(await api.wissen.suche(suche));
  }

  useEffect(() => {
    const timer = setTimeout(() => { if (suche.trim()) suchen(); else laden_(); }, 300);
    return () => clearTimeout(timer);
  }, [suche]); // eslint-disable-line react-hooks/exhaustive-deps

  function oeffneModal(eintrag?: WissensEintrag) {
    if (eintrag) {
      setForm({
        id: eintrag.id, titel: eintrag.titel, inhalt: eintrag.inhalt,
        inhaltJson: eintrag.inhaltJson ?? textZuTiptap(eintrag.inhalt),
        kategorien: eintrag.kategorien, loesung: eintrag.loesung ?? "",
        loesungJson: eintrag.loesungJson ?? textZuTiptap(eintrag.loesung),
        herkunft: eintrag.herkunft, quelle: eintrag.quelle ?? undefined,
      });
      setBearbeitet(true);
    } else {
      setForm({ titel: "", inhalt: "", inhaltJson: null, kategorien: [], loesung: "", loesungJson: null, herkunft: "MANUELL" });
      setBearbeitet(false);
    }
    setModal(true);
  }

  async function speichern(e: FormEvent) {
    e.preventDefault();
    const inhaltText = tiptapZuText(form.inhaltJson);
    if (!form.titel.trim() || !inhaltText) return;
    const payload = {
      titel: form.titel.trim(), inhalt: inhaltText, inhaltJson: form.inhaltJson ?? undefined,
      kategorien: form.kategorien,
      loesung: tiptapZuText(form.loesungJson) || undefined, loesungJson: form.loesungJson ?? undefined,
      herkunft: form.herkunft, quelle: form.quelle,
    };
    try {
      if (bearbeitet && form.id) {
        const aktualisiert = await api.wissen.aktualisieren(form.id, payload);
        setEintraege(prev => prev.map(e => e.id === aktualisiert.id ? aktualisiert : e));
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
    if (ausgeklappt === id) setAusgeklappt(null);
  }

  function tagHinzufuegen() {
    const t = tagInput.trim();
    if (t && !(form.kategorien ?? []).includes(t))
      setForm(f => ({ ...f, kategorien: [...(f.kategorien ?? []), t] }));
    setTagInput("");
  }

  const alleKategorien = Array.from(new Set(eintraege.flatMap(e => e.kategorien))).sort();

  const gefiltert = aktivKategorie
    ? eintraege.filter(e => e.kategorien.includes(aktivKategorie))
    : eintraege;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgb(var(--accent) / 0.1)" }}>
            <BookOpen className="w-5 h-5" style={{ color: "rgb(var(--accent))" }} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Wissensarchiv</h1>
            <p className="text-sm text-gray-500">{eintraege.length} Einträge</p>
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
            placeholder="Durchsuchen…"
            className="bg-transparent text-sm w-full outline-none ml-2 text-gray-700 placeholder-gray-400"
          />
          {suche && (
            <button onClick={() => { setSuche(""); laden_(); }} className="text-gray-400 hover:text-gray-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {alleKategorien.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setAktivKategorie(null)}
              className={`text-xs px-2 py-1 rounded-full border transition-colors ${!aktivKategorie ? "bg-[rgb(var(--accent))] text-white border-[rgb(var(--accent))]" : "bg-white text-gray-600 border-gray-300 hover:border-blue-400"}`}
            >
              Alle
            </button>
            {alleKategorien.map(kat => (
              <button
                key={kat}
                onClick={() => setAktivKategorie(kat === aktivKategorie ? null : kat)}
                className={`text-xs px-2 py-1 rounded-full border transition-colors ${aktivKategorie === kat ? "bg-[rgb(var(--accent))] text-white border-[rgb(var(--accent))]" : "bg-white text-gray-600 border-gray-300 hover:border-blue-400"}`}
              >
                {kat}
              </button>
            ))}
          </div>
        )}
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
          <BookOpen size={40} className="mx-auto mb-3 opacity-20" />
          <p className="font-medium">{suche ? "Keine Treffer" : "Noch keine Einträge"}</p>
          {!suche && <p className="text-sm mt-1">Klicke auf „Neu" um einen Eintrag anzulegen.</p>}
        </div>
      ) : (
        <div className="space-y-2">
          {gefiltert.map(eintrag => (
            <div key={eintrag.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <button
                onClick={() => setAusgeklappt(p => p === eintrag.id ? null : eintrag.id)}
                className="w-full text-left px-5 py-4 flex items-start gap-3 hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    {eintrag.kategorien.map(kat => (
                      <span key={kat} className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">{kat}</span>
                    ))}
                    <span className="text-xs text-gray-400">
                      {formatDatum(eintrag.erstelltAm)} · {eintrag.erstelltVon.name}
                      {eintrag.herkunft === "PROTOKOLL_EXTRAKT" && " · aus Protokoll"}
                    </span>
                  </div>
                  <p className="font-semibold text-gray-900">{eintrag.titel}</p>
                  <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{eintrag.inhalt}</p>
                </div>
                {ausgeklappt === eintrag.id
                  ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
                  : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />}
              </button>

              {ausgeklappt === eintrag.id && (
                <div className="px-5 pb-5 border-t border-gray-100 bg-gray-50">
                  <div className="bg-white rounded-xl border border-gray-200 p-4 mt-4 mb-3">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <FileText size={13} /> Situation / Sachverhalt
                    </h3>
                    {eintrag.inhaltJson ? (
                      <div
                        className="text-sm text-gray-700 leading-relaxed [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0.5 [&_p]:my-0.5 [&_strong]:font-semibold [&_em]:italic"
                        dangerouslySetInnerHTML={{ __html: tiptapZuHtml(eintrag.inhaltJson) }}
                      />
                    ) : (
                      <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{eintrag.inhalt}</div>
                    )}
                  </div>
                  {eintrag.loesung && (
                    <div className="bg-green-50 rounded-xl border border-green-200 p-4 mb-3">
                      <h3 className="text-xs font-semibold text-green-800 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5" /> Lösung / Ergebnis
                      </h3>
                      {eintrag.loesungJson ? (
                        <div
                          className="text-sm text-green-900 leading-relaxed [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0.5 [&_p]:my-0.5 [&_strong]:font-semibold [&_em]:italic"
                          dangerouslySetInnerHTML={{ __html: tiptapZuHtml(eintrag.loesungJson) }}
                        />
                      ) : (
                        <div className="text-sm text-green-900 whitespace-pre-wrap leading-relaxed">{eintrag.loesung}</div>
                      )}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setAusgeklappt(null); oeffneModal(eintrag); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors text-gray-700"
                    >
                      <Edit3 size={14} /> Bearbeiten
                    </button>
                    <button
                      onClick={() => loeschen(eintrag.id)}
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
                  type="text" required autoFocus
                  value={form.titel}
                  onChange={e => setForm(f => ({ ...f, titel: e.target.value }))}
                  placeholder="z.B. Anhörung § 102 – Standardablauf"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sachverhalt / Situation *</label>
                <SitzungsEditor
                  content={form.inhaltJson ?? null}
                  onChange={json => setForm(f => ({ ...f, inhaltJson: json }))}
                  placeholder="Beschreibe die Situation oder den Fall…"
                  minHeight="100px"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Lösung / Ergebnis</label>
                <SitzungsEditor
                  content={form.loesungJson ?? null}
                  onChange={json => setForm(f => ({ ...f, loesungJson: json }))}
                  placeholder="Wie wurde das Problem gelöst? Welches Ergebnis wurde erzielt?"
                  minHeight="80px"
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
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                  />
                  <button type="button" onClick={tagHinzufuegen}
                    className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-600">
                    <Tag size={14} />
                  </button>
                </div>
                {(form.kategorien ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {(form.kategorien ?? []).map(kat => (
                      <span key={kat} className="flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                        {kat}
                        <button type="button"
                          onClick={() => setForm(f => ({ ...f, kategorien: (f.kategorien ?? []).filter(k => k !== kat) }))}
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
