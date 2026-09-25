import { useState, useEffect, FormEvent } from "react";
import { Scale, Plus, Trash2, Edit3, X, Loader2, Filter, AlertTriangle, FileText, Search } from "lucide-react";
import { api, Betriebsvereinbarung, BVStatus, Dokument, formatDatum } from "../lib/api";

const STATUS_LABEL: Record<BVStatus, string> = {
  AKTIV:                 "Aktiv",
  GEKUENDIGT:            "Gekündigt",
  ABGELOEST:             "Abgelöst",
  BEFRISTET_AUSGELAUFEN: "Befristet ausgelaufen",
};

const STATUS_FARBE: Record<BVStatus, string> = {
  AKTIV:                 "text-green-700 bg-green-50 border-green-200",
  GEKUENDIGT:            "text-amber-700 bg-amber-50 border-amber-200",
  ABGELOEST:             "text-gray-600 bg-gray-100 border-gray-200",
  BEFRISTET_AUSGELAUFEN: "text-gray-600 bg-gray-100 border-gray-200",
};

// Dokument-Downloads brauchen den JWT-Header (Bearer-Token, keine Cookie-Session) —
// ein einfacher <a href> würde daher immer mit "Nicht authentifiziert" scheitern.
// Deshalb: Tab synchron öffnen (Popup-Blocker), Datei authentifiziert laden, als Blob anzeigen.
function dokumentOeffnen(dokumentId: string) {
  const tab = window.open("", "_blank");
  const token = localStorage.getItem("brdms_token");
  fetch(api.dokumente.downloadUrl(dokumentId), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
    .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.blob(); })
    .then(blob => {
      const url = URL.createObjectURL(blob);
      if (tab) tab.location.href = url;
      else window.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    })
    .catch(err => {
      if (tab) tab.close();
      alert(err instanceof Error ? err.message : "Dokument konnte nicht geöffnet werden");
    });
}

function laufzeitWarnung(bv: Betriebsvereinbarung): string | null {
  if (bv.status !== "AKTIV" || !bv.laufzeitEnde) return null;
  const tage = Math.ceil((new Date(bv.laufzeitEnde).getTime() - Date.now()) / 86_400_000);
  if (tage < 0)   return "Laufzeit bereits abgelaufen";
  if (tage <= 90) return `Läuft in ${tage} Tagen ab`;
  return null;
}

export default function Betriebsvereinbarungen() {
  const [liste, setListe]           = useState<Betriebsvereinbarung[]>([]);
  const [laden, setLaden]           = useState(true);
  const [modal, setModal]           = useState(false);
  const [bearbeitet, setBearbeitet] = useState<Betriebsvereinbarung | null>(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [q, setQ]                       = useState("");
  const [qDebounced, setQDebounced]     = useState("");

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => { laden_(); }, [filterStatus, qDebounced]); // eslint-disable-line react-hooks/exhaustive-deps

  async function laden_() {
    setLaden(true);
    try {
      const daten = await api.betriebsvereinbarungen.liste({ status: filterStatus || undefined, q: qDebounced || undefined });
      setListe(daten);
    } finally {
      setLaden(false);
    }
  }

  async function loeschen(id: string) {
    if (!confirm("Betriebsvereinbarung wirklich aus dem Register löschen?")) return;
    try {
      await api.betriebsvereinbarungen.loeschen(id);
      setListe(prev => prev.filter(b => b.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Fehler beim Löschen");
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgb(var(--accent) / 0.1)" }}>
            <Scale className="w-5 h-5" style={{ color: "rgb(var(--accent))" }} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Betriebsvereinbarungen</h1>
            <p className="text-sm text-gray-500">Register aller BVs mit Status und Laufzeit</p>
          </div>
        </div>
        <button
          onClick={() => { setBearbeitet(null); setModal(true); }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white hover:brightness-90 transition-colors"
          style={{ backgroundColor: "rgb(var(--accent))" }}
        >
          <Plus size={16} /> Neue BV
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5 flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-1.5 text-gray-400 text-xs">
          <Filter size={14} /> Filter:
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Volltextsuche (Titel, Geltungsbereich, PDF-Inhalt …)"
            className="border border-gray-300 rounded-lg pl-8 pr-2.5 py-1.5 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
          />
        </div>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
        >
          <option value="">Alle Status</option>
          {(Object.keys(STATUS_LABEL) as BVStatus[]).map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        {(filterStatus || q) && (
          <button onClick={() => { setFilterStatus(""); setQ(""); }} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
            <X size={12} /> Zurücksetzen
          </button>
        )}
      </div>

      <p className="text-xs text-gray-500 mb-3">
        {laden ? "Lade…" : `${liste.length} Betriebsvereinbarung${liste.length !== 1 ? "en" : ""}`}
      </p>

      {laden ? (
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Lade…
        </div>
      ) : liste.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Scale size={40} className="mx-auto mb-3 opacity-20" />
          <p className="font-medium">Noch keine Betriebsvereinbarungen erfasst</p>
          <p className="text-sm mt-1">Klicke auf „Neue BV" um eine Vereinbarung anzulegen.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs text-gray-500 uppercase">
                <th className="px-4 py-2.5">Titel</th>
                <th className="px-4 py-2.5">Abschluss</th>
                <th className="px-4 py-2.5">Geltungsbereich</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Laufzeitende</th>
                <th className="px-4 py-2.5">Dokument</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {liste.map(bv => {
                const warnung = laufzeitWarnung(bv);
                return (
                  <tr key={bv.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-900">{bv.titel}</td>
                    <td className="px-4 py-2.5 text-gray-600">{formatDatum(bv.abschlussdatum)}</td>
                    <td className="px-4 py-2.5 text-gray-600">{bv.geltungsbereich ?? "–"}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${STATUS_FARBE[bv.status]}`}>
                        {STATUS_LABEL[bv.status]}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">
                      {bv.laufzeitEnde ? (
                        <span className="inline-flex items-center gap-1">
                          {formatDatum(bv.laufzeitEnde)}
                          {warnung && (
                            <span title={warnung} className="text-amber-600"><AlertTriangle size={13} /></span>
                          )}
                        </span>
                      ) : "unbefristet"}
                    </td>
                    <td className="px-4 py-2.5">
                      {bv.dokument ? (
                        <button
                          onClick={() => dokumentOeffnen(bv.dokument!.id)}
                          className="inline-flex items-center gap-1 text-[rgb(var(--accent))] hover:underline"
                        >
                          <FileText size={13} /> {bv.dokument.titel}
                        </button>
                      ) : "–"}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <button
                        onClick={() => { setBearbeitet(bv); setModal(true); }}
                        className="p-1.5 text-gray-400 hover:text-[rgb(var(--accent))] hover:bg-blue-50 rounded transition-colors"
                        title="Bearbeiten"
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        onClick={() => loeschen(bv.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Löschen"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <BVModal
          bv={bearbeitet}
          onSchliessen={() => setModal(false)}
          onErfolg={() => { setModal(false); laden_(); }}
        />
      )}
    </div>
  );
}

// ── Modal: BV anlegen / bearbeiten ─────────────────────────────────
function BVModal({
  bv, onSchliessen, onErfolg,
}: {
  bv: Betriebsvereinbarung | null;
  onSchliessen: () => void;
  onErfolg: () => void;
}) {
  const [titel, setTitel]                   = useState(bv?.titel ?? "");
  const [abschlussdatum, setAbschlussdatum] = useState(bv?.abschlussdatum?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [geltungsbereich, setGeltungsbereich] = useState(bv?.geltungsbereich ?? "");
  const [status, setStatus]                 = useState<BVStatus>(bv?.status ?? "AKTIV");
  const [laufzeitEnde, setLaufzeitEnde]     = useState(bv?.laufzeitEnde?.slice(0, 10) ?? "");
  const [bemerkung, setBemerkung]           = useState(bv?.bemerkung ?? "");
  const [dokumentId, setDokumentId]         = useState(bv?.dokumentId ?? "");
  const [dokumente, setDokumente]           = useState<Dokument[]>([]);
  const [laden, setLaden]                   = useState(false);
  const [fehler, setFehler]                 = useState("");

  useEffect(() => {
    api.dokumente.liste()
      .then(alle => setDokumente(alle.filter(d => d.kategorie === "BETRIEBSVEREINBARUNG")))
      .catch(() => {});
  }, []);

  async function speichern(e: FormEvent) {
    e.preventDefault();
    if (!titel.trim())    { setFehler("Titel ist Pflicht"); return; }
    if (!abschlussdatum)  { setFehler("Abschlussdatum ist Pflicht"); return; }
    setFehler("");
    setLaden(true);
    try {
      const daten = {
        titel: titel.trim(),
        abschlussdatum,
        geltungsbereich: geltungsbereich.trim() || undefined,
        status,
        laufzeitEnde: laufzeitEnde || null,
        bemerkung: bemerkung.trim() || undefined,
        dokumentId: dokumentId || null,
      };
      if (bv) await api.betriebsvereinbarungen.aktualisieren(bv.id, daten);
      else    await api.betriebsvereinbarungen.erstellen(daten);
      onErfolg();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler beim Speichern");
    } finally {
      setLaden(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">{bv ? "BV bearbeiten" : "Neue Betriebsvereinbarung"}</h2>
          <button onClick={onSchliessen} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <form onSubmit={speichern} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Titel *</label>
            <input type="text" required value={titel} autoFocus onChange={e => setTitel(e.target.value)}
              placeholder="z.B. BV Homeoffice"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Abschlussdatum *</label>
              <input type="date" required value={abschlussdatum} onChange={e => setAbschlussdatum(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select value={status} onChange={e => setStatus(e.target.value as BVStatus)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]">
                {(Object.keys(STATUS_LABEL) as BVStatus[]).map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Geltungsbereich</label>
            <input type="text" value={geltungsbereich} onChange={e => setGeltungsbereich(e.target.value)}
              placeholder="z.B. alle Beschäftigten am Standort Oberhausen"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Laufzeitende / Kündigungsdatum</label>
            <input type="date" value={laufzeitEnde} onChange={e => setLaufzeitEnde(e.target.value)}
              title="Optional – leer lassen bei unbefristeten BVs"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Verknüpftes Dokument</label>
            <select value={dokumentId} onChange={e => setDokumentId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]">
              <option value="">– keins –</option>
              {dokumente.map(d => <option key={d.id} value={d.id}>{d.titel}</option>)}
            </select>
            {dokumente.length === 0 && (
              <p className="text-xs text-gray-400 mt-1">
                Kein Dokument mit Kategorie „Betriebsvereinbarung" gefunden – erst in Dokumente hochladen.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bemerkung</label>
            <textarea rows={2} value={bemerkung} onChange={e => setBemerkung(e.target.value)}
              placeholder="z.B. abgelöst durch BV XY vom ..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))] resize-y" />
          </div>

          {fehler && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{fehler}</div>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onSchliessen}
              className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
              Abbrechen
            </button>
            <button type="submit" disabled={laden}
              className="flex-1 hover:brightness-90 disabled:opacity-60 text-white py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
              style={{ backgroundColor: "rgb(var(--accent))" }}>
              {laden && <Loader2 size={14} className="animate-spin" />}
              {bv ? "Speichern" : "Erstellen"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
