/**
 * Abwesenheitskalender – wer ist wann nicht da?
 *
 * Jede:r trägt eigene Abwesenheiten ein (Urlaub, Krankheit, Schulung, Dienstreise),
 * Vorsitz und Stellvertretung auch für andere (z. B. für JAV/SBV, die diese Seite
 * nicht erreichen). Beim Laden einer Sitzung erkennt BR-DMS daraus, wer verhindert
 * ist, und schlägt Ersatzmitglieder vor (AnwesenheitsListe.tsx).
 * Den Grund sehen nur die Person selbst sowie Vorsitz und Stellvertretung.
 * Backend: routes/abwesenheiten.ts
 */

import { useEffect, useMemo, useState, FormEvent } from "react";
import { Link } from "react-router-dom";
import { CalendarOff, ChevronLeft, ChevronRight, Plus, Pencil, Trash2, X, Lock, CalendarDays } from "lucide-react";
import {
  api, ABWESENHEITS_GRUND_LABEL, AbwesenheitEintrag, AbwesenheitenStand, AbwesenheitsGrund, Benutzer, Rolle,
} from "../lib/api";

const GRUND_FARBE: Record<AbwesenheitsGrund, string> = {
  URLAUB:      "bg-sky-100 text-sky-800",
  KRANKHEIT:   "bg-rose-100 text-rose-800",
  SCHULUNG:    "bg-violet-100 text-violet-800",
  DIENSTREISE: "bg-amber-100 text-amber-800",
  SONSTIGES:   "bg-gray-200 text-gray-700",
};
const OHNE_GRUND = "bg-gray-100 text-gray-600";
const GRUENDE = Object.keys(ABWESENHEITS_GRUND_LABEL) as AbwesenheitsGrund[];
const WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

const eingabeKlasse =
  "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-[rgb(var(--accent))]";

/** Date (UTC-Mitternacht) ↔ "JJJJ-MM-TT" – Abwesenheiten sind reine Kalendertage */
const isoTag = (d: Date) => d.toISOString().slice(0, 10);
const tagDatum = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);
const kurz = (iso: string) => tagDatum(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

function monatsRaster(jahr: number, monat: number): Date[] {
  const erster = new Date(Date.UTC(jahr, monat, 1));
  const versatz = (erster.getUTCDay() + 6) % 7;   // Montag = 0
  const start = new Date(Date.UTC(jahr, monat, 1 - versatz));
  const letzter = new Date(Date.UTC(jahr, monat + 1, 0));
  const tage = Math.ceil((versatz + letzter.getUTCDate()) / 7) * 7;
  return Array.from({ length: tage }, (_, i) => new Date(start.getTime() + i * 86_400_000));
}

export default function Abwesenheiten() {
  const heute = new Date();
  const [jahr, setJahr]     = useState(heute.getFullYear());
  const [monat, setMonat]   = useState(heute.getMonth());
  const [stand, setStand]   = useState<AbwesenheitenStand | null>(null);
  const [fehler, setFehler] = useState("");
  const [ich, setIch]       = useState<{ id: string; rolle: Rolle } | null>(null);
  const [bearbeiten, setBearbeiten] = useState<AbwesenheitEintrag | "neu" | null>(null);
  const [vorgabeTag, setVorgabeTag] = useState<string | null>(null);

  const raster = useMemo(() => monatsRaster(jahr, monat), [jahr, monat]);
  const von = isoTag(raster[0]);
  const bis = isoTag(raster[raster.length - 1]);

  function laden() {
    setFehler("");
    api.abwesenheiten.zeitraum(von, bis).then(setStand).catch(e => setFehler(e.message));
  }
  useEffect(() => { api.auth.me().then(b => setIch({ id: b.id, rolle: b.rolle })).catch(() => {}); }, []);
  useEffect(laden, [von, bis]); // eslint-disable-line react-hooks/exhaustive-deps

  function blaettern(schritt: number) {
    const d = new Date(jahr, monat + schritt, 1);
    setJahr(d.getFullYear()); setMonat(d.getMonth());
  }

  async function loeschen(e: AbwesenheitEintrag) {
    if (!confirm(`Abwesenheit von ${e.benutzer.name} (${kurz(e.von)} – ${kurz(e.bis)}) löschen?`)) return;
    try { await api.abwesenheiten.loeschen(e.id); laden(); }
    catch (err) { setFehler(err instanceof Error ? err.message : "Fehler"); }
  }

  const imMonat = (stand?.eintraege ?? []).filter(e =>
    tagDatum(e.bis) >= new Date(Date.UTC(jahr, monat, 1)) && tagDatum(e.von) <= new Date(Date.UTC(jahr, monat + 1, 0)));
  const monatsName = new Date(jahr, monat, 1).toLocaleDateString("de-DE", { month: "long", year: "numeric" });

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgb(var(--accent) / 0.1)" }}>
            <CalendarOff className="w-5 h-5" style={{ color: "rgb(var(--accent))" }} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Abwesenheiten</h1>
            <p className="text-sm text-gray-500">Wer ist wann nicht da? Die Ladung zur Sitzung erkennt Verhinderungen daraus.</p>
          </div>
        </div>
        <button onClick={() => { setVorgabeTag(null); setBearbeiten("neu"); }}
          className="flex items-center gap-1.5 bg-[rgb(var(--accent))] hover:brightness-90 text-white text-sm font-medium px-3 py-1.5 rounded-lg">
          <Plus size={15} /> Abwesenheit eintragen
        </button>
      </div>

      {fehler && <p className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{fehler}</p>}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
          <button onClick={() => blaettern(-1)} className="p-1 rounded hover:bg-gray-200" aria-label="Vorheriger Monat"><ChevronLeft size={18} /></button>
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-gray-800 capitalize">{monatsName}</h2>
            {(jahr !== heute.getFullYear() || monat !== heute.getMonth()) && (
              <button onClick={() => { setJahr(heute.getFullYear()); setMonat(heute.getMonth()); }}
                className="text-xs text-[rgb(var(--accent))] hover:underline">Heute</button>
            )}
          </div>
          <button onClick={() => blaettern(1)} className="p-1 rounded hover:bg-gray-200" aria-label="Nächster Monat"><ChevronRight size={18} /></button>
        </div>

        <div className="grid grid-cols-7 text-xs font-medium text-gray-500 border-b border-gray-100">
          {WOCHENTAGE.map(w => <div key={w} className="px-2 py-1.5 text-center">{w}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {raster.map((tag, i) => {
            const iso = isoTag(tag);
            const imAktMonat = tag.getUTCMonth() === monat;
            const istHeute = iso === isoTag(new Date(Date.UTC(heute.getFullYear(), heute.getMonth(), heute.getDate())));
            const wochenende = i % 7 >= 5;
            const abwesend = (stand?.eintraege ?? []).filter(e => tagDatum(e.von) <= tag && tagDatum(e.bis) >= tag);
            const sitzungen = (stand?.sitzungen ?? []).filter(s => s.sitzungsdatum.slice(0, 10) === iso);
            return (
              <div key={iso}
                onDoubleClick={() => { setVorgabeTag(iso); setBearbeiten("neu"); }}
                className={`min-h-[92px] border-b border-r border-gray-100 p-1 text-xs ${imAktMonat ? "" : "bg-gray-50/70 text-gray-400"} ${wochenende && imAktMonat ? "bg-gray-50/40" : ""}`}>
                <div className={`mb-1 w-6 h-6 flex items-center justify-center rounded-full ${istHeute ? "bg-[rgb(var(--accent))] text-white font-bold" : "text-gray-600"}`}>
                  {tag.getUTCDate()}
                </div>
                <div className="space-y-0.5">
                  {sitzungen.map(s => (
                    <Link key={s.id} to={`/sitzungen?id=${s.id}`} title={s.titel}
                      className="flex items-center gap-1 truncate rounded px-1 py-0.5 bg-accent/10 text-accent font-medium hover:bg-accent/20">
                      <CalendarDays size={10} className="shrink-0" /> <span className="truncate">{s.titel}</span>
                    </Link>
                  ))}
                  {abwesend.map(e => (
                    <div key={e.id} title={`${e.benutzer.name}${e.grund ? ` – ${ABWESENHEITS_GRUND_LABEL[e.grund]}` : " – abwesend"}`}
                      className={`truncate rounded px-1 py-0.5 ${e.grund ? GRUND_FARBE[e.grund] : OHNE_GRUND}`}>
                      {e.benutzer.name}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 flex flex-wrap gap-2 text-xs text-gray-600 items-center">
          {GRUENDE.map(g => <span key={g} className={`rounded px-1.5 py-0.5 ${GRUND_FARBE[g]}`}>{ABWESENHEITS_GRUND_LABEL[g]}</span>)}
          <span className={`rounded px-1.5 py-0.5 ${OHNE_GRUND}`}>abwesend (Grund nicht sichtbar)</span>
          <span className="ml-auto text-gray-400">Doppelklick auf einen Tag trägt dort ein</span>
        </div>
      </div>

      <div className="mt-6 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800 text-sm">Einträge im {monatsName}</h3>
          <span className="flex items-center gap-1 text-xs text-gray-500">
            <Lock size={12} /> Den Grund sehen nur die Person selbst sowie Vorsitz und Stellvertretung
          </span>
        </div>
        {imMonat.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-400 text-center">Keine Abwesenheiten in diesem Monat.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {imMonat.map(e => (
              <div key={e.id} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                <span className="font-medium text-gray-900 flex-1 min-w-0 truncate">
                  {e.benutzer.name}{e.benutzer.id === ich?.id && <span className="ml-1 text-xs text-gray-400">(ich)</span>}
                </span>
                <span className="text-gray-600 tabular-nums">{kurz(e.von)}{e.bis !== e.von && ` – ${kurz(e.bis)}`}</span>
                <span className={`text-xs rounded px-1.5 py-0.5 w-24 text-center ${e.grund ? GRUND_FARBE[e.grund] : OHNE_GRUND}`}>
                  {e.grund ? ABWESENHEITS_GRUND_LABEL[e.grund] : "abwesend"}
                </span>
                <span className="w-14 flex justify-end gap-1">
                  {e.darfBearbeiten && (
                    <>
                      <button onClick={() => setBearbeiten(e)} className="p-1 text-gray-400 hover:text-gray-700" title="Bearbeiten"><Pencil size={14} /></button>
                      <button onClick={() => loeschen(e)} className="p-1 text-gray-400 hover:text-red-600" title="Löschen"><Trash2 size={14} /></button>
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {bearbeiten && ich && (
        <AbwesenheitDialog
          eintrag={bearbeiten === "neu" ? null : bearbeiten}
          vorgabeTag={vorgabeTag ?? isoTag(new Date(Date.UTC(heute.getFullYear(), heute.getMonth(), heute.getDate())))}
          ichId={ich.id}
          darfFuerAndere={!!stand?.darfFuerAndere}
          onSchliessen={() => setBearbeiten(null)}
          onGespeichert={() => { setBearbeiten(null); laden(); }}
        />
      )}
    </div>
  );
}

function AbwesenheitDialog({ eintrag, vorgabeTag, ichId, darfFuerAndere, onSchliessen, onGespeichert }: {
  eintrag: AbwesenheitEintrag | null; vorgabeTag: string; ichId: string; darfFuerAndere: boolean;
  onSchliessen: () => void; onGespeichert: () => void;
}) {
  const [benutzerId, setBenutzerId] = useState(eintrag?.benutzer.id ?? ichId);
  const [von, setVon]     = useState(eintrag ? eintrag.von.slice(0, 10) : vorgabeTag);
  const [bis, setBis]     = useState(eintrag ? eintrag.bis.slice(0, 10) : vorgabeTag);
  const [grund, setGrund] = useState<AbwesenheitsGrund>(eintrag?.grund ?? "URLAUB");
  const [personen, setPersonen] = useState<Benutzer[]>([]);
  const [fehler, setFehler] = useState("");
  const [speichert, setSpeichert] = useState(false);

  useEffect(() => {
    if (!darfFuerAndere || eintrag) return;
    api.get<Benutzer[]>("/api/benutzer")
      .then(l => setPersonen(l.filter(b => b.aktiv !== false && b.rolle !== "ADMIN").sort((a, b) => a.name.localeCompare(b.name, "de"))))
      .catch(() => {});
  }, [darfFuerAndere, eintrag]);

  async function speichern(ev: FormEvent) {
    ev.preventDefault();
    setFehler(""); setSpeichert(true);
    try {
      const daten = { benutzerId, von, bis: bis || von, grund };
      if (eintrag) await api.abwesenheiten.aendern(eintrag.id, daten);
      else await api.abwesenheiten.anlegen(daten);
      onGespeichert();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler");
    } finally {
      setSpeichert(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <form onSubmit={speichern} className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{eintrag ? "Abwesenheit ändern" : "Abwesenheit eintragen"}</h2>
          <button type="button" onClick={onSchliessen} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          {eintrag ? (
            <p className="text-sm text-gray-700"><span className="text-gray-500">Person:</span> {eintrag.benutzer.name}</p>
          ) : darfFuerAndere && (
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Person</span>
              <select value={benutzerId} onChange={e => setBenutzerId(e.target.value)} className={eingabeKlasse}>
                {personen.length === 0 && <option value={ichId}>Ich</option>}
                {personen.map(p => <option key={p.id} value={p.id}>{p.name}{p.id === ichId ? " (ich)" : ""}</option>)}
              </select>
            </label>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Von</span>
              <input type="date" required value={von} className={eingabeKlasse}
                onChange={e => { setVon(e.target.value); if (!bis || bis < e.target.value) setBis(e.target.value); }} />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Bis (einschließlich)</span>
              <input type="date" required value={bis} min={von} onChange={e => setBis(e.target.value)} className={eingabeKlasse} />
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Grund</span>
            <select value={grund} onChange={e => setGrund(e.target.value as AbwesenheitsGrund)} className={eingabeKlasse}>
              {GRUENDE.map(g => <option key={g} value={g}>{ABWESENHEITS_GRUND_LABEL[g]}</option>)}
            </select>
          </label>
          <p className="flex items-start gap-1.5 text-xs text-gray-500">
            <Lock size={12} className="mt-0.5 shrink-0" />
            Den Grund sehen nur die Person selbst sowie Vorsitz und Stellvertretung – alle anderen sehen nur „abwesend“.
          </p>
          {fehler && <p className="text-sm text-red-700">{fehler}</p>}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button type="button" onClick={onSchliessen} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800">Abbrechen</button>
          <button type="submit" disabled={speichert}
            className="bg-[rgb(var(--accent))] hover:brightness-90 disabled:opacity-60 text-white text-sm font-medium px-4 py-1.5 rounded-lg">
            Speichern
          </button>
        </div>
      </form>
    </div>
  );
}
