import { useState, useEffect, FormEvent } from "react";
import { GraduationCap, Plus, Trash2, Edit3, X, Loader2, Filter, Users, LayoutGrid, List, Check, Minus } from "lucide-react";
import {
  api, Schulungstermin, Qualifikation, Mitarbeiter, SchulungsStatus, QualifikationsMatrix, formatDatum,
} from "../lib/api";

const STATUS_LABEL: Record<SchulungsStatus, string> = {
  GEPLANT:    "Geplant",
  ABSOLVIERT: "Absolviert",
  ABGESAGT:   "Abgesagt",
};

const STATUS_FARBE: Record<SchulungsStatus, string> = {
  GEPLANT:    "text-accent bg-accent/5 border-accent/25",
  ABSOLVIERT: "text-green-700 bg-green-50 border-green-200",
  ABGESAGT:   "text-gray-500 bg-gray-100 border-gray-200",
};

type Tab = "termine" | "matrix";

export default function Schulungen() {
  const [tab, setTab] = useState<Tab>("termine");

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgb(var(--accent) / 0.1)" }}>
            <GraduationCap className="w-5 h-5" style={{ color: "rgb(var(--accent))" }} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Schulungsverwaltung</h1>
            <p className="text-sm text-gray-500">Schulungstermine und Qualifikationsmatrix</p>
          </div>
        </div>
      </div>

      <div className="flex border-b border-gray-200 mb-6">
        <button
          onClick={() => setTab("termine")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === "termine" ? "border-[rgb(var(--accent))] text-[rgb(var(--accent))]" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <List size={15} /> Termine
        </button>
        <button
          onClick={() => setTab("matrix")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === "matrix" ? "border-[rgb(var(--accent))] text-[rgb(var(--accent))]" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <LayoutGrid size={15} /> Qualifikationsmatrix
        </button>
      </div>

      {tab === "termine" ? <TermineTab /> : <MatrixTab />}
    </div>
  );
}

// ── Tab: Schulungstermine ───────────────────────────────────────────
function TermineTab() {
  const [liste, setListe]                 = useState<Schulungstermin[]>([]);
  const [qualifikationen, setQualifikationen] = useState<Qualifikation[]>([]);
  const [mitarbeiterListe, setMitarbeiterListe] = useState<Mitarbeiter[]>([]);
  const [laden, setLaden]                 = useState(true);
  const [modal, setModal]                 = useState(false);
  const [bearbeitet, setBearbeitet]       = useState<Schulungstermin | null>(null);

  const [filterQualifikation, setFilterQualifikation] = useState("");
  const [filterStatus, setFilterStatus]   = useState("");

  useEffect(() => {
    api.qualifikationen.liste().then(setQualifikationen).catch(() => {});
    api.mitarbeiter.liste().then(setMitarbeiterListe).catch(() => {});
  }, []);

  useEffect(() => { laden_(); }, [filterQualifikation, filterStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  async function laden_() {
    setLaden(true);
    try {
      const daten = await api.schulungen.liste({
        qualifikationId: filterQualifikation || undefined,
        status:          filterStatus || undefined,
      });
      setListe(daten);
    } finally {
      setLaden(false);
    }
  }

  async function loeschen(id: string) {
    if (!confirm("Schulungstermin wirklich löschen?")) return;
    try {
      await api.schulungen.loeschen(id);
      setListe(prev => prev.filter(t => t.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Fehler beim Löschen");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap gap-3 items-center flex-1 mr-3">
          <div className="flex items-center gap-1.5 text-gray-400 text-xs">
            <Filter size={14} /> Filter:
          </div>
          <select
            value={filterQualifikation}
            onChange={e => setFilterQualifikation(e.target.value)}
            className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
          >
            <option value="">Alle Qualifikationen</option>
            {qualifikationen.map(q => <option key={q.id} value={q.id}>{q.name}</option>)}
          </select>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
          >
            <option value="">Alle Status</option>
            {(Object.keys(STATUS_LABEL) as SchulungsStatus[]).map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
          {(filterQualifikation || filterStatus) && (
            <button onClick={() => { setFilterQualifikation(""); setFilterStatus(""); }} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
              <X size={12} /> Zurücksetzen
            </button>
          )}
        </div>
        <button
          onClick={() => { setBearbeitet(null); setModal(true); }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white hover:brightness-90 transition-colors whitespace-nowrap"
          style={{ backgroundColor: "rgb(var(--accent))" }}
        >
          <Plus size={16} /> Neuer Termin
        </button>
      </div>

      <p className="text-xs text-gray-500 mb-3">
        {laden ? "Lade…" : `${liste.length} Termin${liste.length !== 1 ? "e" : ""}`}
      </p>

      {laden ? (
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Lade…
        </div>
      ) : liste.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <GraduationCap size={40} className="mx-auto mb-3 opacity-20" />
          <p className="font-medium">Noch keine Schulungstermine erfasst</p>
          <p className="text-sm mt-1">Klicke auf „Neuer Termin" um eine Schulung anzulegen.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs text-gray-500 uppercase">
                <th className="px-4 py-2.5">Datum</th>
                <th className="px-4 py-2.5">Qualifikation</th>
                <th className="px-4 py-2.5">Ort / Anbieter</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Teilnehmer</th>
                <th className="px-4 py-2.5">Kosten</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {liste.map(t => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-600">{formatDatum(t.datum)}</td>
                  <td className="px-4 py-2.5 font-medium text-gray-900">
                    {t.qualifikation.name}
                    {t.titel && <span className="block text-xs text-gray-400 font-normal">{t.titel}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">
                    {[t.ort, t.anbieter].filter(Boolean).join(" · ") || "–"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${STATUS_FARBE[t.status]}`}>
                      {STATUS_LABEL[t.status]}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">
                    <span className="inline-flex items-center gap-1"><Users size={13} className="text-gray-400" /> {t.teilnehmer.length}</span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{t.kosten != null ? `${t.kosten.toFixed(2)} €` : "–"}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <button
                      onClick={() => { setBearbeitet(t); setModal(true); }}
                      className="p-1.5 text-gray-400 hover:text-[rgb(var(--accent))] hover:bg-accent/5 rounded transition-colors"
                      title="Bearbeiten / Teilnehmer verwalten"
                    >
                      <Edit3 size={14} />
                    </button>
                    <button
                      onClick={() => loeschen(t.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="Löschen"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <TerminModal
          termin={bearbeitet}
          qualifikationen={qualifikationen}
          mitarbeiterListe={mitarbeiterListe}
          onQualifikationErstellt={q => setQualifikationen(prev => [...prev, q].sort((a, b) => a.name.localeCompare(b.name)))}
          onSchliessen={() => setModal(false)}
          onErfolg={() => { setModal(false); laden_(); }}
        />
      )}
    </div>
  );
}

// ── Modal: Termin anlegen / bearbeiten + Teilnehmer verwalten ─────
function TerminModal({
  termin, qualifikationen, mitarbeiterListe, onQualifikationErstellt, onSchliessen, onErfolg,
}: {
  termin: Schulungstermin | null;
  qualifikationen: Qualifikation[];
  mitarbeiterListe: Mitarbeiter[];
  onQualifikationErstellt: (q: Qualifikation) => void;
  onSchliessen: () => void;
  onErfolg: () => void;
}) {
  const [neueQualifikation, setNeueQualifikation] = useState(false);
  const [qualifikationId, setQualifikationId] = useState(termin?.qualifikationId ?? "");
  const [qName, setQName]           = useState("");
  const [qGueltigkeit, setQGueltigkeit] = useState("");

  const [titel, setTitel]           = useState(termin?.titel ?? "");
  const [datum, setDatum]           = useState(termin?.datum?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [ort, setOrt]               = useState(termin?.ort ?? "");
  const [anbieter, setAnbieter]     = useState(termin?.anbieter ?? "");
  const [kosten, setKosten]         = useState(termin?.kosten != null ? String(termin.kosten) : "");
  const [status, setStatus]         = useState<SchulungsStatus>(termin?.status ?? "GEPLANT");
  const [bemerkung, setBemerkung]   = useState(termin?.bemerkung ?? "");

  const [neueTeilnehmerIds, setNeueTeilnehmerIds] = useState<string[]>([]);
  const [teilnehmer, setTeilnehmer] = useState(termin?.teilnehmer ?? []);
  const [zusatzMitarbeiterId, setZusatzMitarbeiterId] = useState("");

  const [laden, setLaden]     = useState(false);
  const [fehler, setFehler]   = useState("");

  const nichtTeilnehmende = mitarbeiterListe.filter(m => !teilnehmer.some(t => t.mitarbeiterId === m.id));

  function toggleNeuerTeilnehmer(id: string) {
    setNeueTeilnehmerIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function speichern(e: FormEvent) {
    e.preventDefault();
    setFehler("");

    let zielQualifikationId = qualifikationId;
    if (neueQualifikation) {
      if (!qName.trim()) { setFehler("Name der Qualifikation ist Pflicht"); return; }
    } else if (!qualifikationId) {
      setFehler("Bitte eine Qualifikation auswählen"); return;
    }
    if (!datum) { setFehler("Datum ist Pflicht"); return; }

    setLaden(true);
    try {
      if (neueQualifikation) {
        const q = await api.qualifikationen.erstellen({
          name: qName.trim(),
          gueltigkeitsdauerMonate: qGueltigkeit ? parseInt(qGueltigkeit, 10) : null,
        });
        onQualifikationErstellt(q);
        zielQualifikationId = q.id;
      }

      const daten = {
        qualifikationId: zielQualifikationId,
        titel: titel.trim() || undefined,
        datum,
        ort: ort.trim() || undefined,
        anbieter: anbieter.trim() || undefined,
        kosten: kosten ? parseFloat(kosten) : undefined,
        status,
        bemerkung: bemerkung.trim() || undefined,
      };

      if (termin) {
        await api.schulungen.aktualisieren(termin.id, daten);
      } else {
        await api.schulungen.erstellen({ ...daten, teilnehmerIds: neueTeilnehmerIds });
      }
      onErfolg();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler beim Speichern");
    } finally {
      setLaden(false);
    }
  }

  async function teilnehmerHinzufuegen() {
    if (!termin || !zusatzMitarbeiterId) return;
    try {
      const aktualisiert = await api.schulungen.teilnehmerHinzufuegen(termin.id, zusatzMitarbeiterId);
      setTeilnehmer(aktualisiert.teilnehmer);
      setZusatzMitarbeiterId("");
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler beim Hinzufügen");
    }
  }

  async function teilnahmeToggeln(mitarbeiterId: string, aktuell: boolean) {
    if (!termin) return;
    try {
      const aktualisiert = await api.schulungen.teilnahmeAendern(termin.id, mitarbeiterId, !aktuell);
      setTeilnehmer(aktualisiert.teilnehmer);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler beim Ändern");
    }
  }

  async function teilnehmerEntfernen(mitarbeiterId: string) {
    if (!termin) return;
    try {
      const aktualisiert = await api.schulungen.teilnehmerEntfernen(termin.id, mitarbeiterId);
      setTeilnehmer(aktualisiert.teilnehmer);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler beim Entfernen");
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">{termin ? "Termin bearbeiten" : "Neuer Schulungstermin"}</h2>
          <button onClick={onSchliessen} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <form onSubmit={speichern} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Qualifikation *</label>
            {!neueQualifikation ? (
              <div className="flex gap-2">
                <select
                  value={qualifikationId}
                  onChange={e => setQualifikationId(e.target.value)}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                >
                  <option value="">– auswählen –</option>
                  {qualifikationen.map(q => <option key={q.id} value={q.id}>{q.name}</option>)}
                </select>
                <button type="button" onClick={() => setNeueQualifikation(true)}
                  className="px-3 py-2 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600 whitespace-nowrap">
                  + neue Qualifikation
                </button>
              </div>
            ) : (
              <div className="space-y-2 border border-gray-200 rounded-lg p-3 bg-gray-50">
                <input type="text" placeholder="Name, z.B. Ersthelfer" value={qName} autoFocus
                  onChange={e => setQName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]" />
                <input type="number" min={0} placeholder="Gültigkeitsdauer in Monaten (optional, z.B. 24)" value={qGueltigkeit}
                  onChange={e => setQGueltigkeit(e.target.value)}
                  title="Leer lassen wenn die Qualifikation nicht abläuft"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]" />
                <button type="button" onClick={() => setNeueQualifikation(false)} className="text-xs text-gray-500 hover:text-gray-700">
                  Zurück zur Auswahl
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Titel</label>
            <input type="text" value={titel} onChange={e => setTitel(e.target.value)}
              placeholder="optional, z.B. Auffrischung Q3"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Datum *</label>
              <input type="date" required value={datum} onChange={e => setDatum(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select value={status} onChange={e => setStatus(e.target.value as SchulungsStatus)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]">
                {(Object.keys(STATUS_LABEL) as SchulungsStatus[]).map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ort</label>
              <input type="text" value={ort} onChange={e => setOrt(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Anbieter</label>
              <input type="text" value={anbieter} onChange={e => setAnbieter(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Kosten (€)</label>
            <input type="number" min={0} step="0.01" value={kosten} onChange={e => setKosten(e.target.value)}
              placeholder="optional"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bemerkung</label>
            <textarea rows={2} value={bemerkung} onChange={e => setBemerkung(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))] resize-y" />
          </div>

          {/* Teilnehmer */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Users size={13} className="inline -mt-0.5 mr-1" /> Teilnehmer
            </label>

            {!termin ? (
              // Neuer Termin: Mehrfachauswahl per Checkbox-Liste
              <div className="border border-gray-200 rounded-lg max-h-36 overflow-y-auto divide-y divide-gray-50">
                {mitarbeiterListe.length === 0 && <p className="text-xs text-gray-400 p-3">Keine Mitarbeiter vorhanden.</p>}
                {mitarbeiterListe.map(m => (
                  <label key={m.id} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" checked={neueTeilnehmerIds.includes(m.id)} onChange={() => toggleNeuerTeilnehmer(m.id)}
                      className="rounded border-gray-300 focus:ring-2 focus:ring-[rgb(var(--accent))]" />
                    {m.nachname}, {m.vorname}
                  </label>
                ))}
              </div>
            ) : (
              // Bestehender Termin: Liste mit Teilgenommen-Toggle + Entfernen, plus Hinzufügen
              <div className="space-y-2">
                <div className="border border-gray-200 rounded-lg max-h-36 overflow-y-auto divide-y divide-gray-50">
                  {teilnehmer.length === 0 && <p className="text-xs text-gray-400 p-3">Noch keine Teilnehmer.</p>}
                  {teilnehmer.map(t => (
                    <div key={t.mitarbeiterId} className="flex items-center justify-between px-3 py-1.5 text-sm">
                      <span>{t.mitarbeiter.nachname}, {t.mitarbeiter.vorname}</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => teilnahmeToggeln(t.mitarbeiterId, t.teilgenommen)}
                          title={t.teilgenommen ? "Als nicht teilgenommen markieren" : "Als teilgenommen markieren"}
                          className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full border ${
                            t.teilgenommen ? "text-green-700 bg-green-50 border-green-200" : "text-gray-500 bg-gray-100 border-gray-200"
                          }`}
                        >
                          {t.teilgenommen ? <Check size={11} /> : <Minus size={11} />}
                          {t.teilgenommen ? "teilgenommen" : "nicht erschienen"}
                        </button>
                        <button type="button" onClick={() => teilnehmerEntfernen(t.mitarbeiterId)} className="text-gray-300 hover:text-red-600">
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <select value={zusatzMitarbeiterId} onChange={e => setZusatzMitarbeiterId(e.target.value)}
                    className="flex-1 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]">
                    <option value="">– Teilnehmer hinzufügen –</option>
                    {nichtTeilnehmende.map(m => <option key={m.id} value={m.id}>{m.nachname}, {m.vorname}</option>)}
                  </select>
                  <button type="button" onClick={teilnehmerHinzufuegen} disabled={!zusatzMitarbeiterId}
                    className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600 disabled:opacity-50">
                    Hinzufügen
                  </button>
                </div>
              </div>
            )}
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
              {termin ? "Speichern" : "Erstellen"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Tab: Qualifikationsmatrix ────────────────────────────────────
function MatrixTab() {
  const [matrix, setMatrix] = useState<QualifikationsMatrix | null>(null);
  const [laden, setLaden]   = useState(true);

  useEffect(() => {
    api.schulungen.matrix().then(setMatrix).catch(() => {}).finally(() => setLaden(false));
  }, []);

  if (laden) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Lade…
      </div>
    );
  }

  if (!matrix || matrix.zeilen.length === 0 || matrix.qualifikationen.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <LayoutGrid size={40} className="mx-auto mb-3 opacity-20" />
        <p className="font-medium">Noch keine Daten für die Matrix</p>
        <p className="text-sm mt-1">Lege Mitarbeiter (Gehaltstabelle) und Schulungstermine an, damit hier eine Matrix erscheint.</p>
      </div>
    );
  }

  const ZELLE_FARBE: Record<string, string> = {
    NIE:        "bg-gray-50 text-gray-300",
    GUELTIG:    "bg-green-50 text-green-700",
    ABGELAUFEN: "bg-red-50 text-red-600",
  };
  const ZELLE_LABEL: Record<string, string> = { NIE: "–", GUELTIG: "✓", ABGELAUFEN: "!" };

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-auto">
      <table className="text-sm min-w-full">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs text-gray-500 uppercase">
            <th className="px-4 py-2.5 sticky left-0 bg-gray-50">Mitarbeiter</th>
            {matrix.qualifikationen.map(q => (
              <th key={q.id} className="px-3 py-2.5 text-center whitespace-nowrap" title={q.beschreibung ?? undefined}>
                {q.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {matrix.zeilen.map(zeile => (
            <tr key={zeile.mitarbeiter.id} className="hover:bg-gray-50">
              <td className="px-4 py-2 font-medium text-gray-900 whitespace-nowrap sticky left-0 bg-white">
                {zeile.mitarbeiter.nachname}, {zeile.mitarbeiter.vorname}
              </td>
              {zeile.zellen.map(z => (
                <td key={z.qualifikationId} className="px-3 py-2 text-center">
                  <span
                    className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${ZELLE_FARBE[z.status]}`}
                    title={
                      z.status === "NIE"
                        ? "Noch nicht absolviert"
                        : `Absolviert am ${formatDatum(z.absolviertAm!)}${z.gueltigBis ? ` · gültig bis ${formatDatum(z.gueltigBis)}` : " · unbegrenzt gültig"}`
                    }
                  >
                    {ZELLE_LABEL[z.status]}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
