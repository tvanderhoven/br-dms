/**
 * Kosten des Betriebsrats (§ 40 BetrVG) – Jahresübersicht
 *
 * BR-Schulungen (Qualifikation mit Haken „BR-Schulung“) erscheinen automatisch, alles
 * andere tragen Vorsitz und Stellvertretung von Hand ein. Mitglieder sehen die Übersicht.
 */

import { useEffect, useMemo, useState, FormEvent } from "react";
import { Euro, Plus, Pencil, Trash2, Loader2, X, FileDown, Printer, GraduationCap, Gavel, Paperclip, Lock, Search } from "lucide-react";
import {
  api, BeschlussRegisterEintrag, Dokument, formatDatum, formatEuro, KOSTEN_ART_LABEL, KOSTEN_STATUS_LABEL,
  KostenArt, KostenEingabe, KostenJahr, KostenPosten, KostenStatus, Rolle,
} from "../lib/api";

const STATUS_FARBE: Record<KostenStatus, string> = {
  BEANTRAGT: "bg-amber-100 text-amber-800",
  ZUGESAGT:  "bg-blue-100 text-blue-800",
  BEZAHLT:   "bg-green-100 text-green-800",
  ABGELEHNT: "bg-red-100 text-red-700",
};
const MANUELLE_ARTEN = (Object.keys(KOSTEN_ART_LABEL) as KostenArt[]).filter(a => a !== "SCHULUNG") as KostenEingabe["art"][];
const STATUS_LISTE = Object.keys(KOSTEN_STATUS_LABEL) as KostenStatus[];

const eingabeKlasse =
  "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]";
const knopf =
  "flex items-center gap-1.5 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60";

// PDF im neuen Tab bzw. CSV als Datei – mit Token, darum per fetch statt Link
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

/** "1.234,56" / "1234.5" / "80" → Cent; null = ungültig */
function zuCent(text: string): number | null {
  const t = text.trim().replace(/\s|€/g, "");
  if (!t) return null;
  const normal = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  if (!/^\d+(\.\d{1,2})?$/.test(normal)) return null;
  return Math.round(parseFloat(normal) * 100);
}

export default function Kosten() {
  const [jahr, setJahr]       = useState(new Date().getFullYear());
  const [daten, setDaten]     = useState<KostenJahr | null>(null);
  const [fehler, setFehler]   = useState("");
  const [rolle, setRolle]     = useState<Rolle | null>(null);
  const [bearbeiten, setBearbeiten] = useState<KostenPosten | "neu" | null>(null);
  const [schulungenOffen, setSchulungenOffen] = useState(false);
  const [filterArt, setFilterArt] = useState<KostenArt | "">("");

  const darfAendern = rolle === "VORSITZ" || rolle === "STELLVERTRETER" || rolle === "ADMIN";

  function laden(j = jahr) {
    setFehler("");
    api.kosten.jahr(j).then(setDaten).catch(e => setFehler(e.message));
  }
  useEffect(() => { api.auth.me().then(b => setRolle(b.rolle)).catch(() => {}); }, []);
  useEffect(() => laden(jahr), [jahr]); // eslint-disable-line react-hooks/exhaustive-deps

  const sichtbar = useMemo(
    () => (daten?.posten ?? []).filter(p => !filterArt || p.art === filterArt),
    [daten, filterArt],
  );

  async function loeschen(p: KostenPosten) {
    if (!confirm(`„${p.bezeichnung}“ (${formatEuro(p.betragCent)}) löschen?`)) return;
    try {
      await api.kosten.loeschen(p.id);
      laden();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Fehler");
    }
  }

  const s = daten?.summen;

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgb(var(--accent) / 0.1)" }}>
            <Euro className="w-5 h-5" style={{ color: "rgb(var(--accent))" }} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Kosten des Betriebsrats</h1>
            <p className="text-sm text-gray-500">§ 40 BetrVG – der Arbeitgeber trägt die erforderlichen Kosten</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={jahr} onChange={e => setJahr(Number(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
            aria-label="Jahr">
            {(daten?.jahre ?? [jahr]).map(j => <option key={j} value={j}>{j}</option>)}
          </select>
          <button onClick={() => herunterladen(api.kosten.pdfUrl(jahr))} className={knopf}><Printer size={14} /> PDF</button>
          <button onClick={() => herunterladen(api.kosten.csvUrl(jahr), `BR-Kosten_${jahr}.csv`)} className={knopf}><FileDown size={14} /> CSV</button>
          {darfAendern && (
            <>
              <button onClick={() => setSchulungenOffen(true)} className={knopf}><GraduationCap size={14} /> BR-Schulungen</button>
              <button onClick={() => setBearbeiten("neu")}
                className="flex items-center gap-1.5 bg-[rgb(var(--accent))] hover:brightness-90 text-white text-sm font-medium px-3 py-1.5 rounded-lg">
                <Plus size={15} /> Posten
              </button>
            </>
          )}
        </div>
      </div>

      {fehler && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{fehler}</div>}

      {!daten ? (
        !fehler && <div className="text-sm text-gray-500 flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Laden…</div>
      ) : (
        <>
          {/* Summen */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <Kachel titel={`Summe ${jahr}`} wert={formatEuro(s!.gesamt)} hinweis="ohne abgelehnte Posten" betont />
            <Kachel titel="Offen" wert={formatEuro(s!.nachStatus.BEANTRAGT + s!.nachStatus.ZUGESAGT)} hinweis="beantragt oder zugesagt" />
            <Kachel titel="Bezahlt" wert={formatEuro(s!.nachStatus.BEZAHLT)} />
            <Kachel titel="Abgelehnt" wert={formatEuro(s!.nachStatus.ABGELEHNT)} hinweis={s!.nachStatus.ABGELEHNT > 0 ? "ggf. Beschlussverfahren" : undefined} />
          </div>

          {/* Nach Art */}
          {s!.gesamt > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Nach Art</p>
              <div className="space-y-2">
                {(Object.keys(KOSTEN_ART_LABEL) as KostenArt[]).filter(a => s!.nachArt[a] > 0).map(a => (
                  <button key={a} onClick={() => setFilterArt(filterArt === a ? "" : a)}
                    className={`w-full flex items-center gap-3 text-left rounded px-1 ${filterArt === a ? "bg-accent/5" : "hover:bg-gray-50"}`}
                    title="Klicken: nur diese Art in der Liste zeigen">
                    <span className="text-sm text-gray-700 w-56 shrink-0 truncate">{KOSTEN_ART_LABEL[a]}</span>
                    <span className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <span className="block h-full rounded-full bg-[rgb(var(--accent))]"
                        style={{ width: `${Math.max(2, (s!.nachArt[a] / s!.gesamt) * 100)}%` }} />
                    </span>
                    <span className="text-sm font-medium text-gray-800 w-28 text-right tabular-nums">{formatEuro(s!.nachArt[a])}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Posten */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800 text-sm">
                Posten {jahr} ({sichtbar.length}{filterArt && ` von ${daten.posten.length}`})
              </h2>
              {filterArt && (
                <button onClick={() => setFilterArt("")} className="text-xs text-[rgb(var(--accent))] hover:underline flex items-center gap-1">
                  <X size={12} /> Filter „{KOSTEN_ART_LABEL[filterArt]}“ aufheben
                </button>
              )}
            </div>
            {sichtbar.length === 0 ? (
              <p className="text-sm text-gray-500 px-4 py-6 text-center">
                Keine Posten in {jahr}.{darfAendern && " Mit „+ Posten“ eintragen; BR-Schulungen erscheinen von selbst."}
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 uppercase tracking-wide bg-gray-50 border-b border-gray-100">
                    <th className="px-4 py-2 font-medium">Datum</th>
                    <th className="px-4 py-2 font-medium">Bezeichnung</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium text-right">Betrag</th>
                    {darfAendern && <th className="px-4 py-2" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {sichtbar.map(p => (
                    <tr key={p.id} className={p.status === "ABGELEHNT" ? "text-gray-400" : ""}>
                      <td className="px-4 py-2.5 whitespace-nowrap text-gray-600 align-top">{formatDatum(p.datum)}</td>
                      <td className="px-4 py-2.5 align-top">
                        <p className={`font-medium ${p.status === "ABGELEHNT" ? "line-through" : "text-gray-900"}`}>{p.bezeichnung}</p>
                        <p className="text-xs text-gray-500 flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                          <span>{KOSTEN_ART_LABEL[p.art]}</span>
                          {p.empfaenger && <span>{p.empfaenger}</span>}
                          {p.ausSchulung && <span className="inline-flex items-center gap-1"><GraduationCap size={11} /> aus Schulungen</span>}
                          {p.beschluss && (
                            <span className="inline-flex items-center gap-1" title={p.beschluss.antragstext}>
                              <Gavel size={11} /> {p.beschluss.sitzungTitel}, TOP {p.beschluss.topNummer}
                            </span>
                          )}
                          {p.dokument && (
                            <span className="inline-flex items-center gap-1">
                              {p.dokument.sichtbar ? <Paperclip size={11} /> : <Lock size={11} />} {p.dokument.titel}
                            </span>
                          )}
                        </p>
                        {p.bemerkung && <p className="text-xs text-gray-500 mt-0.5 italic">{p.bemerkung}</p>}
                      </td>
                      <td className="px-4 py-2.5 align-top">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_FARBE[p.status]}`}>
                          {KOSTEN_STATUS_LABEL[p.status]}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap align-top font-medium">{formatEuro(p.betragCent)}</td>
                      {darfAendern && (
                        <td className="px-4 py-2.5 align-top">
                          <div className="flex justify-end gap-1">
                            <button onClick={() => setBearbeiten(p)} title="Bearbeiten"
                              className="p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"><Pencil size={14} /></button>
                            {!p.ausSchulung && (
                              <button onClick={() => loeschen(p)} title="Löschen"
                                className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"><Trash2 size={14} /></button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {bearbeiten && (
        <PostenDialog
          posten={bearbeiten === "neu" ? null : bearbeiten}
          jahr={jahr}
          onSchliessen={() => setBearbeiten(null)}
          onGespeichert={() => { setBearbeiten(null); laden(); }}
        />
      )}
      {schulungenOffen && daten && (
        <BrSchulungenDialog
          liste={daten.brSchulungen}
          onSchliessen={() => setSchulungenOffen(false)}
          onGespeichert={() => { setSchulungenOffen(false); laden(); }}
        />
      )}
    </div>
  );
}

function Kachel({ titel, wert, hinweis, betont = false }: { titel: string; wert: string; hinweis?: string; betont?: boolean }) {
  return (
    <div className={`rounded-xl border shadow-sm p-4 ${betont ? "bg-accent/5 border-accent/25" : "bg-white border-gray-200"}`}>
      <p className="text-xs font-medium text-gray-500">{titel}</p>
      <p className="text-xl font-bold text-gray-900 tabular-nums mt-1">{wert}</p>
      {hinweis && <p className="text-xs text-gray-400 mt-0.5">{hinweis}</p>}
    </div>
  );
}

function Dialog({ titel, onSchliessen, children }: { titel: string; onSchliessen: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{titel}</h2>
          <button onClick={onSchliessen} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function PostenDialog({ posten, jahr, onSchliessen, onGespeichert }: {
  posten: KostenPosten | null; jahr: number; onSchliessen: () => void; onGespeichert: () => void;
}) {
  const ausSchulung = !!posten?.ausSchulung;
  const heute = new Date();
  const vorgabeDatum = jahr === heute.getFullYear() ? heute.toISOString().slice(0, 10) : `${jahr}-01-01`;

  const [datum, setDatum]             = useState(posten ? posten.datum.slice(0, 10) : vorgabeDatum);
  const [art, setArt]                 = useState<KostenEingabe["art"]>(posten && posten.art !== "SCHULUNG" ? posten.art : "SACHMITTEL");
  const [bezeichnung, setBezeichnung] = useState(posten?.bezeichnung ?? "");
  const [empfaenger, setEmpfaenger]   = useState(posten?.empfaenger ?? "");
  const [betrag, setBetrag]           = useState(posten ? (posten.betragCent / 100).toFixed(2).replace(".", ",") : "");
  const [status, setStatus]           = useState<KostenStatus>(posten?.status ?? "BEANTRAGT");
  const [bemerkung, setBemerkung]     = useState(posten?.bemerkung ?? "");
  const [beschluss, setBeschluss]     = useState<{ id: string; text: string } | null>(
    posten?.beschluss ? { id: posten.beschluss.id, text: `${posten.beschluss.sitzungTitel}, TOP ${posten.beschluss.topNummer}` } : null);
  const [dokument, setDokument]       = useState<{ id: string; text: string } | null>(
    posten?.dokument ? { id: posten.dokument.id, text: posten.dokument.titel } : null);
  const [laden, setLaden]             = useState(false);
  const [fehler, setFehler]           = useState("");

  async function speichern(e: FormEvent) {
    e.preventDefault();
    setFehler("");
    const verknuepfung = {
      status, bemerkung: bemerkung.trim() || null,
      beschlussId: beschluss?.id ?? null, dokumentId: dokument?.id ?? null,
    };
    let daten: Partial<KostenEingabe> = verknuepfung;
    if (!ausSchulung) {
      const cent = zuCent(betrag);
      if (cent === null) { setFehler("Betrag bitte als Zahl, z. B. 1.250,00"); return; }
      daten = { ...verknuepfung, datum, art, bezeichnung: bezeichnung.trim(), empfaenger: empfaenger.trim() || null, betragCent: cent };
    }
    setLaden(true);
    try {
      if (posten) await api.kosten.aendern(posten.id, daten);
      else await api.kosten.anlegen(daten as KostenEingabe);
      onGespeichert();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler");
    } finally {
      setLaden(false);
    }
  }

  return (
    <Dialog titel={posten ? "Posten bearbeiten" : "Neuer Posten"} onSchliessen={onSchliessen}>
      <form onSubmit={speichern} className="space-y-4">
        {ausSchulung ? (
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700">
            <p className="font-medium">{posten!.bezeichnung} – {formatEuro(posten!.betragCent)}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Aus den Schulungen ({formatDatum(posten!.datum)}). Datum, Bezeichnung und Betrag dort ändern.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Feld label="Datum *"><input type="date" required value={datum} onChange={e => setDatum(e.target.value)} className={eingabeKlasse} /></Feld>
              <Feld label="Betrag (€) *">
                <input inputMode="decimal" required value={betrag} onChange={e => setBetrag(e.target.value)} placeholder="1.250,00" className={`${eingabeKlasse} text-right`} />
              </Feld>
            </div>
            <Feld label="Art *">
              <select value={art} onChange={e => setArt(e.target.value as KostenEingabe["art"])} className={eingabeKlasse}>
                {MANUELLE_ARTEN.map(a => <option key={a} value={a}>{KOSTEN_ART_LABEL[a]}</option>)}
              </select>
            </Feld>
            <Feld label="Bezeichnung *">
              <input required value={bezeichnung} onChange={e => setBezeichnung(e.target.value)} placeholder="z. B. Gutachten Schichtplan" className={eingabeKlasse} autoFocus={!posten} />
            </Feld>
            <Feld label="Empfänger">
              <input value={empfaenger} onChange={e => setEmpfaenger(e.target.value)} placeholder="Kanzlei, Sachverständige/r, Anbieter" className={eingabeKlasse} />
            </Feld>
          </>
        )}

        <Feld label="Status">
          <div className="flex flex-wrap gap-2">
            {STATUS_LISTE.map(st => (
              <button type="button" key={st} onClick={() => setStatus(st)}
                className={`text-xs font-medium px-3 py-1 rounded-full border ${status === st ? `${STATUS_FARBE[st]} border-transparent` : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}>
                {KOSTEN_STATUS_LABEL[st]}
              </button>
            ))}
          </div>
        </Feld>

        <Feld label="Beschluss" hinweis="Sachverständige (§ 80 Abs. 3), Anwalt und Schulungen brauchen einen BR-Beschluss">
          <BeschlussWahl wert={beschluss} onWahl={setBeschluss} />
        </Feld>
        <Feld label="Rechnung / Kostenzusage">
          <DokumentWahl wert={dokument} onWahl={setDokument} />
        </Feld>
        <Feld label="Bemerkung">
          <textarea value={bemerkung} onChange={e => setBemerkung(e.target.value)} rows={2} className={eingabeKlasse} />
        </Feld>

        {fehler && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{fehler}</div>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onSchliessen} className={knopf}>Abbrechen</button>
          <button type="submit" disabled={laden}
            className="flex items-center gap-1.5 bg-[rgb(var(--accent))] hover:brightness-90 disabled:opacity-60 text-white text-sm font-medium px-4 py-1.5 rounded-lg">
            {laden && <Loader2 size={14} className="animate-spin" />} Speichern
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function Feld({ label, hinweis, children }: { label: string; hinweis?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
      {hinweis && <p className="text-xs text-gray-400 mt-1">{hinweis}</p>}
    </div>
  );
}

/** Gewählter Wert als Chip, sonst Suchfeld mit Trefferliste */
function Auswahl({ wert, onWahl, platzhalter, suchen }: {
  wert: { id: string; text: string } | null;
  onWahl: (w: { id: string; text: string } | null) => void;
  platzhalter: string;
  suchen: (q: string) => Promise<{ id: string; text: string; unter?: string }[]>;
}) {
  const [q, setQ]           = useState("");
  const [treffer, setTreffer] = useState<{ id: string; text: string; unter?: string }[]>([]);

  useEffect(() => {
    if (wert) return;
    const t = setTimeout(() => { suchen(q).then(setTreffer).catch(() => setTreffer([])); }, 250);
    return () => clearTimeout(t);
  }, [q, wert]); // eslint-disable-line react-hooks/exhaustive-deps

  if (wert) {
    return (
      <div className="flex items-center gap-2 border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm">
        <span className="flex-1 truncate">{wert.text}</span>
        <button type="button" onClick={() => { onWahl(null); setQ(""); }} className="text-gray-400 hover:text-gray-600" title="Entfernen"><X size={14} /></button>
      </div>
    );
  }
  return (
    <div>
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={platzhalter} className={`${eingabeKlasse} pl-8`} />
      </div>
      {treffer.length > 0 && (
        <ul className="mt-1 border border-gray-200 rounded-lg max-h-40 overflow-y-auto divide-y divide-gray-50">
          {treffer.slice(0, 8).map(t => (
            <li key={t.id}>
              <button type="button" onClick={() => onWahl({ id: t.id, text: t.text })} className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50">
                <span className="block truncate">{t.text}</span>
                {t.unter && <span className="block text-xs text-gray-400 truncate">{t.unter}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Beschlüsse einmal laden und im Speicher filtern – das Register ist überschaubar
let beschlussCache: Promise<BeschlussRegisterEintrag[]> | null = null;

function BeschlussWahl(props: { wert: { id: string; text: string } | null; onWahl: (w: { id: string; text: string } | null) => void }) {
  return (
    <Auswahl {...props} platzhalter="Beschluss suchen (Text oder Sitzung)…" suchen={async q => {
      beschlussCache ??= api.beschluesse.register();
      const alle = await beschlussCache.catch(() => { beschlussCache = null; return []; });
      const s = q.trim().toLowerCase();
      return alle
        .filter(b => !s || b.antragstext.toLowerCase().includes(s) || b.top.sitzung.titel.toLowerCase().includes(s))
        .map(b => ({ id: b.id, text: `${b.top.sitzung.titel}, TOP ${b.top.nummer}`, unter: b.antragstext }));
    }} />
  );
}

function DokumentWahl(props: { wert: { id: string; text: string } | null; onWahl: (w: { id: string; text: string } | null) => void }) {
  return (
    <Auswahl {...props} platzhalter="Dokument suchen (mind. 2 Zeichen)…" suchen={async q => {
      if (q.trim().length < 2) return [];
      const docs: Dokument[] = await api.dokumente.suche(q.trim());
      return docs.map(d => ({ id: d.id, text: d.alias || d.titel, unter: formatDatum(d.erstelltAm) }));
    }} />
  );
}

function BrSchulungenDialog({ liste, onSchliessen, onGespeichert }: {
  liste: KostenJahr["brSchulungen"]; onSchliessen: () => void; onGespeichert: () => void;
}) {
  const [gewaehlt, setGewaehlt] = useState(new Set(liste.filter(q => q.brSchulung).map(q => q.id)));
  const [laden, setLaden]       = useState(false);
  const [fehler, setFehler]     = useState("");

  async function speichern() {
    setLaden(true);
    try {
      await api.kosten.brSchulungen([...gewaehlt]);
      onGespeichert();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Fehler");
      setLaden(false);
    }
  }

  return (
    <Dialog titel="Welche Schulungen sind BR-Schulungen?" onSchliessen={onSchliessen}>
      <p className="text-sm text-gray-600 mb-4">
        Termine dieser Qualifikationen mit eingetragenen Kosten erscheinen automatisch in der Kostenübersicht
        (§ 37 Abs. 6/7). Arbeitsschutz-Schulungen der Belegschaft (Ersthelfer, Stapler …) gehören nicht dazu.
      </p>
      {liste.length === 0 ? (
        <p className="text-sm text-gray-500">Noch keine Qualifikationen – sie werden unter „Schulungen“ angelegt.</p>
      ) : (
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {liste.map(q => (
            <label key={q.id} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={gewaehlt.has(q.id)} className="rounded border-gray-300"
                onChange={() => setGewaehlt(g => { const n = new Set(g); if (n.has(q.id)) n.delete(q.id); else n.add(q.id); return n; })} />
              {q.name}
            </label>
          ))}
        </div>
      )}
      {fehler && <p className="text-red-700 text-sm mt-3">{fehler}</p>}
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onSchliessen} className={knopf}>Abbrechen</button>
        <button onClick={speichern} disabled={laden}
          className="flex items-center gap-1.5 bg-[rgb(var(--accent))] hover:brightness-90 disabled:opacity-60 text-white text-sm font-medium px-4 py-1.5 rounded-lg">
          {laden && <Loader2 size={14} className="animate-spin" />} Speichern
        </button>
      </div>
    </Dialog>
  );
}
