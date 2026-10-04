import { useEffect, useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  Vote, Plus, X, Loader2, Pencil, Trash2, CheckCircle2, RotateCcw, CalendarRange, AlertTriangle, Info,
  Users, ChevronDown, ChevronRight, FileDown, Ban, Undo2, Search, Trophy, ChevronUp, ExternalLink,
} from "lucide-react";
import {
  api, Wahl, WahlArt, WahlVerfahren, WahlEingabe, Waehlerliste, WaehlerEintrag, Gewaehlt, Geschlecht,
  ErgebnisEingabe, ErgebnisPlan,
  WAHL_ART_LABEL, WAHL_VERFAHREN_LABEL, BESCHAEFTIGUNGSART_LABEL, formatDatum,
} from "../lib/api";
import { ROLLEN_LABEL } from "./Benutzer";

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

              <WaehlerlisteBereich wahl={w} onWahlGeaendert={ersetzen} />
              <ErgebnisBereich wahl={w} onWahlGeaendert={ersetzen} />
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

// ── Stufe 2: Wählerliste, Gremiumsgröße, Minderheitengeschlecht ───
// PDF/CSV mit Token holen (geschützte Route) – PDF im neuen Tab, CSV als Datei
function herunterladen(url: string, dateiname?: string) {
  const tab = dateiname ? null : window.open("", "_blank");
  const token = localStorage.getItem("brdms_token");
  fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.blob(); })
    .then(blob => {
      const objectUrl = URL.createObjectURL(blob);
      if (tab) {
        tab.location.href = objectUrl;
      } else {
        const a = document.createElement("a");
        a.href = objectUrl; a.download = dateiname!;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
      }
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    })
    .catch(() => { tab?.close(); alert("Download fehlgeschlagen"); });
}

function alterText(e: WaehlerEintrag, stichtag: string): string {
  if (!e.geburtsdatum) return "–";
  const g = new Date(e.geburtsdatum), s = new Date(stichtag);
  let alter = s.getUTCFullYear() - g.getUTCFullYear();
  if (s.getUTCMonth() < g.getUTCMonth() || (s.getUTCMonth() === g.getUTCMonth() && s.getUTCDate() < g.getUTCDate())) alter--;
  return String(alter);
}

const GESCHLECHT_KURZ = { WEIBLICH: "w", MAENNLICH: "m" } as const;

function WaehlerlisteBereich({ wahl, onWahlGeaendert }: { wahl: Wahl; onWahlGeaendert: (w: Wahl) => void }) {
  const [offen, setOffen]   = useState(false);
  const [liste, setListe]   = useState<Waehlerliste | null>(null);
  const [laden, setLaden]   = useState(false);
  const [fehler, setFehler] = useState("");
  const [suche, setSuche]   = useState("");

  function ladenFn() {
    setLaden(true); setFehler("");
    api.wahlen.waehlerliste(wahl.id)
      .then(setListe)
      .catch(err => setFehler(err instanceof Error ? err.message : "Laden fehlgeschlagen"))
      .finally(() => setLaden(false));
  }
  // Neu laden, wenn sich die Wahl ändert (Wahltag, Schalter, Ausschlüsse)
  useEffect(() => { if (offen) ladenFn(); }, [offen, wahl.stimmabgabeAm, wahl.art, wahl.dualStudierendeAlsAzubis, wahl.ausgeschlossen.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  async function aendern(daten: { dualStudierendeAlsAzubis?: boolean; ausgeschlossen?: string[] }) {
    try {
      onWahlGeaendert(await api.wahlen.aktualisieren(wahl.id, daten));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    }
  }
  const ausschliessen = (id: string) => aendern({ ausgeschlossen: [...wahl.ausgeschlossen, id] });
  const aufnehmen     = (id: string) => aendern({ ausgeschlossen: wahl.ausgeschlossen.filter(x => x !== id) });

  const gefiltert = liste?.waehler.filter(w =>
    !suche || `${w.nachname} ${w.vorname} ${w.abteilung ?? ""}`.toLowerCase().includes(suche.toLowerCase())) ?? [];
  const dateiTeil = wahl.titel.replace(/[^a-zA-Z0-9äöüÄÖÜß]+/g, "-");

  return (
    <div className="border-t border-gray-100">
      <button onClick={() => setOffen(o => !o)} className="w-full flex items-center gap-2 px-5 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50">
        {offen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        <Users size={15} /> Wählerliste & Gremiumsgröße
        <span className="text-xs font-normal text-gray-400">Vorschlag aus den Mitarbeiterdaten zum Wahltag</span>
      </button>

      {offen && (
        <div className="px-5 pb-5 space-y-4">
          {fehler && <p className="text-sm text-red-600">{fehler}</p>}
          {laden && !liste && <div className="flex items-center text-gray-400 text-sm"><Loader2 className="animate-spin mr-2" size={14} /> Berechne…</div>}
          {liste && (
            <>
              {/* Kennzahlen */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-xs text-gray-500">Wahlberechtigt</p>
                  <p className="text-2xl font-bold text-gray-900">{liste.anzahl.gesamt}</p>
                  <p className="text-xs text-gray-500">{liste.anzahl.weiblich} w · {liste.anzahl.maennlich} m{liste.anzahl.ohneAngabe > 0 && ` · ${liste.anzahl.ohneAngabe} ohne Angabe`}</p>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-xs text-gray-500">Größe des Gremiums</p>
                  <p className="text-2xl font-bold text-gray-900">{liste.groesse.sitze} {liste.groesse.sitze === 1 ? "Sitz" : "Sitze"}</p>
                  <p className="text-xs text-gray-500">{liste.groesse.grundlage}</p>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-xs text-gray-500">Minderheitengeschlecht</p>
                  {liste.minderheit ? (
                    <>
                      <p className="text-2xl font-bold text-gray-900">≥ {liste.minderheit.mindestsitze} {liste.minderheit.geschlecht === "WEIBLICH" ? "Frauen" : "Männer"}</p>
                      <p className="text-xs text-gray-500">
                        {liste.minderheit.frauen} Frauen, {liste.minderheit.maenner} Männer in der {wahl.art === "JAV" ? "§ 60-Gruppe" : "Belegschaft"} · Höchstzahlverfahren (§ 5 WO)
                        {liste.minderheit.losentscheid && <span className="text-amber-700"> · Gleichstand am letzten Sitz – Los entscheidet</span>}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-2xl font-bold text-gray-400">entfällt</p>
                      <p className="text-xs text-gray-500">Erst ab 3 Sitzen und bei echter Minderheit (§ 15 Abs. 2{wahl.art === "JAV" ? ", § 62 Abs. 3" : ""})</p>
                    </>
                  )}
                </div>
                <div className={`rounded-lg border p-3 ${liste.verfahren.empfehlung !== wahl.verfahren && liste.verfahren.pflicht ? "border-amber-300 bg-amber-50" : "border-gray-200"}`}>
                  <p className="text-xs text-gray-500">Verfahren</p>
                  <p className="text-sm font-semibold text-gray-900 mt-1">{WAHL_VERFAHREN_LABEL[liste.verfahren.empfehlung]}</p>
                  <p className="text-xs text-gray-500">{liste.verfahren.text}</p>
                  {liste.verfahren.empfehlung !== wahl.verfahren && liste.verfahren.pflicht && (
                    <p className="text-xs text-amber-700 mt-1">Bei der Wahl ist „{WAHL_VERFAHREN_LABEL[wahl.verfahren]}“ eingestellt – bitte prüfen.</p>
                  )}
                </div>
              </div>

              {/* Schalter und Export */}
              <div className="flex items-center gap-3 flex-wrap">
                {wahl.art === "JAV" && (
                  <label className="flex items-center gap-2 flex-wrap text-sm text-gray-700 cursor-pointer">
                    <input type="checkbox" checked={wahl.dualStudierendeAlsAzubis}
                      onChange={e => aendern({ dualStudierendeAlsAzubis: e.target.checked })} />
                    Dual Studierende als Auszubildende zählen
                    <span className="text-xs text-gray-400" title="Ausbildungsintegriert (mit IHK-Abschluss) gilt eher als Berufsausbildung, praxisintegriert ist umstritten – vorher klären.">(hängt vom Vertrag ab)</span>
                    {!wahl.dualStudierendeAlsAzubis && liste.dualNichtGezaehlt > 0 && (
                      <span className="text-xs text-amber-700">
                        – {liste.dualNichtGezaehlt} dual Studierende zählen nicht mit; eingeschaltet wären es {liste.anzahl.gesamt + liste.dualNichtGezaehlt} Wahlberechtigte
                      </span>
                    )}
                  </label>
                )}
                <div className="flex items-center gap-2 ml-auto shrink-0">
                  <button onClick={() => herunterladen(api.wahlen.waehlerlistePdfUrl(wahl.id))}
                    className="flex items-center gap-1.5 border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm px-3 py-1.5 rounded-lg">
                    <FileDown size={14} /> PDF zum Aushang
                  </button>
                  <button onClick={() => herunterladen(api.wahlen.waehlerlisteCsvUrl(wahl.id), `waehlerliste-${dateiTeil}.csv`)}
                    className="flex items-center gap-1.5 border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm px-3 py-1.5 rounded-lg">
                    <FileDown size={14} /> CSV für den Wahlvorstand
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-400 -mt-2">
                Das PDF enthält keine Geburtsdaten (Abdruck zum Aushang). Die CSV mit Geburtsdaten ist nur für den Wahlvorstand bestimmt.
              </p>

              {/* Nicht entscheidbar */}
              {liste.pruefen.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-sm font-medium text-amber-900 mb-1">Bitte prüfen – nicht in der Liste ({liste.pruefen.length})</p>
                  <ul className="text-xs text-amber-800 space-y-0.5">
                    {liste.pruefen.map(p => <li key={p.id}>{p.nachname}, {p.vorname} – {p.hinweise.join("; ")}</li>)}
                  </ul>
                  <p className="text-xs text-amber-700 mt-1">Geburtsdatum in der Mitarbeiterübersicht nachtragen oder per CSV-Import übernehmen.</p>
                </div>
              )}

              {/* Liste */}
              <div className="rounded-lg border border-gray-200 overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50">
                  <Search size={14} className="text-gray-400" />
                  <input value={suche} onChange={e => setSuche(e.target.value)} placeholder="Name oder Abteilung filtern"
                    className="flex-1 bg-transparent text-sm focus:outline-none" />
                  {laden && <Loader2 size={14} className="animate-spin text-gray-400" />}
                </div>
                <div className="max-h-96 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white">
                      <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                        <th className="px-3 py-2 font-medium">Name</th>
                        <th className="px-3 py-2 font-medium hidden md:table-cell">Abteilung</th>
                        <th className="px-3 py-2 font-medium">Alter</th>
                        <th className="px-3 py-2 font-medium hidden sm:table-cell">Geschl.</th>
                        <th className="px-3 py-2 font-medium hidden lg:table-cell">Art</th>
                        <th className="px-3 py-2 font-medium">Wählbar</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {gefiltert.map(e => (
                        <tr key={e.id} className="align-top">
                          <td className="px-3 py-1.5">
                            <span className="text-gray-900">{e.nachname}, {e.vorname}</span>
                            {e.hinweise.map(h => <p key={h} className="text-xs text-amber-700">{h}</p>)}
                          </td>
                          <td className="px-3 py-1.5 text-gray-500 hidden md:table-cell">{e.abteilung ?? "–"}</td>
                          <td className="px-3 py-1.5 text-gray-500">{alterText(e, liste.stichtag)}</td>
                          <td className="px-3 py-1.5 text-gray-500 hidden sm:table-cell">{e.geschlecht ? GESCHLECHT_KURZ[e.geschlecht] : "–"}</td>
                          <td className="px-3 py-1.5 text-gray-500 hidden lg:table-cell">{BESCHAEFTIGUNGSART_LABEL[e.beschaeftigungsart]}</td>
                          <td className="px-3 py-1.5 text-gray-500">{e.waehlbar ? "ja" : "nein"}</td>
                          <td className="px-3 py-1.5 text-right">
                            <button onClick={() => ausschliessen(e.id)} title="Aus der Wählerliste nehmen (z. B. leitende Angestellte)"
                              className="p-1 text-gray-300 hover:text-red-600"><Ban size={14} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {gefiltert.length === 0 && <p className="text-sm text-gray-400 text-center py-6">Niemand gefunden</p>}
                </div>
              </div>
              <p className="text-xs text-gray-400 -mt-2">
                Wählbarkeit {wahl.art === "BR" ? "nach § 8 (ab 18, 6 Monate im Betrieb, nicht Zeitarbeit)" : "nach § 61 Abs. 2 (unter 25) – BR-Mitglieder sind nicht wählbar, das prüft das Programm nicht"}.
              </p>

              {liste.ausgeschlossen.length > 0 && (
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-sm font-medium text-gray-700 mb-1">Von Hand ausgeschlossen ({liste.ausgeschlossen.length})</p>
                  <ul className="space-y-0.5">
                    {liste.ausgeschlossen.map(a => (
                      <li key={a.id} className="flex items-center gap-2 text-sm text-gray-600">
                        {a.nachname}, {a.vorname}
                        <button onClick={() => aufnehmen(a.id)} title="Wieder aufnehmen" className="text-gray-400 hover:text-accent"><Undo2 size={13} /></button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Stufe 3: Ergebnis übernehmen und als Historie zeigen ──────────
function ErgebnisBereich({ wahl, onWahlGeaendert }: { wahl: Wahl; onWahlGeaendert: (w: Wahl) => void }) {
  const [modal, setModal] = useState(false);
  const navigate = useNavigate();
  const ergebnis = wahl.ergebnis ?? [];

  return (
    <div className="border-t border-gray-100 px-5 py-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Trophy size={15} className="text-gray-500" />
        <span className="text-sm font-medium text-gray-700">Ergebnis</span>
        {wahl.ergebnisUebernommenAm
          ? <span className="text-xs text-gray-400">übernommen am {formatDatum(wahl.ergebnisUebernommenAm)}</span>
          : <span className="text-xs text-gray-400">nach der Wahl aus dem Protokoll des Wahlvorstands übernehmen</span>}
        <div className="ml-auto flex items-center gap-2">
          {wahl.konstituierendeSitzungId && (
            <button onClick={() => navigate(`/sitzungen?id=${wahl.konstituierendeSitzungId}`)}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-accent">
              <ExternalLink size={12} /> Konstituierende Sitzung
            </button>
          )}
          <button onClick={() => setModal(true)}
            className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-700">
            {wahl.ergebnisUebernommenAm ? "Erneut übernehmen" : "Ergebnis übernehmen"}
          </button>
        </div>
      </div>
      {ergebnis.length > 0 && (
        <table className="w-full text-sm mt-3">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
              <th className="py-1.5 pr-3 font-medium w-12">Rang</th>
              <th className="py-1.5 pr-3 font-medium">Name</th>
              <th className="py-1.5 pr-3 font-medium">Gewählt als</th>
              <th className="py-1.5 pr-3 font-medium">Stimmen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {ergebnis.map(e => (
              <tr key={e.rang}>
                <td className="py-1.5 pr-3 text-gray-500">{e.rang}</td>
                <td className="py-1.5 pr-3 text-gray-900">{e.name}{e.geschlecht && <span className="text-gray-400"> ({e.geschlecht === "WEIBLICH" ? "w" : "m"})</span>}</td>
                <td className="py-1.5 pr-3 text-gray-600">{e.gewaehlt === "MITGLIED" ? "Mitglied" : "Ersatzmitglied"}</td>
                <td className="py-1.5 pr-3 text-gray-600">{e.stimmen ?? "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {modal && (
        <ErgebnisModal wahl={wahl} onSchliessen={() => setModal(false)}
          onUebernommen={w => { setModal(false); onWahlGeaendert(w); }} />
      )}
    </div>
  );
}

interface Zeile { name: string; gewaehlt: Gewaehlt; stimmen: string; email: string; geschlecht: Geschlecht | "" }

const AKTION_LABEL: Record<ErgebnisPlan["zeilen"][number]["aktion"], [string, string]> = {
  AKTUALISIEREN: ["Konto vorhanden", "bg-gray-100 text-gray-600"],
  NEU:           ["Neues Konto", "bg-accent/10 text-accent"],
  NUR_ERGEBNIS:  ["Nur im Ergebnis", "bg-gray-100 text-gray-500"],
  FEHLER:        ["Fehler", "bg-red-100 text-red-700"],
};

function ErgebnisModal({ wahl, onSchliessen, onUebernommen }: {
  wahl: Wahl;
  onSchliessen: () => void;
  onUebernommen: (w: Wahl) => void;
}) {
  const br = wahl.art === "BR";
  const leer = (gewaehlt: Gewaehlt): Zeile => ({ name: "", gewaehlt, stimmen: "", email: "", geschlecht: "" });
  const [zeilen, setZeilen]   = useState<Zeile[]>(() => (wahl.ergebnis ?? []).map(e => ({
    name: e.name, gewaehlt: e.gewaehlt, stimmen: e.stimmen?.toString() ?? "", email: "", geschlecht: e.geschlecht ?? "",
  })));
  const [namen, setNamen]     = useState<string[]>([]);
  const [deaktivieren, setDeaktivieren] = useState(true);
  const [quote, setQuote]     = useState(true);
  const konstVorschlag = new Date(new Date(wahl.stimmabgabeAm).getTime() + 6 * 86_400_000).toISOString().slice(0, 10) + "T09:00";
  const [mitKonst, setMitKonst] = useState(br && !wahl.konstituierendeSitzungId);
  const [konstAm, setKonstAm]   = useState(konstVorschlag);
  const [plan, setPlan]       = useState<ErgebnisPlan | null>(null);
  const [laden, setLaden]     = useState(false);
  const [fehler, setFehler]   = useState("");

  // Namensvorschläge: Konten und wählbare Personen der Wählerliste; leere Zeilen nach Gremiumsgröße
  useEffect(() => {
    Promise.all([api.get<{ name: string }[]>("/api/benutzer").catch(() => []), api.wahlen.waehlerliste(wahl.id).catch(() => null)])
      .then(([benutzer, liste]) => {
        const kandidaten = liste?.waehler.filter(w => w.waehlbar).map(w => `${w.vorname} ${w.nachname}`) ?? [];
        setNamen([...new Set([...benutzer.map(b => b.name), ...kandidaten])].sort((a, b) => a.localeCompare(b, "de")));
        if (!wahl.ergebnis?.length) {
          const sitze = liste?.groesse.sitze || 1;
          setZeilen([...Array.from({ length: sitze }, () => leer("MITGLIED")), leer("ERSATZ"), leer("ERSATZ")]);
        }
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function aendern(i: number, teil: Partial<Zeile>) {
    setPlan(null);
    setZeilen(prev => prev.map((z, j) => j === i ? { ...z, ...teil } : z));
  }
  function verschieben(i: number, richtung: -1 | 1) {
    const j = i + richtung;
    if (j < 0 || j >= zeilen.length) return;
    setPlan(null);
    setZeilen(prev => { const n = [...prev]; [n[i], n[j]] = [n[j], n[i]]; return n; });
  }

  function eingabe(): ErgebnisEingabe {
    return {
      zeilen: zeilen.filter(z => z.name.trim()).map(z => ({
        name: z.name, gewaehlt: z.gewaehlt, stimmen: z.stimmen === "" ? null : Number(z.stimmen),
        email: z.email || null, geschlecht: z.geschlecht || null,
      })),
      nichtGewaehlteDeaktivieren: deaktivieren,
      quoteUebernehmen: br && quote,
      konstituierendeSitzungAm: br && mitKonst ? new Date(konstAm).toISOString() : null,
    };
  }

  async function vorschau() {
    setLaden(true); setFehler("");
    try { setPlan(await api.wahlen.ergebnisVorschau(wahl.id, eingabe())); }
    catch (err) { setFehler(err instanceof Error ? err.message : "Vorschau fehlgeschlagen"); }
    finally { setLaden(false); }
  }

  async function uebernehmen() {
    if (!confirm("Ergebnis jetzt übernehmen? Rollen, Wahlrang und Konten werden wie in der Vorschau geändert.")) return;
    setLaden(true); setFehler("");
    try { onUebernommen((await api.wahlen.ergebnisUebernehmen(wahl.id, eingabe())).wahl); }
    catch (err) { setFehler(err instanceof Error ? err.message : "Übernahme fehlgeschlagen"); setLaden(false); }
  }

  const input = "w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]";
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onSchliessen}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Ergebnis übernehmen – {wahl.titel}</h2>
          <button type="button" onClick={onSchliessen} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-6 py-4 space-y-4 overflow-y-auto">
          <p className="text-xs text-gray-500">
            Reihenfolge wie im Protokoll des Wahlvorstands: erst die gewählten Mitglieder, dann die Ersatzmitglieder in ihrer
            Nachrück-Reihenfolge. Die Position ist der Wahlrang{br ? " für die Nachrück-Logik" : ""}. Bestehende Konten werden über den Namen
            erkannt; für neue Personen eine E-Mail-Adresse angeben – das Konto bekommt ein Zufallspasswort, das der Vorsitz in der
            Benutzerverwaltung neu setzt.{!br && " JAV-Ersatzmitglieder bekommen noch keinen Zugang, sie stehen nur im Ergebnis."}
          </p>

          <datalist id="ergebnis-namen">{namen.map(n => <option key={n} value={n} />)}</datalist>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500">
                <th className="pb-1 w-8">#</th><th className="pb-1">Name</th><th className="pb-1 w-36">Gewählt als</th>
                <th className="pb-1 w-20">Stimmen</th><th className="pb-1 w-28">Geschlecht</th><th className="pb-1">E-Mail (nur neue Konten)</th><th className="w-20" />
              </tr>
            </thead>
            <tbody>
              {zeilen.map((z, i) => {
                const p = plan?.zeilen.find(x => x.name.toLowerCase() === z.name.trim().replace(/\s+/g, " ").toLowerCase());
                return (
                  <tr key={i} className="align-top">
                    <td className="py-1 pr-1 text-gray-400 pt-2.5">{i + 1}</td>
                    <td className="py-1 pr-2">
                      <input list="ergebnis-namen" value={z.name} onChange={e => aendern(i, { name: e.target.value })} placeholder="Vorname Nachname" className={input} />
                      {p && (
                        <p className="text-xs mt-0.5">
                          <span className={`px-1.5 py-0.5 rounded ${AKTION_LABEL[p.aktion][1]}`}>{AKTION_LABEL[p.aktion][0]}</span>
                          {p.fehler && <span className="text-red-600 ml-1">{p.fehler}</span>}
                          {!p.fehler && p.neueRolle && p.alteRolle !== p.neueRolle && (
                            <span className="text-gray-500 ml-1">{p.alteRolle ? `${ROLLEN_LABEL[p.alteRolle]} → ` : ""}{ROLLEN_LABEL[p.neueRolle]}</span>
                          )}
                        </p>
                      )}
                    </td>
                    <td className="py-1 pr-2">
                      <select value={z.gewaehlt} onChange={e => aendern(i, { gewaehlt: e.target.value as Gewaehlt })} className={`${input} bg-white`}>
                        <option value="MITGLIED">Mitglied</option>
                        <option value="ERSATZ">Ersatzmitglied</option>
                      </select>
                    </td>
                    <td className="py-1 pr-2"><input type="number" min={0} value={z.stimmen} onChange={e => aendern(i, { stimmen: e.target.value })} className={input} /></td>
                    <td className="py-1 pr-2">
                      <select value={z.geschlecht} onChange={e => aendern(i, { geschlecht: e.target.value as Geschlecht | "" })} className={`${input} bg-white`}>
                        <option value="">automatisch</option>
                        <option value="WEIBLICH">weiblich</option>
                        <option value="MAENNLICH">männlich</option>
                      </select>
                    </td>
                    <td className="py-1 pr-2"><input type="email" value={z.email} onChange={e => aendern(i, { email: e.target.value })} className={input} /></td>
                    <td className="py-1 whitespace-nowrap pt-2">
                      <button onClick={() => verschieben(i, -1)} disabled={i === 0} title="Nach oben" className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-25"><ChevronUp size={15} /></button>
                      <button onClick={() => verschieben(i, 1)} disabled={i === zeilen.length - 1} title="Nach unten" className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-25"><ChevronDown size={15} /></button>
                      <button onClick={() => { setPlan(null); setZeilen(prev => prev.filter((_, j) => j !== i)); }} title="Zeile entfernen" className="p-0.5 text-gray-300 hover:text-red-600"><X size={15} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <button onClick={() => { setPlan(null); setZeilen(prev => [...prev, leer("ERSATZ")]); }}
            className="flex items-center gap-1 text-sm text-accent hover:brightness-90"><Plus size={14} /> Zeile hinzufügen</button>

          <div className="space-y-2 border-t border-gray-100 pt-3">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={deaktivieren} onChange={e => { setPlan(null); setDeaktivieren(e.target.checked); }} />
              Nicht (wieder)gewählte {br ? "Mitglieder und Ersatzmitglieder" : "JAV-Mitglieder"} deaktivieren
            </label>
            {br && (
              <>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={quote} onChange={e => { setPlan(null); setQuote(e.target.checked); }} />
                  Minderheitengeschlecht und Mindestsitze aus der Wählerliste in die Einstellungen übernehmen (Nachrück-Logik)
                </label>
                {wahl.konstituierendeSitzungId ? (
                  <p className="text-sm text-gray-500">Die konstituierende Sitzung ist bereits angelegt.</p>
                ) : (
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer flex-wrap">
                    <input type="checkbox" checked={mitKonst} onChange={e => setMitKonst(e.target.checked)} />
                    Konstituierende Sitzung anlegen am
                    <input type="datetime-local" value={konstAm} onChange={e => setKonstAm(e.target.value)} disabled={!mitKonst}
                      className="border border-gray-300 rounded-lg px-2 py-1 text-sm disabled:opacity-50" />
                    <span className="text-xs text-gray-400">(§ 29: binnen einer Woche nach der Wahl)</span>
                  </label>
                )}
              </>
            )}
          </div>

          {plan && (
            <div className="space-y-2">
              {plan.warnungen.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 space-y-1">
                  {plan.warnungen.map(w => <p key={w} className="flex items-start gap-1.5"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{w}</p>)}
                </div>
              )}
              {plan.deaktivieren.length > 0 && (
                <p className="text-sm text-gray-600"><strong>Wird deaktiviert:</strong> {plan.deaktivieren.map(d => `${d.name} (${ROLLEN_LABEL[d.rolle]})`).join(", ")}</p>
              )}
              {plan.wahlrangWeg.length > 0 && (
                <p className="text-sm text-gray-600"><strong>Verliert den alten Wahlrang:</strong> {plan.wahlrangWeg.map(d => d.name).join(", ")}</p>
              )}
              {plan.quote && quote && (
                <p className="text-sm text-gray-600"><strong>Quote:</strong> mindestens {plan.quote.mindestsitze} {plan.quote.geschlecht === "WEIBLICH" ? "Frauen" : "Männer"}</p>
              )}
              {!plan.fehlerfrei && <p className="text-sm text-red-600">Bitte die markierten Zeilen korrigieren und die Vorschau erneut anzeigen.</p>}
            </div>
          )}
          {fehler && <p className="text-sm text-red-600">{fehler}</p>}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button type="button" onClick={onSchliessen} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Abbrechen</button>
          <button onClick={vorschau} disabled={laden || !zeilen.some(z => z.name.trim())}
            className="px-4 py-2 text-sm border border-gray-300 hover:bg-gray-50 rounded-lg disabled:opacity-50">Vorschau</button>
          <button onClick={uebernehmen} disabled={laden || !plan?.fehlerfrei}
            title={!plan ? "Erst die Vorschau anzeigen" : undefined}
            className="flex items-center gap-2 bg-[rgb(var(--accent))] hover:brightness-90 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium">
            {laden && <Loader2 size={14} className="animate-spin" />} Übernehmen
          </button>
        </div>
      </div>
    </div>
  );
}
