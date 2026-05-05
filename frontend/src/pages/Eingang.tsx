import { useEffect, useState, useRef, useCallback } from "react";
import {
  Inbox, FileText, Clock, Tag, CheckSquare, Eye, X, ChevronRight, Loader2, Check, CheckCheck, History, Search
} from "lucide-react";
import {
  api, Dokument, SitzungListItem, Benutzer, KATEGORIE_LABEL, formatDatum, formatDateigroesse
} from "../lib/api";

type Aktion = "sitzung-top" | "wissensarchiv" | "aufgabe" | "version" | null;

const QUELLE_LABEL: Record<string, string> = {
  WATCHFOLDER: "Watch-Folder",
  UPLOAD:      "Manuell hochgeladen",
  SYSTEM:      "System",
};

const QUELLE_FARBE: Record<string, string> = {
  WATCHFOLDER: "bg-violet-100 text-violet-800",
  UPLOAD:      "bg-blue-100 text-blue-800",
  SYSTEM:      "bg-gray-100 text-gray-700",
};

export default function Eingang() {
  const [dokumente, setDokumente]           = useState<Dokument[]>([]);
  const [ausgewaehlt, setAusgewaehlt]       = useState<Dokument | null>(null);
  const [vorschauUrl, setVorschauUrl]       = useState<string | null>(null);
  const [laden, setLaden]                   = useState(true);
  const [aktiveAktion, setAktiveAktion]     = useState<Aktion>(null);

  // Für Aktions-Modals
  const [sitzungen, setSitzungen]           = useState<SitzungListItem[]>([]);
  const [benutzer, setBenutzer]             = useState<Benutzer[]>([]);
  const [aktionLaden, setAktionLaden]       = useState(false);
  const [aktionErfolg, setAktionErfolg]     = useState<string | null>(null);

  // Sitzung/TOP-Felder
  const [selSitzungId, setSelSitzungId]     = useState("");
  const [topTitel, setTopTitel]             = useState("");
  const [fristDatum, setFristDatum]         = useState("");
  // Wissensarchiv-Felder
  const [tagInput, setTagInput]             = useState("");
  const [tagListe, setTagListe]             = useState<string[]>([]);
  const [selKategorie, setSelKategorie]     = useState("");
  // Aufgabe-Felder
  const [aufgabeTitel, setAufgabeTitel]     = useState("");
  const [selMitglied, setSelMitglied]       = useState("");
  const [aufgabePrio, setAufgabePrio]       = useState("MITTEL");
  const [aufgabeFaellig, setAufgabeFaellig] = useState("");

  // Versions-Felder
  const [versionSuche, setVersionSuche]       = useState("");
  const [versionTreffer, setVersionTreffer]   = useState<Dokument[]>([]);
  const [versionVonId, setVersionVonId]       = useState<string | null>(null);
  const [versionVonTitel, setVersionVonTitel] = useState("");
  const [aenderungsnotiz, setAenderungsnotiz] = useState("");
  const [sucheLaden, setSucheLaden]           = useState(false);
  const sucheTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const blobRef = useRef<string | null>(null);

  const ladeInbox = useCallback(() => {
    setLaden(true);
    api.dokumente.inbox()
      .then(setDokumente)
      .catch(console.error)
      .finally(() => setLaden(false));
  }, []);

  useEffect(() => { ladeInbox(); }, [ladeInbox]);

  async function waehleAus(dok: Dokument) {
    if (blobRef.current) URL.revokeObjectURL(blobRef.current);
    setVorschauUrl(null);
    setAusgewaehlt(dok);
    setAktiveAktion(null);
    setAktionErfolg(null);

    if (dok.mimeTyp === "application/pdf") {
      try {
        const res = await fetch(api.dokumente.vorschauUrl(dok.id), {
          headers: { Authorization: `Bearer ${localStorage.getItem("brdms_token")}` },
        });
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        blobRef.current = url;
        setVorschauUrl(url);
      } catch { /* Vorschau nicht möglich */ }
    }

  }

  async function oeffneAktion(aktion: Aktion) {
    setAktiveAktion(aktion);
    setAktionErfolg(null);
    if (aktion === "sitzung-top" && sitzungen.length === 0) {
      const data = await api.sitzungen.liste().catch(() => []);
      setSitzungen(data.filter(s => s.status === "ENTWURF" || s.status === "TAGESORDNUNG_FIXIERT"));
    }
    if (aktion === "aufgabe" && benutzer.length === 0) {
      const data = await api.get<Benutzer[]>("/api/benutzer").catch(() => []);
      setBenutzer(data.filter(b => b.aktiv));
    }
    if (aktion === "wissensarchiv" && ausgewaehlt) {
      setTagListe(ausgewaehlt.tags ?? []);
      setSelKategorie(ausgewaehlt.kategorie);
    }
  }

  function tagHinzufuegen(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const tag = tagInput.trim().replace(/^#/, "");
      if (tag && !tagListe.includes(tag)) setTagListe(prev => [...prev, tag]);
      setTagInput("");
    }
  }

  async function sendeAktionSitzungTop() {
    if (!ausgewaehlt || !selSitzungId || !topTitel) return;
    setAktionLaden(true);
    try {
      await api.dokumente.aktionSitzungTop(ausgewaehlt.id, {
        sitzungId: selSitzungId, topTitel, fristDatum: fristDatum || undefined,
      });
      setAktionErfolg("Dokument wurde mit Sitzung/TOP verknüpft.");
      setDokumente(prev => prev.filter(d => d.id !== ausgewaehlt.id));
      setAusgewaehlt(null);
      setAktiveAktion(null);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setAktionLaden(false);
    }
  }

  async function sendeAktionWissensarchiv() {
    if (!ausgewaehlt) return;
    setAktionLaden(true);
    try {
      await api.dokumente.aktionWissensarchiv(ausgewaehlt.id, {
        tags: tagListe, kategorie: selKategorie || undefined,
      });
      setAktionErfolg("Ins Wissensarchiv verschoben und verschlagwortet.");
      setDokumente(prev => prev.filter(d => d.id !== ausgewaehlt.id));
      setAusgewaehlt(null);
      setAktiveAktion(null);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setAktionLaden(false);
    }
  }

  function onVersionSucheChange(q: string) {
    setVersionSuche(q);
    setVersionVonId(null);
    setVersionVonTitel("");
    if (sucheTimer.current) clearTimeout(sucheTimer.current);
    if (q.trim().length < 2) { setVersionTreffer([]); return; }
    sucheTimer.current = setTimeout(async () => {
      setSucheLaden(true);
      try { setVersionTreffer(await api.dokumente.suche(q.trim())); }
      catch { setVersionTreffer([]); }
      finally { setSucheLaden(false); }
    }, 300);
  }

  function waehleVersionVon(d: Dokument) {
    setVersionVonId(d.id);
    setVersionVonTitel(d.alias ?? d.titel);
    setVersionTreffer([]);
    setVersionSuche("");
  }

  async function sendeAktionVersion() {
    if (!ausgewaehlt || !versionVonId) return;
    setAktionLaden(true);
    try {
      const form = new FormData();
      const res = await fetch(api.dokumente.downloadUrl(ausgewaehlt.id), {
        headers: { Authorization: `Bearer ${localStorage.getItem("brdms_token")}` },
      });
      const blob = await res.blob();
      form.append("file", blob, ausgewaehlt.dateiname);
      if (aenderungsnotiz) form.append("aenderungsnotiz", aenderungsnotiz);
      await api.dokumente.versionHochladen(versionVonId, form);
      await api.dokumente.aktionErledigt(ausgewaehlt.id);
      setAktionErfolg("Als neue Version gespeichert.");
      setDokumente(prev => prev.filter(d => d.id !== ausgewaehlt.id));
      setAusgewaehlt(null);
      setAktiveAktion(null);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setAktionLaden(false);
    }
  }

  async function sendeAktionErledigt() {
    if (!ausgewaehlt) return;
    setAktionLaden(true);
    try {
      await api.dokumente.aktionErledigt(ausgewaehlt.id);
      setDokumente(prev => prev.filter(d => d.id !== ausgewaehlt.id));
      setAusgewaehlt(null);
      setAktiveAktion(null);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setAktionLaden(false);
    }
  }

  async function sendeAktionAufgabe() {
    if (!ausgewaehlt || !aufgabeTitel) return;
    setAktionLaden(true);
    try {
      await api.dokumente.aktionAufgabe(ausgewaehlt.id, {
        titel:          aufgabeTitel,
        zugewiesenAnId: selMitglied || undefined,
        prioritaet:     aufgabePrio,
        faelligAm:      aufgabeFaellig || undefined,
      });
      setAktionErfolg("Aufgabe wurde erstellt.");
      setAktiveAktion(null);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setAktionLaden(false);
    }
  }

  const ungelesen = dokumente.filter(d => !d.inboxGelesen).length;

  return (
    <div className="flex flex-col md:flex-row h-full gap-0">
      {/* ── Linke Spalte: Inbox-Liste ─────────────────────────────── */}
      <div className="w-full md:w-96 flex-shrink-0 border-r md:border-b-0 border-b border-gray-200 flex flex-col">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Inbox className="w-5 h-5 text-[rgb(var(--accent))]" />
            <span className="font-semibold text-gray-800">Eingang</span>
            {ungelesen > 0 && (
              <span className="bg-[rgb(var(--accent))] text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {ungelesen}
              </span>
            )}
          </div>
          <span className="text-xs text-gray-500">{dokumente.length} Dokument{dokumente.length !== 1 ? "e" : ""}</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {laden ? (
            <div className="flex items-center justify-center h-32 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Lade…
            </div>
          ) : dokumente.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-2">
              <CheckSquare className="w-8 h-8" />
              <p className="text-sm">Eingang ist leer</p>
            </div>
          ) : (
            dokumente.map(dok => (
              <button
                key={dok.id}
                onClick={() => waehleAus(dok)}
                className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-blue-50 transition-colors ${
                  ausgewaehlt?.id === dok.id ? "bg-[rgb(var(--accent)/0.1)] border-l-4 border-l-[rgb(var(--accent))]" : ""
                }`}
              >
                <div className="flex items-start gap-2">
                  {!dok.inboxGelesen && (
                    <span className="mt-1.5 w-2 h-2 rounded-full bg-[rgb(var(--accent))] flex-shrink-0" />
                  )}
                  <div className={`flex-1 min-w-0 ${dok.inboxGelesen ? "pl-4" : ""}`}>
                    <p className={`text-sm truncate ${!dok.inboxGelesen ? "font-semibold text-gray-900" : "text-gray-700"}`}>
                      {dok.alias ?? dok.titel}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{dok.dateiname}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${QUELLE_FARBE[dok.inboxQuelle ?? "UPLOAD"] ?? "bg-gray-100 text-gray-600"}`}>
                        {QUELLE_LABEL[dok.inboxQuelle ?? "UPLOAD"]}
                      </span>
                      <span className="text-xs text-gray-400">{formatDatum(dok.erstelltAm)}</span>
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Rechte Spalte: Vorschau & Aktionen ───────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {!ausgewaehlt ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
            <FileText className="w-12 h-12" />
            <p className="text-sm">Dokument auswählen, um Vorschau und Aktionen zu sehen</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-5 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <div className="min-w-0">
                <h2 className="font-semibold text-gray-900 truncate">{ausgewaehlt.alias ?? ausgewaehlt.titel}</h2>
                <p className="text-xs text-gray-500">
                  {KATEGORIE_LABEL[ausgewaehlt.kategorie]} · {formatDateigroesse(ausgewaehlt.dateigroesse)}
                </p>
              </div>
              <button onClick={() => setAusgewaehlt(null)} className="p-1 hover:bg-gray-200 rounded">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            {/* Aktions-Erfolg-Banner */}
            {aktionErfolg && (
              <div className="mx-4 mt-3 flex items-center gap-2 bg-green-50 text-green-800 border border-green-200 rounded-lg px-3 py-2 text-sm">
                <Check className="w-4 h-4 flex-shrink-0" /> {aktionErfolg}
              </div>
            )}

            {/* Smart-Actions */}
            {!aktiveAktion && (
              <div className="px-5 py-3 flex gap-3 border-b border-gray-100">
                <button
                  onClick={() => oeffneAktion("sitzung-top")}
                  className="flex items-center gap-2 px-3 py-2 bg-[rgb(var(--accent))] text-white text-sm rounded-lg hover:brightness-90 transition-colors"
                >
                  <Clock className="w-4 h-4" /> Sitzung / TOP
                </button>
                <button
                  onClick={() => oeffneAktion("wissensarchiv")}
                  className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 transition-colors"
                >
                  <Tag className="w-4 h-4" /> Wissensarchiv
                </button>
                <button
                  onClick={() => oeffneAktion("aufgabe")}
                  className="flex items-center gap-2 px-3 py-2 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700 transition-colors"
                >
                  <CheckSquare className="w-4 h-4" /> Aufgabe
                </button>
                <button
                  onClick={sendeAktionErledigt}
                  disabled={aktionLaden}
                  className="flex items-center gap-2 px-3 py-2 bg-gray-500 text-white text-sm rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-50"
                >
                  {aktionLaden ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
                  Erledigt
                </button>
                <button
                  onClick={() => { oeffneAktion("version"); setVersionVonId(null); setVersionVonTitel(""); setVersionSuche(""); setVersionTreffer([]); setAenderungsnotiz(""); }}
                  className="flex items-center gap-2 px-3 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition-colors"
                >
                  <History className="w-4 h-4" /> Als Version
                </button>
                <a
                  href={api.dokumente.downloadUrl(ausgewaehlt.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 px-3 py-2 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300 transition-colors"
                >
                  <Eye className="w-4 h-4" /> Download
                </a>
              </div>
            )}

            {/* Aktions-Panels */}
            {aktiveAktion === "sitzung-top" && (
              <div className="px-5 py-4 border-b border-gray-200 bg-blue-50 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-blue-900 text-sm">Sitzung / TOP verknüpfen</h3>
                  <button onClick={() => setAktiveAktion(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Sitzung auswählen</label>
                    <select
                      value={selSitzungId}
                      onChange={e => setSelSitzungId(e.target.value)}
                      className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white"
                    >
                      <option value="">– Sitzung wählen –</option>
                      {sitzungen.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.titel} ({formatDatum(s.sitzungsdatum)})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">TOP-Titel (neuer TOP)</label>
                    <input
                      type="text"
                      value={topTitel}
                      onChange={e => setTopTitel(e.target.value)}
                      placeholder="z. B. Einstellung Mustermann"
                      className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Fristdatum (optional)</label>
                    <input
                      type="date"
                      value={fristDatum}
                      onChange={e => setFristDatum(e.target.value)}
                      className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
                    />
                  </div>
                </div>
                <button
                  onClick={sendeAktionSitzungTop}
                  disabled={aktionLaden || !selSitzungId || !topTitel}
                  className="flex items-center gap-2 px-4 py-2 bg-[rgb(var(--accent))] text-white text-sm rounded-lg hover:brightness-90 disabled:opacity-50"
                >
                  {aktionLaden ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                  Verknüpfen
                </button>
              </div>
            )}

            {aktiveAktion === "wissensarchiv" && (
              <div className="px-5 py-4 border-b border-gray-200 bg-emerald-50 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-emerald-900 text-sm">Ins Wissensarchiv</h3>
                  <button onClick={() => setAktiveAktion(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Tags (Enter zum Hinzufügen)</label>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {tagListe.map(t => (
                      <span key={t} className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 text-xs px-2 py-0.5 rounded-full">
                        #{t}
                        <button onClick={() => setTagListe(prev => prev.filter(x => x !== t))} className="hover:text-red-600">×</button>
                      </span>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={tagHinzufuegen}
                    placeholder="#Tag eingeben und Enter drücken"
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Kategorie</label>
                  <select
                    value={selKategorie}
                    onChange={e => setSelKategorie(e.target.value)}
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white"
                  >
                    {Object.entries(KATEGORIE_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={sendeAktionWissensarchiv}
                  disabled={aktionLaden}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                >
                  {aktionLaden ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                  Speichern
                </button>
              </div>
            )}

            {aktiveAktion === "aufgabe" && (
              <div className="px-5 py-4 border-b border-gray-200 bg-amber-50 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-amber-900 text-sm">Aufgabe erstellen</h3>
                  <button onClick={() => setAktiveAktion(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Aufgabentitel</label>
                    <input
                      type="text"
                      value={aufgabeTitel}
                      onChange={e => setAufgabeTitel(e.target.value)}
                      placeholder={`Prüfe: ${ausgewaehlt.titel}`}
                      className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Zugewiesen an</label>
                    <select
                      value={selMitglied}
                      onChange={e => setSelMitglied(e.target.value)}
                      className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white"
                    >
                      <option value="">– Mitglied wählen –</option>
                      {benutzer.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Priorität</label>
                    <select
                      value={aufgabePrio}
                      onChange={e => setAufgabePrio(e.target.value)}
                      className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white"
                    >
                      <option value="HOCH">Hoch</option>
                      <option value="MITTEL">Mittel</option>
                      <option value="NIEDRIG">Niedrig</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Fällig am (optional)</label>
                    <input
                      type="date"
                      value={aufgabeFaellig}
                      onChange={e => setAufgabeFaellig(e.target.value)}
                      className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
                    />
                  </div>
                </div>
                <button
                  onClick={sendeAktionAufgabe}
                  disabled={aktionLaden || !aufgabeTitel}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700 disabled:opacity-50"
                >
                  {aktionLaden ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                  Aufgabe anlegen
                </button>
              </div>
            )}

            {aktiveAktion === "version" && (
              <div className="px-5 py-4 border-b border-gray-200 bg-purple-50 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-purple-900 text-sm">Als neue Version speichern</h3>
                  <button onClick={() => setAktiveAktion(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Dokument auswählen *</label>
                  {versionVonId ? (
                    <div className="flex items-center justify-between bg-white border border-purple-300 rounded-lg px-3 py-2 text-sm">
                      <span className="text-purple-800 font-medium truncate">{versionVonTitel}</span>
                      <button type="button" onClick={() => { setVersionVonId(null); setVersionVonTitel(""); }} className="text-purple-400 hover:text-purple-600 ml-2 flex-shrink-0">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        value={versionSuche}
                        onChange={e => onVersionSucheChange(e.target.value)}
                        placeholder="Titel suchen…"
                        className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white"
                      />
                      {sucheLaden && <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />}
                      {versionTreffer.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                          {versionTreffer.map(d => (
                            <button key={d.id} type="button" onClick={() => waehleVersionVon(d)}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0">
                              <p className="font-medium text-gray-800 truncate">{d.alias ?? d.titel}</p>
                              <p className="text-xs text-gray-400">{KATEGORIE_LABEL[d.kategorie]}</p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Änderungsnotiz (optional)</label>
                  <input
                    value={aenderungsnotiz}
                    onChange={e => setAenderungsnotiz(e.target.value)}
                    placeholder="Was wurde geändert?"
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-purple-400"
                  />
                </div>
                <button
                  onClick={sendeAktionVersion}
                  disabled={aktionLaden || !versionVonId}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:opacity-50"
                >
                  {aktionLaden ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                  Als Version speichern
                </button>
              </div>
            )}

            {/* PDF-Vorschau */}
            <div className="flex-1 min-h-0 bg-gray-100">
              {ausgewaehlt.mimeTyp === "application/pdf" ? (
                vorschauUrl ? (
                  <object
                    data={vorschauUrl}
                    type="application/pdf"
                    className="w-full h-full"
                  >
                    <p className="p-4 text-sm text-gray-500">PDF-Vorschau nicht verfügbar – <a href={vorschauUrl} className="text-[rgb(var(--accent))] underline">direkt öffnen</a></p>
                  </object>
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-400">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" /> Lade Vorschau…
                  </div>
                )
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
                  <FileText className="w-10 h-10" />
                  <p className="text-sm">Keine Vorschau für {ausgewaehlt.mimeTyp}</p>
                  <a
                    href={api.dokumente.downloadUrl(ausgewaehlt.id)}
                    className="text-[rgb(var(--accent))] text-sm underline"
                  >
                    Herunterladen
                  </a>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
