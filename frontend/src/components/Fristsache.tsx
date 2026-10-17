/**
 * Fristsachen (Anhörung § 99/§ 102, § 87): Zugang beim Betriebsrat bestätigen,
 * Empfangsbestätigung an den Arbeitgeber, Sitzung vor Fristende – im Dokumenteneingang und
 * in der Dokumentansicht (Backend: lib/zugang.ts, lib/empfangsbestaetigung.ts,
 * lib/sitzungsvorschlag.ts). Nur für Vorsitz/Stellvertretung.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, CalendarClock, Check, Clock, Loader2, Send } from "lucide-react";
import {
  api, Dokument, istEmail, KuendigungsArt, ZugangInfo, EmpfangsbestaetigungEntwurf, Sitzungsvorschlag, VorgeschlageneSitzung,
} from "../lib/api";

// ── Zugang bestätigen ────────────────────────────────────────────────
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

export function FristBadge({ dok }: { dok: Dokument }) {
  const naechste = dok.fristen?.[0];
  if (!naechste) return null;
  return dok.zugangBestaetigtAm ? (
    <span className="text-xs px-1.5 py-0.5 rounded-sm bg-red-50 text-red-700 flex items-center gap-1">
      <CalendarClock size={12} /> Frist bis {datumMitTag(naechste.faelligAm)}
    </span>
  ) : (
    <span className="text-xs px-1.5 py-0.5 rounded-sm bg-amber-100 text-amber-800 flex items-center gap-1">
      <AlertTriangle size={12} /> Frist vorläufig – Zugang bestätigen
    </span>
  );
}

export function ZugangKarte({ dok, onBestaetigt }: { dok: Dokument; onBestaetigt: () => void }) {
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

export function SitzungsVorschlagKarte({ dok, onTopAngelegt }: { dok: Dokument; onTopAngelegt: () => void }) {
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
            <p className="text-xs text-gray-500">Das Dokument wird mit dem TOP verknüpft und aus dem Dokumenteneingang genommen.</p>
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
