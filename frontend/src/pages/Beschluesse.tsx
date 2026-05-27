import { useState, useEffect } from "react";
import { Gavel, ChevronDown, ChevronUp, ExternalLink, Filter } from "lucide-react";
import { api, BeschlussRegisterEintrag, SitzungListItem, formatDatum } from "../lib/api";

const ERGEBNIS_STYLE: Record<string, string> = {
  ANGENOMMEN:   "bg-green-100 text-green-800",
  ABGELEHNT:    "bg-red-100 text-red-800",
  UNENTSCHIEDEN:"bg-amber-100 text-amber-800",
};

export default function Beschluesse() {
  const [beschluesse,  setBeschluesse]  = useState<BeschlussRegisterEintrag[]>([]);
  const [sitzungen,    setSitzungen]    = useState<SitzungListItem[]>([]);
  const [laden,        setLaden]        = useState(true);
  const [ausgeklappt,  setAusgeklappt]  = useState<string | null>(null);

  // Filter
  const [vonDatum,   setVonDatum]   = useState("");
  const [bisDatum,   setBisDatum]   = useState("");
  const [sitzungId,  setSitzungId]  = useState("");

  useEffect(() => {
    api.sitzungen.liste().then(setSitzungen).catch(() => {});
    laden_();
  }, []);

  async function laden_() {
    setLaden(true);
    try {
      const data = await api.beschluesse.register({
        von: vonDatum || undefined,
        bis: bisDatum || undefined,
        sitzungId: sitzungId || undefined,
      });
      setBeschluesse(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLaden(false);
    }
  }

  function toggle(id: string) {
    setAusgeklappt(p => p === id ? null : id);
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgb(var(--accent) / 0.1)" }}>
          <Gavel className="w-5 h-5" style={{ color: "rgb(var(--accent))" }} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Beschlussregister</h1>
          <p className="text-sm text-gray-500">Alle finalisierten Beschlüsse aller Sitzungen</p>
        </div>
      </div>

      {/* Filter */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5 flex flex-wrap gap-3 items-end">
        <Filter className="w-4 h-4 text-gray-400 mb-2" />
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Von</label>
          <input type="date" value={vonDatum} onChange={e => setVonDatum(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Bis</label>
          <input type="date" value={bisDatum} onChange={e => setBisDatum(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Sitzung</label>
          <select value={sitzungId} onChange={e => setSitzungId(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm">
            <option value="">Alle Sitzungen</option>
            {sitzungen.map(s => (
              <option key={s.id} value={s.id}>{s.titel} ({formatDatum(s.sitzungsdatum)})</option>
            ))}
          </select>
        </div>
        <button onClick={laden_}
          className="px-4 py-1.5 rounded-lg text-sm font-medium text-white"
          style={{ backgroundColor: "rgb(var(--accent))" }}>
          Filtern
        </button>
      </div>

      {/* Zähler */}
      <p className="text-xs text-gray-500 mb-3">
        {laden ? "Laden…" : `${beschluesse.length} Beschluss${beschluesse.length !== 1 ? "e" : ""} gefunden`}
      </p>

      {/* Liste */}
      {!laden && beschluesse.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Gavel className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Keine Beschlüsse gefunden</p>
          <p className="text-sm mt-1">Passen Sie die Filter an oder finalisieren Sie Beschlüsse in Sitzungen.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {beschluesse.map(b => (
            <div key={b.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {/* Kopfzeile */}
              <button
                onClick={() => toggle(b.id)}
                className="w-full text-left px-5 py-4 flex items-start gap-3 hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-gray-500">
                      {b.top.sitzung.titel} · {formatDatum(b.top.sitzung.sitzungsdatum)}
                    </span>
                    <span className="text-xs text-gray-400">TOP {b.top.nummer}</span>
                    {b.ergebnis && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ERGEBNIS_STYLE[b.ergebnis] ?? "bg-gray-100 text-gray-700"}`}>
                        {b.ergebnis}
                      </span>
                    )}
                  </div>
                  <p className="font-semibold text-gray-900 mt-0.5 truncate">{b.antragstext}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Ja: {b.jaStimmen} · Nein: {b.neinStimmen} · Enthaltungen: {b.enthaltungen} · Anwesend: {b.anwesend}
                    {b.finalisiertAm && ` · Finalisiert: ${formatDatum(b.finalisiertAm)}`}
                  </p>
                </div>
                {ausgeklappt === b.id
                  ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
                  : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
                }
              </button>

              {/* Detail */}
              {ausgeklappt === b.id && (
                <div className="px-5 pb-4 border-t border-gray-100 bg-gray-50">
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-2 mt-3 text-sm">
                    <div>
                      <dt className="text-xs font-medium text-gray-500">TOP</dt>
                      <dd className="text-gray-800">{b.top.nummer}. {b.top.titel}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-gray-500">Rechtsgrundlage</dt>
                      <dd className="text-gray-800">{b.rechtsgrundlage || "–"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-gray-500">Finalisiert am</dt>
                      <dd className="text-gray-800">{b.finalisiertAm ? formatDatum(b.finalisiertAm) : "–"}</dd>
                    </div>
                  </dl>
                  <a
                    href={`/sitzungen`}
                    className="inline-flex items-center gap-1 mt-3 text-xs font-medium"
                    style={{ color: "rgb(var(--accent))" }}
                  >
                    <ExternalLink className="w-3 h-3" />
                    Zur Sitzung
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
