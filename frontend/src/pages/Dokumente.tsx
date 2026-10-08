import { useEffect, useState, useRef, FormEvent, useCallback } from "react";
import { useLocation, Link } from "react-router-dom";
import {
  Upload, Download, Trash2, FileText, Lock, X, Loader2, Search, Pencil, MessageSquare, Eye, History, ExternalLink, CalendarDays,
  CheckCircle2, Send,
} from "lucide-react";
import {
  api, Dokument, DokumentVersion, Kategorie, KATEGORIE_LABEL, KATEGORIE_KURZ, Aufbewahrungsregel, Gremium,
  formatDatum, formatDateigroesse, fristFarbe,
  AnhoerungVorgangAntwort, AnhoerungStatus, AnhoerungArt, ANHOERUNG_STATUS_LABEL, ANHOERUNG_ART_LABEL, gruendeFuerArt,
} from "../lib/api";

// Sitzungen/TOPs, in denen ein Dokument behandelt wurde – jüngste Sitzung zuerst
function behandeltIn(d: Dokument) {
  return [...(d.topVerknuepfungen ?? [])]
    .map(v => v.top)
    .sort((a, b) => b.sitzung.sitzungsdatum.localeCompare(a.sitzung.sitzungsdatum) || a.nummer - b.nummer);
}
import KommentarBlock from "../components/KommentarBlock";

const STATUS_BADGE: Record<string, string> = {
  AKTIV:             "bg-green-100 text-green-700",
  ARCHIVIERT:        "bg-gray-100 text-gray-600",
  LOESCHVORMERKUNG:  "bg-red-100 text-red-700",
};

const STATUS_LABEL: Record<string, string> = {
  AKTIV: "Aktiv", ARCHIVIERT: "Archiviert", LOESCHVORMERKUNG: "Löschvormerkung",
};

export default function Dokumente() {
  const location   = useLocation();
  const rowRefs    = useRef<Record<string, HTMLTableRowElement | null>>({});
  const blobRef    = useRef<string | null>(null);

  const [dokumente, setDokumente]         = useState<Dokument[]>([]);
  const [laden, setLaden]                 = useState(true);
  const [suche, setSuche]                 = useState("");
  const [kategorieFilter, setFilter]      = useState<Kategorie | "">("");
  const [gremiumFilter, setGremiumFilter] = useState("");
  const [gremien, setGremien]             = useState<Gremium[]>([]);
  const [uploadOffen, setUploadOffen]     = useState(false);
  const [loeschId, setLoeschId]           = useState<string | null>(null);
  const [bearbeitenDok, setBearbeitenDok] = useState<Dokument | null>(null);
  const [vorschau, setVorschau]           = useState<Dokument | null>(null);
  const [vorschauUrl, setVorschauUrl]     = useState<string | null>(null);
  const [vorschauLaden, setVorschauLaden] = useState(false);
  const [markiertId, setMarkiertId]       = useState<string | null>(null);
  const [versionen, setVersionen]         = useState<DokumentVersion[]>([]);
  const [versionenLaden, setVersionenLaden] = useState(false);

  const [vorgang, setVorgang]             = useState<AnhoerungVorgangAntwort | null>(null);
  const [vorgangLaden, setVorgangLaden]   = useState(false);
  const [vorgangSpeichern, setVorgangSpeichern] = useState(false);
  const [stnArt, setStnArt]               = useState<AnhoerungArt | "">("");
  const [stnGruende, setStnGruende]       = useState<string[]>([]);
  const [stnText, setStnText]             = useState("");
  const [versandDatum, setVersandDatum]   = useState(() => new Date().toISOString().slice(0, 10));
  const [versandLaufend, setVersandLaufend] = useState(false);

  function laden_() {
    setLaden(true);
    api.dokumente.liste()
      .then(setDokumente)
      .catch(console.error)
      .finally(() => setLaden(false));
  }

  useEffect(laden_, []);
  useEffect(() => { api.gremien.liste().then(setGremien).catch(() => {}); }, []);

  // Highlight aus Suche übernehmen
  useEffect(() => {
    const id = (location.state as any)?.markiere as string | undefined;
    if (!id) return;
    setMarkiertId(id);
    setTimeout(() => {
      rowRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => setMarkiertId(null), 3000);
    }, 300);
  }, [location.state]);

  const ladeVersionen = useCallback(async (id: string) => {
    setVersionenLaden(true);
    try {
      const vs = await api.dokumente.versionen(id);
      setVersionen(vs);
    } catch { setVersionen([]); }
    finally { setVersionenLaden(false); }
  }, []);

  const ladeVorgang = useCallback(async (d: Dokument) => {
    if (d.kategorie !== "ANHOERUNG_99" && d.kategorie !== "ANHOERUNG_102") { setVorgang(null); return; }
    setVorgangLaden(true);
    try {
      const v = await api.dokumente.vorgang(d.id);
      setVorgang(v);
      setStnArt(v.vorgang.stellungnahmeArt ?? "");
      setStnGruende(v.vorgang.stellungnahmeGruende ?? []);
      setStnText(v.vorgang.stellungnahmeText ?? "");
    } catch { setVorgang(null); }
    finally { setVorgangLaden(false); }
  }, []);

  const oeffneVorschau = useCallback(async (d: Dokument) => {
    if (blobRef.current) URL.revokeObjectURL(blobRef.current);
    setVorschauUrl(null);
    setVorschau(d);
    setVersionen([]);
    setVorgang(null);
    ladeVersionen(d.id);
    ladeVorgang(d);
    if (d.mimeTyp === "application/pdf") {
      setVorschauLaden(true);
      try {
        const res = await fetch(api.dokumente.vorschauUrl(d.id), {
          headers: { Authorization: `Bearer ${localStorage.getItem("brdms_token")}` },
        });
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        blobRef.current = url;
        setVorschauUrl(url);
      } catch { /* keine Vorschau */ }
      finally { setVorschauLaden(false); }
    }
  }, []);

  function schliesseVorschau() {
    if (blobRef.current) URL.revokeObjectURL(blobRef.current);
    setVorschau(null);
    setVorschauUrl(null);
  }

  const anzahlJeKategorie: Partial<Record<Kategorie, number>> = {};
  for (const d of dokumente) anzahlJeKategorie[d.kategorie] = (anzahlJeKategorie[d.kategorie] ?? 0) + 1;

  const gefiltert = dokumente.filter(d => {
    const suchTreffer = suche === "" ||
      d.titel.toLowerCase().includes(suche.toLowerCase()) ||
      d.aktenzeichen?.toLowerCase().includes(suche.toLowerCase());
    const kategorieOk = kategorieFilter === "" || d.kategorie === kategorieFilter;
    const gremiumOk = gremiumFilter === "" || behandeltIn(d).some(top =>
      gremiumFilter === "BR" ? !top.sitzung.gremium : top.sitzung.gremium?.id === gremiumFilter);
    return suchTreffer && kategorieOk && gremiumOk;
  });

  async function loeschen(id: string) {
    try {
      await api.dokumente.loeschen(id);
      setLoeschId(null);
      if (vorschau?.id === id) schliesseVorschau();
      laden_();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Fehler beim Löschen");
    }
  }

  // Öffnet das Dokument in einem eigenen Browser-Tab (PDF inline, sonst Download) —
  // gleiches Muster wie bei den Protokoll-Dokumentlinks/Betriebsvereinbarungen: Tab
  // synchron öffnen (Popup-Blocker), dann authentifiziert laden und als Blob anzeigen.
  function dokumentInNeuemFensterOeffnen(d: Dokument) {
    const tab = window.open("", "_blank");
    const token = localStorage.getItem("brdms_token");
    const url = d.mimeTyp === "application/pdf" ? api.dokumente.vorschauUrl(d.id) : api.dokumente.downloadUrl(d.id);
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.blob(); })
      .then(blob => {
        const objUrl = URL.createObjectURL(blob);
        if (tab) tab.location.href = objUrl;
        else window.location.href = objUrl;
        setTimeout(() => URL.revokeObjectURL(objUrl), 60_000);
      })
      .catch(err => {
        if (tab) tab.close();
        alert(err instanceof Error ? err.message : "Dokument konnte nicht geöffnet werden");
      });
  }

  function herunterladen(d: Dokument) {
    const url = api.dokumente.downloadUrl(d.id);
    const token = localStorage.getItem("brdms_token");
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = d.dateiname;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(console.error);
  }

  function versandPdfHerunterladen(dokumentId: string) {
    const url = api.dokumente.downloadUrl(dokumentId);
    const token = localStorage.getItem("brdms_token");
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "Stellungnahme.pdf";
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(console.error);
  }

  async function vorgangStatusSetzen(status: AnhoerungStatus) {
    if (!vorgang) return;
    try {
      const aktualisiert = await api.dokumente.vorgangAktualisieren(vorgang.vorgang.dokumentId, { status });
      setVorgang(v => v ? { ...v, vorgang: aktualisiert } : v);
    } catch (err) { alert(err instanceof Error ? err.message : "Fehler beim Ändern des Status"); }
  }

  async function stellungnahmeSpeichern() {
    if (!vorgang) return;
    setVorgangSpeichern(true);
    try {
      const aktualisiert = await api.dokumente.vorgangAktualisieren(vorgang.vorgang.dokumentId, {
        stellungnahmeArt: stnArt || null,
        stellungnahmeGruende: stnGruende,
        stellungnahmeText: stnText || null,
      });
      setVorgang(v => v ? { ...v, vorgang: aktualisiert } : v);
    } catch (err) { alert(err instanceof Error ? err.message : "Fehler beim Speichern"); }
    finally { setVorgangSpeichern(false); }
  }

  async function vorgangFristErledigen(fristId: string, erledigt: boolean) {
    if (!vorschau) return;
    try {
      await api.fristen.aktualisieren(fristId, { erledigt });
      await ladeVorgang(vorschau);
    } catch (err) { alert(err instanceof Error ? err.message : "Fehler beim Aktualisieren der Frist"); }
  }

  async function vorgangAlsVersendetMarkieren() {
    if (!vorgang || !vorschau) return;
    if (!confirm("Stellungnahme als versendet markieren? Dabei wird ein Brief-PDF erzeugt, archiviert und alle offenen Fristen dieses Dokuments werden als erledigt markiert.")) return;
    setVersandLaufend(true);
    try {
      await api.dokumente.vorgangVersenden(vorgang.vorgang.dokumentId, versandDatum);
      await ladeVorgang(vorschau);
    } catch (err) { alert(err instanceof Error ? err.message : "Fehler beim Versenden"); }
    finally { setVersandLaufend(false); }
  }

  function ladeVersionHerunter(v: DokumentVersion) {
    if (!vorschau) return;
    const url = api.dokumente.versionDownloadUrl(vorschau.id, v.id);
    const token = localStorage.getItem("brdms_token");
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = v.dateiname;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(console.error);
  }

  return (
    <div className="flex flex-col md:flex-row h-full">
      {/* ── Linke Spalte: Liste ─────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-2xl font-bold text-gray-900">Dokumente</h1>
          <button
            onClick={() => setUploadOffen(true)}
            className="flex items-center gap-2 bg-[rgb(var(--accent))] hover:brightness-90 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Upload size={16} /> Hochladen
          </button>
        </div>

        {/* Filter */}
        <div className="flex gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={suche}
              onChange={e => setSuche(e.target.value)}
              placeholder="Titel oder Aktenzeichen…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
            />
          </div>
          {gremien.length > 0 && (
            <select value={gremiumFilter} onChange={e => setGremiumFilter(e.target.value)}
              title="Nach Gremium der behandelten Sitzung filtern"
              className="border border-gray-300 rounded-lg px-2.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]">
              <option value="">Alle Gremien</option>
              <option value="BR">Betriebsrat</option>
              {gremien.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          )}
        </div>

        {/* Kategorien mit Anzahl – leere Kategorien nur, wenn gerade ausgewählt */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {(["", ...ALLE_KATEGORIEN] as (Kategorie | "")[])
            .filter(k => k === "" || k === kategorieFilter || (anzahlJeKategorie[k] ?? 0) > 0)
            .map(k => {
              const aktiv = kategorieFilter === k;
              return (
                <button
                  key={k || "alle"}
                  onClick={() => setFilter(k)}
                  title={k ? KATEGORIE_LABEL[k] : "Alle Kategorien"}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    aktiv
                      ? "bg-[rgb(var(--accent))] border-[rgb(var(--accent))] text-white"
                      : "bg-white border-gray-200 text-gray-600 hover:border-[rgb(var(--accent))] hover:text-[rgb(var(--accent))]"
                  }`}
                >
                  {k ? KATEGORIE_KURZ[k] : "Alle"}
                  <span className={`ml-1.5 ${aktiv ? "text-white/80" : "text-gray-400"}`}>
                    {k ? anzahlJeKategorie[k] ?? 0 : dokumente.length}
                  </span>
                </button>
              );
            })}
        </div>

        {/* Tabelle */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {laden ? (
            <div className="flex items-center justify-center h-48 text-gray-400">
              <Loader2 className="animate-spin mr-2" size={18} /> Laden…
            </div>
          ) : gefiltert.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400 text-sm">
              <FileText size={32} className="mb-2 opacity-30" />
              Keine Dokumente gefunden
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3 font-medium">Titel</th>
                  <th className="px-4 py-3 font-medium hidden sm:table-cell">Kategorie</th>
                  <th className="px-4 py-3 font-medium hidden sm:table-cell">Status</th>
                  <th className="px-4 py-3 font-medium hidden md:table-cell">Fristen</th>
                  <th className="px-4 py-3 font-medium hidden lg:table-cell">Löschdatum</th>
                  <th className="px-4 py-3 font-medium hidden lg:table-cell">Hochgeladen</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {gefiltert.map(d => {
                  const istMarkiert  = d.id === markiertId;
                  const istGewählt   = d.id === vorschau?.id;
                  return (
                    <tr
                      key={d.id}
                      ref={el => { rowRefs.current[d.id] = el; }}
                      onClick={() => oeffneVorschau(d)}
                      onDoubleClick={() => dokumentInNeuemFensterOeffnen(d)}
                      title="Klick: Vorschau · Doppelklick: in neuem Fenster öffnen"
                      className={`cursor-pointer transition-colors ${
                        istMarkiert  ? "bg-yellow-100 animate-pulse" :
                        istGewählt   ? "bg-[rgb(var(--accent)/0.1)] border-l-4 border-l-[rgb(var(--accent))]" :
                        "hover:bg-gray-50"
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {d.vertraulich && <Lock size={12} className="text-amber-500 shrink-0" />}
                          <div>
                            <p className="font-medium text-gray-900">{d.alias ?? d.titel}</p>
                            {d.aktenzeichen && (
                              <p className="text-xs text-gray-400">Az.: {d.aktenzeichen}</p>
                            )}
                            <p className="text-xs text-gray-400">
                              {d.dateiname} · {formatDateigroesse(d.dateigroesse)}
                            </p>
                            {behandeltIn(d).length > 0 && (() => {
                              const [erste, ...weitere] = behandeltIn(d);
                              return (
                                <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                                  <CalendarDays size={11} className="text-gray-400 shrink-0" />
                                  Sitzung {formatDatum(erste.sitzung.sitzungsdatum)}, TOP {erste.nummer}
                                  {weitere.length > 0 && <span className="text-gray-400">+{weitere.length}</span>}
                                  {erste.sitzung.gremium && (
                                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full border border-accent/25 bg-accent/10 text-accent whitespace-nowrap">
                                      {erste.sitzung.gremium.name}
                                    </span>
                                  )}
                                </p>
                              );
                            })()}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="text-xs text-gray-600">{KATEGORIE_LABEL[d.kategorie]}</span>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[d.status] ?? "bg-gray-100 text-gray-600"}`}>
                          {STATUS_LABEL[d.status] ?? d.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {(d.fristen ?? []).filter(f => f.status === "OFFEN").length > 0 ? (
                          <div className="space-y-0.5">
                            {d.fristen!.filter(f => f.status === "OFFEN").map(f => {
                              const tage = Math.ceil((new Date(f.faelligAm).getTime() - Date.now()) / 86_400_000);
                              return (
                                <span key={f.id} className={`inline-block text-xs px-1.5 py-0.5 rounded border ${fristFarbe(f.faelligAm)}`}>
                                  {tage < 0 ? "Abgelaufen" : tage === 0 ? "Heute" : `${tage}T`}
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300">–</span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {d.deleteAt ? (
                          <span className={`text-xs ${fristFarbe(d.deleteAt)}`}>
                            {formatDatum(d.deleteAt)}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">–</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 hidden lg:table-cell">
                        <p>{d.hochgeladenVon?.name}</p>
                        <p className="text-gray-400">{formatDatum(d.erstelltAm)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => dokumentInNeuemFensterOeffnen(d)}
                            title="In neuem Fenster öffnen"
                            className="p-1.5 text-gray-400 hover:text-[rgb(var(--accent))] hover:bg-accent/5 rounded transition-colors"
                          >
                            <ExternalLink size={15} />
                          </button>
                          <button
                            onClick={() => herunterladen(d)}
                            title="Herunterladen"
                            className="p-1.5 text-gray-400 hover:text-[rgb(var(--accent))] hover:bg-accent/5 rounded transition-colors"
                          >
                            <Download size={15} />
                          </button>
                          <button
                            onClick={() => setBearbeitenDok(d)}
                            title="Bearbeiten"
                            className="p-1.5 text-gray-400 hover:text-accent hover:bg-accent/5 rounded transition-colors"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            onClick={() => setLoeschId(d.id)}
                            title="Löschen"
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Modals */}
        {bearbeitenDok && (
          <BearbeitenModal
            dokument={bearbeitenDok}
            onSchliessen={() => setBearbeitenDok(null)}
            onErfolg={() => { setBearbeitenDok(null); laden_(); }}
          />
        )}
        {uploadOffen && (
          <UploadModal
            onSchliessen={() => setUploadOffen(false)}
            onErfolg={() => { setUploadOffen(false); laden_(); }}
          />
        )}
        {loeschId && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6">
              <h3 className="font-semibold text-gray-900 mb-2">Dokument löschen?</h3>
              <p className="text-sm text-gray-500 mb-6">
                Das Dokument wird zur Löschung vorgemerkt und gemäß DSGVO automatisch entfernt.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setLoeschId(null)} className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
                  Abbrechen
                </button>
                <button onClick={() => loeschen(loeschId)} className="flex-1 px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg">
                  Löschen
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Rechte Spalte: Vorschau ──────────────────────────────── */}
      {/* md:sticky + md:h-screen + md:self-start: Panel bleibt beim Scrollen der Liste
          im Viewport stehen, statt mit der Seite mitzuwandern (unabhängig vom
          Höhen-Verhalten des restlichen Layouts, da vh-Einheiten nicht von
          Eltern-Elementen abhängen). */}
      {vorschau && (
        <div className="w-full md:w-96 flex-shrink-0 border-l md:border-t-0 border-t border-gray-200 flex flex-col bg-white md:sticky md:top-0 md:h-screen md:self-start">
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 text-sm truncate" title={vorschau.alias ?? vorschau.titel}>
                {vorschau.alias ?? vorschau.titel}
              </p>
              <p className="text-xs text-gray-400 truncate">{vorschau.dateiname}</p>
              <p className="text-xs text-gray-500 mt-0.5">{KATEGORIE_LABEL[vorschau.kategorie]} · {formatDateigroesse(vorschau.dateigroesse)}</p>
            </div>
            <button onClick={schliesseVorschau} className="p-1 hover:bg-gray-100 rounded flex-shrink-0">
              <X size={15} className="text-gray-400" />
            </button>
          </div>

          {/* Aktionen */}
          <div className="px-4 py-2 border-b border-gray-100 flex gap-2">
            <button
              onClick={() => dokumentInNeuemFensterOeffnen(vorschau)}
              className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-[rgb(var(--accent))] px-2 py-1.5 rounded hover:bg-accent/5 transition-colors"
            >
              <ExternalLink size={13} /> Neues Fenster
            </button>
            <button
              onClick={() => herunterladen(vorschau)}
              className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-[rgb(var(--accent))] px-2 py-1.5 rounded hover:bg-accent/5 transition-colors"
            >
              <Download size={13} /> Herunterladen
            </button>
            <button
              onClick={() => setBearbeitenDok(vorschau)}
              className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-accent px-2 py-1.5 rounded hover:bg-accent/5 transition-colors"
            >
              <Pencil size={13} /> Bearbeiten
            </button>
          </div>

          {/* Anhörungs-Vorgang (§ 99 / § 102 BetrVG) */}
          {(vorschau.kategorie === "ANHOERUNG_99" || vorschau.kategorie === "ANHOERUNG_102") && (
            <div className="px-4 py-3 border-b border-gray-100 space-y-3">
              <p className="text-xs font-medium text-gray-500">Vorgang</p>
              {vorgangLaden ? (
                <div className="flex items-center gap-1 text-xs text-gray-400">
                  <Loader2 size={11} className="animate-spin" /> Laden…
                </div>
              ) : vorgang ? (
                <>
                  {/* Status-Stepper */}
                  <div className="flex items-center gap-1">
                    {(["EINGEGANGEN", "BERATEN", "BESCHLOSSEN", "BEANTWORTET"] as AnhoerungStatus[]).map((s, i) => {
                      const aktiv = vorgang.vorgang.status === s;
                      const stufenIndex = ["EINGEGANGEN", "BERATEN", "BESCHLOSSEN", "BEANTWORTET"].indexOf(vorgang.vorgang.status);
                      const erreicht = i <= stufenIndex;
                      return (
                        <button
                          key={s}
                          onClick={() => vorgangStatusSetzen(s)}
                          disabled={vorgang.vorgang.status === "BEANTWORTET"}
                          title={ANHOERUNG_STATUS_LABEL[s]}
                          className={`flex-1 text-[10px] py-1 rounded transition-colors truncate px-1 ${
                            aktiv ? "bg-[rgb(var(--accent))] text-white font-medium"
                            : erreicht ? "bg-accent/10 text-[rgb(var(--accent))]"
                            : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                          }`}
                        >
                          {ANHOERUNG_STATUS_LABEL[s]}
                        </button>
                      );
                    })}
                  </div>

                  {/* Fristen */}
                  {vorgang.fristen.length > 0 && (
                    <div className="space-y-1">
                      {vorgang.fristen.map(f => (
                        <div key={f.id} className="flex items-center justify-between gap-2 text-xs">
                          <span className={f.status === "ERLEDIGT" ? "text-gray-400 line-through" : fristFarbe(f.faelligAm)}>
                            {f.bezeichnung ?? f.typ} – fällig {formatDatum(f.faelligAm)}
                          </span>
                          <button
                            onClick={() => vorgangFristErledigen(f.id, f.status !== "ERLEDIGT")}
                            className="p-1 text-gray-400 hover:text-[rgb(var(--accent))] hover:bg-accent/5 rounded flex-shrink-0"
                            title={f.status === "ERLEDIGT" ? "Als offen markieren" : "Als erledigt markieren"}
                          >
                            <CheckCircle2 size={13} className={f.status === "ERLEDIGT" ? "text-green-600" : ""} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Stellungnahme */}
                  {vorgang.vorgang.status === "BEANTWORTET" ? (
                    <div className="text-xs text-gray-600 space-y-1 bg-gray-50 rounded p-2">
                      <p className="font-medium text-gray-700">
                        {vorgang.vorgang.stellungnahmeArt ? ANHOERUNG_ART_LABEL[vorgang.vorgang.stellungnahmeArt] : "Stellungnahme"} – versendet
                      </p>
                      <p className="text-gray-400">
                        {vorgang.vorgang.versendetAm && formatDatum(vorgang.vorgang.versendetAm)}
                        {vorgang.vorgang.versendetVon && ` · ${vorgang.vorgang.versendetVon.name}`}
                      </p>
                      {vorgang.vorgang.versandDokumentId && (
                        <button
                          onClick={() => versandPdfHerunterladen(vorgang.vorgang.versandDokumentId!)}
                          className="inline-flex items-center gap-1 text-[rgb(var(--accent))] hover:underline"
                        >
                          <Download size={11} /> Brief-PDF herunterladen
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <select
                        value={stnArt}
                        onChange={e => { setStnArt(e.target.value as AnhoerungArt | ""); setStnGruende([]); }}
                        className="w-full text-xs border border-gray-200 rounded px-2 py-1.5"
                      >
                        <option value="">Art der Stellungnahme wählen…</option>
                        {(Object.keys(ANHOERUNG_ART_LABEL) as AnhoerungArt[]).map(a => (
                          <option key={a} value={a}>{ANHOERUNG_ART_LABEL[a]}</option>
                        ))}
                      </select>

                      {gruendeFuerArt(stnArt).length > 0 && (
                        <div className="space-y-1 bg-gray-50 rounded p-2">
                          {gruendeFuerArt(stnArt).map(g => (
                            <label key={g.code} className="flex items-start gap-1.5 text-[11px] text-gray-600 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={stnGruende.includes(g.code)}
                                onChange={e => setStnGruende(prev =>
                                  e.target.checked ? [...prev, g.code] : prev.filter(c => c !== g.code))}
                                className="mt-0.5"
                              />
                              <span>{g.text}</span>
                            </label>
                          ))}
                        </div>
                      )}

                      <textarea
                        value={stnText}
                        onChange={e => setStnText(e.target.value)}
                        placeholder="Begründung / weitere Ausführungen…"
                        rows={3}
                        className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 resize-none"
                      />

                      <div className="flex items-center justify-between gap-2">
                        <button
                          onClick={stellungnahmeSpeichern}
                          disabled={vorgangSpeichern}
                          className="text-xs text-gray-600 hover:text-[rgb(var(--accent))] px-2 py-1 rounded hover:bg-accent/5 disabled:opacity-50"
                        >
                          {vorgangSpeichern ? "Speichert…" : "Speichern"}
                        </button>
                      </div>

                      <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
                        <input
                          type="date"
                          value={versandDatum}
                          onChange={e => setVersandDatum(e.target.value)}
                          className="text-xs border border-gray-200 rounded px-2 py-1.5"
                        />
                        <button
                          onClick={vorgangAlsVersendetMarkieren}
                          disabled={versandLaufend}
                          className="flex items-center gap-1.5 text-xs text-white bg-[rgb(var(--accent))] px-2 py-1.5 rounded hover:brightness-90 disabled:opacity-50"
                        >
                          {versandLaufend ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                          Als versendet markieren
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          )}

          {/* In welchen Sitzungen behandelt */}
          {behandeltIn(vorschau).length > 0 && (
            <div className="px-4 py-2 border-b border-gray-100">
              <p className="text-xs font-medium text-gray-500 mb-1">Behandelt in</p>
              <ul className="space-y-0.5">
                {behandeltIn(vorschau).map(t => (
                  <li key={`${t.sitzung.id}-${t.nummer}`}>
                    <Link
                      to={`/sitzungen?id=${t.sitzung.id}`}
                      className="flex items-start gap-1.5 text-xs text-gray-700 hover:text-[rgb(var(--accent))]"
                    >
                      <CalendarDays size={12} className="mt-0.5 text-gray-400 shrink-0" />
                      <span>
                        {formatDatum(t.sitzung.sitzungsdatum)} · TOP {t.nummer}: {t.titel}
                        {t.sitzung.gremium && <span className="text-gray-400"> ({t.sitzung.gremium.name})</span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Versionshistorie */}
          {(versionenLaden || versionen.length > 0) && (
            <div className="px-4 py-2 border-b border-gray-100">
              <div className="flex items-center gap-2 mb-2">
                <History size={13} className="text-gray-400" />
                <span className="text-xs font-medium text-gray-600">Versionen</span>
              </div>
              {versionenLaden ? (
                <div className="flex items-center gap-1 text-xs text-gray-400">
                  <Loader2 size={11} className="animate-spin" /> Laden…
                </div>
              ) : (
                <div className="space-y-1">
                  {versionen.map(v => (
                    <div key={v.id} className="flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <span className="font-medium text-gray-700">v{v.version}</span>
                        <span className="text-gray-400 ml-1">{formatDatum(v.erstelltAm)}</span>
                        {v.aenderungsnotiz && (
                          <p className="text-gray-500 truncate">{v.aenderungsnotiz}</p>
                        )}
                      </div>
                      <button
                        onClick={() => ladeVersionHerunter(v)}
                        className="p-1 text-gray-400 hover:text-[rgb(var(--accent))] hover:bg-accent/5 rounded flex-shrink-0"
                        title={`v${v.version} herunterladen`}
                      >
                        <Download size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* PDF-Vorschau */}
          <div className="flex-1 min-h-0 bg-gray-100">
            {vorschau.mimeTyp === "application/pdf" ? (
              vorschauLaden ? (
                <div className="flex items-center justify-center h-full text-gray-400">
                  <Loader2 className="animate-spin mr-2" size={18} /> Lade Vorschau…
                </div>
              ) : vorschauUrl ? (
                <object data={vorschauUrl} type="application/pdf" className="w-full h-full">
                  <p className="p-4 text-sm text-gray-500">
                    PDF-Vorschau nicht verfügbar –{" "}
                    <button onClick={() => herunterladen(vorschau)} className="text-[rgb(var(--accent))] underline">herunterladen</button>
                  </p>
                </object>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-400 text-sm">Vorschau nicht verfügbar</div>
              )
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3 p-6">
                <Eye size={32} className="opacity-30" />
                <p className="text-sm text-center">Keine Vorschau für {vorschau.mimeTyp}</p>
                <button
                  onClick={() => herunterladen(vorschau)}
                  className="flex items-center gap-1.5 text-sm text-[rgb(var(--accent))] hover:brightness-75"
                >
                  <Download size={14} /> Herunterladen
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Upload-Modal ──────────────────────────────────────────────────
function UploadModal({ onSchliessen, onErfolg }: { onSchliessen: () => void; onErfolg: () => void }) {
  const [laden, setLaden]                 = useState(false);
  const [fehler, setFehler]               = useState("");
  const [datei, setDatei]                 = useState<File | null>(null);
  const [titel, setTitel]                 = useState("");
  const [kategorie, setKategorie]         = useState<Kategorie>("SONSTIGES");
  const [kuendigungsArt, setKuendigungsArt] = useState<"ORDENTLICH" | "AUSSERORDENTLICH">("ORDENTLICH");
  const [aktenzeichen, setAktenzeichen]   = useState("");
  const [vertraulich, setVertraulich]     = useState(false);
  const [istVersion, setIstVersion]       = useState(false);
  const [versionSuche, setVersionSuche]   = useState("");
  const [versionTreffer, setVersionTreffer] = useState<Dokument[]>([]);
  const [versionVonId, setVersionVonId]   = useState<string | null>(null);
  const [versionVonTitel, setVersionVonTitel] = useState("");
  const [aenderungsnotiz, setAenderungsnotiz] = useState("");
  const [sucheLaden, setSucheLaden]       = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const sucheTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onSucheChange(q: string) {
    setVersionSuche(q);
    setVersionVonId(null);
    setVersionVonTitel("");
    if (sucheTimer.current) clearTimeout(sucheTimer.current);
    if (q.trim().length < 2) { setVersionTreffer([]); return; }
    sucheTimer.current = setTimeout(async () => {
      setSucheLaden(true);
      try {
        const treffer = await api.dokumente.suche(q.trim());
        setVersionTreffer(treffer);
      } catch { setVersionTreffer([]); }
      finally { setSucheLaden(false); }
    }, 300);
  }

  function waehleVersionVon(d: Dokument) {
    setVersionVonId(d.id);
    setVersionVonTitel(d.alias ?? d.titel);
    setVersionTreffer([]);
    setVersionSuche("");
  }

  async function hochladen(e: FormEvent) {
    e.preventDefault();
    if (!datei) return;
    if (istVersion && !versionVonId) {
      setFehler("Bitte ein Dokument auswählen, zu dem diese Version gehört.");
      return;
    }
    setFehler("");
    setLaden(true);
    try {
      const form = new FormData();
      form.append("file", datei);
      if (istVersion && versionVonId) {
        if (aenderungsnotiz) form.append("aenderungsnotiz", aenderungsnotiz);
        await api.dokumente.versionHochladen(versionVonId, form);
      } else {
        form.append("titel", titel);
        form.append("kategorie", kategorie);
        if (kategorie === "ANHOERUNG_102") form.append("kuendigungsArt", kuendigungsArt);
        if (aktenzeichen) form.append("aktenzeichen", aktenzeichen);
        form.append("vertraulich", String(vertraulich));
        await api.dokumente.upload(form);
      }
      onErfolg();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Upload fehlgeschlagen");
    } finally {
      setLaden(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Dokument hochladen</h2>
          <button onClick={onSchliessen} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={hochladen} className="px-6 py-4 space-y-4">
          {/* Datei */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Datei</label>
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-gray-300 hover:border-accent/60 rounded-lg p-4 text-center cursor-pointer transition-colors"
            >
              {datei ? (
                <p className="text-sm text-gray-700 font-medium">{datei.name}</p>
              ) : (
                <p className="text-sm text-gray-400">Klicken zum Auswählen</p>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.docx,.docm,.xlsx"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0] ?? null;
                  setDatei(f);
                  if (f && !titel) setTitel(f.name.replace(/\.[^.]+$/, ""));
                }}
              />
            </div>
          </div>

          {/* Version-Toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={istVersion}
              onChange={e => { setIstVersion(e.target.checked); setVersionVonId(null); setVersionVonTitel(""); setVersionSuche(""); setVersionTreffer([]); }}
              className="rounded border-gray-300 text-[rgb(var(--accent))]"
            />
            <span className="text-sm text-gray-700">Als neue Version eines vorhandenen Dokuments</span>
          </label>

          {/* Versions-Suche */}
          {istVersion && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Dokument auswählen *
              </label>
              {versionVonId ? (
                <div className="flex items-center justify-between bg-accent/5 border border-accent/25 rounded-lg px-3 py-2 text-sm">
                  <span className="text-accent font-medium truncate">{versionVonTitel}</span>
                  <button type="button" onClick={() => { setVersionVonId(null); setVersionVonTitel(""); }} className="text-accent/60 hover:text-accent ml-2 flex-shrink-0">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      value={versionSuche}
                      onChange={e => onSucheChange(e.target.value)}
                      placeholder="Titel suchen…"
                      className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                    />
                    {sucheLaden && <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />}
                  </div>
                  {versionTreffer.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {versionTreffer.map(d => (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => waehleVersionVon(d)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0"
                        >
                          <p className="font-medium text-gray-800 truncate">{d.alias ?? d.titel}</p>
                          <p className="text-xs text-gray-400">{KATEGORIE_LABEL[d.kategorie]}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Änderungsnotiz (nur bei Version) */}
          {istVersion && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Änderungsnotiz</label>
              <input
                value={aenderungsnotiz}
                onChange={e => setAenderungsnotiz(e.target.value)}
                placeholder="Was wurde geändert? (optional)"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
              />
            </div>
          )}

          {/* Felder für neues Dokument */}
          {!istVersion && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Titel *</label>
                <input
                  value={titel}
                  onChange={e => setTitel(e.target.value)}
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kategorie *</label>
                <select
                  value={kategorie}
                  onChange={e => setKategorie(e.target.value as Kategorie)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))] bg-white"
                >
                  {ALLE_KATEGORIEN.map(k => (
                    <option key={k} value={k}>{KATEGORIE_LABEL[k]}</option>
                  ))}
                </select>
              </div>

              {kategorie === "ANHOERUNG_102" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Art der Kündigung *</label>
                  <select
                    value={kuendigungsArt}
                    onChange={e => setKuendigungsArt(e.target.value as "ORDENTLICH" | "AUSSERORDENTLICH")}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))] bg-white"
                  >
                    <option value="ORDENTLICH">Ordentliche Kündigung (Anhörungsfrist 7 Tage)</option>
                    <option value="AUSSERORDENTLICH">Außerordentliche Kündigung (Anhörungsfrist 3 Tage)</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Aktenzeichen</label>
                <input
                  value={aktenzeichen}
                  onChange={e => setAktenzeichen(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                  placeholder="Optional"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={vertraulich}
                  onChange={e => setVertraulich(e.target.checked)}
                  className="rounded border-gray-300 text-[rgb(var(--accent))]"
                />
                <span className="text-sm text-gray-700">Vertraulich (nur Vorsitz und Stellvertretung)</span>
              </label>
            </>
          )}

          {fehler && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
              {fehler}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onSchliessen} className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={laden || !datei}
              className="flex-1 px-4 py-2 text-sm bg-[rgb(var(--accent))] hover:brightness-90 disabled:opacity-60 text-white rounded-lg flex items-center justify-center gap-2"
            >
              {laden && <Loader2 size={14} className="animate-spin" />}
              {istVersion ? "Als Version hochladen" : "Hochladen"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const ALLE_KATEGORIEN = Object.keys(KATEGORIE_LABEL) as Kategorie[];

// ── Bearbeiten-Modal ──────────────────────────────────────────────
function BearbeitenModal({ dokument, onSchliessen, onErfolg }: {
  dokument: Dokument;
  onSchliessen: () => void;
  onErfolg: () => void;
}) {
  const [laden, setLaden]               = useState(false);
  const [fehler, setFehler]             = useState("");
  const [titel, setTitel]               = useState(dokument.alias ?? dokument.titel);
  const [kategorie, setKategorie]       = useState<Kategorie>(dokument.kategorie);
  const [aktenzeichen, setAktenzeichen] = useState(dokument.aktenzeichen ?? "");
  const [beschreibung, setBeschreibung] = useState(dokument.beschreibung ?? "");
  const [vertraulich, setVertraulich]   = useState(dokument.vertraulich);
  const deleteAtVorher = dokument.deleteAt ? dokument.deleteAt.slice(0, 10) : "";
  const [deleteAt, setDeleteAt]         = useState(deleteAtVorher);
  const [regeln, setRegeln]             = useState<Aufbewahrungsregel[]>([]);
  const [angepasst, setAngepasst]       = useState(false);

  useEffect(() => { api.einstellungen.aufbewahrung().then(setRegeln).catch(() => {}); }, []);

  // Löschdatum nach der Aufbewahrungsregel einer Kategorie, gerechnet ab dem Hochladen
  function regelDatum(k: Kategorie): { datum: string; tage: number } | null {
    const r = regeln.find(x => x.kategorie === k);
    if (!r) return null;
    const d = new Date(dokument.erstelltAm);
    d.setDate(d.getDate() + r.tage);
    return { datum: d.toISOString().slice(0, 10), tage: r.tage };
  }

  function kategorieWechseln(k: Kategorie) {
    setKategorie(k);
    const r = regelDatum(k);
    if (r && r.datum !== deleteAt && r.datum > morgen) { setDeleteAt(r.datum); setAngepasst(true); }
  }

  const morgen = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const vorschlag = regelDatum(kategorie);
  const dauer = (tage: number) => tage >= 365 ? `${Math.round(tage / 365 * 10) / 10} Jahre` : `${tage} Tage`;

  async function speichern(e: FormEvent) {
    e.preventDefault();
    setFehler("");
    setLaden(true);
    try {
      await api.dokumente.aktualisieren(dokument.id, {
        alias:        titel || undefined,
        kategorie,
        aktenzeichen: aktenzeichen || undefined,
        beschreibung: beschreibung || undefined,
        vertraulich,
        // nur bei Änderung senden – sonst scheitert z. B. eine Alias-Änderung an
        // einem Dokument, dessen Löschdatum schon erreicht ist
        ...(deleteAt && deleteAt !== deleteAtVorher ? { deleteAt } : {}),
      });
      onErfolg();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler beim Speichern");
    } finally {
      setLaden(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-semibold text-gray-900">Dokument bearbeiten</h2>
          <button onClick={onSchliessen} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
        <form onSubmit={speichern} className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Anzeigename / Alias</label>
            <input
              value={titel}
              onChange={e => setTitel(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
              placeholder={dokument.titel}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Kategorie</label>
            <select
              value={kategorie}
              onChange={e => kategorieWechseln(e.target.value as Kategorie)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))] bg-white"
            >
              {ALLE_KATEGORIEN.map(k => (
                <option key={k} value={k}>{KATEGORIE_LABEL[k]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Aktenzeichen</label>
            <input
              value={aktenzeichen}
              onChange={e => setAktenzeichen(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
              placeholder="Optional"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Beschreibung</label>
            <textarea
              value={beschreibung}
              onChange={e => setBeschreibung(e.target.value)}
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))] resize-y"
              placeholder="Optional"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Aufbewahrung bis (Löschdatum)</label>
            <input
              type="date"
              value={deleteAt}
              min={morgen}
              onChange={e => { setDeleteAt(e.target.value); setAngepasst(false); }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
            />
            {vorschlag && (
              <p className="text-xs text-gray-500 mt-1 flex items-center gap-2 flex-wrap">
                <span>
                  Regel für {KATEGORIE_KURZ[kategorie]}: {dauer(vorschlag.tage)} ab Hochladen → {formatDatum(vorschlag.datum)}
                </span>
                {vorschlag.datum !== deleteAt && vorschlag.datum > morgen && (
                  <button
                    type="button"
                    onClick={() => { setDeleteAt(vorschlag.datum); setAngepasst(true); }}
                    className="text-[rgb(var(--accent))] hover:underline"
                  >
                    übernehmen
                  </button>
                )}
              </p>
            )}
            {angepasst && deleteAt !== deleteAtVorher && (
              <p className="text-xs text-amber-700 mt-1">
                Löschdatum an die Kategorie angepasst (vorher {deleteAtVorher ? formatDatum(deleteAtVorher) : "keins"}).
              </p>
            )}
            {deleteAt && deleteAt !== deleteAtVorher && deleteAt < morgen && (
              <p className="text-xs text-red-700 mt-1">Das Löschdatum muss in der Zukunft liegen.</p>
            )}
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={vertraulich}
              onChange={e => setVertraulich(e.target.checked)}
              className="rounded border-gray-300 text-[rgb(var(--accent))]"
            />
            <span className="text-sm text-gray-700">Vertraulich (nur Vorsitz und Stellvertretung)</span>
          </label>

          {/* Volltext-Indikator */}
          <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${
            dokument.textinhalt
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-gray-50 text-gray-400 border border-gray-200"
          }`}>
            <Search size={12} />
            {dokument.textinhalt
              ? `Volltext extrahiert – ${dokument.textinhalt.length.toLocaleString("de-DE")} Zeichen durchsuchbar`
              : dokument.mimeTyp === "application/pdf"
                ? "Kein Volltext – PDF wurde vor Aktivierung der Extraktion hochgeladen"
                : "Kein Volltext (nur PDF wird extrahiert)"
            }
          </div>

          {fehler && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
              {fehler}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onSchliessen} className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={laden}
              className="flex-1 px-4 py-2 text-sm bg-[rgb(var(--accent))] hover:brightness-90 disabled:opacity-60 text-white rounded-lg flex items-center justify-center gap-2"
            >
              {laden && <Loader2 size={14} className="animate-spin" />}
              Speichern
            </button>
          </div>
        </form>

        <div className="px-6 pb-4 pt-2 border-t border-gray-100">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare size={15} className="text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Kommentare</span>
          </div>
          <KommentarBlock
            ladeUrl={`/api/dokumente/${dokument.id}/kommentare`}
            erstellenUrl={`/api/dokumente/${dokument.id}/kommentare`}
            loeschenUrl={kid => `/api/dokumente/${dokument.id}/kommentare/${kid}`}
          />
        </div>
        </div>
      </div>
    </div>
  );
}
