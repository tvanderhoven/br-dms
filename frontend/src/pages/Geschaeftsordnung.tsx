import { useState, useEffect, FormEvent } from "react";
import { Scale, Plus, Trash2, Edit3, X, Loader2, FileText, AlertTriangle, Gavel } from "lucide-react";
import { api, Geschaeftsordnung, Dokument, BeschlussRegisterEintrag, formatDatum } from "../lib/api";

// Dokument-Downloads brauchen den JWT-Header (Bearer-Token, keine Cookie-Session) —
// ein einfacher <a href> würde daher immer mit "Nicht authentifiziert" scheitern.
// Deshalb: Tab synchron öffnen (Popup-Blocker), Datei authentifiziert laden, als Blob anzeigen.
function dokumentOeffnen(dokumentId: string) {
  const tab = window.open("", "_blank");
  const token = localStorage.getItem("brdms_token");
  fetch(api.dokumente.downloadUrl(dokumentId), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
    .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.blob(); })
    .then(blob => {
      const url = URL.createObjectURL(blob);
      if (tab) tab.location.href = url;
      else window.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    })
    .catch(err => {
      if (tab) tab.close();
      alert(err instanceof Error ? err.message : "Dokument konnte nicht geöffnet werden");
    });
}

export default function GeschaeftsordnungSeite() {
  const [liste, setListe]           = useState<Geschaeftsordnung[]>([]);
  const [laden, setLaden]           = useState(true);
  const [modal, setModal]           = useState(false);
  const [bearbeitet, setBearbeitet] = useState<Geschaeftsordnung | null>(null);

  function laden_() {
    setLaden(true);
    api.geschaeftsordnung.liste()
      .then(setListe)
      .catch(console.error)
      .finally(() => setLaden(false));
  }

  useEffect(laden_, []);

  async function loeschen(id: string) {
    if (!confirm("Diese Fassung der Geschäftsordnung wirklich aus dem Register löschen?")) return;
    try {
      await api.geschaeftsordnung.loeschen(id);
      setListe(prev => prev.filter(g => g.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Fehler beim Löschen");
    }
  }

  const aktuelleId = liste[0]?.id; // Liste kommt sortiert nach beschlossenAm absteigend

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgb(var(--accent) / 0.1)" }}>
            <Scale className="w-5 h-5" style={{ color: "rgb(var(--accent))" }} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Geschäftsordnung</h1>
            <p className="text-sm text-gray-500">Grundlagendokument des Betriebsrats nach § 36 BetrVG</p>
          </div>
        </div>
        <button
          onClick={() => { setBearbeitet(null); setModal(true); }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white hover:brightness-90 transition-colors"
          style={{ backgroundColor: "rgb(var(--accent))" }}
        >
          <Plus size={16} /> Neue Fassung
        </button>
      </div>

      {laden ? (
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Lade…
        </div>
      ) : liste.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Scale size={40} className="mx-auto mb-3 opacity-20" />
          <p className="font-medium">Noch keine Geschäftsordnung erfasst</p>
          <p className="text-sm mt-1">Klicke auf „Neue Fassung" um die aktuell gültige Geschäftsordnung abzulegen.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs text-gray-500 uppercase">
                <th className="px-4 py-2.5">Beschlossen am</th>
                <th className="px-4 py-2.5">Bemerkung</th>
                <th className="px-4 py-2.5">Dokument</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {liste.map(g => (
                <tr key={g.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-900">
                    {formatDatum(g.beschlossenAm)}
                    {g.id === aktuelleId && (
                      <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded-full border text-green-700 bg-green-50 border-green-200">
                        Aktuell gültig
                      </span>
                    )}
                    {g.goMehrheitErreicht === false && (
                      <span
                        className="ml-2 inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border text-red-700 bg-red-50 border-red-200"
                        title="§ 36 BetrVG: Beschlüsse über die Geschäftsordnung brauchen die Mehrheit aller Mitglieder, nicht nur der Anwesenden"
                      >
                        <AlertTriangle size={11} /> Keine Mehrheit aller Mitglieder
                      </span>
                    )}
                    {g.beschluss && (
                      <span className="block text-xs text-gray-400 font-normal mt-0.5">
                        <Gavel size={11} className="inline -mt-0.5 mr-1" />
                        {g.beschluss.jaStimmen} von {g.beschluss.sollStaerke ?? "?"} Mitgliedern – {g.beschluss.top.sitzung.titel}, TOP {g.beschluss.top.nummer}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">
                    {g.bemerkung ?? "–"}
                    {g.videoErlaubt && (
                      <span className="block text-xs text-gray-400 mt-0.5" title={g.videoBedingungen ?? undefined}>
                        Video/Telefon erlaubt{g.videoNichtVertraulich ? ", nicht bei vertraulichen TOPs" : ""}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {g.dokument ? (
                      <button
                        onClick={() => dokumentOeffnen(g.dokument!.id)}
                        className="inline-flex items-center gap-1 text-[rgb(var(--accent))] hover:underline"
                      >
                        <FileText size={13} /> {g.dokument.titel}
                      </button>
                    ) : "–"}
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <button
                      onClick={() => { setBearbeitet(g); setModal(true); }}
                      className="p-1.5 text-gray-400 hover:text-[rgb(var(--accent))] hover:bg-accent/5 rounded-sm transition-colors"
                      title="Bearbeiten"
                    >
                      <Edit3 size={14} />
                    </button>
                    <button
                      onClick={() => loeschen(g.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-sm transition-colors"
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
        <GeschaeftsordnungModal
          eintrag={bearbeitet}
          vergebeneBeschlussIds={liste.filter(g => g.id !== bearbeitet?.id).map(g => g.beschlussId).filter((x): x is string => !!x)}
          onSchliessen={() => setModal(false)}
          onErfolg={() => { setModal(false); laden_(); }}
        />
      )}
    </div>
  );
}

// ── Modal: Fassung anlegen / bearbeiten ─────────────────────────────
function GeschaeftsordnungModal({
  eintrag, vergebeneBeschlussIds, onSchliessen, onErfolg,
}: {
  eintrag: Geschaeftsordnung | null;
  vergebeneBeschlussIds: string[];
  onSchliessen: () => void;
  onErfolg: () => void;
}) {
  const [modus, setModus]                 = useState<"beschluss" | "manuell">(eintrag && !eintrag.beschlussId ? "manuell" : "beschluss");
  const [beschlussId, setBeschlussId]     = useState(eintrag?.beschlussId ?? "");
  const [beschluesse, setBeschluesse]     = useState<BeschlussRegisterEintrag[]>([]);
  const [beschlossenAm, setBeschlossenAm] = useState(eintrag?.beschlossenAm?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [bemerkung, setBemerkung]         = useState(eintrag?.bemerkung ?? "");
  const [dokumentId, setDokumentId]       = useState(eintrag?.dokumentId ?? "");
  // § 30 Abs. 2 Nr. 1 BetrVG: Teilnahme per Video/Telefon (Roadmap Paket 6)
  const [videoErlaubt, setVideoErlaubt]   = useState(eintrag?.videoErlaubt ?? false);
  const [videoNichtVertraulich, setVideoNichtVertraulich] = useState(eintrag?.videoNichtVertraulich ?? false);
  const [videoBedingungen, setVideoBedingungen] = useState(eintrag?.videoBedingungen ?? "");
  const [dokumente, setDokumente]         = useState<Dokument[]>([]);
  const [laden, setLaden]                 = useState(false);
  const [fehler, setFehler]               = useState("");

  useEffect(() => {
    api.dokumente.liste()
      .then(alle => setDokumente(alle.filter(d => d.kategorie === "GESCHAEFTSORDNUNG")))
      .catch(() => {});
    api.beschluesse.register()
      .then(alle => setBeschluesse(alle.filter(b => !vergebeneBeschlussIds.includes(b.id))))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const gewaehlterBeschluss = beschluesse.find(b => b.id === beschlussId) ?? (eintrag?.beschluss as BeschlussRegisterEintrag | undefined);
  const mehrheitWarnung = modus === "beschluss" && gewaehlterBeschluss && gewaehlterBeschluss.sollStaerke != null
    && gewaehlterBeschluss.jaStimmen <= gewaehlterBeschluss.sollStaerke / 2;

  async function speichern(e: FormEvent) {
    e.preventDefault();
    if (modus === "beschluss" && !beschlussId) { setFehler("Bitte einen Beschluss wählen"); return; }
    if (modus === "manuell" && !beschlossenAm) { setFehler("Beschlossen am ist Pflicht"); return; }
    setFehler("");
    setLaden(true);
    try {
      const daten = {
        ...(modus === "beschluss" ? { beschlussId } : { beschlossenAm, beschlussId: null }),
        bemerkung: bemerkung.trim() || undefined,
        dokumentId: dokumentId || null,
        videoErlaubt,
        videoNichtVertraulich: videoErlaubt && videoNichtVertraulich,
        videoBedingungen: videoErlaubt ? videoBedingungen.trim() || null : null,
      };
      if (eintrag) await api.geschaeftsordnung.aktualisieren(eintrag.id, daten);
      else         await api.geschaeftsordnung.erstellen(daten);
      onErfolg();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler beim Speichern");
    } finally {
      setLaden(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">{eintrag ? "Fassung bearbeiten" : "Neue Fassung"}</h2>
          <button onClick={onSchliessen} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <form onSubmit={speichern} className="space-y-4">
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={modus === "beschluss"} onChange={() => setModus("beschluss")} /> Aus Beschluss
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={modus === "manuell"} onChange={() => setModus("manuell")} /> Datum von Hand (historisch/ohne Systembeschluss)
            </label>
          </div>

          {modus === "beschluss" ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Beschluss *</label>
              <select required value={beschlussId} onChange={e => setBeschlussId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-[rgb(var(--accent))]">
                <option value="">– wählen –</option>
                {beschluesse.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.top.sitzung.titel}, TOP {b.top.nummer} ({formatDatum(b.finalisiertAm ?? b.top.sitzung.sitzungsdatum)}) – {b.antragstext.slice(0, 40)}
                  </option>
                ))}
              </select>
              {beschluesse.length === 0 && (
                <p className="text-xs text-gray-400 mt-1">Keine freien finalisierten Beschlüsse gefunden.</p>
              )}
              {gewaehlterBeschluss && (
                <p className="text-xs text-gray-500 mt-1.5">
                  {gewaehlterBeschluss.jaStimmen} Ja-Stimmen von {gewaehlterBeschluss.sollStaerke ?? "?"} Mitgliedern insgesamt
                </p>
              )}
              {mehrheitWarnung && (
                <p className="flex items-start gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-1.5">
                  <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                  Keine Mehrheit aller Mitglieder (§ 36 BetrVG verlangt mehr als die Hälfte der
                  Mitglieder, nicht nur der Anwesenden). Trotzdem speicherbar, aber rechtlich angreifbar.
                </p>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Beschlossen am *</label>
              <input type="date" required value={beschlossenAm} autoFocus onChange={e => setBeschlossenAm(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-[rgb(var(--accent))]" />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Verknüpftes Dokument</label>
            <select value={dokumentId} onChange={e => setDokumentId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-[rgb(var(--accent))]">
              <option value="">– keins –</option>
              {dokumente.map(d => <option key={d.id} value={d.id}>{d.titel}</option>)}
            </select>
            {dokumente.length === 0 && (
              <p className="text-xs text-gray-400 mt-1">
                Kein Dokument mit Kategorie „Geschäftsordnung" gefunden – erst in Dokumente hochladen.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bemerkung</label>
            <textarea rows={2} value={bemerkung} onChange={e => setBemerkung(e.target.value)}
              placeholder="z.B. löst die Fassung vom ... ab"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-[rgb(var(--accent))] resize-y" />
          </div>

          <fieldset className="border border-gray-200 rounded-lg px-3 py-2 space-y-2">
            <legend className="text-sm font-medium text-gray-700 px-1">Sitzung per Video/Telefon (§ 30 Abs. 2 BetrVG)</legend>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={videoErlaubt} onChange={e => setVideoErlaubt(e.target.checked)}
                className="rounded-sm border-gray-300 text-[rgb(var(--accent))]" />
              Teilnahme per Video-/Telefonkonferenz erlaubt
            </label>
            {videoErlaubt && (
              <>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={videoNichtVertraulich} onChange={e => setVideoNichtVertraulich(e.target.checked)}
                    className="rounded-sm border-gray-300 text-[rgb(var(--accent))]" />
                  Nicht bei vertraulichen TOPs
                </label>
                <textarea rows={2} value={videoBedingungen} onChange={e => setVideoBedingungen(e.target.value)}
                  placeholder="Weitere Bedingungen laut Geschäftsordnung, z. B. nur in begründeten Fällen, Kamera an"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-[rgb(var(--accent))] resize-y" />
              </>
            )}
            <p className="text-xs text-gray-400">
              Ohne diese Regel finden alle Sitzungen in Präsenz statt. Die Präsenzsitzung hat Vorrang; widerspricht ein Viertel der
              Mitglieder, gilt das für die einzelne Sitzung nicht.
            </p>
          </fieldset>

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
              {eintrag ? "Speichern" : "Erstellen"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
