import { useEffect, useState, useRef, useCallback } from "react";
import {
  Inbox, FileText, Clock, Tag, CheckSquare, Eye, X, ChevronRight, ChevronDown, ChevronUp,
  Loader2, Check, CheckCheck, History, Search, RotateCcw, ScanLine, Trash2, AlertTriangle, CalendarClock, Send,
} from "lucide-react";
import {
  api, Dokument, SitzungListItem, Benutzer, TOP, KATEGORIE_LABEL, formatDatum, formatDateigroesse,
  ScanEingangEintrag, SitzungScanTyp, istEmail, KuendigungsArt, ZugangInfo, EmpfangsbestaetigungEntwurf, Sitzungsvorschlag, VorgeschlageneSitzung } from "../lib/api";
import EmailVorschau from "../components/EmailVorschau";
import { dokumentInNeuemTabOeffnen } from "../lib/dokumentOeffnen";

type Aktion = "sitzung-top" | "wissensarchiv" | "aufgabe" | "version" | "wiedervorlage" | null;

const QUELLE_LABEL: Record<string, string> = {
  WATCHFOLDER: "Watch-Folder",
  UPLOAD:      "Manuell hochgeladen",
  SYSTEM:      "System",
};

const QUELLE_FARBE: Record<string, string> = {
  WATCHFOLDER: "bg-violet-100 text-violet-800",
  UPLOAD:      "bg-accent/10 text-accent",
  SYSTEM:      "bg-gray-100 text-gray-700",
};

// Datei im neuen Tab öffnen statt als Datei zu erzwingen – vermeidet Chromes
// "nicht sicher"-Downloadwarnung im HTTP-Intranet-Betrieb. Wichtig: die
// Endpunkte brauchen einen Auth-Token, ein simples <a href> würde den nicht
// mitschicken (kein Cookie-Login) und nur eine 401-Fehlerseite liefern.
function dateiInTabOeffnen(url: string) {
  const tab = window.open("", "_blank");
  const token = localStorage.getItem("brdms_token");
  fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.blob(); })
    .then(blob => {
      const objectUrl = URL.createObjectURL(blob);
      if (tab) tab.location.href = objectUrl; else window.location.href = objectUrl;
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    })
    .catch(() => {
      if (tab) tab.close();
      alert("Datei konnte nicht geöffnet werden");
    });
}

export default function Eingang() {
  const [dokumente, setDokumente]             = useState<Dokument[]>([]);
  const [laden, setLaden]                     = useState(true);
  const [ausgeklappt, setAusgeklappt]         = useState<string | null>(null);
  const [vorschauUrl, setVorschauUrl]         = useState<string | null>(null);
  const [aktiveAktion, setAktiveAktion]       = useState<Aktion>(null);
  const [aktionErfolg, setAktionErfolg]       = useState<string | null>(null);

  // Wartende Scans aus dem Watch-Folder (protokoll_scan)
  const [scanEingang, setScanEingang]         = useState<ScanEingangEintrag[]>([]);
  const [scanSitzungen, setScanSitzungen]     = useState<SitzungListItem[]>([]);

  // Für Aktions-Modals
  const [sitzungen, setSitzungen]             = useState<SitzungListItem[]>([]);
  const [benutzer, setBenutzer]               = useState<Benutzer[]>([]);
  const [aktionLaden, setAktionLaden]         = useState(false);

  // Sitzung/TOP-Felder
  const [selSitzungId, setSelSitzungId]       = useState("");
  const [topModus, setTopModus]               = useState<"neu" | "bestehend">("neu");
  const [topsDerSitzung, setTopsDerSitzung]   = useState<TOP[]>([]);
  const [topsLaden, setTopsLaden]             = useState(false);
  const [selTopId, setSelTopId]               = useState("");
  const [topTitel, setTopTitel]               = useState("");
  const [fristDatum, setFristDatum]           = useState("");
  // Wissensarchiv-Felder
  const [tagInput, setTagInput]               = useState("");
  const [tagListe, setTagListe]               = useState<string[]>([]);
  const [selKategorie, setSelKategorie]       = useState("");
  // Aufgabe-Felder
  const [aufgabeTitel, setAufgabeTitel]       = useState("");
  const [selMitglied, setSelMitglied]         = useState("");
  const [aufgabePrio, setAufgabePrio]         = useState("MITTEL");
  const [aufgabeFaellig, setAufgabeFaellig]   = useState("");
  // Wiedervorlage
  const [wiedervorlageDatum, setWiedervorlageDatum] = useState("");
  // Versions-Felder
  const [versionSuche, setVersionSuche]       = useState("");
  const [versionTreffer, setVersionTreffer]   = useState<Dokument[]>([]);
  const [versionVonId, setVersionVonId]       = useState<string | null>(null);
  const [versionVonTitel, setVersionVonTitel] = useState("");
  const [aenderungsnotiz, setAenderungsnotiz] = useState("");
  const [sucheLaden, setSucheLaden]           = useState(false);
  const sucheTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blobRef    = useRef<string | null>(null);

  // Derived: das aktuell ausgeklappte Dokument
  const ausgewaehlt = dokumente.find(d => d.id === ausgeklappt) ?? null;

  // Fixierte Tagesordnung ist eingefroren – neue TOPs nur im ENTWURF (siehe waehleSitzungFuerTop)
  const topAktionSitzungImEntwurf = sitzungen.find(s => s.id === selSitzungId)?.status === "ENTWURF";

  const ladeInbox = useCallback(() => {
    setLaden(true);
    api.dokumente.inbox()
      .then(setDokumente)
      .catch(console.error)
      .finally(() => setLaden(false));
  }, []);

  useEffect(() => { ladeInbox(); }, [ladeInbox]);

  const ladeScanEingang = useCallback(() => {
    api.scanEingang.liste().then(setScanEingang).catch(console.error);
  }, []);

  useEffect(() => {
    ladeScanEingang();
    api.sitzungen.liste()
      .then(data => setScanSitzungen(data.filter(s => s.status !== "ENTWURF" && s.status !== "ABGESAGT" && s.status !== "ABGESCHLOSSEN")))
      .catch(console.error);
  }, [ladeScanEingang]);

  function scanEingangErledigt(id: string) {
    setScanEingang(prev => prev.filter(e => e.id !== id));
  }

  async function ladeVorschau(dok: Dokument) {
    if (blobRef.current) URL.revokeObjectURL(blobRef.current);
    setVorschauUrl(null);
    if (dok.mimeTyp === "application/pdf") {
      try {
        const res = await fetch(api.dokumente.vorschauUrl(dok.id), {
          headers: { Authorization: `Bearer ${localStorage.getItem("brdms_token")}` },
        });
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        blobRef.current = url;
        setVorschauUrl(url);
      } catch {}
    }
  }

  async function toggle(dok: Dokument) {
    if (ausgeklappt === dok.id) {
      setAusgeklappt(null);
      setAktiveAktion(null);
      setAktionErfolg(null);
      return;
    }
    setAktiveAktion(null);
    setAktionErfolg(null);
    setAusgeklappt(dok.id);
    await ladeVorschau(dok);
  }

  async function oeffneAktion(aktion: Aktion) {
    setAktiveAktion(aktion);
    setAktionErfolg(null);
    if (aktion === "sitzung-top") {
      setTopModus("neu");
      setSelTopId("");
      setTopsDerSitzung([]);
      if (sitzungen.length === 0) {
        const data = await api.sitzungen.liste().catch(() => []);
        setSitzungen(data.filter(s => s.status === "ENTWURF" || s.status === "TAGESORDNUNG_FIXIERT"));
      }
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

  async function waehleSitzungFuerTop(sitzungId: string) {
    setSelSitzungId(sitzungId);
    setSelTopId("");
    setTopsDerSitzung([]);
    if (!sitzungId) return;

    // Fixierte Tagesordnung ist eingefroren (gleiche Regel wie auf der Sitzungsseite):
    // neue TOPs nur im ENTWURF, danach lässt sich ein Dokument nur noch an einen
    // bereits spontan hinzugefügten TOP hängen.
    const istEntwurf = sitzungen.find(s => s.id === sitzungId)?.status === "ENTWURF";
    setTopModus(istEntwurf ? "neu" : "bestehend");

    setTopsLaden(true);
    try {
      const sitzung = await api.sitzungen.einzel(sitzungId);
      setTopsDerSitzung(istEntwurf ? sitzung.tops : sitzung.tops.filter(t => t.spontan));
    } catch { setTopsDerSitzung([]); }
    finally { setTopsLaden(false); }
  }

  async function sendeAktionSitzungTop() {
    if (!ausgewaehlt || !selSitzungId) return;
    if (topModus === "neu" && !topTitel) return;
    if (topModus === "bestehend" && !selTopId) return;
    setAktionLaden(true);
    try {
      const gewaehlterTop = topsDerSitzung.find(t => t.id === selTopId);
      await api.dokumente.aktionSitzungTop(ausgewaehlt.id, {
        sitzungId: selSitzungId,
        topTitel:  topModus === "bestehend" ? (gewaehlterTop?.titel ?? "") : topTitel,
        topId:     topModus === "bestehend" ? selTopId : undefined,
        fristDatum: fristDatum || undefined,
      });
      setAktionErfolg("Dokument wurde mit Sitzung/TOP verknüpft.");
      setDokumente(prev => prev.filter(d => d.id !== ausgewaehlt.id));
      setAusgeklappt(null);
      setAktiveAktion(null);
    } catch (err: any) { alert(err.message); }
    finally { setAktionLaden(false); }
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
      setAusgeklappt(null);
      setAktiveAktion(null);
    } catch (err: any) { alert(err.message); }
    finally { setAktionLaden(false); }
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
      setAusgeklappt(null);
      setAktiveAktion(null);
    } catch (err: any) { alert(err.message); }
    finally { setAktionLaden(false); }
  }

  async function sendeAktionErledigt() {
    if (!ausgewaehlt) return;
    setAktionLaden(true);
    try {
      await api.dokumente.aktionErledigt(ausgewaehlt.id);
      setDokumente(prev => prev.filter(d => d.id !== ausgewaehlt.id));
      setAusgeklappt(null);
      setAktiveAktion(null);
    } catch (err: any) { alert(err.message); }
    finally { setAktionLaden(false); }
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
    } catch (err: any) { alert(err.message); }
    finally { setAktionLaden(false); }
  }

  async function sendeAktionWiedervorlage() {
    if (!ausgewaehlt || !wiedervorlageDatum) return;
    setAktionLaden(true);
    try {
      await api.dokumente.aktualisieren(ausgewaehlt.id, { wiedervorlageAm: wiedervorlageDatum });
      await api.dokumente.aktionErledigt(ausgewaehlt.id);
      setAktionErfolg(`Wiedervorlage gesetzt für ${new Date(wiedervorlageDatum).toLocaleDateString("de-DE")}`);
      setDokumente(prev => prev.filter(d => d.id !== ausgewaehlt.id));
      setAusgeklappt(null);
      setAktiveAktion(null);
    } catch (err: any) { alert(err.message); }
    finally { setAktionLaden(false); }
  }

  const ungelesen = dokumente.filter(d => !d.inboxGelesen).length;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgb(var(--accent) / 0.1)" }}>
            <Inbox className="w-5 h-5" style={{ color: "rgb(var(--accent))" }} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              Eingang
              {ungelesen > 0 && (
                <span className="bg-[rgb(var(--accent))] text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  {ungelesen}
                </span>
              )}
            </h1>
            <p className="text-sm text-gray-500">Neu eingegangene Dokumente</p>
          </div>
        </div>
        <button
          onClick={() => { ladeInbox(); ladeScanEingang(); }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border border-gray-200 bg-white hover:bg-gray-50 transition-colors text-gray-600"
        >
          <RotateCcw size={15} /> Aktualisieren
        </button>
      </div>

      {/* Wartende Scans aus dem Watch-Folder (protokoll_scan) */}
      {scanEingang.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1.5">
            <ScanLine size={13} /> Wartende Scans ({scanEingang.length}) – noch keiner Sitzung zugeordnet
          </p>
          <div className="space-y-2">
            {scanEingang.map(eintrag => (
              <ScanEingangKarte
                key={eintrag.id}
                eintrag={eintrag}
                sitzungen={scanSitzungen}
                onErledigt={scanEingangErledigt}
              />
            ))}
          </div>
        </div>
      )}

      {/* Zähler */}
      <p className="text-xs text-gray-500 mb-3">
        {laden ? "Lade…" : `${dokumente.length} Dokument${dokumente.length !== 1 ? "e" : ""} im Eingang`}
      </p>

      {/* Liste */}
      {laden ? (
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Lade…
        </div>
      ) : dokumente.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <CheckSquare size={40} className="mx-auto mb-3 opacity-20" />
          <p className="font-medium">Eingang ist leer</p>
          <p className="text-sm mt-1">Alle Dokumente wurden bearbeitet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {dokumente.map(dok => (
            <div key={dok.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {/* Kopfzeile */}
              <button
                onClick={() => toggle(dok)}
                className="w-full text-left px-5 py-4 flex items-start gap-3 hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    {!dok.inboxGelesen && (
                      <span className="w-2 h-2 rounded-full bg-[rgb(var(--accent))] flex-shrink-0" />
                    )}
                    <span className={`text-xs px-1.5 py-0.5 rounded ${QUELLE_FARBE[dok.inboxQuelle ?? "UPLOAD"] ?? "bg-gray-100 text-gray-600"}`}>
                      {QUELLE_LABEL[dok.inboxQuelle ?? "UPLOAD"]}
                    </span>
                    <span className="text-xs text-gray-400">{KATEGORIE_LABEL[dok.kategorie]}</span>
                    <span className="text-xs text-gray-400">{formatDatum(dok.erstelltAm)}</span>
                    <span className="text-xs text-gray-400">{formatDateigroesse(dok.dateigroesse)}</span>
                    <FristBadge dok={dok} />
                  </div>
                  <p className={`font-semibold truncate ${!dok.inboxGelesen ? "text-gray-900" : "text-gray-700"}`}>
                    {dok.alias ?? dok.titel}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{dok.dateiname}</p>
                </div>
                {ausgeklappt === dok.id
                  ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
                  : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />}
              </button>

              {/* Ausgeklappter Inhalt */}
              {ausgeklappt === dok.id && ausgewaehlt && (
                <div className="px-5 pb-5 border-t border-gray-100 bg-gray-50">

                  {/* Erfolg-Banner */}
                  {aktionErfolg && (
                    <div className="mt-4 flex items-center gap-2 bg-green-50 text-green-800 border border-green-200 rounded-lg px-3 py-2 text-sm">
                      <Check className="w-4 h-4 flex-shrink-0" /> {aktionErfolg}
                    </div>
                  )}

                  {/* Fristsachen: Zugang beim BR bestätigen (Fristbeginn) */}
                  {!aktiveAktion && (dok.fristen?.length ?? 0) > 0 && (
                    <ZugangKarte
                      dok={dok}
                      onBestaetigt={() => api.dokumente.inbox().then(setDokumente).catch(console.error)}
                    />
                  )}

                  {/* Fristsachen: passende Sitzung vor Fristende (erst nach bestätigtem Zugang) */}
                  {!aktiveAktion && (dok.fristen?.length ?? 0) > 0 && dok.zugangBestaetigtAm && (
                    <SitzungsVorschlagKarte
                      dok={dok}
                      onTopAngelegt={() => {
                        setDokumente(prev => prev.filter(d => d.id !== dok.id));
                        setAusgeklappt(null);
                      }}
                    />
                  )}

                  {/* Aktions-Buttons */}
                  {!aktiveAktion && (
                    <div className="flex flex-wrap gap-2 mt-4 mb-4">
                      <button onClick={() => oeffneAktion("sitzung-top")}
                        className="flex items-center gap-2 px-3 py-2 text-white text-sm rounded-lg hover:brightness-90 transition-colors"
                        style={{ backgroundColor: "rgb(var(--accent))" }}>
                        <Clock className="w-4 h-4" /> Sitzung / TOP
                      </button>
                      <button onClick={() => oeffneAktion("wissensarchiv")}
                        className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 transition-colors">
                        <Tag className="w-4 h-4" /> Wissensarchiv
                      </button>
                      <button onClick={() => oeffneAktion("aufgabe")}
                        className="flex items-center gap-2 px-3 py-2 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700 transition-colors">
                        <CheckSquare className="w-4 h-4" /> Aufgabe
                      </button>
                      <button onClick={() => { oeffneAktion("version"); setVersionVonId(null); setVersionVonTitel(""); setVersionSuche(""); setVersionTreffer([]); setAenderungsnotiz(""); }}
                        className="flex items-center gap-2 px-3 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition-colors">
                        <History className="w-4 h-4" /> Als Version
                      </button>
                      <button onClick={() => { setWiedervorlageDatum(""); oeffneAktion("wiedervorlage"); }}
                        className="flex items-center gap-2 px-3 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent-hover transition-colors">
                        <RotateCcw className="w-4 h-4" /> Wiedervorlage
                      </button>
                      <button onClick={() => dateiInTabOeffnen(api.dokumente.downloadUrl(ausgewaehlt.id))}
                        className="flex items-center gap-2 px-3 py-2 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300 transition-colors">
                        <Eye className="w-4 h-4" /> Download
                      </button>
                      <button onClick={sendeAktionErledigt} disabled={aktionLaden}
                        className="flex items-center gap-2 px-3 py-2 bg-gray-500 text-white text-sm rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-50">
                        {aktionLaden ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
                        Erledigt
                      </button>
                    </div>
                  )}

                  {/* Aktions-Panel: Sitzung/TOP */}
                  {aktiveAktion === "sitzung-top" && (
                    <div className="mt-4 mb-4 p-4 bg-accent/5 border border-accent/25 rounded-xl space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="font-medium text-accent text-sm">Sitzung / TOP verknüpfen</h3>
                        <button onClick={() => setAktiveAktion(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-gray-700 mb-1">Sitzung auswählen</label>
                          <select value={selSitzungId} onChange={e => waehleSitzungFuerTop(e.target.value)}
                            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white">
                            <option value="">– Sitzung wählen –</option>
                            {sitzungen.map(s => (
                              <option key={s.id} value={s.id}>{s.titel} ({formatDatum(s.sitzungsdatum)})</option>
                            ))}
                          </select>
                        </div>

                        <div className="col-span-2 flex gap-4 text-sm">
                          <label className={`flex items-center gap-1.5 cursor-pointer ${!topAktionSitzungImEntwurf ? "opacity-40 cursor-not-allowed" : ""}`}>
                            <input type="radio" name="topModus" checked={topModus === "neu"}
                              disabled={!topAktionSitzungImEntwurf}
                              onChange={() => setTopModus("neu")} />
                            Neuer TOP
                          </label>
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input type="radio" name="topModus" checked={topModus === "bestehend"}
                              onChange={() => setTopModus("bestehend")} />
                            Als Anhang zu vorhandenem TOP
                          </label>
                        </div>

                        {selSitzungId && !topAktionSitzungImEntwurf && (
                          <div className="col-span-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                            Die Tagesordnung dieser Sitzung ist bereits fixiert – neue TOPs gehen jetzt nur noch als
                            Spontan-TOP in der Sitzung selbst. Hier lässt sich das Dokument nur an einen bereits
                            spontan hinzugefügten TOP hängen.
                          </div>
                        )}

                        {topModus === "neu" ? (
                          <div className="col-span-2">
                            <label className="block text-xs font-medium text-gray-700 mb-1">TOP-Titel (neuer TOP)</label>
                            <input type="text" value={topTitel} onChange={e => setTopTitel(e.target.value)}
                              placeholder="z. B. Einstellung Mustermann"
                              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
                          </div>
                        ) : (
                          <div className="col-span-2">
                            <label className="block text-xs font-medium text-gray-700 mb-1">Vorhandenen TOP wählen</label>
                            <select value={selTopId} onChange={e => setSelTopId(e.target.value)}
                              disabled={!selSitzungId || topsLaden}
                              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white disabled:opacity-50">
                              <option value="">
                                {!selSitzungId ? "– zuerst Sitzung wählen –" : topsLaden ? "Lade TOPs…" : "– TOP wählen –"}
                              </option>
                              {topsDerSitzung.map(t => (
                                <option key={t.id} value={t.id}>{t.nummer}. {t.titel}</option>
                              ))}
                            </select>
                            {selSitzungId && !topsLaden && topsDerSitzung.length === 0 && (
                              <p className="text-xs text-gray-400 mt-1">
                                {topAktionSitzungImEntwurf
                                  ? "Diese Sitzung hat noch keine TOPs."
                                  : "Diese Sitzung hat noch keine Spontan-TOPs."}
                              </p>
                            )}
                          </div>
                        )}

                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Fristdatum (optional)</label>
                          <input type="date" value={fristDatum} onChange={e => setFristDatum(e.target.value)}
                            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
                        </div>
                      </div>
                      <button onClick={sendeAktionSitzungTop}
                        disabled={aktionLaden || !selSitzungId || (topModus === "neu" ? !topTitel : !selTopId)}
                        className="flex items-center gap-2 px-4 py-2 text-white text-sm rounded-lg hover:brightness-90 disabled:opacity-50"
                        style={{ backgroundColor: "rgb(var(--accent))" }}>
                        {aktionLaden ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                        Verknüpfen
                      </button>
                    </div>
                  )}

                  {/* Aktions-Panel: Wiedervorlage */}
                  {aktiveAktion === "wiedervorlage" && (
                    <div className="mt-4 mb-4 p-4 bg-accent/5 border border-accent/25 rounded-xl space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="font-medium text-accent text-sm">Wiedervorlage</h3>
                        <button onClick={() => setAktiveAktion(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                      </div>
                      <p className="text-xs text-accent">Das Dokument erscheint am gewählten Datum erneut im Eingang.</p>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Wiedervorlage am</label>
                        <input type="date" value={wiedervorlageDatum}
                          min={new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)}
                          onChange={e => setWiedervorlageDatum(e.target.value)}
                          className="text-sm border border-gray-300 rounded-lg px-3 py-2" />
                      </div>
                      <button onClick={sendeAktionWiedervorlage} disabled={aktionLaden || !wiedervorlageDatum}
                        className="flex items-center gap-2 px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent-hover disabled:opacity-50">
                        {aktionLaden ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                        Wiedervorlage setzen
                      </button>
                    </div>
                  )}

                  {/* Aktions-Panel: Wissensarchiv */}
                  {aktiveAktion === "wissensarchiv" && (
                    <div className="mt-4 mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-3">
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
                        <input type="text" value={tagInput} onChange={e => setTagInput(e.target.value)}
                          onKeyDown={tagHinzufuegen} placeholder="#Tag eingeben und Enter drücken"
                          className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Kategorie</label>
                        <select value={selKategorie} onChange={e => setSelKategorie(e.target.value)}
                          className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white">
                          {Object.entries(KATEGORIE_LABEL).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                      </div>
                      <button onClick={sendeAktionWissensarchiv} disabled={aktionLaden}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                        {aktionLaden ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                        Speichern
                      </button>
                    </div>
                  )}

                  {/* Aktions-Panel: Aufgabe */}
                  {aktiveAktion === "aufgabe" && (
                    <div className="mt-4 mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="font-medium text-amber-900 text-sm">Aufgabe erstellen</h3>
                        <button onClick={() => setAktiveAktion(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-gray-700 mb-1">Aufgabentitel</label>
                          <input type="text" value={aufgabeTitel} onChange={e => setAufgabeTitel(e.target.value)}
                            placeholder={`Prüfe: ${ausgewaehlt.titel}`}
                            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Zugewiesen an</label>
                          <select value={selMitglied} onChange={e => setSelMitglied(e.target.value)}
                            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white">
                            <option value="">– Mitglied wählen –</option>
                            {benutzer.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Priorität</label>
                          <select value={aufgabePrio} onChange={e => setAufgabePrio(e.target.value)}
                            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white">
                            <option value="HOCH">Hoch</option>
                            <option value="MITTEL">Mittel</option>
                            <option value="NIEDRIG">Niedrig</option>
                          </select>
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-gray-700 mb-1">Fällig am (optional)</label>
                          <input type="date" value={aufgabeFaellig} onChange={e => setAufgabeFaellig(e.target.value)}
                            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
                        </div>
                      </div>
                      <button onClick={sendeAktionAufgabe} disabled={aktionLaden || !aufgabeTitel}
                        className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700 disabled:opacity-50">
                        {aktionLaden ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                        Aufgabe anlegen
                      </button>
                    </div>
                  )}

                  {/* Aktions-Panel: Als Version */}
                  {aktiveAktion === "version" && (
                    <div className="mt-4 mb-4 p-4 bg-purple-50 border border-purple-200 rounded-xl space-y-3">
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
                            <input value={versionSuche} onChange={e => onVersionSucheChange(e.target.value)}
                              placeholder="Titel suchen…"
                              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white" />
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
                        <input value={aenderungsnotiz} onChange={e => setAenderungsnotiz(e.target.value)}
                          placeholder="Was wurde geändert?"
                          className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-purple-400" />
                      </div>
                      <button onClick={sendeAktionVersion} disabled={aktionLaden || !versionVonId}
                        className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:opacity-50">
                        {aktionLaden ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                        Als Version speichern
                      </button>
                    </div>
                  )}

                  {/* PDF- bzw. E-Mail-Vorschau */}
                  <div className="rounded-xl overflow-hidden border border-gray-200 mt-2 bg-gray-100" style={{ height: "60vh" }}>
                    {istEmail(ausgewaehlt.mimeTyp) ? (
                      <EmailVorschau
                        dokumentId={ausgewaehlt.id}
                        onDokumentOeffnen={id => dokumentInNeuemTabOeffnen(id)}
                        onAbgelegt={() => {}}
                      />
                    ) : ausgewaehlt.mimeTyp === "application/pdf" ? (
                      vorschauUrl ? (
                        <object data={vorschauUrl} type="application/pdf" className="w-full h-full">
                          <p className="p-4 text-sm text-gray-500">
                            PDF-Vorschau nicht verfügbar –{" "}
                            <a href={vorschauUrl} className="text-[rgb(var(--accent))] underline">direkt öffnen</a>
                          </p>
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
                        {/* Button statt Link: der Download braucht den Auth-Header */}
                        <button onClick={() => dateiInTabOeffnen(api.dokumente.downloadUrl(ausgewaehlt.id))}
                          className="text-[rgb(var(--accent))] text-sm underline">
                          Herunterladen
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Karte für einen wartenden Scan (Watch-Folder-Unterordner protokoll_scan) ──
function ScanEingangKarte({
  eintrag, sitzungen, onErledigt,
}: { eintrag: ScanEingangEintrag; sitzungen: SitzungListItem[]; onErledigt: (id: string) => void }) {
  const [selSitzungId, setSelSitzungId]           = useState("");
  const [alGewaehlt, setAlGewaehlt]               = useState(false);
  const [protokollGewaehlt, setProtokollGewaehlt] = useState(false);
  const [laden, setLaden]                         = useState(false);
  const [fehler, setFehler]                       = useState("");

  const gewaehlteSitzung = sitzungen.find(s => s.id === selSitzungId);
  const alErlaubt = gewaehlteSitzung
    ? gewaehlteSitzung.status === "TAGESORDNUNG_FIXIERT" || gewaehlteSitzung.status === "PROTOKOLL_ENTWURF" || gewaehlteSitzung.status === "PROTOKOLL_FINAL"
    : false;
  const protokollErlaubt = gewaehlteSitzung?.status === "PROTOKOLL_FINAL";

  function sitzungWaehlen(id: string) {
    setSelSitzungId(id);
    setAlGewaehlt(false);
    setProtokollGewaehlt(false);
  }

  async function zuordnen() {
    const typen: SitzungScanTyp[] = [
      ...(alGewaehlt ? ["ANWESENHEITSLISTE" as SitzungScanTyp] : []),
      ...(protokollGewaehlt ? ["PROTOKOLL_UNTERSCHRIFTEN" as SitzungScanTyp] : []),
    ];
    if (!selSitzungId || typen.length === 0) return;
    setLaden(true);
    setFehler("");
    try {
      await api.scanEingang.zuordnen(eintrag.id, selSitzungId, typen);
      onErledigt(eintrag.id);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler");
    } finally {
      setLaden(false);
    }
  }

  async function verwerfen() {
    if (!confirm(`"${eintrag.dateiname}" wirklich verwerfen?`)) return;
    setLaden(true);
    try {
      await api.scanEingang.verwerfen(eintrag.id);
      onErledigt(eintrag.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Fehler");
    } finally {
      setLaden(false);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
        <div className="min-w-0">
          <p className="font-medium text-gray-900 truncate">{eintrag.dateiname}</p>
          <p className="text-xs text-gray-400">
            {formatDateigroesse(eintrag.dateigroesse)} · {formatDatum(eintrag.erkanntAm)}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => dateiInTabOeffnen(api.scanEingang.dateiUrl(eintrag.id))}
            className="flex items-center gap-1 text-gray-500 hover:text-gray-700 text-xs font-medium"
          >
            <Eye size={13} /> Ansehen
          </button>
          <button
            onClick={verwerfen}
            disabled={laden}
            title="Verwerfen"
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-gray-700 mb-1">Sitzung</label>
          <select
            value={selSitzungId}
            onChange={e => sitzungWaehlen(e.target.value)}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white"
          >
            <option value="">– Sitzung wählen –</option>
            {sitzungen.map(s => (
              <option key={s.id} value={s.id}>{s.titel} ({formatDatum(s.sitzungsdatum)})</option>
            ))}
          </select>
        </div>

        <div className="flex gap-3 text-sm">
          <label className={`flex items-center gap-1.5 cursor-pointer ${!alErlaubt ? "opacity-40 cursor-not-allowed" : ""}`}>
            <input type="checkbox" checked={alGewaehlt} disabled={!alErlaubt}
              onChange={e => setAlGewaehlt(e.target.checked)} />
            Anwesenheitsliste
          </label>
          <label className={`flex items-center gap-1.5 cursor-pointer ${!protokollErlaubt ? "opacity-40 cursor-not-allowed" : ""}`}>
            <input type="checkbox" checked={protokollGewaehlt} disabled={!protokollErlaubt}
              onChange={e => setProtokollGewaehlt(e.target.checked)} />
            Protokoll-Unterschriften
          </label>
        </div>

        <button
          onClick={zuordnen}
          disabled={laden || !selSitzungId || (!alGewaehlt && !protokollGewaehlt)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-white text-sm font-medium rounded-lg hover:brightness-90 disabled:opacity-50"
          style={{ backgroundColor: "rgb(var(--accent))" }}
        >
          {laden ? <Loader2 size={13} className="animate-spin" /> : <ChevronRight size={13} />}
          Zuordnen
        </button>
      </div>

      {fehler && <p className="text-xs text-red-600 mt-2">{fehler}</p>}
    </div>
  );
}

// ── Fristsachen: Zugang bestätigen ───────────────────────────────────
// Die Frist läuft ab Zugang beim Betriebsrat, nicht ab Import. Das System schlägt
// den Zugang vor (E-Mail-Datum bzw. Eingang); Vorsitz/Stellvertretung bestätigen
// oder korrigieren ihn, danach werden die Fristen neu berechnet (Backend: lib/zugang.ts).

const datumMitTag = (iso: string) =>
  new Date(iso).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });

const datumZeit = (iso: string) =>
  new Date(iso).toLocaleString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Date → Wert für <input type="datetime-local"> in Ortszeit */
function alsEingabe(iso: string): string {
  const d = new Date(iso);
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
}

function FristBadge({ dok }: { dok: Dokument }) {
  const naechste = dok.fristen?.[0];
  if (!naechste) return null;
  return dok.zugangBestaetigtAm ? (
    <span className="text-xs px-1.5 py-0.5 rounded bg-red-50 text-red-700 flex items-center gap-1">
      <CalendarClock size={12} /> Frist bis {datumMitTag(naechste.faelligAm)}
    </span>
  ) : (
    <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 flex items-center gap-1">
      <AlertTriangle size={12} /> Frist vorläufig – Zugang bestätigen
    </span>
  );
}

function ZugangKarte({ dok, onBestaetigt }: { dok: Dokument; onBestaetigt: () => void }) {
  const ist102 = dok.kategorie === "ANHOERUNG_102";
  const bestaetigt = !!dok.zugangBestaetigtAm;

  const [bearbeiten, setBearbeiten]   = useState(!bestaetigt);
  const [zugang, setZugang]           = useState(() => alsEingabe(dok.zugangAm ?? dok.erstelltAm));
  const [art, setArt]                 = useState<KuendigungsArt | null>(dok.anhoerungsVorgang?.kuendigungsArt ?? null);
  const [vollstaendig, setVollstaendig] = useState(dok.unterlagenVollstaendig !== false);
  const [info, setInfo]               = useState<ZugangInfo | null>(null);
  const [speichert, setSpeichert]     = useState(false);
  const [fehler, setFehler]           = useState("");

  // Vorschau der Fristen bei jeder Änderung (kurz entprellt)
  useEffect(() => {
    const iso = zugang ? new Date(zugang).toISOString() : undefined;
    const t = setTimeout(() => {
      api.dokumente.zugang(dok.id, iso, art)
        .then(i => { setInfo(i); setFehler(""); })
        .catch(err => setFehler(err instanceof Error ? err.message : "Vorschau fehlgeschlagen"));
    }, 250);
    return () => clearTimeout(t);
  }, [dok.id, zugang, art, dok.zugangBestaetigtAm]);

  async function bestaetigen() {
    if (!zugang) return;
    setSpeichert(true);
    setFehler("");
    try {
      await api.dokumente.zugangBestaetigen(dok.id, {
        zugangAm: new Date(zugang).toISOString(),
        kuendigungsArt: ist102 ? art : null,
        unterlagenVollstaendig: vollstaendig,
      });
      setBearbeiten(false);
      onBestaetigt();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler beim Bestätigen");
    } finally {
      setSpeichert(false);
    }
  }

  const rahmen = bestaetigt ? "bg-white border-gray-200" : "bg-amber-50 border-amber-200";

  return (
    <div className={`mt-4 p-4 border rounded-xl space-y-3 ${rahmen}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-medium text-sm text-gray-900 flex items-center gap-1.5">
            <CalendarClock size={15} /> Zugang beim Betriebsrat
          </h3>
          {bestaetigt && !bearbeiten ? (
            <p className="text-xs text-gray-600 mt-0.5">
              Zugegangen {datumZeit(dok.zugangAm!)} · bestätigt{info?.zugangBestaetigtVon ? ` von ${info.zugangBestaetigtVon}` : ""} am {datumMitTag(dok.zugangBestaetigtAm!)}
            </p>
          ) : (
            <p className="text-xs text-gray-600 mt-0.5">
              Die Frist beginnt mit dem Zugang beim Betriebsrat, nicht mit dem Scan. Vorschlag: {
                istEmail(dok.mimeTyp) ? "Sendezeit der E-Mail" : "Eingang im System"
              } – bitte prüfen. Liegt ein Schreiben außerhalb der Dienstzeit im Postfach, geht es in der Regel erst am nächsten Arbeitstag zu.
            </p>
          )}
        </div>
        {bestaetigt && !bearbeiten && (
          <button onClick={() => setBearbeiten(true)} className="text-xs text-accent hover:underline shrink-0">Korrigieren</button>
        )}
      </div>

      {bearbeiten && (
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-gray-700">Zugegangen am</span>
            <input
              type="datetime-local"
              value={zugang}
              max={alsEingabe(new Date().toISOString())}
              onChange={e => setZugang(e.target.value)}
              className="mt-1 block w-full max-w-xs border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </label>

          {ist102 && (
            <fieldset>
              <legend className="text-xs font-medium text-gray-700">Kündigung</legend>
              <div className="mt-1 flex flex-wrap gap-4 text-sm text-gray-700">
                {([["ORDENTLICH", "ordentlich (1 Woche)"], ["AUSSERORDENTLICH", "außerordentlich (3 Tage)"]] as const).map(([wert, label]) => (
                  <label key={wert} className="flex items-center gap-1.5">
                    <input type="radio" name={`art-${dok.id}`} checked={art === wert} onChange={() => setArt(wert)} />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input type="checkbox" className="mt-0.5" checked={vollstaendig} onChange={e => setVollstaendig(e.target.checked)} />
            Unterlagen vollständig
          </label>
          {!vollstaendig && (
            <p className="text-xs text-amber-800">
              Bei unvollständiger Unterrichtung beginnt die Frist nach überwiegender Ansicht erst mit den fehlenden Angaben.
              Das System rechnet sicherheitshalber trotzdem ab Zugang – fehlende Unterlagen beim Arbeitgeber anfordern.
            </p>
          )}
        </div>
      )}

      {info && info.fristen.length > 0 && (
        <ul className="text-sm space-y-1">
          {info.fristen.map(f => {
            const ende = bearbeiten ? f.neuFaelligAm : f.faelligAm;
            return (
              <li key={f.id ?? f.typ} className={ende ? "text-gray-800" : "text-gray-400 line-through"}>
                <span className="font-medium">{f.bezeichnung}:</span>{" "}
                {ende ? <>endet {datumMitTag(ende)}, 24:00 Uhr</> : "entfällt"}
                {bearbeiten && ende && f.verschoben.length > 0 && (
                  <span className="text-xs text-gray-500"> – verschoben wegen {f.verschoben.map(v => v.grund).join(", ")}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {fehler && <p className="text-sm text-red-700">{fehler}</p>}

      {bestaetigt && !bearbeiten && <EmpfangsbestaetigungBereich dok={dok} onGesendet={onBestaetigt} />}

      {bearbeiten && (
        <div className="flex items-center gap-2">
          <button
            onClick={bestaetigen}
            disabled={speichert || !zugang || (ist102 && !art)}
            className="flex items-center gap-1.5 px-3 py-2 text-white text-sm rounded-lg hover:brightness-90 disabled:opacity-50"
            style={{ backgroundColor: "rgb(var(--accent))" }}
          >
            {speichert ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Zugang bestätigen
          </button>
          {bestaetigt && (
            <button onClick={() => setBearbeiten(false)} className="px-3 py-2 text-sm text-gray-600 hover:underline">Abbrechen</button>
          )}
          {ist102 && !art && <span className="text-xs text-gray-500">Bitte Kündigungsart wählen</span>}
        </div>
      )}
    </div>
  );
}

// Empfangsbestätigung an den Arbeitgeber – erst nach bestätigtem Zugang (Backend: lib/empfangsbestaetigung.ts)
function EmpfangsbestaetigungBereich({ dok, onGesendet }: { dok: Dokument; onGesendet: () => void }) {
  const [entwurf, setEntwurf]   = useState<EmpfangsbestaetigungEntwurf | null>(null);
  const [offen, setOffen]       = useState(false);
  const [sendet, setSendet]     = useState(false);
  const [fehler, setFehler]     = useState("");

  async function oeffnen() {
    setFehler("");
    try {
      setEntwurf(await api.dokumente.empfangsbestaetigung(dok.id));
      setOffen(true);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Entwurf konnte nicht geladen werden");
    }
  }

  async function senden() {
    if (!entwurf) return;
    setSendet(true);
    setFehler("");
    try {
      await api.dokumente.empfangsbestaetigungSenden(dok.id, { an: entwurf.an, betreff: entwurf.betreff, text: entwurf.text });
      setOffen(false);
      onGesendet();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Senden fehlgeschlagen");
    } finally {
      setSendet(false);
    }
  }

  return (
    <div className="pt-3 border-t border-gray-100 space-y-2">
      {!offen && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={oeffnen}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-700"
          >
            <Send size={14} /> {dok.empfangsbestaetigungAm ? "Empfangsbestätigung erneut senden" : "Empfangsbestätigung an HR"}
          </button>
          {dok.empfangsbestaetigungAm && (
            <span className="text-xs text-gray-600">
              Gesendet an {dok.empfangsbestaetigungAn} am {datumZeit(dok.empfangsbestaetigungAm)} Uhr
            </span>
          )}
        </div>
      )}

      {offen && entwurf && (
        <div className="space-y-2">
          {!entwurf.smtpAktiv && (
            <p className="flex items-start gap-1.5 text-xs text-amber-800">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              Es ist kein Mailserver eingerichtet – Senden ist nicht möglich.
            </p>
          )}
          <label className="block">
            <span className="text-xs font-medium text-gray-700">An</span>
            <input
              type="email"
              value={entwurf.an}
              placeholder="personal@firma.de (Voreinstellung unter Einstellungen → Löschfristen)"
              onChange={e => setEntwurf({ ...entwurf, an: e.target.value })}
              className="mt-1 block w-full max-w-md border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-700">Betreff</span>
            <input
              value={entwurf.betreff}
              onChange={e => setEntwurf({ ...entwurf, betreff: e.target.value })}
              className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-700">Text</span>
            <textarea
              value={entwurf.text}
              rows={Math.min(18, entwurf.text.split("\n").length + 1)}
              onChange={e => setEntwurf({ ...entwurf, text: e.target.value })}
              className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
            />
          </label>
          <p className="text-xs text-gray-500">Du bekommst eine Kopie. Der Versand wird im Audit-Log festgehalten.</p>
          <div className="flex items-center gap-2">
            <button
              onClick={senden}
              disabled={sendet || !entwurf.smtpAktiv || !entwurf.an.trim()}
              className="flex items-center gap-1.5 px-3 py-2 text-white text-sm rounded-lg hover:brightness-90 disabled:opacity-50"
              style={{ backgroundColor: "rgb(var(--accent))" }}
            >
              {sendet ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Senden
            </button>
            <button onClick={() => setOffen(false)} className="px-3 py-2 text-sm text-gray-600 hover:underline">Abbrechen</button>
          </div>
        </div>
      )}

      {fehler && <p className="text-sm text-red-700">{fehler}</p>}
    </div>
  );
}

// ── Fristsachen: Sitzung vor Fristende vorschlagen ───────────────────
// Der Betriebsrat muss vor Fristende beschließen. Vorgeschlagen werden die nächsten
// Sitzungen; reicht keine, kommt die Warnung "Sondersitzung nötig" (Backend:
// lib/sitzungsvorschlag.ts). Sitzungszeiten liegen als Ortszeit in UTC-Feldern.
const sitzungsZeit = (iso: string) =>
  new Date(iso).toLocaleString("de-DE", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

function SitzungsHinweis({ s }: { s: VorgeschlageneSitzung }) {
  if (s.rechtzeitig === false) return <span className="text-xs text-red-700">nach Fristende</span>;
  if (s.letzterTag) return <span className="text-xs text-amber-700">am letzten Tag der Frist</span>;
  if (s.rechtzeitig) return <span className="text-xs text-green-700">vor Fristende</span>;
  return null;
}

function SitzungsVorschlagKarte({ dok, onTopAngelegt }: { dok: Dokument; onTopAngelegt: () => void }) {
  const [v, setV]               = useState<Sitzungsvorschlag | null>(null);
  const [topTitel, setTopTitel] = useState("");
  const [legtAn, setLegtAn]     = useState<string | null>(null);
  const [fehler, setFehler]     = useState("");

  useEffect(() => {
    api.dokumente.sitzungsvorschlag(dok.id)
      .then(r => { setV(r); setTopTitel(r.vorschlagTitel); })
      .catch(err => setFehler(err instanceof Error ? err.message : "Sitzungen konnten nicht geladen werden"));
  }, [dok.id, dok.zugangBestaetigtAm]);

  async function alsTop(sitzungId: string) {
    if (!topTitel.trim()) return;
    setLegtAn(sitzungId);
    setFehler("");
    try {
      await api.dokumente.aktionSitzungTop(dok.id, { sitzungId, topTitel: topTitel.trim() });
      onTopAngelegt();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "TOP konnte nicht angelegt werden");
      setLegtAn(null);
    }
  }

  if (!v) return fehler ? <p className="mt-3 text-sm text-red-700">{fehler}</p> : null;
  const erste = v.sitzungen.find(s => s.rechtzeitig !== false && s.topMoeglich);

  return (
    <div className={`mt-3 p-4 border rounded-xl space-y-3 ${v.sondersitzungNoetig ? "bg-red-50 border-red-200" : "bg-white border-gray-200"}`}>
      <h3 className="font-medium text-sm text-gray-900 flex items-center gap-1.5">
        <Clock size={15} /> Beratung im Betriebsrat
      </h3>

      {v.sondersitzungNoetig && (
        <p className="flex items-start gap-1.5 text-sm text-red-800">
          <AlertTriangle size={15} className="shrink-0 mt-0.5" />
          <span>
            Keine Sitzung vor Fristende{v.fristende ? ` (${datumMitTag(v.fristende)}, 24:00 Uhr)` : ""}, in die sich noch ein TOP aufnehmen lässt.
            Bitte eine Sondersitzung einberufen – unter <a href="/sitzungen" className="underline">Sitzungen</a>.
          </span>
        </p>
      )}

      {v.verknuepft.length > 0 && (
        <ul className="text-sm space-y-1">
          {v.verknuepft.map(s => (
            <li key={s.id} className="flex flex-wrap items-baseline gap-x-2">
              <Check size={14} className="text-green-700 self-center" />
              <span>TOP {s.topNummer} „{s.topTitel}“ in {s.titel}, {sitzungsZeit(s.datum)}</span>
              <SitzungsHinweis s={s} />
            </li>
          ))}
        </ul>
      )}

      {v.sitzungen.length > 0 && (
        <>
          {v.sitzungen.some(s => s.topMoeglich) && (
          <label className="block">
            <span className="text-xs font-medium text-gray-700">Titel des TOPs</span>
            <input
              value={topTitel}
              onChange={e => setTopTitel(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </label>
          )}
          <ul className="text-sm divide-y divide-gray-100 border border-gray-100 rounded-lg bg-white">
            {v.sitzungen.map(s => (
              <li key={s.id} className="px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-medium text-gray-800">{s.titel}</span>
                  {s.gremium && <span className="text-xs text-gray-500"> · {s.gremium}</span>}
                  <span className="block text-xs text-gray-500">
                    {sitzungsZeit(s.datum)} · <SitzungsHinweis s={s} />
                  </span>
                </div>
                {s.topMoeglich ? (
                  <button
                    onClick={() => alsTop(s.id)}
                    disabled={legtAn !== null || !topTitel.trim()}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg disabled:opacity-50 ${
                      s.id === erste?.id ? "text-white hover:brightness-90" : "border border-gray-300 text-gray-700 hover:bg-gray-50"
                    }`}
                    style={s.id === erste?.id ? { backgroundColor: "rgb(var(--accent))" } : undefined}
                  >
                    {legtAn === s.id ? <Loader2 size={14} className="animate-spin" /> : <Clock size={14} />}
                    Als TOP aufnehmen
                  </button>
                ) : (
                  <span className="text-xs text-gray-500">Tagesordnung fixiert</span>
                )}
              </li>
            ))}
          </ul>
          {v.sitzungen.some(s => s.topMoeglich) && (
            <p className="text-xs text-gray-500">Das Dokument wird mit dem TOP verknüpft und verlässt den Eingang.</p>
          )}
        </>
      )}

      {v.sitzungen.length === 0 && v.verknuepft.length === 0 && (
        <p className="text-sm text-gray-600">Keine geplanten Sitzungen.</p>
      )}

      {fehler && <p className="text-sm text-red-700">{fehler}</p>}
    </div>
  );
}
