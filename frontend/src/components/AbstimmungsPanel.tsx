/**
 * AbstimmungsPanel – Strukturierte Abstimmung pro Tagesordnungspunkt
 *
 * Phasen:
 *  1. SETUP    – Rechtsgrundlage + Fragestellung erfassen
 *  2. ANWESENHEIT – Wer ist anwesend / stimmberechtigt?
 *  3. ABSTIMMUNG  – Jede Person gibt JA / NEIN / ENTHALTUNG
 *  4. ERGEBNIS    – Automatische Berechnung, Finalisierung
 */

import { useEffect, useState } from "react";
import {
  CheckCircle, XCircle, MinusCircle, Users, Gavel, ChevronRight,
  Lock, Loader2, RotateCcw, AlertTriangle,
} from "lucide-react";
import { api, Benutzer } from "../lib/api";

// ── Typen ─────────────────────────────────────────────────────────
type StimmeWert = "JA" | "NEIN" | "ENTHALTUNG";

interface AbstimmungsStimme {
  benutzerId: string;
  stimme: StimmeWert;
}

interface Abstimmung {
  id: string;
  rechtsgrundlage: string;
  fragestellung: string;
  jaStimmen: number;
  neinStimmen: number;
  enthaltungen: number;
  anwesend: number;
  ergebnis: string | null;
  finalisiert: boolean;
  finalisiertAm?: string;
  stimmen: AbstimmungsStimme[];
}

type Phase = "SETUP" | "ANWESENHEIT" | "ABSTIMMUNG" | "ERGEBNIS";

const RECHTSGRUNDLAGEN = [
  "§ 87 BetrVG – Mitbestimmung",
  "§ 99 BetrVG – Einstellung / Versetzung",
  "§ 100 BetrVG – Vorläufige personelle Maßnahmen",
  "§ 102 BetrVG – Kündigung",
  "§ 112 BetrVG – Interessenausgleich / Sozialplan",
  "§ 37 BetrVG – Freistellung",
  "Sonstige Beschlussfassung",
];

// ── Hilfsfunktionen ───────────────────────────────────────────────
function berechneErgebnis(ja: number, nein: number): string {
  if (ja > nein) return "ANGENOMMEN";
  if (nein > ja) return "ABGELEHNT";
  return "UNENTSCHIEDEN";
}

function ergebnisLabel(e: string | null): string {
  if (!e) return "—";
  return { ANGENOMMEN: "Angenommen", ABGELEHNT: "Abgelehnt", UNENTSCHIEDEN: "Unentschieden" }[e] ?? e;
}

function rolleKurz(rolle: string): string {
  return { VORSITZ: "Vors.", MITGLIED: "Mitgl.", ERSATZMITGLIED: "Ers.", ADMIN: "Admin" }[rolle] ?? rolle;
}

// ── Haupt-Komponente ──────────────────────────────────────────────
interface Props {
  topId: string;
  sitzungId: string;
  topTitel: string;
  readonly: boolean;
  onUpdate?: () => void;
}

export default function AbstimmungsPanel({ topId, sitzungId, topTitel, readonly, onUpdate }: Props) {
  const [phase, setPhase]               = useState<Phase>("SETUP");
  const [abstimmung, setAbstimmung]     = useState<Abstimmung | null>(null);
  const [mitglieder, setMitglieder]     = useState<Benutzer[]>([]);
  const [laden, setLaden]               = useState(true);
  const [fehler, setFehler]             = useState("");
  const [speichern, setSpeichern]       = useState(false);

  // Setup-Felder
  const [rechtsgrundlage, setRechtsgrundlage] = useState(RECHTSGRUNDLAGEN[0]);
  const [fragestellung, setFragestellung]     = useState("");

  // Anwesenheit: Set der anwesenden Benutzer-IDs
  const [anwesend, setAnwesend] = useState<Set<string>>(new Set());

  // Stimmen: benutzerId → Wert
  const [stimmen, setStimmen] = useState<Map<string, StimmeWert>>(new Map());

  useEffect(() => {
    Promise.all([
      fetch_abstimmung(),
      fetch_mitglieder(),
    ]).finally(() => setLaden(false));
  }, [topId]);

  async function fetch_abstimmung() {
    try {
      const res = await fetch(
        `/api/sitzungen/${sitzungId}/tops/${topId}/abstimmung`,
        { headers: { Authorization: `Bearer ${localStorage.getItem("brdms_token")}` } }
      );
      if (res.status === 404) return; // noch keine
      if (!res.ok) throw new Error(await res.text());
      const data: Abstimmung = await res.json();
      setAbstimmung(data);
      setRechtsgrundlage(data.rechtsgrundlage);
      setFragestellung(data.fragestellung);

      // Anwesende + Stimmen aus DB wiederherstellen
      const anwesendIds = new Set(data.stimmen.map(s => s.benutzerId));
      setAnwesend(anwesendIds);
      const stimmenMap = new Map(data.stimmen.map(s => [s.benutzerId, s.stimme]));
      setStimmen(stimmenMap);

      setPhase(data.finalisiert ? "ERGEBNIS" : data.stimmen.length > 0 ? "ABSTIMMUNG" : "ANWESENHEIT");
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler");
    }
  }

  async function fetch_mitglieder() {
    try {
      const res = await fetch("/api/benutzer", {
        headers: { Authorization: `Bearer ${localStorage.getItem("brdms_token")}` },
      });
      const alle: Benutzer[] = await res.json();
      // Nur aktive BR-Mitglieder (kein Admin)
      setMitglieder(alle.filter(b => b.aktiv && b.rolle !== "ADMIN"));
    } catch {
      // Benutzer-Endpunkt evtl. nicht erreichbar — wird toleriert
    }
  }

  async function abstimmungAnlegen() {
    if (!fragestellung.trim()) {
      setFehler("Bitte Fragestellung eingeben.");
      return;
    }
    setFehler("");
    setSpeichern(true);
    try {
      const res = await fetch(`/api/sitzungen/${sitzungId}/tops/${topId}/abstimmung`, {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization:  `Bearer ${localStorage.getItem("brdms_token")}`,
        },
        body: JSON.stringify({ rechtsgrundlage, fragestellung }),
      });
      if (!res.ok) throw new Error((await res.json()).fehler ?? "Fehler");
      const data: Abstimmung = await res.json();
      setAbstimmung(data);
      setPhase("ANWESENHEIT");
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler");
    } finally {
      setSpeichern(false);
    }
  }

  function anwesenheitToggle(id: string) {
    setAnwesend(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        setStimmen(s => { const m = new Map(s); m.delete(id); return m; });
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function stimmeSetzen(benutzerId: string, wert: StimmeWert) {
    setStimmen(prev => new Map(prev).set(benutzerId, wert));
  }

  async function abstimmungSpeichern(finalisieren: boolean) {
    if (!abstimmung) return;
    setFehler("");
    setSpeichern(true);

    const stimmenListe = Array.from(anwesend).map(bId => ({
      benutzerId: bId,
      stimme: stimmen.get(bId) ?? "ENTHALTUNG",
    }));

    try {
      const res = await fetch(`/api/sitzungen/${sitzungId}/tops/${topId}/abstimmung`, {
        method:  "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization:  `Bearer ${localStorage.getItem("brdms_token")}`,
        },
        body: JSON.stringify({ stimmen: stimmenListe, finalisieren }),
      });
      if (!res.ok) throw new Error((await res.json()).fehler ?? "Fehler");
      const data: Abstimmung = await res.json();
      setAbstimmung(data);
      if (finalisieren) setPhase("ERGEBNIS");
      onUpdate?.();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler");
    } finally {
      setSpeichern(false);
    }
  }

  // ── Berechnungen ────────────────────────────────────────────────
  const anwesendeListe   = mitglieder.filter(m => anwesend.has(m.id));
  const alleHabenGestimmt = anwesendeListe.length > 0 &&
    anwesendeListe.every(m => stimmen.has(m.id));

  const jaCount      = Array.from(stimmen.values()).filter(s => s === "JA").length;
  const neinCount    = Array.from(stimmen.values()).filter(s => s === "NEIN").length;
  const enthaltCount = Array.from(stimmen.values()).filter(s => s === "ENTHALTUNG").length;
  const vorschauErgebnis = berechneErgebnis(jaCount, neinCount);

  // ── Render ──────────────────────────────────────────────────────
  if (laden) {
    return (
      <div className="flex items-center gap-2 text-gray-400 text-sm py-3">
        <Loader2 size={15} className="animate-spin" /> Abstimmung laden…
      </div>
    );
  }

  return (
    <div className="mt-3 border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 bg-gray-50 border-b border-gray-200 px-4 py-2.5">
        <Gavel size={15} className="text-gray-500" />
        <span className="text-sm font-semibold text-gray-700">Abstimmung</span>
        {abstimmung && (
          <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full border ${
            abstimmung.finalisiert
              ? "bg-green-50 text-green-700 border-green-200"
              : "bg-yellow-50 text-yellow-700 border-yellow-200"
          }`}>
            {abstimmung.finalisiert ? "Finalisiert" : "In Bearbeitung"}
          </span>
        )}
      </div>

      <div className="p-4 space-y-4">
        {fehler && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-lg">
            <AlertTriangle size={13} /> {fehler}
          </div>
        )}

        {/* Phase 1: SETUP */}
        {phase === "SETUP" && !readonly && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Rechtsgrundlage</label>
              <select
                value={rechtsgrundlage}
                onChange={e => setRechtsgrundlage(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))] bg-white"
              >
                {RECHTSGRUNDLAGEN.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Fragestellung / Antrag <span className="text-red-500">*</span>
              </label>
              <textarea
                value={fragestellung}
                onChange={e => setFragestellung(e.target.value)}
                rows={3}
                placeholder={`z.B. „Der Betriebsrat stimmt der Einstellung von Herrn Müller zu."`}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))] resize-none"
              />
            </div>
            <button
              onClick={abstimmungAnlegen}
              disabled={speichern || !fragestellung.trim()}
              className="flex items-center gap-2 bg-[rgb(var(--accent))] hover:brightness-90 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {speichern ? <Loader2 size={14} className="animate-spin" /> : <ChevronRight size={14} />}
              Abstimmung vorbereiten
            </button>
          </div>
        )}

        {/* Phase 2: ANWESENHEIT */}
        {phase === "ANWESENHEIT" && !abstimmung?.finalisiert && (
          <div className="space-y-3">
            <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs text-blue-800">
              <p className="font-medium">{abstimmung?.rechtsgrundlage}</p>
              <p className="mt-0.5 italic">„{abstimmung?.fragestellung}"</p>
            </div>

            <div>
              <div className="flex items-center gap-1 text-xs font-medium text-gray-600 mb-2">
                <Users size={13} />
                Anwesenheitsliste ({anwesend.size} von {mitglieder.length} anwesend)
              </div>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 text-left">
                      <th className="px-3 py-2 font-medium">Mitglied</th>
                      <th className="px-3 py-2 font-medium">Rolle</th>
                      <th className="px-3 py-2 font-medium text-center">Anwesend</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {mitglieder.map(m => (
                      <tr key={m.id} className={anwesend.has(m.id) ? "bg-green-50" : ""}>
                        <td className="px-3 py-2 font-medium text-gray-800">{m.name}</td>
                        <td className="px-3 py-2 text-gray-500">{rolleKurz(m.rolle)}</td>
                        <td className="px-3 py-2 text-center">
                          {readonly ? (
                            <span className={anwesend.has(m.id) ? "text-green-600" : "text-gray-300"}>
                              {anwesend.has(m.id) ? "✓" : "✗"}
                            </span>
                          ) : (
                            <input
                              type="checkbox"
                              checked={anwesend.has(m.id)}
                              onChange={() => anwesenheitToggle(m.id)}
                              className="rounded border-gray-300 text-[rgb(var(--accent))] cursor-pointer"
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {!readonly && (
              <button
                onClick={() => setPhase("ABSTIMMUNG")}
                disabled={anwesend.size === 0}
                className="flex items-center gap-2 bg-[rgb(var(--accent))] hover:brightness-90 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                <ChevronRight size={14} />
                Zur Abstimmung ({anwesend.size} Stimmberechtigt)
              </button>
            )}
          </div>
        )}

        {/* Phase 3: ABSTIMMUNG */}
        {phase === "ABSTIMMUNG" && !abstimmung?.finalisiert && (
          <div className="space-y-3">
            <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs text-blue-800">
              <p className="font-medium">{abstimmung?.rechtsgrundlage}</p>
              <p className="mt-0.5 italic">„{abstimmung?.fragestellung}"</p>
            </div>

            {/* Abstimmungs-Matrix */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 text-left">
                    <th className="px-3 py-2 font-medium">Mitglied</th>
                    <th className="px-3 py-2 font-medium text-center text-green-700">Ja</th>
                    <th className="px-3 py-2 font-medium text-center text-red-700">Nein</th>
                    <th className="px-3 py-2 font-medium text-center text-gray-600">Enthal.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {anwesendeListe.map(m => {
                    const aktuelleStimme = stimmen.get(m.id);
                    return (
                      <tr key={m.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2">
                          <p className="font-medium text-gray-800">{m.name}</p>
                          <p className="text-gray-400">{rolleKurz(m.rolle)}</p>
                        </td>
                        {(["JA", "NEIN", "ENTHALTUNG"] as StimmeWert[]).map(wert => (
                          <td key={wert} className="px-3 py-2 text-center">
                            {readonly ? (
                              aktuelleStimme === wert ? (
                                <StimmeIcon wert={wert} aktiv />
                              ) : (
                                <span className="text-gray-200">—</span>
                              )
                            ) : (
                              <button
                                onClick={() => stimmeSetzen(m.id, wert)}
                                className={`w-7 h-7 rounded-full border-2 transition-all flex items-center justify-center mx-auto ${
                                  aktuelleStimme === wert
                                    ? stimmeButtonAktiv(wert)
                                    : "border-gray-200 text-gray-300 hover:border-gray-400"
                                }`}
                              >
                                <StimmeIcon wert={wert} aktiv={aktuelleStimme === wert} />
                              </button>
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Live-Vorschau */}
            <ErgebnisAnzeige
              ja={jaCount}
              nein={neinCount}
              enthaltungen={enthaltCount}
              anwesend={anwesend.size}
              ergebnis={vorschauErgebnis}
              vorschau
            />

            {!readonly && (
              <div className="flex gap-2">
                <button
                  onClick={() => setPhase("ANWESENHEIT")}
                  className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
                >
                  <RotateCcw size={13} /> Zurück
                </button>
                <button
                  onClick={() => abstimmungSpeichern(false)}
                  disabled={speichern}
                  className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-800 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
                >
                  Zwischenspeichern
                </button>
                <button
                  onClick={() => abstimmungSpeichern(true)}
                  disabled={speichern || !alleHabenGestimmt}
                  title={!alleHabenGestimmt ? "Alle anwesenden Mitglieder müssen abgestimmt haben" : undefined}
                  className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors ml-auto"
                >
                  {speichern ? <Loader2 size={13} className="animate-spin" /> : <Lock size={13} />}
                  Abstimmung abschließen
                </button>
              </div>
            )}
          </div>
        )}

        {/* Phase 4: ERGEBNIS (readonly) */}
        {(phase === "ERGEBNIS" || abstimmung?.finalisiert) && abstimmung && (
          <div className="space-y-3">
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700">
              <p className="font-medium text-gray-500 uppercase tracking-wide text-[10px]">Rechtsgrundlage</p>
              <p className="font-semibold">{abstimmung.rechtsgrundlage}</p>
              <p className="mt-1 font-medium text-gray-500 uppercase tracking-wide text-[10px]">Fragestellung</p>
              <p className="italic">„{abstimmung.fragestellung}"</p>
            </div>

            {/* Einzel-Stimmen */}
            {abstimmung.stimmen.length > 0 && (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 text-left">
                      <th className="px-3 py-2 font-medium">Mitglied</th>
                      <th className="px-3 py-2 font-medium text-center">Stimme</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {abstimmung.stimmen.map(s => {
                      const m = mitglieder.find(x => x.id === s.benutzerId);
                      return (
                        <tr key={s.benutzerId}>
                          <td className="px-3 py-2 font-medium text-gray-800">
                            {m?.name ?? "Unbekannt"}
                            {m && <span className="ml-1 text-gray-400">({rolleKurz(m.rolle)})</span>}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`flex items-center justify-center gap-1 font-medium ${
                              s.stimme === "JA" ? "text-green-700" :
                              s.stimme === "NEIN" ? "text-red-700" : "text-gray-500"
                            }`}>
                              <StimmeIcon wert={s.stimme} aktiv />
                              {s.stimme === "JA" ? "Ja" : s.stimme === "NEIN" ? "Nein" : "Enthaltung"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <ErgebnisAnzeige
              ja={abstimmung.jaStimmen}
              nein={abstimmung.neinStimmen}
              enthaltungen={abstimmung.enthaltungen}
              anwesend={abstimmung.anwesend}
              ergebnis={abstimmung.ergebnis}
            />

            {abstimmung.finalisiertAm && (
              <p className="text-[11px] text-gray-400 text-right">
                Finalisiert am {new Date(abstimmung.finalisiertAm).toLocaleString("de-DE")}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Hilfs-Komponenten ─────────────────────────────────────────────
function StimmeIcon({ wert, aktiv }: { wert: StimmeWert; aktiv: boolean }) {
  const size = 13;
  if (wert === "JA")          return <CheckCircle  size={size} className={aktiv ? "text-green-600" : ""} />;
  if (wert === "NEIN")        return <XCircle      size={size} className={aktiv ? "text-red-600"   : ""} />;
  return                             <MinusCircle  size={size} className={aktiv ? "text-gray-500"  : ""} />;
}

function stimmeButtonAktiv(wert: StimmeWert): string {
  return {
    JA:         "border-green-500 bg-green-50 text-green-600",
    NEIN:       "border-red-500 bg-red-50 text-red-600",
    ENTHALTUNG: "border-gray-400 bg-gray-100 text-gray-600",
  }[wert];
}

function ErgebnisAnzeige({
  ja, nein, enthaltungen, anwesend, ergebnis, vorschau = false,
}: {
  ja: number; nein: number; enthaltungen: number; anwesend: number;
  ergebnis: string | null | undefined; vorschau?: boolean;
}) {
  const gesamtStimmen = ja + nein + enthaltungen;
  const jaBreite      = gesamtStimmen > 0 ? (ja / gesamtStimmen) * 100 : 0;
  const neinBreite    = gesamtStimmen > 0 ? (nein / gesamtStimmen) * 100 : 0;

  return (
    <div className={`rounded-lg border p-3 ${
      ergebnis === "ANGENOMMEN" ? "bg-green-50 border-green-200" :
      ergebnis === "ABGELEHNT"  ? "bg-red-50 border-red-200"     :
      "bg-gray-50 border-gray-200"
    }`}>
      {vorschau && (
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-2">
          Live-Vorschau
        </p>
      )}

      {/* Balkendiagramm */}
      {gesamtStimmen > 0 && (
        <div className="flex h-2 rounded-full overflow-hidden mb-3 bg-gray-200">
          {jaBreite > 0   && <div className="bg-green-500 transition-all" style={{ width: `${jaBreite}%` }} />}
          {neinBreite > 0 && <div className="bg-red-500 transition-all"   style={{ width: `${neinBreite}%` }} />}
        </div>
      )}

      {/* Zahlen */}
      <div className="grid grid-cols-4 gap-2 text-center text-xs mb-3">
        <div>
          <p className="text-xl font-bold text-green-700">{ja}</p>
          <p className="text-gray-500">Ja</p>
        </div>
        <div>
          <p className="text-xl font-bold text-red-700">{nein}</p>
          <p className="text-gray-500">Nein</p>
        </div>
        <div>
          <p className="text-xl font-bold text-gray-500">{enthaltungen}</p>
          <p className="text-gray-500">Enthal.</p>
        </div>
        <div>
          <p className="text-xl font-bold text-gray-700">{anwesend}</p>
          <p className="text-gray-500">Anwes.</p>
        </div>
      </div>

      {/* Ergebnis-Banner */}
      {ergebnis && (
        <div className={`text-center py-1.5 rounded-lg font-bold text-sm ${
          ergebnis === "ANGENOMMEN"   ? "bg-green-600 text-white" :
          ergebnis === "ABGELEHNT"    ? "bg-red-600 text-white"   :
          "bg-gray-400 text-white"
        }`}>
          {ergebnisLabel(ergebnis)}
        </div>
      )}
    </div>
  );
}
