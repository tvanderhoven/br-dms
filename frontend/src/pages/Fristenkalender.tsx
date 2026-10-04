import { useState, useEffect, useMemo, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarRange, ChevronLeft, ChevronRight, AlertTriangle, Clock, CheckCircle2, Trash2, Plus, X, Loader2, RotateCcw, FileText, Pencil } from "lucide-react";
import { api, FristMitDokument, KATEGORIE_LABEL, FRIST_TYP_LABEL, fristTitel, formatDatum } from "../lib/api";

const istUeberfaellig = (f: FristMitDokument) =>
  f.status === "OFFEN" && new Date(f.faelligAm).getTime() < new Date().setHours(0, 0, 0, 0);

function tagFarbe(faelligAm: string, status: string): string {
  if (status === "ERLEDIGT")  return "bg-green-100 text-green-800 border-green-200";
  if (status === "ABGELAUFEN") return "bg-gray-100 text-gray-500 border-gray-200";
  const tage = Math.ceil((new Date(faelligAm).getTime() - Date.now()) / 86_400_000);
  if (tage < 0)  return "bg-red-100 text-red-800 border-red-200";
  if (tage <= 3) return "bg-red-50 text-red-700 border-red-200";
  if (tage <= 7) return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-accent/5 text-accent border-accent/25";
}

function punktFarbe(faelligAm: string, status: string): string {
  if (status === "ERLEDIGT")   return "bg-green-500";
  if (status === "ABGELAUFEN") return "bg-gray-400";
  const tage = Math.ceil((new Date(faelligAm).getTime() - Date.now()) / 86_400_000);
  if (tage <= 3) return "bg-red-500";
  if (tage <= 7) return "bg-amber-500";
  return "bg-accent";
}

export default function Fristenkalender() {
  const heute = new Date();
  const [monat, setMonat] = useState(heute.getMonth());
  const [jahr,  setJahr]  = useState(heute.getFullYear());
  const [fristen, setFristen] = useState<FristMitDokument[]>([]);
  const [laden,   setLaden]   = useState(true);
  const [ausgewaehltTag, setAusgewaehltTag] = useState<number | null>(null);
  const [neuOffen, setNeuOffen] = useState(false);
  const [bearbeiten, setBearbeiten] = useState<FristMitDokument | null>(null);
  const navigate = useNavigate();

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
    try {
      await api.fristen.loeschen(id);
      setFristen(prev => prev.filter(f => f.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Löschen fehlgeschlagen");
    }
  }

  async function erledigtUmschalten(f: FristMitDokument) {
    try {
      const neu = await api.fristen.aktualisieren(f.id, { erledigt: f.status !== "ERLEDIGT" });
      setFristen(prev => prev.map(x => x.id === f.id ? neu : x));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    }
  }

  function fristGeaendert(f: FristMitDokument) {
    setBearbeiten(null);
    const d = new Date(f.faelligAm);
    // In einen anderen Monat verschoben → aus der Monatsansicht nehmen
    setFristen(prev => (d.getMonth() === monat && d.getFullYear() === jahr
      ? prev.map(x => x.id === f.id ? f : x)
      : prev.filter(x => x.id !== f.id)
    ).sort((a, b) => a.faelligAm.localeCompare(b.faelligAm)));
  }

  function fristAngelegt(f: FristMitDokument) {
    setNeuOffen(false);
    const d = new Date(f.faelligAm);
    if (d.getMonth() === monat && d.getFullYear() === jahr) {
      setFristen(prev => [...prev, f].sort((a, b) => a.faelligAm.localeCompare(b.faelligAm)));
    } else {
      setMonat(d.getMonth());
      setJahr(d.getFullYear());
    }
  }

  // "Überfällig" ergibt sich aus dem Datum – der Status bleibt OFFEN, bis jemand die Frist erledigt
  const ueberfaellig = fristen.filter(istUeberfaellig).length;
  const offene   = fristen.filter(f => f.status === "OFFEN").length - ueberfaellig;
  const erledigt = fristen.filter(f => f.status === "ERLEDIGT").length;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgb(var(--accent) / 0.1)" }}>
          <CalendarRange className="w-5 h-5" style={{ color: "rgb(var(--accent))" }} />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">Fristenkalender</h1>
          <p className="text-sm text-gray-500">Übersicht aller Fristen im Monatsraster</p>
        </div>
        <button
          onClick={() => setNeuOffen(true)}
          className="flex items-center gap-1.5 bg-accent hover:brightness-90 text-white text-sm font-medium px-4 py-2 rounded-lg shadow-sm transition-all"
        >
          <Plus size={15} /> Neue Frist
        </button>
      </div>

      {/* Statistik */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { icon: <Clock className="w-4 h-4" />, label: "Offen",     wert: offene,    farbe: "text-amber-600 bg-amber-50 border-amber-200" },
          { icon: <CheckCircle2 className="w-4 h-4" />, label: "Erledigt", wert: erledigt, farbe: "text-green-600 bg-green-50 border-green-200" },
          { icon: <AlertTriangle className="w-4 h-4" />, label: "Überfällig", wert: ueberfaellig, farbe: "text-red-600 bg-red-50 border-red-200" },
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
                    istAusgewaehlt ? "bg-accent/5" : "hover:bg-gray-50"
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
                  <li key={f.id} className={`px-4 py-3 group relative ${f.status === "ERLEDIGT" ? "opacity-60" : ""}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className={`inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded border mb-1 ${tagFarbe(f.faelligAm, f.status)}`}>
                        {FRIST_TYP_LABEL[f.typ] ?? f.typ}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => setBearbeiten(f)}
                          title="Frist bearbeiten"
                          className="text-gray-300 hover:text-accent opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => erledigtUmschalten(f)}
                          title={f.status === "ERLEDIGT" ? "Wieder öffnen" : "Als erledigt markieren"}
                          className={f.status === "ERLEDIGT" ? "text-gray-400 hover:text-gray-700" : "text-gray-300 hover:text-green-600"}
                        >
                          {f.status === "ERLEDIGT" ? <RotateCcw size={14} /> : <CheckCircle2 size={15} />}
                        </button>
                        <button
                          onClick={() => fristLoeschen(f.id)}
                          title="Frist löschen"
                          className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                    <p className={`text-sm font-medium text-gray-800 leading-snug ${f.status === "ERLEDIGT" ? "line-through" : ""}`}>
                      {fristTitel(f)}
                    </p>
                    {f.dokument && (
                      <button
                        onClick={() => navigate("/dokumente", { state: { markiere: f.dokument!.id } })}
                        className="flex items-center gap-1 text-xs text-gray-500 hover:text-accent mt-0.5 max-w-full"
                        title="Dokument öffnen"
                      >
                        <FileText size={11} className="shrink-0" />
                        <span className="truncate">
                          {f.bezeichnung ? (f.dokument.alias ?? f.dokument.titel) : KATEGORIE_LABEL[f.dokument.kategorie]}
                          {f.dokument.aktenzeichen && ` · AZ ${f.dokument.aktenzeichen}`}
                        </span>
                      </button>
                    )}
                    {f.notiz && <p className="text-xs text-gray-500 mt-0.5 whitespace-pre-line">{f.notiz}</p>}
                    <p className="text-xs text-gray-400 mt-0.5">
                      {formatDatum(f.faelligAm)}
                      {istUeberfaellig(f) && <span className="text-red-600 font-medium"> · überfällig</span>}
                    </p>
                    {f.status === "ERLEDIGT" && f.erledigtVon && (
                      <p className="text-xs text-green-600 mt-0.5">✓ {f.erledigtVon.name}{f.erledigtAm && `, ${formatDatum(f.erledigtAm)}`}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {neuOffen && <FristModal onSchliessen={() => setNeuOffen(false)} onGespeichert={fristAngelegt} />}
      {bearbeiten && <FristModal frist={bearbeiten} onSchliessen={() => setBearbeiten(null)} onGespeichert={fristGeaendert} />}
    </div>
  );
}

// ── Frist anlegen (ohne Dokument, z. B. Wahl, Betriebsversammlung, Erinnerung) oder bearbeiten ──
// Bei Fristen mit Dokument kommt der Titel vom Dokument – dort nur Datum und Notiz änderbar.
function FristModal({ frist, onSchliessen, onGespeichert }: {
  frist?: FristMitDokument;
  onSchliessen: () => void;
  onGespeichert: (f: FristMitDokument) => void;
}) {
  const mitDokument = !!frist?.dokument;
  const [bezeichnung, setBezeichnung] = useState(frist?.bezeichnung ?? "");
  const [faelligAm, setFaelligAm]     = useState(frist?.faelligAm.slice(0, 10) ?? "");
  const [notiz, setNotiz]             = useState(frist?.notiz ?? "");
  const [laden, setLaden]             = useState(false);
  const [fehler, setFehler]           = useState("");

  async function speichern(e: FormEvent) {
    e.preventDefault();
    setLaden(true);
    setFehler("");
    try {
      onGespeichert(frist
        ? await api.fristen.aktualisieren(frist.id, {
            ...(!mitDokument && { bezeichnung }),
            ...(faelligAm !== frist.faelligAm.slice(0, 10) && { faelligAm }),
            notiz,
          })
        : await api.fristen.erstellen({ bezeichnung, faelligAm, notiz: notiz || undefined }));
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
      setLaden(false);
    }
  }

  const inputKlasse = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent";
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onSchliessen}>
      <form onSubmit={speichern} onClick={e => e.stopPropagation()} className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{frist ? "Frist bearbeiten" : "Neue Frist"}</h2>
          <button type="button" onClick={onSchliessen} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {!frist && (
            <p className="text-xs text-gray-500">
              Für Fristen, die an keinem Dokument hängen – z. B. Wahltermine, Betriebsversammlung oder eine Erinnerung.
              Fristen zu Anhörungen entstehen automatisch beim Upload.
            </p>
          )}
          {mitDokument ? (
            <div>
              <p className="text-sm font-medium text-gray-800">{fristTitel(frist!)}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {FRIST_TYP_LABEL[frist!.typ] ?? frist!.typ} · Die Bezeichnung kommt vom Dokument.
              </p>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bezeichnung *</label>
              <input value={bezeichnung} onChange={e => setBezeichnung(e.target.value)} required autoFocus
                placeholder="z. B. Aushang Betriebsversammlung Q4" className={inputKlasse} />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fällig am *</label>
            <input type="date" value={faelligAm} onChange={e => setFaelligAm(e.target.value)} required className={inputKlasse} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notiz</label>
            <textarea value={notiz} onChange={e => setNotiz(e.target.value)} rows={3} className={`${inputKlasse} resize-y`} />
          </div>
          {fehler && <p className="text-sm text-red-600">{fehler}</p>}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button type="button" onClick={onSchliessen} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Abbrechen</button>
          <button type="submit" disabled={laden}
            className="flex items-center gap-2 bg-accent hover:brightness-90 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-medium">
            {laden && <Loader2 size={14} className="animate-spin" />} {frist ? "Speichern" : "Frist anlegen"}
          </button>
        </div>
      </form>
    </div>
  );
}
