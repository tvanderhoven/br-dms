import { useEffect, useState, useRef, FormEvent } from "react";
import { useLocation } from "react-router-dom";
import { SitzungsVorlage } from "../lib/api";
import {
  CalendarDays, Plus, ChevronLeft, ChevronUp, ChevronDown, Lock, Unlock, FileCheck, FileText,
  Trash2, Link, Unlink, X, Loader2, CheckCircle, Clock, XCircle, RotateCcw, Eye,
  Send, ClipboardList, Download, MessageSquare, Zap, Pencil, RefreshCw, BookmarkPlus, Tag, CheckSquare, Folder, Wallet, MoreHorizontal, Copy, Timer,
  Users, Inbox, ListPlus,
} from "lucide-react";
import {
  api, Sitzung, SitzungListItem, SitzungStatus, TOP, TopStatus, Dokument, Mitarbeiter, Abteilung, Zeitmodell, Rolle,
  TOP_STATUS_LABEL, KATEGORIE_LABEL, SITZUNGSTYP_LABEL, KummerkastenEintrag,
  istBetriebsversammlung, sitzungStatusLabel, formatDatum,
} from "../lib/api";
import SitzungsEditor from "../components/SitzungsEditor";
import AnwesenheitsListe from "../components/AnwesenheitsListe";
import BeschlussBlock from "../components/BeschlussBlock";
import KommentarBlock from "../components/KommentarBlock";
import AufgabeUebernehmenModal from "../components/AufgabeUebernehmenModal";
import { tiptapZuText, tiptapZuHtml, textZuTiptap } from "../lib/tiptap";

// PDF direkt im Browser-eigenen Viewer als neuen Tab öffnen statt als Datei
// zu erzwingen – vermeidet Chromes "nicht sicher"-Downloadwarnung bei HTTP-
// only-Intranet-Betrieb (kein erzwungener Download = keine Warnung). Der Tab
// wird synchron geöffnet (noch im User-Klick-Kontext), sonst greift der
// Popup-Blocker.
function pdfInTabOeffnen(url: string) {
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
      alert("PDF konnte nicht geöffnet werden");
    });
}

// ── Status-Badges ─────────────────────────────────────────────────
const SITZUNG_BADGE: Record<SitzungStatus, string> = {
  ENTWURF:              "bg-yellow-100 text-yellow-700 border-yellow-200",
  TAGESORDNUNG_FIXIERT: "bg-accent/10 text-accent border-accent/25",
  PROTOKOLL_ENTWURF:    "bg-orange-100 text-orange-700 border-orange-200",
  PROTOKOLL_FINAL:      "bg-green-100 text-green-700 border-green-200",
  ABGESAGT:             "bg-gray-100 text-gray-500 border-gray-200",
};

const TOP_BADGE: Record<TopStatus, string> = {
  OFFEN:        "bg-gray-100 text-gray-600",
  BESCHLOSSEN:  "bg-green-100 text-green-700",
  ABGELEHNT:    "bg-red-100 text-red-700",
  VERTAGT:      "bg-yellow-100 text-yellow-700",
  ZUR_KENNTNIS: "bg-accent/10 text-accent",
};

const TOP_STATUS_ICON: Record<TopStatus, React.ReactNode> = {
  OFFEN:        <Clock size={12} />,
  BESCHLOSSEN:  <CheckCircle size={12} />,
  ABGELEHNT:    <XCircle size={12} />,
  VERTAGT:      <RotateCcw size={12} />,
  ZUR_KENNTNIS: <Eye size={12} />,
};

const VERSIONS_TYP_LABEL: Record<string, string> = {
  TAGESORDNUNG_ENTWURF:  "V1.0 – Tagesordnung (Entwurf)",
  TAGESORDNUNG_FIXIERT:  "V1.1 – Tagesordnung (Fixiert)",
  PROTOKOLL_ENTWURF:     "V2.0 – Protokoll (Entwurf)",
  PROTOKOLL_FINAL:       "V2.1 – Protokoll (Final)",
};

// Betriebsversammlung: Tagesordnung = Einladung/Aushang, Protokoll = Niederschrift
const VERSIONS_TYP_LABEL_BV: Record<string, string> = {
  TAGESORDNUNG_ENTWURF:  "V1.0 – Einladung (Entwurf)",
  TAGESORDNUNG_FIXIERT:  "V1.1 – Einladung (Fixiert)",
  PROTOKOLL_ENTWURF:     "V2.0 – Niederschrift (Entwurf)",
  PROTOKOLL_FINAL:       "V2.1 – Niederschrift (Final)",
};

function versionLabel(typ: string, sitzungstyp: string): string | undefined {
  return (istBetriebsversammlung(sitzungstyp) ? VERSIONS_TYP_LABEL_BV : VERSIONS_TYP_LABEL)[typ];
}

// TOP-Status, die bei einer Betriebsversammlung Sinn ergeben (sie beschließt nicht)
const TOP_STATUS_BV: TopStatus[] = ["OFFEN", "ZUR_KENNTNIS", "VERTAGT"];

// Konstituierende Sitzung und Betriebsversammlung bringen ohne Vorlage eine Standard-Tagesordnung mit (Backend: STANDARD_TOPS)
const STANDARD_TOP_HINWEIS: Record<string, string> = {
  KONSTITUIEREND:      "Ohne Vorlage wird die Tagesordnung nach § 29 BetrVG angelegt (Wahlleitung, Vorsitz, Stellvertretung, Betriebsausschuss).",
  BETRIEBSVERSAMMLUNG: "Ohne Vorlage wird die Tagesordnung nach § 43 BetrVG angelegt (Tätigkeitsbericht, Bericht des Arbeitgebers, Fragen, Anträge an den BR).",
};

// ── Hauptkomponente ───────────────────────────────────────────────
function PdfNeuGenerierenButton({ sitzungId, versionNummer, onFertig }: {
  sitzungId: string;
  versionNummer: string;
  onFertig: () => void;
}) {
  const [laden, setLaden] = useState(false);

  async function klick(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("PDF neu generieren? Das überschreibt die gespeicherte Version.")) return;
    setLaden(true);
    try {
      await api.sitzungen.pdfNeuGenerieren(sitzungId, versionNummer);
      onFertig();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Fehler beim Generieren");
    } finally {
      setLaden(false);
    }
  }

  return (
    <button
      onClick={klick}
      disabled={laden}
      title="PDF neu generieren (aktuelles Layout übernehmen)"
      className="text-gray-400 hover:text-[rgb(var(--accent))] disabled:opacity-40"
    >
      {laden ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
    </button>
  );
}

export default function Sitzungen() {
  const [liste, setListe]           = useState<SitzungListItem[]>([]);
  const [laden, setLaden]           = useState(true);
  const [gewählt, setGewählt]       = useState<Sitzung | null>(null);
  const [neueModal, setNeueModal]   = useState(false);
  const [detailLaden, setDetailLaden] = useState(false);
  const [meineRolle, setMeineRolle] = useState<Rolle | null>(null);
  const location = useLocation();

  useEffect(() => { api.auth.me().then(b => setMeineRolle(b.rolle)).catch(() => {}); }, []);

  // Erneuter Klick auf "Sitzungen" in der Sidebar navigiert zur selben Route
  // (/sitzungen) – React Router vergibt dabei trotzdem einen neuen location.key.
  // Das nutzen wir, um aus der Detailansicht zurück zur Übersicht zu springen,
  // statt dass der Klick wirkungslos verpufft.
  useEffect(() => {
    setGewählt(null);
  }, [location.key]);

  function listeLaden() {
    setLaden(true);
    api.sitzungen.liste()
      .then(setListe)
      .catch(console.error)
      .finally(() => setLaden(false));
  }

  useEffect(listeLaden, []);

  async function sitzungOeffnen(id: string) {
    setDetailLaden(true);
    try {
      const s = await api.sitzungen.einzel(id);
      setGewählt(s);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Fehler beim Laden");
    } finally {
      setDetailLaden(false);
    }
  }

  // Direktlink auf eine bestimmte Sitzung (z.B. per E-Mail verschickt als
  // /sitzungen?id=...) – öffnet die Detailansicht automatisch.
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("id");
    if (id) sitzungOeffnen(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  async function sitzungAktualisieren(id: string) {
    const s = await api.sitzungen.einzel(id);
    setGewählt(s);
    listeLaden();
  }

  if (gewählt) {
    return (
      <SitzungDetail
        sitzung={gewählt}
        meineRolle={meineRolle}
        onZurueck={() => { setGewählt(null); listeLaden(); }}
        onAktualisieren={() => sitzungAktualisieren(gewählt.id)}
      />
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Sitzungen</h1>
        <button
          onClick={() => setNeueModal(true)}
          className="flex items-center gap-2 bg-[rgb(var(--accent))] hover:brightness-90 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={16} />
          Neue Sitzung
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {laden ? (
          <div className="flex items-center justify-center h-48 text-gray-400">
            <Loader2 className="animate-spin mr-2" size={18} /> Laden…
          </div>
        ) : liste.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400 text-sm">
            <CalendarDays size={32} className="mb-2 opacity-30" />
            Noch keine Sitzungen angelegt
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3 font-medium">Sitzung</th>
                <th className="px-4 py-3 font-medium">Datum</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell">Typ</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell">Status</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">TOPs</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Version</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {liste.map(s => (
                <tr
                  key={s.id}
                  onClick={() => detailLaden ? undefined : sitzungOeffnen(s.id)}
                  className="hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{s.titel}</p>
                    {s.ort && <p className="text-xs text-gray-400">{s.ort}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {formatDatum(s.sitzungsdatum)}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 hidden sm:table-cell">
                    {SITZUNGSTYP_LABEL[s.sitzungstyp] ?? s.sitzungstyp}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${SITZUNG_BADGE[s.status]}`}>
                      {sitzungStatusLabel(s.status, s.sitzungstyp)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{s._count.tops}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 hidden md:table-cell">
                    {s.versionen[0] ? versionLabel(s.versionen[0].typ, s.sitzungstyp) ?? s.versionen[0].versionNummer : "–"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {neueModal && (
        <NeueSitzungModal
          onSchliessen={() => setNeueModal(false)}
          onErfolg={(id) => { setNeueModal(false); listeLaden(); sitzungOeffnen(id); }}
        />
      )}
    </div>
  );
}

// ── Sitzung-Bearbeiten-Modal ──────────────────────────────────────
function SitzungBearbeitenModal({
  sitzung, onSchliessen, onErfolg,
}: { sitzung: Sitzung; onSchliessen: () => void; onErfolg: () => void }) {
  const [laden, setLaden]     = useState(false);
  const [fehler, setFehler]   = useState("");
  const [titel, setTitel]     = useState(sitzung.titel);
  const [datum, setDatum]     = useState(sitzung.sitzungsdatum.slice(0, 10));
  const [ort, setOrt]         = useState(sitzung.ort ?? "");
  const [typ, setTyp]         = useState(sitzung.sitzungstyp ?? "ORDENTLICH");
  const [notizen, setNotizen] = useState(sitzung.notizen ?? "");

  async function speichern(e: FormEvent) {
    e.preventDefault();
    if (!titel || !datum) return;
    setFehler(""); setLaden(true);
    try {
      await api.sitzungen.aktualisieren(sitzung.id, {
        titel,
        sitzungsdatum: datum,
        ort: ort || undefined,
        sitzungstyp: typ,
        notizen: notizen || undefined,
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
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Sitzung bearbeiten</h2>
          <button onClick={onSchliessen} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={speichern} className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Titel *</label>
            <input value={titel} onChange={e => setTitel(e.target.value)} required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Datum *</label>
            <input type="date" value={datum} onChange={e => setDatum(e.target.value)} required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ort</label>
            <input value={ort} onChange={e => setOrt(e.target.value)} placeholder="Optional"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Typ</label>
            <select value={typ} onChange={e => setTyp(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))] bg-white">
              {/* Betriebsversammlung ↔ BR-Sitzung lässt sich nicht umwandeln (Anwesenheit/Beschlüsse) */}
              {Object.entries(SITZUNGSTYP_LABEL)
                .filter(([wert]) => istBetriebsversammlung(wert) === istBetriebsversammlung(sitzung.sitzungstyp))
                .map(([wert, label]) => <option key={wert} value={wert}>{label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notizen</label>
            <textarea value={notizen} onChange={e => setNotizen(e.target.value)} rows={3} placeholder="Optional"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))] resize-y" />
          </div>
          {fehler && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{fehler}</div>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onSchliessen}
              className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Abbrechen</button>
            <button type="submit" disabled={laden || !titel || !datum}
              className="flex-1 px-4 py-2 text-sm bg-[rgb(var(--accent))] hover:brightness-90 disabled:opacity-60 text-white rounded-lg flex items-center justify-center gap-2">
              {laden && <Loader2 size={14} className="animate-spin" />}
              Speichern
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Neue-Sitzung-Modal ────────────────────────────────────────────
function NeueSitzungModal({
  onSchliessen, onErfolg,
}: { onSchliessen: () => void; onErfolg: (id: string) => void }) {
  const [laden, setLaden]           = useState(false);
  const [fehler, setFehler]         = useState("");
  const [titel, setTitel]           = useState("");
  const [datum, setDatum]           = useState("");
  const [ort, setOrt]               = useState("");
  const [typ, setTyp]               = useState("ORDENTLICH");
  const [notizen, setNotizen]       = useState("");
  const [vorlagen, setVorlagen]     = useState<SitzungsVorlage[]>([]);
  const [vorlageId, setVorlageId]   = useState<string>("");

  useEffect(() => {
    api.vorlagen.liste().then(setVorlagen).catch(() => {});
  }, []);

  async function anlegen(e: FormEvent) {
    e.preventDefault();
    if (!titel || !datum) return;
    setFehler("");
    setLaden(true);
    try {
      const s = await api.sitzungen.erstellen({ titel, sitzungsdatum: datum, ort: ort || undefined, sitzungstyp: typ, notizen: notizen || undefined, vorlageId: vorlageId || undefined });
      onErfolg(s.id);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler beim Anlegen");
    } finally {
      setLaden(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Neue Sitzung anlegen</h2>
          <button onClick={onSchliessen} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={anlegen} className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Titel *</label>
            <input value={titel} onChange={e => setTitel(e.target.value)} required
              placeholder="z.B. BR-Sitzung April 2026"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Datum *</label>
            <input type="datetime-local" value={datum} onChange={e => setDatum(e.target.value)} required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ort</label>
              <input value={ort} onChange={e => setOrt(e.target.value)} placeholder="Optional"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Typ</label>
              <select value={typ} onChange={e => setTyp(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))] bg-white">
                {Object.entries(SITZUNGSTYP_LABEL).map(([wert, label]) => (
                  <option key={wert} value={wert}>{label}</option>
                ))}
              </select>
            </div>
          </div>
          {STANDARD_TOP_HINWEIS[typ] && !vorlageId && (
            <p className="text-xs text-gray-500 -mt-2">{STANDARD_TOP_HINWEIS[typ]}</p>
          )}
          {vorlagen.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vorlage</label>
              <select value={vorlageId} onChange={e => setVorlageId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))] bg-white">
                <option value="">Keine Vorlage</option>
                {vorlagen.map(v => (
                  <option key={v.id} value={v.id}>{v.name} ({v.tops.length} TOPs)</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notizen</label>
            <textarea value={notizen} onChange={e => setNotizen(e.target.value)} rows={3} placeholder="Optional"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))] resize-y" />
          </div>
          {fehler && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{fehler}</div>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onSchliessen} className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Abbrechen</button>
            <button type="submit" disabled={laden}
              className="flex-1 px-4 py-2 text-sm bg-[rgb(var(--accent))] hover:brightness-90 disabled:opacity-60 text-white rounded-lg flex items-center justify-center gap-2">
              {laden && <Loader2 size={14} className="animate-spin" />}
              Anlegen
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Sitzungs-Detail ───────────────────────────────────────────────
function SitzungDetail({
  sitzung, meineRolle, onZurueck, onAktualisieren,
}: { sitzung: Sitzung; meineRolle: Rolle | null; onZurueck: () => void; onAktualisieren: () => void }) {
  const [aktion, setAktion]             = useState(false);
  const [fehler, setFehler]             = useState("");
  const [topModal, setTopModal]         = useState<{ top?: TOP } | null>(null);
  const [linkModal, setLinkModal]       = useState<{ topId: string; topTitel: string } | null>(null);
  const [spontanModal, setSpontanModal] = useState(false);
  const [bearbeitenModal, setBearbeitenModal] = useState(false);
  const [linkKopiert, setLinkKopiert] = useState(false);

  async function linkKopieren() {
    const url = `${window.location.origin}/sitzungen?id=${sitzung.id}`;
    try {
      // navigator.clipboard gibt es nur in "sicheren Kontexten" (HTTPS/localhost) –
      // im HTTP-Intranet-Betrieb fehlt die API schlicht, daher Fallback über die
      // klassische execCommand-Methode (funktioniert auch über HTTP).
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setLinkKopiert(true);
      setTimeout(() => setLinkKopiert(false), 2000);
    } catch {
      prompt("Konnte nicht automatisch kopiert werden – bitte manuell kopieren:", url);
    }
  }

  const readonly    = sitzung.status === "PROTOKOLL_FINAL" || sitzung.status === "ABGESAGT";
  const imEntwurf   = sitzung.status === "ENTWURF";
  const istBV       = istBetriebsversammlung(sitzung.sitzungstyp);
  const [kummerkastenModal, setKummerkastenModal] = useState(false);
  const imProtokoll = sitzung.status === "PROTOKOLL_ENTWURF";
  // Vorsitz/Stellvertretung dürfen auch nach Finalisierung noch Zeitmodell-/
  // Überstunden-/Gehaltsänderungen aus einem TOP heraus nachtragen (Erprobungsphase) –
  // für alle anderen bleibt der Knopf nach PROTOKOLL_FINAL ausgeblendet.
  const kannRetroaktivUebertragen = meineRolle === "VORSITZ" || meineRolle === "STELLVERTRETER" || meineRolle === "ADMIN";

  async function topVerschieben(topId: string, richtung: "hoch" | "runter") {
    const tops = [...sitzung.tops].sort((a, b) => a.nummer - b.nummer);
    const idx = tops.findIndex(t => t.id === topId);
    if (idx < 0) return;
    const tauschIdx = richtung === "hoch" ? idx - 1 : idx + 1;
    if (tauschIdx < 0 || tauschIdx >= tops.length) return;
    [tops[idx], tops[tauschIdx]] = [tops[tauschIdx], tops[idx]];
    try {
      await api.sitzungen.topReihenfolge(sitzung.id, tops.map(t => t.id));
      onAktualisieren();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler beim Verschieben");
    }
  }

  async function sitzungLoeschen() {
    if (!confirm(`Sitzung "${sitzung.titel}" wirklich löschen?`)) return;
    try {
      await api.sitzungen.absagen(sitzung.id);
      onZurueck();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler beim Löschen");
    }
  }

  async function statusAktion(fn: () => Promise<unknown>) {
    setFehler("");
    setAktion(true);
    try {
      await fn();
      onAktualisieren();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler");
    } finally {
      setAktion(false);
    }
  }

  async function topLoeschen(topId: string) {
    if (!confirm("TOP wirklich löschen?")) return;
    try {
      await api.sitzungen.topLoeschen(sitzung.id, topId);
      onAktualisieren();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Fehler");
    }
  }

  async function dokumentEntknuepfen(topId: string, dokumentId: string) {
    try {
      await api.sitzungen.dokumentEntknuepfen(sitzung.id, topId, dokumentId);
      onAktualisieren();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Fehler");
    }
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <button onClick={onZurueck} className="mt-1 text-gray-400 hover:text-gray-600 shrink-0">
          <ChevronLeft size={20} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">{sitzung.titel}</h1>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${SITZUNG_BADGE[sitzung.status]}`}>
              {sitzungStatusLabel(sitzung.status, sitzung.sitzungstyp)}
            </span>
            <button
              onClick={linkKopieren}
              title="Link zu dieser Sitzung kopieren (z.B. für eine E-Mail) – Empfänger müssen sich einloggen"
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-[rgb(var(--accent))] border border-gray-200 hover:border-[rgb(var(--accent))] rounded-full px-2 py-0.5 transition-colors"
            >
              <Copy size={11} />
              {linkKopiert ? "Kopiert!" : "Link kopieren"}
            </button>
            {imEntwurf && (
              <>
                <button
                  onClick={() => setBearbeitenModal(true)}
                  title="Metadaten bearbeiten"
                  className="p-1.5 text-gray-400 hover:text-[rgb(var(--accent))] hover:bg-accent/5 rounded transition-colors"
                >
                  <Pencil size={15} />
                </button>
                <button
                  onClick={sitzungLoeschen}
                  title="Sitzung löschen"
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                >
                  <Trash2 size={15} />
                </button>
              </>
            )}
          </div>
          <div className="flex gap-4 mt-1 text-sm text-gray-500 flex-wrap">
            <span>{formatDatum(sitzung.sitzungsdatum)}</span>
            {sitzung.ort && <span>{sitzung.ort}</span>}
            <span>{SITZUNGSTYP_LABEL[sitzung.sitzungstyp] ?? sitzung.sitzungstyp}</span>
          </div>
        </div>
      </div>

      {fehler && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {fehler}
        </div>
      )}

      {/* Versions-Timeline */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Versionshistorie</h2>
        <div className="flex gap-2 flex-wrap">
          {sitzung.versionen.map(v => (
            <div key={v.id} className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-xs">
              {v.readonly ? <Lock size={11} className="text-gray-400" /> : <Unlock size={11} className="text-accent/80" />}
              <span className="font-medium text-gray-700">{versionLabel(v.typ, sitzung.sitzungstyp) ?? v.versionNummer}</span>
              {v.einladungVersendetAm && (
                <span className="text-green-600 ml-1">· Einladung {istBV ? "ausgehängt" : "versendet"} {formatDatum(v.einladungVersendetAm)}</span>
              )}
              {v.finalisiertAm && (
                <span className="text-green-600 ml-1">· Finalisiert {formatDatum(v.finalisiertAm)}</span>
              )}
              {(v.typ === "TAGESORDNUNG_FIXIERT" || v.typ === "PROTOKOLL_FINAL") && (
                <span className="ml-2 inline-flex items-center gap-1">
                  <a
                    href={`${import.meta.env.VITE_API_URL ?? "http://localhost:4000"}/api/sitzungen/${sitzung.id}/pdf/${v.versionNummer}`}
                    onClick={e => {
                      e.stopPropagation();
                      e.preventDefault();
                      pdfInTabOeffnen(`${import.meta.env.VITE_API_URL ?? "http://localhost:4000"}/api/sitzungen/${sitzung.id}/pdf/${v.versionNummer}`);
                    }}
                    className="text-[rgb(var(--accent))] hover:brightness-75"
                    title="PDF öffnen"
                  >
                    <Download size={11} />
                  </a>
                  <PdfNeuGenerierenButton sitzungId={sitzung.id} versionNummer={v.versionNummer} onFertig={onAktualisieren} />
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Aktions-Buttons (State Machine) */}
      {!readonly && (
        <div className="flex gap-2 flex-wrap mb-5">
          {imEntwurf && (
            <button
              onClick={() => statusAktion(() => api.sitzungen.fixieren(sitzung.id))}
              disabled={aktion || sitzung.tops.length === 0}
              className="flex items-center gap-2 bg-[rgb(var(--accent))] hover:brightness-90 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {aktion ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
              {istBV ? "Einladung fixieren (→ V1.1)" : "Tagesordnung fixieren (→ V1.1)"}
            </button>
          )}
          {sitzung.status === "TAGESORDNUNG_FIXIERT" && (
            <>
              <button
                onClick={() => statusAktion(() => api.sitzungen.einladungSenden(sitzung.id))}
                disabled={aktion}
                className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                <Send size={14} />
                {istBV ? "Einladung als ausgehängt markieren" : "Einladung als versendet markieren"}
              </button>
              <button
                onClick={() => statusAktion(() => api.sitzungen.protokollStarten(sitzung.id))}
                disabled={aktion}
                className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                {aktion ? <Loader2 size={14} className="animate-spin" /> : <ClipboardList size={14} />}
                {istBV ? "Niederschrift starten (→ V2.0)" : "Protokoll starten (→ V2.0)"}
              </button>
            </>
          )}
          {imProtokoll && (
            <button
              onClick={() => statusAktion(() => api.sitzungen.finalisieren(sitzung.id))}
              disabled={aktion}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {aktion ? <Loader2 size={14} className="animate-spin" /> : <FileCheck size={14} />}
              {istBV ? "Niederschrift finalisieren (→ V2.1 Final)" : "Protokoll finalisieren (→ V2.1 Final)"}
            </button>
          )}
        </div>
      )}

      {/* Betriebsversammlung: Teilnehmerzahl statt Anwesenheitsliste */}
      {istBV && sitzung.status !== "ENTWURF" && sitzung.status !== "ABGESAGT" && (
        <TeilnahmeKarte sitzung={sitzung} onAktualisieren={onAktualisieren} />
      )}

      {/* Anwesenheitsliste */}
      {!istBV && (sitzung.status === "TAGESORDNUNG_FIXIERT" || sitzung.status === "PROTOKOLL_ENTWURF" || sitzung.status === "PROTOKOLL_FINAL") && (
        <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5">
          <div>
            <p className="text-sm font-medium text-amber-900">Anwesenheitsliste</p>
            <p className="text-xs text-amber-700">Zum Ausdrucken und Unterschreiben während der Sitzung</p>
          </div>
          <a
            href={api.sitzungen.anwesenheitslisteUrl(sitzung.id)}
            onClick={e => {
              e.preventDefault();
              pdfInTabOeffnen(api.sitzungen.anwesenheitslisteUrl(sitzung.id));
            }}
            className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Download size={14} />
            PDF öffnen
          </a>
        </div>
      )}

      {/* TOPs */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-5">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800 text-sm">Tagesordnungspunkte ({sitzung.tops.length})</h2>
          <div className="flex items-center gap-2">
            {istBV && imEntwurf && sitzung.tops.length > 0 && (
              <button
                onClick={() => setKummerkastenModal(true)}
                title="Fragen aus dem Kummerkasten in einen TOP übernehmen"
                className="flex items-center gap-1 text-gray-500 hover:text-[rgb(var(--accent))] text-sm font-medium mr-2"
              >
                <Inbox size={15} /> Fragen aus dem Kummerkasten
              </button>
            )}
            {imEntwurf && (
              <button
                onClick={() => setTopModal({})}
                className="flex items-center gap-1 text-[rgb(var(--accent))] hover:brightness-90 text-sm font-medium"
              >
                <Plus size={15} /> TOP hinzufügen
              </button>
            )}
            {imProtokoll && (
              <button
                onClick={() => setSpontanModal(true)}
                className="flex items-center gap-1 text-amber-600 hover:text-amber-700 text-sm font-medium"
              >
                <Zap size={15} /> Spontan-TOP
              </button>
            )}
          </div>
        </div>

        {sitzung.tops.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 text-gray-400 text-sm">
            <FileText size={24} className="mb-1 opacity-30" />
            Noch keine TOPs angelegt
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {sitzung.tops.map((top, idx) => (
              <TopZeile
                key={top.id}
                top={top}
                sitzungId={sitzung.id}
                sitzungTitel={sitzung.titel}
                sitzungsdatum={sitzung.sitzungsdatum}
                sitzungStatus={sitzung.status}
                istBV={istBV}
                readonly={readonly}
                imEntwurf={imEntwurf}
                imProtokoll={imProtokoll}
                kannRetroaktivUebertragen={kannRetroaktivUebertragen}
                istErster={idx === 0}
                istLetzter={idx === sitzung.tops.length - 1}
                onBearbeiten={() => setTopModal({ top })}
                onLoeschen={() => topLoeschen(top.id)}
                onVerschiebenHoch={() => topVerschieben(top.id, "hoch")}
                onVerschiebenRunter={() => topVerschieben(top.id, "runter")}
                onDokumentVerknuepfen={() => setLinkModal({ topId: top.id, topTitel: top.titel })}
                onDokumentEntknuepfen={(dId) => dokumentEntknuepfen(top.id, dId)}
                onAktualisieren={onAktualisieren}
              />
            ))}
          </div>
        )}
      </div>

      {/* Notizen */}
      {sitzung.notizen && (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 text-sm text-gray-600">
          <p className="font-medium text-gray-700 mb-1">Notizen</p>
          <p className="whitespace-pre-wrap">{sitzung.notizen}</p>
        </div>
      )}

      {/* Anwesenheitsliste */}
      {!istBV && (
        <div className="mt-5">
          <AnwesenheitsListe sitzungId={sitzung.id} readonly={sitzung.status === "PROTOKOLL_FINAL"} />
        </div>
      )}

      {/* Kommentare */}
      <KommentareSection sitzungId={sitzung.id} />

      {/* Modals */}
      {bearbeitenModal && (
        <SitzungBearbeitenModal
          sitzung={sitzung}
          onSchliessen={() => setBearbeitenModal(false)}
          onErfolg={() => { setBearbeitenModal(false); onAktualisieren(); }}
        />
      )}
      {kummerkastenModal && (
        <KummerkastenFragenModal
          sitzung={sitzung}
          onSchliessen={() => setKummerkastenModal(false)}
          onErfolg={() => { setKummerkastenModal(false); onAktualisieren(); }}
        />
      )}
      {spontanModal && (
        <SpontanTopModal
          sitzungId={sitzung.id}
          onSchliessen={() => setSpontanModal(false)}
          onErfolg={() => { setSpontanModal(false); onAktualisieren(); }}
        />
      )}
      {topModal !== null && (
        <TopModal
          sitzungId={sitzung.id}
          top={topModal.top}
          onSchliessen={() => setTopModal(null)}
          onErfolg={() => { setTopModal(null); onAktualisieren(); }}
        />
      )}
      {linkModal !== null && (
        <DokumentLinkModal
          sitzungId={sitzung.id}
          topId={linkModal.topId}
          topTitel={linkModal.topTitel}
          bereitsVerknuepft={sitzung.tops.find(t => t.id === linkModal.topId)?.dokumente.map(d => d.dokument.id) ?? []}
          onSchliessen={() => setLinkModal(null)}
          onErfolg={() => { setLinkModal(null); onAktualisieren(); }}
        />
      )}
    </div>
  );
}

// ── TOP-Zeile ─────────────────────────────────────────────────────
function TopZeile({
  top, sitzungId, sitzungTitel, sitzungsdatum, sitzungStatus, istBV, readonly, imEntwurf, imProtokoll, kannRetroaktivUebertragen,
  istErster, istLetzter,
  onBearbeiten, onLoeschen, onVerschiebenHoch, onVerschiebenRunter,
  onDokumentVerknuepfen, onDokumentEntknuepfen, onAktualisieren,
}: {
  top: TOP;
  sitzungId: string;
  sitzungTitel: string;
  sitzungsdatum: string;
  sitzungStatus: SitzungStatus;
  istBV: boolean;
  readonly: boolean;
  imEntwurf: boolean;
  imProtokoll: boolean;
  kannRetroaktivUebertragen: boolean;
  istErster: boolean;
  istLetzter: boolean;
  onBearbeiten: () => void;
  onLoeschen: () => void;
  onVerschiebenHoch: () => void;
  onVerschiebenRunter: () => void;
  onDokumentVerknuepfen: () => void;
  onDokumentEntknuepfen: (dokumentId: string) => void;
  onAktualisieren: () => void;
}) {
  const [ergebnisOffen, setErgebnisOffen]       = useState(false);
  const [ergebnis, setErgebnis]                 = useState(top.ergebnis ?? "");
  const [ergebnisJson, setErgebnisJson]         = useState<object | null>(top.ergebnisJson ?? null);
  const [topStatus, setTopStatus]               = useState<TopStatus>(top.status);
  const [speichern, setSpeichern]               = useState(false);
  const [inhaltJson, setInhaltJson]             = useState<object | null>(top.inhaltsJson ?? null);
  const [inhaltGeaendert, setInhaltGeaendert]   = useState(false);
  const [inhaltSpeichern, setInhaltSpeichern]   = useState(false);

  // Sync wenn TOP extern aktualisiert wurde (z.B. nach TopModal-Speichern oder Phasenwechsel)
  useEffect(() => {
    if (!inhaltGeaendert) setInhaltJson(top.inhaltsJson ?? null);
  }, [top.aktualisiertAm]); // eslint-disable-line react-hooks/exhaustive-deps
  const [kommentareOffen, setKommentareOffen]   = useState(false);
  const [kommentarAnzahl, setKommentarAnzahl]   = useState(top._count?.kommentare ?? 0);
  const [extraktModal, setExtraktModal]         = useState(false);
  const [aufgabeModal, setAufgabeModal]         = useState(false);
  const [gehaltModal, setGehaltModal]           = useState(false);
  const [antragModal, setAntragModal]           = useState(false);
  const [mehrOffen, setMehrOffen]               = useState(false);
  const mehrRef = useRef<HTMLDivElement>(null);

  // Mehr-Menü bei Klick außerhalb schließen
  useEffect(() => {
    if (!mehrOffen) return;
    function handleClick(e: MouseEvent) {
      if (mehrRef.current && !mehrRef.current.contains(e.target as Node)) {
        setMehrOffen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [mehrOffen]);

  async function ergebnisSpeichern() {
    setSpeichern(true);
    try {
      await api.sitzungen.topAktualisieren(sitzungId, top.id, {
        ergebnis: tiptapZuText(ergebnisJson) || ergebnis || undefined,
        ergebnisJson: ergebnisJson ?? undefined,
        topStatus,
      });
      setErgebnisOffen(false);
      onAktualisieren();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Fehler");
    } finally {
      setSpeichern(false);
    }
  }

  async function inhaltSpeichernFn() {
    setInhaltSpeichern(true);
    try {
      await api.sitzungen.topAktualisieren(sitzungId, top.id, {
        inhalt:      tiptapZuText(inhaltJson) || undefined,
        inhaltsJson: inhaltJson ?? undefined,
      });
      setInhaltGeaendert(false);
      onAktualisieren();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Fehler");
    } finally {
      setInhaltSpeichern(false);
    }
  }

  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-xs font-bold text-gray-400 w-6 shrink-0">
          {top.nummer}.
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-gray-900 text-sm">{top.titel}</p>
            {top.vertraulich && (
              <span
                title="Vertraulich – für JAV-Zugang ausgeblendet"
                className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600"
              >
                <Lock size={10} /> Vertraulich
              </span>
            )}
            {top.spontan && (
              <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                <Zap size={10} /> Spontan
              </span>
            )}
            <span className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full ${TOP_BADGE[top.status]}`}>
              {TOP_STATUS_ICON[top.status]}
              {TOP_STATUS_LABEL[top.status]}
            </span>
          </div>
          {(top.inhaltsJson || top.inhalt) && (
            imProtokoll ? (
              <div className="mt-1.5">
                <SitzungsEditor
                  content={inhaltJson}
                  onChange={json => { setInhaltJson(json); setInhaltGeaendert(true); }}
                  readonly={readonly}
                  minHeight="auto"
                />
                {inhaltGeaendert && (
                  <button
                    onClick={inhaltSpeichernFn}
                    disabled={inhaltSpeichern}
                    className="mt-1 flex items-center gap-1 text-xs bg-accent hover:bg-accent-hover disabled:opacity-50 text-white px-2.5 py-1 rounded-lg"
                  >
                    {inhaltSpeichern && <Loader2 size={10} className="animate-spin" />}
                    Inhalt speichern
                  </button>
                )}
              </div>
            ) : (
              <div
                className="text-xs text-gray-600 mt-1 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0.5 [&_p]:my-0.5 [&_strong]:font-semibold [&_em]:italic [&_blockquote]:border-l-2 [&_blockquote]:border-gray-300 [&_blockquote]:pl-2 [&_blockquote]:text-gray-400"
                dangerouslySetInnerHTML={{ __html: top.inhaltsJson ? tiptapZuHtml(top.inhaltsJson as object) : (top.inhalt ?? "") }}
              />
            )
          )}
          {top.ergebnis && !ergebnisOffen && (
            <div className="mt-1.5 bg-green-50 border border-green-100 rounded-lg px-3 py-1.5 text-xs text-green-800">
              <span className="font-medium">Ergebnis:</span> {top.ergebnis}
            </div>
          )}

          {/* Beschlüsse (Abstimmungsmatrix) – auch nach dem Finalisieren sichtbar,
              nur eben schreibgeschützt. Vorher verschwand der ganze Block, sobald
              die Sitzung PROTOKOLL_FINAL erreichte. */}
          {!istBV && (imProtokoll || sitzungStatus === "PROTOKOLL_FINAL") && (
            <BeschlussBlock
              topId={top.id}
              sitzungId={sitzungId}
              readonly={sitzungStatus === "PROTOKOLL_FINAL"}
            />
          )}

          {/* Ergebnis-Editor (nur in Protokoll-Phase) */}
          {imProtokoll && ergebnisOffen && (
            <div className="mt-2 space-y-2">
              <select
                value={topStatus}
                onChange={e => setTopStatus(e.target.value as TopStatus)}
                className="border border-gray-300 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
              >
                {(istBV ? TOP_STATUS_BV : Object.keys(TOP_STATUS_LABEL) as TopStatus[]).map(s => (
                  <option key={s} value={s}>{TOP_STATUS_LABEL[s]}</option>
                ))}
              </select>
              <SitzungsEditor
                content={ergebnisJson}
                onChange={json => { setErgebnisJson(json); setErgebnis(tiptapZuText(json)); }}
                placeholder={istBV ? "Verlauf / Ergebnis eintragen…" : "Ergebnis / Beschluss eintragen…"}
                minHeight="80px"
              />
              <div className="flex gap-2">
                <button onClick={ergebnisSpeichern} disabled={speichern}
                  className="flex items-center gap-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-lg">
                  {speichern && <Loader2 size={11} className="animate-spin" />}
                  Speichern
                </button>
                <button onClick={() => setErgebnisOffen(false)}
                  className="text-gray-500 hover:text-gray-700 text-xs px-2 py-1.5 rounded-lg border border-gray-200">
                  Abbrechen
                </button>
              </div>
            </div>
          )}

          {/* Verknüpfte Dokumente */}
          {top.dokumente.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {top.dokumente.map(td => {
                function dokumentOeffnen() {
                  const token = localStorage.getItem("brdms_token");
                  fetch(api.dokumente.downloadUrl(td.dokument.id), {
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                  })
                    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.blob(); })
                    .then(blob => {
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      const isPdf = td.dokument.dateiname.toLowerCase().endsWith(".pdf");
                      if (isPdf) {
                        a.target = "_blank";
                      } else {
                        a.download = td.dokument.dateiname;
                      }
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      setTimeout(() => URL.revokeObjectURL(url), 60_000);
                    })
                    .catch(err => alert(`Fehler beim Öffnen: ${err}`));
                }

                return (
                  <div
                    key={td.id}
                    onDoubleClick={dokumentOeffnen}
                    title="Doppelklick zum Öffnen"
                    className="flex items-center gap-1 bg-accent/5 border border-accent/15 rounded-lg pl-2 pr-1 py-1 text-xs text-accent cursor-pointer hover:border-accent/40"
                  >
                    <FileText size={11} />
                    <span className="max-w-[160px] truncate" title={td.dokument.alias ?? td.dokument.titel}>
                      {td.dokument.alias ?? td.dokument.titel}
                    </span>
                    <span className="text-accent/60 ml-0.5">({KATEGORIE_LABEL[td.dokument.kategorie]})</span>
                    <button
                      title="Dokument öffnen"
                      onClick={dokumentOeffnen}
                      className="p-1 ml-1 text-accent/60 hover:text-accent hover:bg-accent/10 rounded"
                    >
                      <Eye size={13} />
                    </button>
                    {!readonly && (imEntwurf || top.spontan) && (
                      <>
                        <span className="w-px h-3.5 bg-accent/20 mx-0.5" />
                        <button
                          onClick={() => {
                            if (confirm(`Verknüpfung mit „${td.dokument.titel}" wirklich trennen?`)) {
                              onDokumentEntknuepfen(td.dokument.id);
                            }
                          }}
                          title="Verknüpfung trennen"
                          className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                        >
                          <Unlink size={13} />
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Aktionen */}
        <div className="flex items-center gap-1 shrink-0">
          {imEntwurf && (
            <>
              <button
                onClick={onVerschiebenHoch}
                disabled={istErster}
                title="Nach oben"
                className="p-1.5 text-gray-400 hover:text-[rgb(var(--accent))] hover:bg-accent/5 rounded transition-colors disabled:opacity-25 disabled:cursor-default"
              >
                <ChevronUp size={15} />
              </button>
              <button
                onClick={onVerschiebenRunter}
                disabled={istLetzter}
                title="Nach unten"
                className="p-1.5 text-gray-400 hover:text-[rgb(var(--accent))] hover:bg-accent/5 rounded transition-colors disabled:opacity-25 disabled:cursor-default"
              >
                <ChevronDown size={15} />
              </button>
            </>
          )}

          {/* Die 3 meistgenutzten Aktionen: beschriftet und immer sichtbar */}
          <button
            onClick={() => setKommentareOffen(o => !o)}
            title={kommentarAnzahl > 0 ? `${kommentarAnzahl} Kommentar(e)` : "Kommentare"}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${kommentareOffen ? "text-purple-600 bg-purple-50" : "text-gray-500 hover:text-purple-600 hover:bg-purple-50"}`}
          >
            <MessageSquare size={14} /> Kommentar
            {kommentarAnzahl > 0 && (
              <span className={`text-[10px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center ${kommentareOffen ? "bg-purple-600 text-white" : "bg-purple-100 text-purple-700"}`}>
                {kommentarAnzahl}
              </span>
            )}
          </button>
          {!readonly && (
            <button
              onClick={() => setAufgabeModal(true)}
              title="Als Aufgabe anlegen"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
            >
              <CheckSquare size={14} /> Als Aufgabe
            </button>
          )}
          {imProtokoll && !ergebnisOffen && (
            <button
              onClick={() => setErgebnisOffen(true)}
              title={istBV ? "Verlauf / Ergebnis eintragen" : "Ergebnis / Beschluss eintragen"}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium text-gray-500 hover:text-orange-600 hover:bg-orange-50 transition-colors"
            >
              <ClipboardList size={14} /> {istBV ? "Ergebnis" : "Beschluss"}
            </button>
          )}
          {/* § 45 BetrVG: Anträge der Versammlung gehen an den BR → Themen-Backlog */}
          {istBV && (imProtokoll || sitzungStatus === "PROTOKOLL_FINAL") && (
            <button
              onClick={() => setAntragModal(true)}
              title="Antrag an den Betriebsrat ins Themen-Backlog übernehmen"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium text-gray-500 hover:text-[rgb(var(--accent))] hover:bg-accent/5 transition-colors"
            >
              <ListPlus size={14} /> Antrag
            </button>
          )}

          {/* Seltener genutzte Aktionen: hinter Mehr-Menü */}
          <div className="relative" ref={mehrRef}>
            <button
              onClick={() => setMehrOffen(o => !o)}
              title="Weitere Aktionen"
              className={`p-1.5 rounded transition-colors ${mehrOffen ? "text-gray-700 bg-gray-100" : "text-gray-400 hover:text-gray-700 hover:bg-gray-100"}`}
            >
              <MoreHorizontal size={15} />
            </button>
            {mehrOffen && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1 min-w-[200px]">
                {!istBV && (!readonly || kannRetroaktivUebertragen) && (
                  <button
                    onClick={() => { setGehaltModal(true); setMehrOffen(false); }}
                    title={readonly ? "Protokoll ist finalisiert – nachträgliche Übertragung nur für Vorsitz/Stellvertretung" : undefined}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 text-left"
                  >
                    <Wallet size={14} className="text-amber-500" /> In Gehaltstabelle übertragen
                    {readonly && <Lock size={11} className="text-gray-400 ml-auto" />}
                  </button>
                )}
                <button
                  onClick={() => { setExtraktModal(true); setMehrOffen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 text-left"
                >
                  <BookmarkPlus size={14} className="text-[rgb(var(--accent))]" /> Ins Wissensarchiv extrahieren
                </button>
                {(imProtokoll || readonly) && (
                  <button
                    onClick={() => {
                      setMehrOffen(false);
                      pdfInTabOeffnen(api.sitzungen.topAuszugUrl(sitzungId, top.id));
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 text-left"
                  >
                    <Download size={14} className="text-green-600" /> Auszug als PDF
                  </button>
                )}
                {!readonly && (imEntwurf || top.spontan) && (
                  <button
                    onClick={() => { onDokumentVerknuepfen(); setMehrOffen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 text-left"
                  >
                    <Link size={14} className="text-[rgb(var(--accent))]" /> Dokument verknüpfen
                  </button>
                )}
                {imEntwurf && (
                  <>
                    <button
                      onClick={() => { onBearbeiten(); setMehrOffen(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 text-left"
                    >
                      <FileText size={14} className="text-[rgb(var(--accent))]" /> Bearbeiten
                    </button>
                    <div className="h-px bg-gray-100 my-1" />
                    <button
                      onClick={() => { onLoeschen(); setMehrOffen(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 text-left"
                    >
                      <Trash2 size={14} /> Löschen
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Kommentare (aufklappbar) */}
      {kommentareOffen && (
        <div className="mt-2 ml-9 p-3 bg-purple-50 rounded-lg border border-purple-100">
          <KommentarBlock
            compact
            ladeUrl={`/api/tops/${top.id}/kommentare`}
            erstellenUrl={`/api/tops/${top.id}/kommentare`}
            loeschenUrl={kid => `/api/tops/${top.id}/kommentare/${kid}`}
            onAnzahlAendert={setKommentarAnzahl}
          />
        </div>
      )}
      <ExtraktModal
        sitzungId={sitzungId}
        topId={top.id}
        titel={top.titel}
        inhalt={top.inhaltsJson ? tiptapZuText(top.inhaltsJson) : (top.inhalt ?? "")}
        ergebnis={top.ergebnis ?? ""}
        offen={extraktModal}
        onSchliessen={() => setExtraktModal(false)}
      />
      {aufgabeModal && (
        <AufgabeUebernehmenModal
          headerTitel="Aus TOP übernehmen"
          titelVorschlag={top.titel}
          beschreibungVorschlag={top.inhaltsJson ? tiptapZuText(top.inhaltsJson as object) : (top.inhalt ?? "")}
          onSchliessen={() => setAufgabeModal(false)}
          onErfolg={() => setAufgabeModal(false)}
        />
      )}
      {antragModal && (
        <AntragBacklogModal
          sitzungTitel={sitzungTitel}
          sitzungsdatum={sitzungsdatum}
          onSchliessen={() => setAntragModal(false)}
        />
      )}
      {gehaltModal && (
        <TopGehaltModal
          sitzungId={sitzungId}
          sitzungsdatum={sitzungsdatum}
          onSchliessen={() => setGehaltModal(false)}
        />
      )}

    </div>
  );
}

// ── Gehaltsstufe aus TOP in die Gehaltstabelle übertragen ─────────
const ZEITMODELLE_TOP_MODAL: Zeitmodell[] = ["A", "B", "C", "D"];

function TopGehaltModal({
  sitzungId, sitzungsdatum, onSchliessen,
}: { sitzungId: string; sitzungsdatum: string; onSchliessen: () => void }) {
  const [tab, setTab] = useState<"gehalt" | "zeitmodell" | "ueberstunden">("gehalt");
  const [mitarbeiterListe, setMitarbeiterListe] = useState<Mitarbeiter[]>([]);
  const [abteilungen, setAbteilungen]           = useState<Abteilung[]>([]);
  const [neuerMitarbeiter, setNeuerMitarbeiter] = useState(false);
  const [mitarbeiterId, setMitarbeiterId]       = useState("");
  const [vorname, setVorname]                   = useState("");
  const [nachname, setNachname]                 = useState("");
  const [pnr, setPnr]                           = useState("");
  const [eintritt, setEintritt]                 = useState("");
  const [austritt, setAustritt]                 = useState("");
  const [abteilungId, setAbteilungId]           = useState("");

  // Gehaltseinstufung
  const [istAt, setIstAt]           = useState(false);
  const [gruppe, setGruppe]         = useState("");
  const [stufe, setStufe]           = useState("");
  const [gehaltAt, setGehaltAt]     = useState("");
  const [gueltigAb, setGueltigAb]   = useState(sitzungsdatum?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [bemerkung, setBemerkung]   = useState("");

  // Zeitmodell
  const [zmZeitmodell, setZmZeitmodell] = useState<Zeitmodell>("A");
  const [zmGueltigVon, setZmGueltigVon] = useState(sitzungsdatum?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [zmUnbefristet, setZmUnbefristet] = useState(true);
  const [zmGueltigBis, setZmGueltigBis]   = useState("");
  const [zmBemerkung, setZmBemerkung]     = useState("");

  // Überstunden
  const [usRegelung, setUsRegelung]       = useState("");
  const [usGueltigVon, setUsGueltigVon]   = useState(sitzungsdatum?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [usUnbefristet, setUsUnbefristet] = useState(true);
  const [usGueltigBis, setUsGueltigBis]   = useState("");
  const [usBemerkung, setUsBemerkung]     = useState("");

  const [laden, setLaden]                       = useState(false);
  const [fehler, setFehler]                     = useState("");
  // Bewusst kein Auto-Schließen nach dem Speichern: in einer Sitzung müssen
  // oft mehrere Mitarbeiter nacheinander dieselbe Regelung bekommen – Grunddaten
  // (Tab, Daten, Regelung/Zeitmodell, Bemerkung) bleiben stehen, nur die
  // Mitarbeiter-Auswahl wird zurückgesetzt, damit man direkt weitermachen kann.
  const [erfolgName, setErfolgName]             = useState<string | null>(null);
  const [gespeicherteAnzahl, setGespeicherteAnzahl] = useState(0);

  useEffect(() => {
    api.mitarbeiter.liste().then(setMitarbeiterListe).catch(() => {});
    api.abteilungen.liste().then(setAbteilungen).catch(() => {});
  }, []);

  async function speichern(e: FormEvent) {
    e.preventDefault();
    setFehler("");
    setLaden(true);
    try {
      let zielMitarbeiterId = mitarbeiterId;
      let gespeicherterName = mitarbeiterListe.find(m => m.id === mitarbeiterId)
        ? `${mitarbeiterListe.find(m => m.id === mitarbeiterId)!.nachname}, ${mitarbeiterListe.find(m => m.id === mitarbeiterId)!.vorname}`
        : "";

      if (neuerMitarbeiter) {
        if (!vorname.trim() || !nachname.trim()) {
          setFehler("Vor- und Nachname sind Pflicht");
          setLaden(false);
          return;
        }
        const m = await api.mitarbeiter.erstellen({
          vorname, nachname,
          abteilungId: abteilungId || undefined,
          pnr:         pnr.trim() || undefined,
          eintritt:    eintritt || undefined,
          austritt:    austritt || undefined,
        });
        zielMitarbeiterId = m.id;
        gespeicherterName = `${m.nachname}, ${m.vorname}`;
        setMitarbeiterListe(prev => [...prev, m]);
      }

      if (!zielMitarbeiterId) {
        setFehler("Bitte einen Mitarbeiter auswählen");
        setLaden(false);
        return;
      }

      if (tab === "gehalt") {
        let werteFeld: { gruppe: number; stufe: number; gehaltAt?: undefined } | { gruppe?: undefined; stufe?: undefined; gehaltAt: number };
        if (istAt) {
          const gehaltNr = Number(gehaltAt.replace(",", "."));
          if (!gehaltAt || !Number.isFinite(gehaltNr) || gehaltNr <= 0) {
            setFehler("Bitte ein gültiges Gehalt eingeben");
            setLaden(false);
            return;
          }
          werteFeld = { gehaltAt: gehaltNr };
        } else {
          const gruppeNr = Number(gruppe);
          const stufeNr  = Number(stufe);
          if (!gruppe || !Number.isInteger(gruppeNr) || gruppeNr < 1 || gruppeNr > 6) {
            setFehler("Bitte eine Gruppe (1-6) auswählen");
            setLaden(false);
            return;
          }
          if (!stufe || !Number.isInteger(stufeNr) || stufeNr < 1 || stufeNr > 4) {
            setFehler("Bitte eine Stufe (1-4) auswählen");
            setLaden(false);
            return;
          }
          werteFeld = { gruppe: gruppeNr, stufe: stufeNr };
        }

        await api.gehaltstabelle.erstellen({
          mitarbeiterId: zielMitarbeiterId,
          ...werteFeld,
          gueltigAb,
          bemerkung:     bemerkung || undefined,
          sitzungId,
        });
      } else if (tab === "zeitmodell") {
        if (!zmUnbefristet && !zmGueltigBis) {
          setFehler('Bitte ein Enddatum angeben oder "unbefristet" wählen');
          setLaden(false);
          return;
        }
        await api.zeitmodell.erstellen({
          mitarbeiterId: zielMitarbeiterId,
          zeitmodell:    zmZeitmodell,
          gueltigVon:    zmGueltigVon,
          gueltigBis:    zmUnbefristet ? null : zmGueltigBis,
          bemerkung:     zmBemerkung || undefined,
          sitzungId,
        });
      } else {
        if (!usUnbefristet && !usGueltigBis) {
          setFehler('Bitte ein Enddatum angeben oder "unbefristet" wählen');
          setLaden(false);
          return;
        }
        await api.ueberstunden.erstellen({
          mitarbeiterId: zielMitarbeiterId,
          regelung:      usRegelung.trim(),
          gueltigVon:    usGueltigVon,
          gueltigBis:    usUnbefristet ? null : usGueltigBis,
          bemerkung:     usBemerkung || undefined,
          sitzungId,
        });
      }

      // Nur die Mitarbeiter-Auswahl zurücksetzen – Tab, Daten, Regelung/Zeitmodell
      // und Bemerkung bleiben stehen, damit der nächste Mitarbeiter mit denselben
      // Grunddaten sofort eingetragen werden kann.
      setMitarbeiterId("");
      setNeuerMitarbeiter(false);
      setVorname("");
      setNachname("");
      setPnr("");
      setEintritt("");
      setAustritt("");
      setAbteilungId("");
      setGespeicherteAnzahl(n => n + 1);
      setErfolgName(gespeicherterName || "Mitarbeiter");
      setTimeout(() => setErfolgName(null), 3000);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler");
    } finally {
      setLaden(false);
    }
  }

  const ERFOLGSTEXT_KURZ: Record<typeof tab, string> = {
    gehalt:      "Gehaltseintrag",
    zeitmodell:  "Zeitmodell",
    ueberstunden: "Überstunden-Regelung",
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">In Gehaltstabelle übertragen</h2>
            {gespeicherteAnzahl > 0 && (
              <p className="text-xs text-gray-400 mt-0.5">{gespeicherteAnzahl} Eintrag{gespeicherteAnzahl !== 1 ? "e" : ""} in dieser Sitzung gespeichert</p>
            )}
          </div>
          <button onClick={onSchliessen} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        {erfolgName && (
          <div className="mx-6 mt-4 flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-3 py-2 rounded-lg">
            <Wallet size={14} /> {ERFOLGSTEXT_KURZ[tab]} für {erfolgName} gespeichert.
          </div>
        )}
        <form onSubmit={speichern} className="px-6 py-4 space-y-4">
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
              <button
                type="button"
                onClick={() => setTab("gehalt")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === "gehalt" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
              >
                <Wallet size={13} /> Gehaltseinstufung
              </button>
              <button
                type="button"
                onClick={() => setTab("zeitmodell")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === "zeitmodell" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
              >
                <Clock size={13} /> Zeitmodell
              </button>
              <button
                type="button"
                onClick={() => setTab("ueberstunden")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === "ueberstunden" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
              >
                <Timer size={13} /> Überstunden
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mitarbeiter *</label>
              {!neuerMitarbeiter ? (
                <div className="flex gap-2">
                  <select
                    value={mitarbeiterId}
                    onChange={e => setMitarbeiterId(e.target.value)}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                  >
                    <option value="">– auswählen –</option>
                    {mitarbeiterListe.map(m => (
                      <option key={m.id} value={m.id}>{m.nachname}, {m.vorname}{m.abteilung ? ` (${m.abteilung.name})` : ""}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setNeuerMitarbeiter(true)}
                    className="px-3 py-2 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600 whitespace-nowrap"
                  >
                    + neuer Mitarbeiter
                  </button>
                </div>
              ) : (
                <div className="space-y-2 border border-gray-200 rounded-lg p-3 bg-gray-50">
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text" placeholder="Vorname" value={vorname} autoFocus
                      onChange={e => setVorname(e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                    />
                    <input
                      type="text" placeholder="Nachname" value={nachname}
                      onChange={e => setNachname(e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text" placeholder="PNR (optional)" value={pnr}
                      onChange={e => setPnr(e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                    />
                    <input
                      type="date" placeholder="Eintritt" value={eintritt}
                      onChange={e => setEintritt(e.target.value)}
                      title="Eintrittsdatum (optional)"
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date" placeholder="Austritt" value={austritt}
                      onChange={e => setAustritt(e.target.value)}
                      title="Austrittsdatum (optional)"
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                    />
                  </div>
                  <select
                    value={abteilungId}
                    onChange={e => setAbteilungId(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                  >
                    <option value="">Abteilung (optional)</option>
                    {abteilungen.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={() => setNeuerMitarbeiter(false)}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    Zurück zur Auswahl
                  </button>
                </div>
              )}
            </div>

            {tab === "gehalt" && (
              <>
                <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden w-fit">
                  <button
                    type="button"
                    onClick={() => setIstAt(false)}
                    className={`px-3 py-1.5 text-sm transition-colors ${!istAt ? "bg-[rgb(var(--accent))] text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                  >
                    Tarif (Gruppe/Stufe)
                  </button>
                  <button
                    type="button"
                    onClick={() => setIstAt(true)}
                    className={`px-3 py-1.5 text-sm transition-colors ${istAt ? "bg-[rgb(var(--accent))] text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                  >
                    AT (reales Gehalt)
                  </button>
                </div>

                {istAt ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Gehalt (€) *</label>
                    <input
                      type="text" required value={gehaltAt}
                      onChange={e => setGehaltAt(e.target.value)}
                      placeholder="z.B. 4200"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Gruppe *</label>
                      <select
                        required value={gruppe}
                        onChange={e => setGruppe(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                      >
                        <option value="">– wählen –</option>
                        {[1, 2, 3, 4, 5, 6].map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Stufe *</label>
                      <select
                        required value={stufe}
                        onChange={e => setStufe(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                      >
                        <option value="">– wählen –</option>
                        {[1, 2, 3, 4].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Gültig ab *</label>
                  <input
                    type="date" required value={gueltigAb}
                    onChange={e => setGueltigAb(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bemerkung</label>
                  <input
                    type="text" value={bemerkung}
                    onChange={e => setBemerkung(e.target.value)}
                    placeholder="Optional"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                  />
                </div>
              </>
            )}

            {tab === "zeitmodell" && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Zeitmodell *</label>
                  <select
                    required value={zmZeitmodell}
                    onChange={e => setZmZeitmodell(e.target.value as Zeitmodell)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                  >
                    {ZEITMODELLE_TOP_MODAL.map(z => <option key={z} value={z}>{z}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Von *</label>
                  <input
                    type="date" required value={zmGueltigVon}
                    onChange={e => setZmGueltigVon(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                  />
                </div>

                <div>
                  <label className="flex items-center gap-2 cursor-pointer mb-2">
                    <input
                      type="checkbox" checked={zmUnbefristet}
                      onChange={e => setZmUnbefristet(e.target.checked)}
                      className="rounded border-gray-300 text-[rgb(var(--accent))]"
                    />
                    <span className="text-sm text-gray-700">Unbefristet</span>
                  </label>
                  {!zmUnbefristet && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Bis *</label>
                      <input
                        type="date" required value={zmGueltigBis}
                        onChange={e => setZmGueltigBis(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bemerkung</label>
                  <input
                    type="text" value={zmBemerkung}
                    onChange={e => setZmBemerkung(e.target.value)}
                    placeholder="Optional"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                  />
                </div>
              </>
            )}

            {tab === "ueberstunden" && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Regelung</label>
                  <input
                    type="text" value={usRegelung}
                    onChange={e => setUsRegelung(e.target.value)}
                    placeholder="Optional – z.B. Ausgleich in Freizeit, Auszahlung ab 20h"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Von *</label>
                  <input
                    type="date" required value={usGueltigVon}
                    onChange={e => setUsGueltigVon(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                  />
                </div>

                <div>
                  <label className="flex items-center gap-2 cursor-pointer mb-2">
                    <input
                      type="checkbox" checked={usUnbefristet}
                      onChange={e => setUsUnbefristet(e.target.checked)}
                      className="rounded border-gray-300 text-[rgb(var(--accent))]"
                    />
                    <span className="text-sm text-gray-700">Unbefristet</span>
                  </label>
                  {!usUnbefristet && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Bis *</label>
                      <input
                        type="date" required value={usGueltigBis}
                        onChange={e => setUsGueltigBis(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bemerkung</label>
                  <input
                    type="text" value={usBemerkung}
                    onChange={e => setUsBemerkung(e.target.value)}
                    placeholder="Optional"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                  />
                </div>
              </>
            )}

            {fehler && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{fehler}</div>}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onSchliessen}
                className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
                {gespeicherteAnzahl > 0 ? "Fertig" : "Abbrechen"}
              </button>
              <button type="submit" disabled={laden}
                className="flex-1 px-4 py-2 text-sm bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white rounded-lg flex items-center justify-center gap-2">
                {laden && <Loader2 size={14} className="animate-spin" />}
                {gespeicherteAnzahl > 0 ? "Nächsten übertragen" : "Übertragen"}
              </button>
            </div>
        </form>
      </div>
    </div>
  );
}
// ── TOP-Modal (Anlegen / Bearbeiten) ──────────────────────────────
function TopModal({
  sitzungId, top, onSchliessen, onErfolg,
}: { sitzungId: string; top?: TOP; onSchliessen: () => void; onErfolg: () => void }) {
  const [laden, setLaden]       = useState(false);
  const [fehler, setFehler]     = useState("");
  const [titel, setTitel]       = useState(top?.titel ?? "");
  const [inhaltJson, setInhaltJson] = useState<object | null>(top?.inhaltsJson ?? null);
  const [vertraulich, setVertraulich] = useState(top?.vertraulich ?? false);

  async function speichern(e: FormEvent) {
    e.preventDefault();
    if (!titel) return;
    setFehler("");
    setLaden(true);
    try {
      const payload = {
        titel,
        inhalt: tiptapZuText(inhaltJson) || undefined,
        inhaltsJson: inhaltJson ?? undefined,
        vertraulich,
      };
      if (top) {
        await api.sitzungen.topAktualisieren(sitzungId, top.id, payload);
      } else {
        await api.sitzungen.topHinzufuegen(sitzungId, payload);
      }
      onErfolg();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler");
    } finally {
      setLaden(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{top ? "TOP bearbeiten" : "TOP hinzufügen"}</h2>
          <button onClick={onSchliessen} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={speichern} className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Titel *</label>
            <input value={titel} onChange={e => setTitel(e.target.value)} required autoFocus
              placeholder="z.B. Anhörung gemäß § 99 BetrVG – Einstellung Herr Müller"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sachverhalt / Beschreibung</label>
            <SitzungsEditor
              content={inhaltJson}
              onChange={setInhaltJson}
              placeholder="Optional – Sachverhalt, Unterlagen, Hintergrund…"
              minHeight="140px"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={vertraulich}
              onChange={e => setVertraulich(e.target.checked)}
              className="rounded border-gray-300 text-[rgb(var(--accent))]"
            />
            <span className="text-sm text-gray-700">Vertraulich (für JAV-Zugang ausgeblendet)</span>
          </label>
          {fehler && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{fehler}</div>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onSchliessen} className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Abbrechen</button>
            <button type="submit" disabled={laden}
              className="flex-1 px-4 py-2 text-sm bg-[rgb(var(--accent))] hover:brightness-90 disabled:opacity-60 text-white rounded-lg flex items-center justify-center gap-2">
              {laden && <Loader2 size={14} className="animate-spin" />}
              {top ? "Speichern" : "Hinzufügen"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Ins Wissensarchiv extrahieren ──────────────────────────────────
function ExtraktModal({
  sitzungId, topId, titel, inhalt, ergebnis, offen, onSchliessen,
}: {
  sitzungId: string; topId: string; titel: string; inhalt: string; ergebnis: string;
  offen: boolean; onSchliessen: () => void;
}) {
  const [formTitel, setFormTitel]       = useState(titel);
  const [formInhalt, setFormInhalt]     = useState(inhalt);
  const [formLoesung, setFormLoesung]   = useState(ergebnis);
  const [formKategorien, setFormKats]   = useState<string[]>([]);
  const [tagInput, setTagInput]         = useState("");
  const [laden, setLaden]               = useState(false);

  function tagHinzufuegen() {
    const t = tagInput.trim();
    if (t && !formKategorien.includes(t)) setFormKats(k => [...k, t]);
    setTagInput("");
  }

  async function speichern(e: FormEvent) {
    e.preventDefault();
    if (!formTitel.trim() || !formInhalt.trim()) return;
    setLaden(true);
    try {
      await api.wissen.erstellen({
        titel: formTitel.trim(),
        inhalt: formInhalt.trim(),
        kategorien: formKategorien,
        loesung: formLoesung.trim() || undefined,
        herkunft: "PROTOKOLL_EXTRAKT",
        quelle: { sitzungId, topId },
      });
      onSchliessen();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Fehler beim Speichern");
    } finally {
      setLaden(false);
    }
  }

  if (!offen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <BookmarkPlus size={20} className="text-[rgb(var(--accent))]" />
            Ins Wissensarchiv extrahieren
          </h2>
          <button onClick={onSchliessen} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={speichern} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Titel *</label>
            <input value={formTitel} onChange={e => setFormTitel(e.target.value)} required autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sachverhalt / Situation *</label>
            <textarea value={formInhalt} onChange={e => setFormInhalt(e.target.value)} required rows={4}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))] resize-y" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Lösung / Ergebnis</label>
            <textarea value={formLoesung} onChange={e => setFormLoesung(e.target.value)} rows={3}
              placeholder="Wie wurde das Problem gelöst?"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))] resize-y" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Kategorien / Schlagworte</label>
            <div className="flex gap-2 mb-2">
              <input value={tagInput} onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); tagHinzufuegen(); } }}
                placeholder="Schlagwort eingeben…"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]" />
              <button type="button" onClick={tagHinzufuegen}
                className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-600">
                <Tag size={14} />
              </button>
            </div>
            {formKategorien.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {formKategorien.map(kat => (
                  <span key={kat} className="flex items-center gap-1 text-xs bg-accent/10 text-accent px-2 py-0.5 rounded-full">
                    {kat}
                    <button type="button" onClick={() => setFormKats(k => k.filter(t => t !== kat))}>
                      <X size={11} className="hover:text-red-600" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onSchliessen}
              className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
              Abbrechen
            </button>
            <button type="submit" disabled={laden}
              className="flex-1 bg-[rgb(var(--accent))] hover:brightness-90 disabled:opacity-60 text-white py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2">
              {laden && <Loader2 size={14} className="animate-spin" />}
              Erstellen
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Kommentare Section ────────────────────────────────────────────
function KommentareSection({ sitzungId }: { sitzungId: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mt-5">
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare size={18} className="text-gray-500" />
        <h2 className="font-semibold text-gray-800 text-sm">Kommentare</h2>
      </div>
      <KommentarBlock
        ladeUrl={`/api/sitzungen/${sitzungId}/kommentare`}
        erstellenUrl={`/api/sitzungen/${sitzungId}/kommentare`}
        loeschenUrl={kid => `/api/sitzungen/${sitzungId}/kommentare/${kid}`}
      />
    </div>
  );
}

// ── Dokument-Link-Modal ───────────────────────────────────────────
function DokumentLinkModal({
  sitzungId, topId, topTitel, bereitsVerknuepft, onSchliessen, onErfolg,
}: {
  sitzungId: string;
  topId: string;
  topTitel: string;
  bereitsVerknuepft: string[];
  onSchliessen: () => void;
  onErfolg: () => void;
}) {
  const [dokumente, setDokumente] = useState<Dokument[]>([]);
  const [suche, setSuche]         = useState("");
  const [hinweis, setHinweis]     = useState("");
  const [gewählt, setGewählt]     = useState<string | null>(null);
  const [laden, setLaden]         = useState(false);
  const [ladenListe, setLadenListe] = useState(true);
  const [fehler, setFehler]       = useState("");

  useEffect(() => {
    api.dokumente.liste()
      .then(d => setDokumente(d.filter(x => x.status === "AKTIV")))
      .catch(console.error)
      .finally(() => setLadenListe(false));
  }, []);

  const gefiltert = dokumente.filter(d =>
    !bereitsVerknuepft.includes(d.id) &&
    (suche === "" ||
      d.titel.toLowerCase().includes(suche.toLowerCase()) ||
      d.aktenzeichen?.toLowerCase().includes(suche.toLowerCase()))
  );

  async function verknuepfen() {
    if (!gewählt) return;
    setFehler("");
    setLaden(true);
    try {
      await api.sitzungen.dokumentVerknuepfen(sitzungId, topId, gewählt, hinweis || undefined);
      onErfolg();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler");
    } finally {
      setLaden(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">Dokument verknüpfen</h2>
            <p className="text-xs text-gray-500 mt-0.5">TOP: {topTitel}</p>
          </div>
          <button onClick={onSchliessen} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-6 py-4 space-y-3">
          <input
            value={suche}
            onChange={e => setSuche(e.target.value)}
            placeholder="Dokument suchen (Titel oder Aktenzeichen)…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
          />

          <div className="border border-gray-200 rounded-lg overflow-hidden max-h-56 overflow-y-auto">
            {ladenListe ? (
              <div className="flex items-center justify-center h-24 text-gray-400">
                <Loader2 className="animate-spin mr-2" size={16} /> Laden…
              </div>
            ) : gefiltert.length === 0 ? (
              <div className="flex items-center justify-center h-24 text-gray-400 text-sm">
                Keine Dokumente gefunden
              </div>
            ) : (
              gefiltert.map(d => (
                <div
                  key={d.id}
                  onClick={() => setGewählt(d.id === gewählt ? null : d.id)}
                  className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer border-b border-gray-50 last:border-0 transition-colors ${
                    gewählt === d.id ? "bg-[rgb(var(--accent)/0.1)]" : "hover:bg-gray-50"
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full border-2 shrink-0 ${
                    gewählt === d.id ? "bg-[rgb(var(--accent))] border-[rgb(var(--accent))]" : "border-gray-300"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{d.titel}</p>
                    <p className="text-xs text-gray-400">
                      {KATEGORIE_LABEL[d.kategorie]}
                      {d.aktenzeichen && ` · Az.: ${d.aktenzeichen}`}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Hinweis (optional)</label>
            <input value={hinweis} onChange={e => setHinweis(e.target.value)}
              placeholder="z.B. Bewerbungsunterlagen für TOP 3"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]" />
          </div>

          {fehler && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{fehler}</div>}

          <div className="flex gap-3 pt-1">
            <button onClick={onSchliessen} className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Abbrechen</button>
            <button onClick={verknuepfen} disabled={laden || !gewählt}
              className="flex-1 px-4 py-2 text-sm bg-[rgb(var(--accent))] hover:brightness-90 disabled:opacity-60 text-white rounded-lg flex items-center justify-center gap-2">
              {laden && <Loader2 size={14} className="animate-spin" />}
              Verknüpfen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Spontan-TOP-Modal ─────────────────────────────────────────────
function SpontanTopModal({
  sitzungId, onSchliessen, onErfolg,
}: { sitzungId: string; onSchliessen: () => void; onErfolg: () => void }) {
  const [laden,  setLaden]  = useState(false);
  const [fehler, setFehler] = useState("");
  const [titel,  setTitel]  = useState("");

  async function beantragen(e: FormEvent) {
    e.preventDefault();
    if (!titel.trim()) return;
    setFehler("");
    setLaden(true);
    try {
      await api.sitzungen.spontanTop(sitzungId, titel.trim());
      onErfolg();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler");
    } finally {
      setLaden(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Zap size={18} className="text-amber-500" />
            <h2 className="font-semibold text-gray-900">Spontan-TOP beantragen</h2>
          </div>
          <button onClick={onSchliessen} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={beantragen} className="p-5 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
            Der BR muss die Aufnahme <strong>einstimmig</strong> beschließen (§ 29 Abs. 2 BetrVG).
            Nach dem Anlegen erscheint automatisch ein Aufnahme-Beschluss.
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Titel des beantragten TOPs <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={titel}
              onChange={e => setTitel(e.target.value)}
              placeholder="z.B. Antrag AG – Überstundenregelung Abteilung X"
              autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          {fehler && (
            <p className="text-red-600 text-sm">{fehler}</p>
          )}

          <div className="flex gap-3">
            <button type="button" onClick={onSchliessen}
              className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
              Abbrechen
            </button>
            <button type="submit" disabled={laden || !titel.trim()}
              className="flex-1 px-4 py-2 text-sm bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-lg flex items-center justify-center gap-2 font-medium">
              {laden && <Loader2 size={14} className="animate-spin" />}
              <Zap size={14} /> TOP anlegen
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Betriebsversammlung: Teilnehmerzahl ──────────────────────────
function TeilnahmeKarte({ sitzung, onAktualisieren }: { sitzung: Sitzung; onAktualisieren: () => void }) {
  const [wert, setWert]       = useState(sitzung.teilnehmerzahl?.toString() ?? "");
  const [laden, setLaden]     = useState(false);
  const readonly = sitzung.status === "PROTOKOLL_FINAL";
  const geaendert = wert !== (sitzung.teilnehmerzahl?.toString() ?? "");

  async function speichern() {
    setLaden(true);
    try {
      await api.sitzungen.aktualisieren(sitzung.id, { teilnehmerzahl: wert === "" ? null : Number(wert) });
      onAktualisieren();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Fehler beim Speichern");
    } finally {
      setLaden(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-4 flex-wrap bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5">
      <div>
        <p className="text-sm font-medium text-amber-900 flex items-center gap-1.5"><Users size={14} /> Teilnahme</p>
        <p className="text-xs text-amber-700">
          Bei der Betriebsversammlung gibt es keine Anwesenheitsliste – die Teilnehmerzahl erscheint in der Niederschrift.
          Weitere Angaben (z. B. Gäste, Arbeitgebervertretung) gehören in die Notizen.
        </p>
      </div>
      {readonly ? (
        <span className="text-sm font-semibold text-amber-900">
          {sitzung.teilnehmerzahl != null ? `${sitzung.teilnehmerzahl} Teilnehmende` : "nicht erfasst"}
        </span>
      ) : (
        <div className="flex items-center gap-2">
          <input
            type="number" min={0} value={wert} onChange={e => setWert(e.target.value)} placeholder="Anzahl"
            className="w-24 border border-amber-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
          />
          <button
            onClick={speichern} disabled={laden || !geaendert}
            className="flex items-center gap-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-medium px-3 py-1.5 rounded-lg"
          >
            {laden && <Loader2 size={13} className="animate-spin" />}
            Speichern
          </button>
        </div>
      )}
    </div>
  );
}

// ── Betriebsversammlung: Fragen aus dem Kummerkasten übernehmen ──
function KummerkastenFragenModal({
  sitzung, onSchliessen, onErfolg,
}: { sitzung: Sitzung; onSchliessen: () => void; onErfolg: () => void }) {
  const [eintraege, setEintraege] = useState<KummerkastenEintrag[] | null>(null);
  const [gewaehlt, setGewaehlt]   = useState<Set<string>>(new Set());
  const [zielTopId, setZielTopId] = useState(
    (sitzung.tops.find(t => /frage/i.test(t.titel)) ?? sitzung.tops[0])?.id ?? "",
  );
  const [laden, setLaden]   = useState(false);
  const [fehler, setFehler] = useState("");

  useEffect(() => {
    api.kummerkasten.liste()
      .then(l => setEintraege(l.filter(e => e.status !== "ERLEDIGT")))
      .catch(err => setFehler(err instanceof Error ? err.message : "Kummerkasten konnte nicht geladen werden"));
  }, []);

  function umschalten(id: string) {
    setGewaehlt(prev => {
      const neu = new Set(prev);
      if (neu.has(id)) neu.delete(id); else neu.add(id);
      return neu;
    });
  }

  async function uebernehmen() {
    const top = sitzung.tops.find(t => t.id === zielTopId);
    if (!top || !eintraege) return;
    setLaden(true); setFehler("");
    try {
      // Als Aufzählung an den bisherigen TOP-Inhalt anhängen – anonym, ohne Absendernamen
      const fragen = eintraege.filter(e => gewaehlt.has(e.id));
      const liste = {
        type: "bulletList",
        content: fragen.map(f => ({
          type: "listItem",
          content: [{ type: "paragraph", content: [{ type: "text", text: f.nachricht.trim().replace(/\s+/g, " ") }] }],
        })),
      };
      const alt = (top.inhaltsJson as { content?: object[] } | null) ?? textZuTiptap(top.inhalt ?? "") as { content?: object[] } | null;
      const inhaltsJson = { type: "doc", content: [...(alt?.content ?? []), liste] };
      await api.sitzungen.topAktualisieren(sitzung.id, top.id, {
        inhaltsJson,
        inhalt: tiptapZuText(inhaltsJson),
      });
      // Neue Einträge als "in Bearbeitung" markieren, damit sie im Kummerkasten nicht untergehen
      await Promise.all(fragen.filter(f => f.status === "NEU")
        .map(f => api.kummerkasten.aktualisieren(f.id, { status: "IN_BEARBEITUNG" }).catch(() => {})));
      onErfolg();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler beim Übernehmen");
    } finally {
      setLaden(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Fragen aus dem Kummerkasten</h2>
          <button onClick={onSchliessen} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-6 py-4 space-y-4 overflow-y-auto">
          <p className="text-xs text-gray-500">
            Die ausgewählten Nachrichten werden ohne Absendernamen als Aufzählung an den TOP angehängt.
            Bitte vorher prüfen, ob sie für die Versammlung geeignet sind.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">In TOP übernehmen</label>
            <select value={zielTopId} onChange={e => setZielTopId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]">
              {sitzung.tops.map(t => <option key={t.id} value={t.id}>{t.nummer}. {t.titel}</option>)}
            </select>
          </div>
          {eintraege === null && !fehler ? (
            <div className="flex items-center justify-center h-24 text-gray-400 text-sm">
              <Loader2 className="animate-spin mr-2" size={16} /> Laden…
            </div>
          ) : eintraege && eintraege.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Keine offenen Nachrichten im Kummerkasten</p>
          ) : (
            <div className="space-y-2">
              {eintraege?.map(e => (
                <label key={e.id}
                  className={`flex items-start gap-2 p-3 rounded-lg border cursor-pointer text-sm ${gewaehlt.has(e.id) ? "border-accent/40 bg-accent/5" : "border-gray-200 hover:bg-gray-50"}`}>
                  <input type="checkbox" checked={gewaehlt.has(e.id)} onChange={() => umschalten(e.id)} className="mt-0.5" />
                  <span className="flex-1">
                    <span className="block text-gray-800 whitespace-pre-wrap">{e.nachricht}</span>
                    <span className="block text-xs text-gray-400 mt-1">{formatDatum(e.erstelltAm)}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
          {fehler && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{fehler}</div>}
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
          <button type="button" onClick={onSchliessen} className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Abbrechen</button>
          <button onClick={uebernehmen} disabled={laden || gewaehlt.size === 0 || !zielTopId}
            className="flex-1 px-4 py-2 text-sm bg-[rgb(var(--accent))] hover:brightness-90 disabled:opacity-60 text-white rounded-lg flex items-center justify-center gap-2">
            {laden && <Loader2 size={14} className="animate-spin" />}
            {gewaehlt.size > 0 ? `${gewaehlt.size} übernehmen` : "Übernehmen"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Betriebsversammlung: Antrag an den BR ins Themen-Backlog (§ 45 BetrVG) ──
function AntragBacklogModal({
  sitzungTitel, sitzungsdatum, onSchliessen,
}: { sitzungTitel: string; sitzungsdatum: string; onSchliessen: () => void }) {
  const [titel, setTitel]   = useState("");
  const [text, setText]     = useState("");
  const [laden, setLaden]   = useState(false);
  const [fehler, setFehler] = useState("");
  const [erfolg, setErfolg] = useState(false);

  async function speichern(e: FormEvent) {
    e.preventDefault();
    if (!titel.trim()) return;
    setLaden(true); setFehler("");
    try {
      const herkunft = `Antrag aus der Betriebsversammlung „${sitzungTitel}“ vom ${formatDatum(sitzungsdatum)} (§ 45 BetrVG)`;
      const beschreibung = text.trim() ? `${herkunft}\n\n${text.trim()}` : herkunft;
      await api.aufgaben.erstellen({
        titel: titel.trim(),
        beschreibung,
        beschreibungJson: textZuTiptap(beschreibung) ?? undefined,
        kanbanStatus: "BACKLOG",
      });
      setErfolg(true);
      setTimeout(onSchliessen, 1200);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler beim Anlegen");
    } finally {
      setLaden(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Antrag an den Betriebsrat</h2>
          <button onClick={onSchliessen} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        {erfolg ? (
          <div className="px-6 py-10 flex flex-col items-center text-green-700 text-sm">
            <CheckCircle size={28} className="mb-2" />
            Antrag ins Themen-Backlog übernommen
          </div>
        ) : (
          <form onSubmit={speichern} className="px-6 py-4 space-y-4">
            <p className="text-xs text-gray-500">
              Die Betriebsversammlung kann dem Betriebsrat Anträge unterbreiten (§ 45 BetrVG). Der Antrag landet als
              Thema im Backlog und kann von dort in eine BR-Sitzung übernommen werden.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Antrag (Kurztitel) *</label>
              <input value={titel} onChange={e => setTitel(e.target.value)} required autoFocus
                placeholder="z. B. Überdachte Fahrradstellplätze"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Wortlaut / Begründung</label>
              <textarea value={text} onChange={e => setText(e.target.value)} rows={4} placeholder="Optional"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))] resize-y" />
            </div>
            {fehler && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{fehler}</div>}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onSchliessen} className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Abbrechen</button>
              <button type="submit" disabled={laden || !titel.trim()}
                className="flex-1 px-4 py-2 text-sm bg-[rgb(var(--accent))] hover:brightness-90 disabled:opacity-60 text-white rounded-lg flex items-center justify-center gap-2">
                {laden && <Loader2 size={14} className="animate-spin" />}
                Ins Backlog
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
