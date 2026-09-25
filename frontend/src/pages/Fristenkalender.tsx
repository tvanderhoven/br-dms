import { useState, useEffect, useMemo } from "react";
import { CalendarRange, ChevronLeft, ChevronRight, AlertTriangle, Clock, CheckCircle2, Trash2 } from "lucide-react";
import { api, FristMitDokument, KATEGORIE_LABEL, formatDatum } from "../lib/api";

const FRIST_TYP_LABEL: Record<string, string> = {
  ANHOERUNG_99_WOCHE:            "§ 99 (1 Wo.)",
  ANHOERUNG_102_ORDENTLICH:      "§ 102 ordentl.",
  ANHOERUNG_102_AUSSERORDENTLICH:"§ 102 a.o.",
  WIDERSPRUCH:                   "Widerspruch",
  BENUTZERDEFINIERT:             "Benutzerdefiniert",
};

function tagFarbe(faelligAm: string, status: string): string {
  if (status === "ERLEDIGT")  return "bg-green-100 text-green-800 border-green-200";
  if (status === "ABGELAUFEN") return "bg-gray-100 text-gray-500 border-gray-200";
  const tage = Math.ceil((new Date(faelligAm).getTime() - Date.now()) / 86_400_000);
  if (tage < 0)  return "bg-red-100 text-red-800 border-red-200";
  if (tage <= 3) return "bg-red-50 text-red-700 border-red-200";
  if (tage <= 7) return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-blue-50 text-blue-700 border-blue-200";
}

function punktFarbe(faelligAm: string, status: string): string {
  if (status === "ERLEDIGT")   return "bg-green-500";
  if (status === "ABGELAUFEN") return "bg-gray-400";
  const tage = Math.ceil((new Date(faelligAm).getTime() - Date.now()) / 86_400_000);
  if (tage <= 3) return "bg-red-500";
  if (tage <= 7) return "bg-amber-500";
  return "bg-blue-500";
}

export default function Fristenkalender() {
  const heute = new Date();
  const [monat, setMonat] = useState(heute.getMonth());
  const [jahr,  setJahr]  = useState(heute.getFullYear());
  const [fristen, setFristen] = useState<FristMitDokument[]>([]);
  const [laden,   setLaden]   = useState(true);
  const [ausgewaehltTag, setAusgewaehltTag] = useState<number | null>(null);

  useEffect(() => {
    const von = new Date(jahr, monat, 1).toISOString().slice(0, 10);
    const bis = new Date(jahr, monat + 1, 0).toISOString().slice(0, 10);
    setLaden(true);
    api.fristen.liste({ von, bis })
      .then(setFristen)
      .catch(console.error)
      .finally(() => setLaden(false));
    setAusgewaehltTag(null);
  }, [monat, jahr]);

  // Fristen nach Tag gruppieren
  const nachTag = useMemo(() => {
    const map: Record<number, FristMitDokument[]> = {};
    for (const f of fristen) {
      const d = new Date(f.faelligAm).getDate();
      if (!map[d]) map[d] = [];
      map[d].push(f);
    }
    return map;
  }, [fristen]);

  // Kalenderraster
  const erstesDesMonats = new Date(jahr, monat, 1);
  const startWochentag  = (erstesDesMonats.getDay() + 6) % 7; // Montag = 0
  const tageImMonat     = new Date(jahr, monat + 1, 0).getDate();

  const monatName = erstesDesMonats.toLocaleDateString("de-DE", { month: "long", year: "numeric" });

  function vorMonat() {
    if (monat === 0) { setMonat(11); setJahr(j => j - 1); }
    else setMonat(m => m - 1);
  }
  function naechsterMonat() {
    if (monat === 11) { setMonat(0); setJahr(j => j + 1); }
    else setMonat(m => m + 1);
  }

  const ausgewaehlteFristen = ausgewaehltTag ? (nachTag[ausgewaehltTag] ?? []) : [];

  async function fristLoeschen(id: string) {
    if (!confirm("Diese Frist wirklich löschen? (z.B. weil beim Upload die falsche Kündigungsart gewählt wurde)")) return;
    await api.fristen.loeschen(id);
    setFristen(prev => prev.filter(f => f.id !== id));
  }

  const offene   = fristen.filter(f => f.status === "OFFEN").length;
  const erledigt = fristen.filter(f => f.status === "ERLEDIGT").length;
  const abgelaufen = fristen.filter(f => f.status === "ABGELAUFEN").length;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgb(var(--accent) / 0.1)" }}>
          <CalendarRange className="w-5 h-5" style={{ color: "rgb(var(--accent))" }} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Fristenkalender</h1>
          <p className="text-sm text-gray-500">Übersicht aller Fristen im Monatsraster</p>
        </div>
      </div>

      {/* Statistik */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { icon: <Clock className="w-4 h-4" />, label: "Offen",     wert: offene,    farbe: "text-amber-600 bg-amber-50 border-amber-200" },
          { icon: <CheckCircle2 className="w-4 h-4" />, label: "Erledigt", wert: erledigt, farbe: "text-green-600 bg-green-50 border-green-200" },
          { icon: <AlertTriangle className="w-4 h-4" />, label: "Abgelaufen", wert: abgelaufen, farbe: "text-red-600 bg-red-50 border-red-200" },
        ].map(s => (
          <div key={s.label} className={`flex items-center gap-3 p-3 rounded-xl border ${s.farbe}`}>
            {s.icon}
            <div>
              <p className="text-lg font-bold">{s.wert}</p>
              <p className="text-xs">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Kalender */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl overflow-hidden">
          {/* Navigation */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <button onClick={vorMonat} className="p-1.5 rounded-lg hover:bg-gray-100">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h2 className="font-semibold text-gray-900 capitalize">{monatName}</h2>
            <button onClick={naechsterMonat} className="p-1.5 rounded-lg hover:bg-gray-100">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Wochentage */}
          <div className="grid grid-cols-7 text-center">
            {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map(w => (
              <div key={w} className="py-2 text-xs font-medium text-gray-400">{w}</div>
            ))}
          </div>

          {/* Tage */}
          <div className="grid grid-cols-7 border-t border-gray-100">
            {Array.from({ length: startWochentag }).map((_, i) => (
              <div key={`leer-${i}`} className="border-b border-r border-gray-100 h-16" />
            ))}
            {Array.from({ length: tageImMonat }, (_, i) => i + 1).map(tag => {
              const hatFristen    = (nachTag[tag] ?? []).length > 0;
              const istHeute      = tag === heute.getDate() && monat === heute.getMonth() && jahr === heute.getFullYear();
              const istAusgewaehlt = tag === ausgewaehltTag;
              return (
                <button
                  key={tag}
                  onClick={() => setAusgewaehltTag(p => p === tag ? null : tag)}
                  className={`border-b border-r border-gray-100 h-16 p-1.5 text-left flex flex-col transition-colors ${
                    istAusgewaehlt ? "bg-blue-50" : "hover:bg-gray-50"
                  }`}
                >
                  <span className={`text-xs font-medium w-5 h-5 flex items-center justify-center rounded-full ${
                    istHeute
                      ? "text-white"
                      : "text-gray-700"
                  }`}
                  style={istHeute ? { backgroundColor: "rgb(var(--accent))" } : {}}>
                    {tag}
                  </span>
                  {hatFristen && (
                    <div className="flex flex-wrap gap-0.5 mt-0.5">
                      {(nachTag[tag] ?? []).slice(0, 3).map(f => (
                        <span key={f.id} className={`w-2 h-2 rounded-full ${punktFarbe(f.faelligAm, f.status)}`} />
                      ))}
                      {(nachTag[tag] ?? []).length > 3 && (
                        <span className="text-gray-400" style={{ fontSize: "9px" }}>+{(nachTag[tag] ?? []).length - 3}</span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Seitenleiste */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-sm text-gray-900">
              {ausgewaehltTag
                ? `${ausgewaehltTag}. ${monatName}`
                : laden ? "Laden…" : `${fristen.length} Frist(en) im Monat`}
            </h3>
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: "400px" }}>
            {(ausgewaehltTag ? ausgewaehlteFristen : fristen).length === 0 ? (
              <p className="text-sm text-gray-400 p-4">
                {ausgewaehltTag ? "Keine Fristen an diesem Tag." : "Keine Fristen in diesem Monat."}
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {(ausgewaehltTag ? ausgewaehlteFristen : fristen).map(f => (
                  <li key={f.id} className="px-4 py-3 group relative">
                    <div className="flex items-start justify-between gap-2">
                      <div className={`inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded border mb-1 ${tagFarbe(f.faelligAm, f.status)}`}>
                        {FRIST_TYP_LABEL[f.typ] ?? f.typ}
                      </div>
                      <button
                        onClick={() => fristLoeschen(f.id)}
                        title="Frist löschen"
                        className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <p className="text-sm font-medium text-gray-800 leading-snug truncate">
                      {f.dokument.alias ?? f.dokument.titel}
                    </p>
                    {f.dokument.aktenzeichen && (
                      <p className="text-xs text-gray-400">AZ: {f.dokument.aktenzeichen}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-0.5">
                      {formatDatum(f.faelligAm)} · {KATEGORIE_LABEL[f.dokument.kategorie]}
                    </p>
                    {f.status === "ERLEDIGT" && f.erledigtVon && (
                      <p className="text-xs text-green-600 mt-0.5">✓ {f.erledigtVon.name}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
