import { useEffect, useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Vote, Plus, X, Loader2, Pencil, Trash2, CheckCircle2, RotateCcw, CalendarRange, AlertTriangle, Info } from "lucide-react";
import {
  api, Wahl, WahlArt, WahlVerfahren, WahlEingabe, WAHL_ART_LABEL, WAHL_VERFAHREN_LABEL, formatDatum,
} from "../lib/api";

type WahlFrist = Wahl["fristen"][number];

const istUeberfaellig = (f: WahlFrist) =>
  f.status === "OFFEN" && new Date(f.faelligAm).getTime() < new Date().setHours(0, 0, 0, 0);

// Hinweis zur Wahl des Verfahrens – Stufe 2 schlägt es später aus der Wählerliste vor
const VERFAHREN_HINWEIS: Record<WahlArt, string> = {
  BR:  "Vereinfacht ist Pflicht bei 5–100 Wahlberechtigten, bei 101–200 nur nach Vereinbarung von Wahlvorstand und Arbeitgeber (§ 14a BetrVG). Darüber: normales Verfahren.",
  JAV: "Vereinfacht ist Pflicht bei 5–100 JAV-Wahlberechtigten (§ 63 Abs. 4 BetrVG) – also Beschäftigte unter 18 und Auszubildende unter 25.",
};

export default function Wahlen() {
  const [wahlen, setWahlen]       = useState<Wahl[]>([]);
  const [laden, setLaden]         = useState(true);
  const [fehler, setFehler]       = useState("");
  const [modal, setModal]         = useState<{ wahl?: Wahl } | null>(null);
  const navigate = useNavigate();

  function ladenFn() {
    setLaden(true);
    api.wahlen.liste()
      .then(setWahlen)
      .catch(err => setFehler(err instanceof Error ? err.message : "Laden fehlgeschlagen"))
      .finally(() => setLaden(false));
  }
  useEffect(ladenFn, []);

  function ersetzen(w: Wahl) {
    setWahlen(prev => prev.some(x => x.id === w.id) ? prev.map(x => x.id === w.id ? w : x) : [w, ...prev]);
  }

  async function fristUmschalten(wahl: Wahl, f: WahlFrist) {
    try {
      const neu = await api.fristen.aktualisieren(f.id, { erledigt: f.status !== "ERLEDIGT" });
      ersetzen({ ...wahl, fristen: wahl.fristen.map(x => x.id === f.id ? { ...x, ...neu } : x) });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    }
  }

  async function loeschen(w: Wahl) {
    if (!confirm(`„${w.titel}“ mit allen berechneten Fristen löschen? Das Vorhaben im Zeitplan bleibt mit seinen Aufgaben erhalten.`)) return;
    try {
      await api.wahlen.loeschen(w.id);
      setWahlen(prev => prev.filter(x => x.id !== w.id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Löschen fehlgeschlagen");
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgb(var(--accent) / 0.1)" }}>
          <Vote className="w-5 h-5" style={{ color: "rgb(var(--accent))" }} />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Wahlen</h1>
          <p className="text-sm text-gray-500">BR- und JAV-Wahlen begleiten: Fristen nach BetrVG und Wahlordnung im Blick behalten</p>
        </div>
        <button
          onClick={() => setModal({})}
          className="flex items-center gap-2 bg-[rgb(var(--accent))] hover:brightness-90 text-white text-sm font-medium px-4 py-2 rounded-lg"
        >
          <Plus size={16} /> Neue Wahl
        </button>
      </div>

      <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-3 mb-5">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        <p>
          Die Fristen werden aus BetrVG und Wahlordnung berechnet, sind aber <strong>nicht juristisch geprüft</strong>.
          Bitte vor dem Einsatz gegenlesen lassen (Gewerkschaft, Schulung des Wahlvorstands). Den Ablauf verantwortet der
          Wahlvorstand – hier behält der Betriebsrat ihn im Blick.
        </p>
      </div>

      {fehler && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{fehler}</div>}

      {laden ? (
        <div className="flex items-center justify-center h-48 text-gray-400"><Loader2 className="animate-spin mr-2" size={18} /> Laden…</div>
      ) : wahlen.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center justify-center h-48 text-gray-400 text-sm">
          <Vote size={32} className="mb-2 opacity-30" />
          Noch keine Wahl angelegt
        </div>
      ) : (
        <div className="space-y-5">
          {wahlen.map(w => (
            <div key={w.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="flex items-start gap-3 px-5 py-4 border-b border-gray-100 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-semibold text-gray-900">{w.titel}</h2>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent">{WAHL_ART_LABEL[w.art]}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{WAHL_VERFAHREN_LABEL[w.verfahren]}</span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    {w.verfahren === "VEREINFACHT" ? "Wahlversammlung" : "Stimmabgabe"} am {formatDatum(w.stimmabgabeAm)}
                    {w.amtszeitEnde && <> · Amtszeit endet {formatDatum(w.amtszeitEnde)}</>}
                    {w.ausschreibenAm && <> · Wahlausschreiben vom {formatDatum(w.ausschreibenAm)}</>}
                  </p>
                  {w.notiz && <p className="text-sm text-gray-600 mt-1 whitespace-pre-line">{w.notiz}</p>}
                </div>
                <div className="flex items-center gap-1">
                  {w.vorhabenId && (
                    <button onClick={() => navigate("/aufgaben?ansicht=zeitplan")} title="Vorhaben im Zeitplan"
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium text-gray-500 hover:text-accent hover:bg-accent/5">
                      <CalendarRange size={14} /> Zeitplan
                    </button>
                  )}
                  <button onClick={() => setModal({ wahl: w })} title="Bearbeiten"
                    className="p-1.5 text-gray-400 hover:text-accent hover:bg-accent/5 rounded"><Pencil size={15} /></button>
                  <button onClick={() => loeschen(w)} title="Löschen"
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 size={15} /></button>
                </div>
              </div>

              <ul className="divide-y divide-gray-50">
                {w.fristen.map(f => {
                  const [grundlage, ...hinweise] = (f.notiz ?? "").split("\n");
                  const erledigt = f.status === "ERLEDIGT";
                  return (
                    <li key={f.id} className={`flex items-start gap-4 px-5 py-3 ${erledigt ? "opacity-60" : ""}`}>
                      <span className={`w-24 shrink-0 text-sm font-medium ${istUeberfaellig(f) ? "text-red-600" : "text-gray-700"}`}>
                        {formatDatum(f.faelligAm)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium text-gray-900 ${erledigt ? "line-through" : ""}`}>
                          {(f.bezeichnung ?? "").replace(/^(BR|JAV)-Wahl: /, "")}
                          {istUeberfaellig(f) && <span className="ml-2 text-xs text-red-600 font-medium">überfällig</span>}
                        </p>
                        <p className={`text-xs mt-0.5 ${grundlage.includes("Empfehlung") ? "text-amber-700" : "text-gray-500"}`}>{grundlage}</p>
                        {hinweise.filter(h => !h.startsWith("Automatisch")).map(h => (
                          <p key={h} className="text-xs text-gray-400 mt-0.5 flex items-start gap-1"><Info size={11} className="mt-0.5 shrink-0" />{h}</p>
                        ))}
                        {erledigt && f.erledigtVon && (
                          <p className="text-xs text-green-600 mt-0.5">✓ {f.erledigtVon.name}{f.erledigtAm && `, ${formatDatum(f.erledigtAm)}`}</p>
                        )}
                      </div>
                      <button
                        onClick={() => fristUmschalten(w, f)}
                        title={erledigt ? "Wieder öffnen" : "Als erledigt markieren"}
                        className={erledigt ? "text-gray-400 hover:text-gray-700 mt-0.5" : "text-gray-300 hover:text-green-600 mt-0.5"}
                      >
                        {erledigt ? <RotateCcw size={14} /> : <CheckCircle2 size={16} />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <WahlModal
          wahl={modal.wahl}
          onSchliessen={() => setModal(null)}
          onGespeichert={w => { setModal(null); ersetzen(w); }}
        />
      )}
    </div>
  );
}

// ── Wahl anlegen / bearbeiten ─────────────────────────────────────
function WahlModal({ wahl, onSchliessen, onGespeichert }: {
  wahl?: Wahl;
  onSchliessen: () => void;
  onGespeichert: (w: Wahl) => void;
}) {
  const [art, setArt]                 = useState<WahlArt>(wahl?.art ?? "JAV");
  const [verfahren, setVerfahren]     = useState<WahlVerfahren>(wahl?.verfahren ?? "VEREINFACHT");
  const [titel, setTitel]             = useState(wahl?.titel ?? "");
  const [stimmabgabeAm, setStimmabgabeAm] = useState(wahl?.stimmabgabeAm.slice(0, 10) ?? "");
  const [amtszeitEnde, setAmtszeitEnde]   = useState(wahl?.amtszeitEnde?.slice(0, 10) ?? "");
  const [ausschreibenAm, setAusschreibenAm] = useState(wahl?.ausschreibenAm?.slice(0, 10) ?? "");
  const [notiz, setNotiz]             = useState(wahl?.notiz ?? "");
  const [mitVorhaben, setMitVorhaben] = useState(true);
  const [laden, setLaden]             = useState(false);
  const [fehler, setFehler]           = useState("");

  async function speichern(e: FormEvent) {
    e.preventDefault();
    setLaden(true); setFehler("");
    const daten: WahlEingabe = {
      art, verfahren, stimmabgabeAm,
      amtszeitEnde: amtszeitEnde || null,
      ausschreibenAm: ausschreibenAm || null,
      notiz: notiz || null,
      ...(titel.trim() && { titel: titel.trim() }),
    };
    try {
      onGespeichert(wahl ? await api.wahlen.aktualisieren(wahl.id, daten) : await api.wahlen.erstellen({ ...daten, mitVorhaben }));
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
      setLaden(false);
    }
  }

  const input = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]";
  const vereinfacht = verfahren === "VEREINFACHT";
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onSchliessen}>
      <form onSubmit={speichern} onClick={e => e.stopPropagation()} className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{wahl ? "Wahl bearbeiten" : "Neue Wahl"}</h2>
          <button type="button" onClick={onSchliessen} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Art *</label>
              <select value={art} onChange={e => setArt(e.target.value as WahlArt)} className={`${input} bg-white`}>
                {(Object.keys(WAHL_ART_LABEL) as WahlArt[]).map(a => <option key={a} value={a}>{WAHL_ART_LABEL[a]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Verfahren *</label>
              <select value={verfahren} onChange={e => setVerfahren(e.target.value as WahlVerfahren)} className={`${input} bg-white`}>
                {(Object.keys(WAHL_VERFAHREN_LABEL) as WahlVerfahren[]).map(v => <option key={v} value={v}>{WAHL_VERFAHREN_LABEL[v]}</option>)}
              </select>
            </div>
          </div>
          <p className="text-xs text-gray-500 -mt-2">{VERFAHREN_HINWEIS[art]}</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{vereinfacht ? "Wahlversammlung *" : "Stimmabgabe (1. Tag) *"}</label>
              <input type="date" value={stimmabgabeAm} onChange={e => setStimmabgabeAm(e.target.value)} required className={input} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ende der Amtszeit</label>
              <input type="date" value={amtszeitEnde} onChange={e => setAmtszeitEnde(e.target.value)} className={input} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Wahlausschreiben erlassen am</label>
            <input type="date" value={ausschreibenAm} onChange={e => setAusschreibenAm(e.target.value)} className={input} />
            <p className="text-xs text-gray-400 mt-1">
              Sobald bekannt eintragen – Einspruchsfrist und Wahlvorschläge rechnen davon. Leer: Es wird mit
              {vereinfacht ? " einer Empfehlung (3 Wochen vor der Versammlung)" : " dem spätesten Termin (6 Wochen vor der Stimmabgabe)"} gerechnet.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Titel</label>
            <input value={titel} onChange={e => setTitel(e.target.value)} placeholder={`z. B. ${WAHL_ART_LABEL[art]} ${stimmabgabeAm.slice(0, 4) || new Date().getFullYear()}`} className={input} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notiz</label>
            <textarea value={notiz} onChange={e => setNotiz(e.target.value)} rows={2} placeholder="z. B. Mitglieder des Wahlvorstands" className={`${input} resize-y`} />
          </div>
          {!wahl && (
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={mitVorhaben} onChange={e => setMitVorhaben(e.target.checked)} />
              Vorhaben im Zeitplan anlegen (für eigene Aufgaben rund um die Wahl)
            </label>
          )}
          {wahl && (
            <p className="text-xs text-gray-500">
              Beim Speichern werden die Fristen neu berechnet. Erledigt-Markierungen bleiben erhalten, von Hand geänderte Daten werden überschrieben.
            </p>
          )}
          {fehler && <p className="text-sm text-red-600">{fehler}</p>}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button type="button" onClick={onSchliessen} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Abbrechen</button>
          <button type="submit" disabled={laden || !stimmabgabeAm}
            className="flex items-center gap-2 bg-[rgb(var(--accent))] hover:brightness-90 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-medium">
            {laden && <Loader2 size={14} className="animate-spin" />} {wahl ? "Speichern" : "Wahl anlegen"}
          </button>
        </div>
      </form>
    </div>
  );
}
