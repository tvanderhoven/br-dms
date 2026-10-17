/**
 * Einberufung auf Antrag (§ 29 Abs. 3 BetrVG): ein Viertel der Mitglieder oder der
 * Arbeitgeber können eine Sitzung verlangen; sie muss binnen einer Woche nach Zugang
 * des Antrags stattfinden. Mitglieder-Anträge sammeln erst Unterschriften bis zum
 * Quorum, Arbeitgeber-Anträge (kein eigener Login) trägt ein Mitglied stellvertretend
 * ein. Dazu die allgemeine Pflicht, mindestens einmal im Monat zu tagen (Satz 1) –
 * rein clientseitig aus der schon geladenen Sitzungsliste geprüft, kein Blocker.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, Plus, Check, X, Loader2, Clock } from "lucide-react";
import { api, Einberufungsantrag, EinberufungsantragListe, EinberufungsantragTyp, SitzungListItem, Rolle } from "../lib/api";

const datumMitTag = (iso: string) =>
  new Date(iso).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });

function monatsPruefung(liste: SitzungListItem[]) {
  const heute = new Date();
  const relevante = liste.filter(s => !s.gremium && s.sitzungstyp !== "BETRIEBSVERSAMMLUNG");
  const vergangene = relevante.filter(s => new Date(s.sitzungsdatum) <= heute);
  const kommendeBald = relevante.some(s => {
    const tage = (new Date(s.sitzungsdatum).getTime() - heute.getTime()) / 86_400_000;
    return tage > 0 && tage <= 10;
  });
  if (vergangene.length === 0) return { ueberfaellig: false, tageSeit: 0 };
  const letzte = vergangene.reduce((a, b) => (a.sitzungsdatum > b.sitzungsdatum ? a : b));
  const tageSeit = Math.floor((heute.getTime() - new Date(letzte.sitzungsdatum).getTime()) / 86_400_000);
  return { ueberfaellig: tageSeit > 35 && !kommendeBald, tageSeit };
}

export default function EinberufungsantragKarte({ liste, meineRolle }: { liste: SitzungListItem[]; meineRolle: Rolle | null }) {
  const [daten, setDaten]       = useState<EinberufungsantragListe | null>(null);
  const [meinId, setMeinId]     = useState<string | null>(null);
  const [formOffen, setFormOffen] = useState<EinberufungsantragTyp | null>(null);
  const [grund, setGrund]       = useState("");
  const [zugangAm, setZugangAm] = useState("");
  const [speichert, setSpeichert] = useState(false);
  const [aktion, setAktion]     = useState<string | null>(null);
  const [fehler, setFehler]     = useState("");

  function laden() {
    api.einberufungsantraege.liste().then(setDaten).catch(() => {});
  }
  useEffect(laden, []);
  useEffect(() => { api.auth.me().then(b => setMeinId(b.id)).catch(() => {}); }, []);

  const istVorsitz = meineRolle === "VORSITZ" || meineRolle === "STELLVERTRETER";
  const darfAntragStellen = meineRolle && ["VORSITZ", "STELLVERTRETER", "MITGLIED", "ERSATZMITGLIED"].includes(meineRolle);
  const { ueberfaellig, tageSeit } = monatsPruefung(liste);
  const offene = (daten?.antraege ?? []).filter(a => !a.sitzung);

  async function antragStellen() {
    if (!grund.trim() || !formOffen) return;
    setSpeichert(true);
    setFehler("");
    try {
      if (formOffen === "ARBEITGEBER") {
        await api.einberufungsantraege.arbeitgeber({ grund: grund.trim(), zugangAm: zugangAm ? new Date(zugangAm).toISOString() : undefined });
      } else {
        await api.einberufungsantraege.mitglieder({ grund: grund.trim() });
      }
      setFormOffen(null);
      setGrund("");
      setZugangAm("");
      laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler beim Speichern");
    } finally {
      setSpeichert(false);
    }
  }

  async function unterzeichnen(a: Einberufungsantrag, zurueckziehen: boolean) {
    setAktion(a.id);
    setFehler("");
    try {
      if (zurueckziehen) await api.einberufungsantraege.unterschriftZurueckziehen(a.id);
      else await api.einberufungsantraege.unterzeichnen(a.id);
      laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler");
    } finally {
      setAktion(null);
    }
  }

  async function verknuepfen(antragId: string, sitzungId: string) {
    setAktion(antragId);
    setFehler("");
    try {
      await api.einberufungsantraege.verknuepfen(antragId, sitzungId);
      laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler");
    } finally {
      setAktion(null);
    }
  }

  async function loeschen(a: Einberufungsantrag) {
    if (!confirm("Diesen Antrag wirklich löschen?")) return;
    setAktion(a.id);
    try {
      await api.einberufungsantraege.loeschen(a.id);
      laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler");
    } finally {
      setAktion(null);
    }
  }

  if (!ueberfaellig && offene.length === 0 && !formOffen) {
    return darfAntragStellen ? (
      <button
        onClick={() => setFormOffen(istVorsitz ? "ARBEITGEBER" : "MITGLIEDER")}
        className="mb-4 flex items-center gap-1.5 text-xs text-gray-500 hover:text-[rgb(var(--accent))]"
      >
        <Plus size={13} /> Einberufung auf Antrag (§ 29 Abs. 3)
      </button>
    ) : null;
  }

  return (
    <div className={`mb-4 p-4 border rounded-xl space-y-3 ${ueberfaellig ? "bg-red-50 border-red-200" : "bg-white border-gray-200"}`}>
      {ueberfaellig && (
        <p className="flex items-start gap-1.5 text-sm text-red-800">
          <AlertTriangle size={15} className="shrink-0 mt-0.5" />
          Seit {tageSeit} Tagen keine Sitzung – interne Erinnerung: mindestens einmal im Monat tagen.
        </p>
      )}

      {offene.map(a => {
        const mindest = daten?.mindestUnterzeichner ?? 1;
        const anzahl = a.unterzeichner.length;
        const schonUnterzeichnet = a.unterzeichner.some(u => u.benutzerId === meinId);
        const quorumErreicht = !!a.zugangAm;
        return (
          <div key={a.id} className="border border-gray-200 rounded-lg p-3 space-y-1.5 bg-white">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-gray-800">
                  {a.antragstellerTyp === "ARBEITGEBER" ? "Antrag des Arbeitgebers" : "Antrag von Mitgliedern"}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{a.grund}</p>
              </div>
              {istVorsitz && (
                <button onClick={() => loeschen(a)} disabled={aktion === a.id} className="p-1 text-gray-300 hover:text-red-500 shrink-0">
                  <X size={14} />
                </button>
              )}
            </div>

            {quorumErreicht ? (
              <>
                <p className="flex items-center gap-1.5 text-xs text-red-700">
                  <Clock size={12} />
                  Frist läuft{a.fristen[0] ? ` – Sitzung fällig bis ${datumMitTag(a.fristen[0].faelligAm)}` : ""}
                </p>
                {istVorsitz && (
                  <select
                    defaultValue=""
                    onChange={e => e.target.value && verknuepfen(a.id, e.target.value)}
                    className="text-xs border border-gray-300 rounded-lg px-2 py-1 bg-white"
                  >
                    <option value="" disabled>Mit Sitzung verknüpfen…</option>
                    {liste.map(s => <option key={s.id} value={s.id}>{s.titel} ({datumMitTag(s.sitzungsdatum)})</option>)}
                  </select>
                )}
              </>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">{anzahl} von {mindest} Unterschriften nötig</span>
                {darfAntragStellen && !schonUnterzeichnet && (
                  <button
                    onClick={() => unterzeichnen(a, false)}
                    disabled={aktion === a.id}
                    className="flex items-center gap-1 text-xs text-[rgb(var(--accent))] hover:underline"
                  >
                    {aktion === a.id ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                    Mitunterzeichnen
                  </button>
                )}
                {schonUnterzeichnet && (
                  <button
                    onClick={() => unterzeichnen(a, true)}
                    disabled={aktion === a.id}
                    className="flex items-center gap-1 text-xs text-green-700 hover:text-gray-500"
                  >
                    <Check size={11} /> unterzeichnet (zurückziehen)
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {formOffen ? (
        <div className="space-y-2 border-t border-gray-100 pt-3">
          {istVorsitz && (
            <div className="flex gap-3 text-xs">
              <label className="flex items-center gap-1">
                <input type="radio" checked={formOffen === "ARBEITGEBER"} onChange={() => setFormOffen("ARBEITGEBER")} /> Arbeitgeber
              </label>
              <label className="flex items-center gap-1">
                <input type="radio" checked={formOffen === "MITGLIEDER"} onChange={() => setFormOffen("MITGLIEDER")} /> Mitglieder
              </label>
            </div>
          )}
          <textarea
            value={grund}
            onChange={e => setGrund(e.target.value)}
            placeholder="Grund bzw. Gegenstand der Beratung (§ 29 Abs. 3 BetrVG)…"
            rows={2}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
          />
          {formOffen === "ARBEITGEBER" && (
            <label className="block text-xs text-gray-600">
              Zugegangen am (leer = jetzt)
              <input
                type="datetime-local"
                value={zugangAm}
                onChange={e => setZugangAm(e.target.value)}
                className="mt-1 block border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
              />
            </label>
          )}
          {fehler && <p className="text-xs text-red-700">{fehler}</p>}
          <div className="flex gap-2">
            <button
              onClick={antragStellen}
              disabled={speichert || !grund.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-white text-xs rounded-lg disabled:opacity-50"
              style={{ backgroundColor: "rgb(var(--accent))" }}
            >
              {speichert ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              Antrag stellen
            </button>
            <button onClick={() => { setFormOffen(null); setFehler(""); }} className="px-3 py-1.5 text-xs text-gray-600 hover:underline">
              Abbrechen
            </button>
          </div>
        </div>
      ) : darfAntragStellen && (
        <button
          onClick={() => setFormOffen(istVorsitz ? "ARBEITGEBER" : "MITGLIEDER")}
          className="flex items-center gap-1.5 text-xs text-[rgb(var(--accent))] hover:underline"
        >
          <Plus size={12} /> Weiteren Antrag stellen
        </button>
      )}
      {fehler && !formOffen && <p className="text-xs text-red-700">{fehler}</p>}
    </div>
  );
}
