import { useState, useEffect, useMemo, useRef, FormEvent, ChangeEvent } from "react";
import { Wallet, Plus, Trash2, Download, Upload, X, Loader2, Edit3, Filter, AlertTriangle, UserCog, List, BarChart3 } from "lucide-react";
import {
  api, GehaltsstufenEintrag, Abteilung, Mitarbeiter, GehaltstabelleImportZusammenfassung, formatDatum,
  Beschaeftigungsart, ALLE_BESCHAEFTIGUNGSARTEN, BESCHAEFTIGUNGSART_FARBE, BESCHAEFTIGUNGSART_KUERZEL, BESCHAEFTIGUNGSART_LABEL,
} from "../lib/api";
import MitarbeiterBearbeitenModal from "../components/MitarbeiterBearbeitenModal";
import Sichtschutz from "../components/Sichtschutz";

// ── Gehaltsstufen-Format: Zeitmodell(A-D):Gruppe(1-6).Stufe(1-4), z.B. "B:3.2" ──
const GEHALTSSTUFE_REGEX = /^([A-Da-d]):([1-6])\.([1-4])$/;
const ZEITMODELLE = ["A", "B", "C", "D"];
const GRUPPEN = [1, 2, 3, 4, 5, 6];
const STUFEN = [1, 2, 3, 4];

interface GeparsteStufe { zeitmodell: string; gruppe: number; stufe: number; }

function parseGehaltsstufe(stufe: string): GeparsteStufe | null {
  const treffer = stufe.trim().match(GEHALTSSTUFE_REGEX);
  if (!treffer) return null;
  return { zeitmodell: treffer[1].toUpperCase(), gruppe: Number(treffer[2]), stufe: Number(treffer[3]) };
}

export default function Gehaltstabelle() {
  const [liste, setListe]           = useState<GehaltsstufenEintrag[]>([]);
  const [abteilungen, setAbteilungen] = useState<Abteilung[]>([]);
  const [mitarbeiterListe, setMitarbeiterListe] = useState<Mitarbeiter[]>([]);
  const [laden, setLaden]           = useState(true);
  const [modal, setModal]           = useState(false);
  const [bearbeitet, setBearbeitet] = useState<GehaltsstufenEintrag | null>(null);
  const [neuerEintragFuerId, setNeuerEintragFuerId] = useState<string | undefined>(undefined);
  const [bearbeiteterMitarbeiter, setBearbeiteterMitarbeiter] = useState<Mitarbeiter | null>(null);
  const [mitarbeiterIdsMitEintrag, setMitarbeiterIdsMitEintrag] = useState<Set<string>>(new Set());
  const [alleEintraege, setAlleEintraege] = useState<GehaltsstufenEintrag[]>([]);
  const [tab, setTab] = useState<"liste" | "statistik">("liste");

  const importInputRef = useRef<HTMLInputElement>(null);
  const [importDatei, setImportDatei] = useState<File | null>(null);
  const [importVorschau, setImportVorschau] = useState<GehaltstabelleImportZusammenfassung | null>(null);
  const [importLaden, setImportLaden]   = useState(false);
  const [importFehler, setImportFehler] = useState("");

  const [filterAbteilung, setFilterAbteilung]   = useState("");
  const [filterMitarbeiter, setFilterMitarbeiter] = useState("");
  const [filterVon, setFilterVon]   = useState("");
  const [filterBis, setFilterBis]   = useState("");
  const [nurAktive, setNurAktive]   = useState(false);

  useEffect(() => {
    api.abteilungen.liste().then(setAbteilungen).catch(() => {});
    api.mitarbeiter.liste().then(setMitarbeiterListe).catch(() => {});
    // Ungefiltert laden, unabhängig von den Filtern oben – für die "ohne Eintrag"-
    // Prüfung und als Datenbasis für die Statistik.
    api.gehaltstabelle.liste({}).then(alle => {
      setAlleEintraege(alle);
      setMitarbeiterIdsMitEintrag(new Set(alle.map(e => e.mitarbeiterId)));
    }).catch(() => {});
  }, []);

  // Nur für den Filter oben: Abteilungen ohne jeden Mitarbeiter (weder im
  // Personalstamm noch dadurch in der Gehaltstabelle) blähen den Filter nur
  // unnötig auf. Beim Anlegen/Zuordnen von Mitarbeitern bleiben alle wählbar.
  const abteilungenMitMitarbeitern = useMemo(
    () => abteilungen.filter(a => mitarbeiterListe.some(m => m.abteilungId === a.id)),
    [abteilungen, mitarbeiterListe],
  );

  const mitarbeiterOhneEintrag = mitarbeiterListe.filter(m =>
    !mitarbeiterIdsMitEintrag.has(m.id) &&
    !m.gehaltIgnorieren &&
    (!nurAktive || !m.austritt || new Date(m.austritt) >= new Date())
  );

  async function ignorieren(id: string) {
    const aktualisiert = await api.mitarbeiter.aktualisieren(id, { gehaltIgnorieren: true });
    setMitarbeiterListe(prev => prev.map(m => m.id === id ? aktualisiert : m));
  }

  useEffect(() => { laden_(); }, [filterAbteilung, filterMitarbeiter, filterVon, filterBis]); // eslint-disable-line react-hooks/exhaustive-deps

  const listeGefiltert = nurAktive
    ? liste.filter(e => !e.mitarbeiter.austritt || new Date(e.mitarbeiter.austritt) >= new Date())
    : liste;

  async function laden_() {
    setLaden(true);
    try {
      const eintraege = await api.gehaltstabelle.liste({
        abteilungId:   filterAbteilung || undefined,
        mitarbeiterId: filterMitarbeiter || undefined,
        von:           filterVon || undefined,
        bis:           filterBis || undefined,
      });
      setListe(eintraege);
      // "Ohne Eintrag"-Liste und Statistik halten sich unabhängig von den Filtern oben aktuell
      api.gehaltstabelle.liste({}).then(alle => {
        setAlleEintraege(alle);
        setMitarbeiterIdsMitEintrag(new Set(alle.map(e => e.mitarbeiterId)));
      }).catch(() => {});
    } finally {
      setLaden(false);
    }
  }

  function vorlageHerunterladen() {
    const url = api.gehaltstabelle.vorlageUrl();
    const token = localStorage.getItem("brdms_token");
    fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.blob(); })
      .then(blob => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "gehaltstabelle_vorlage.csv";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      })
      .catch(err => alert(`Vorlage konnte nicht geladen werden: ${err instanceof Error ? err.message : err}`));
  }

  async function loeschen(id: string) {
    if (!confirm("Eintrag wirklich löschen?")) return;
    try {
      await api.gehaltstabelle.loeschen(id);
      setListe(prev => prev.filter(e => e.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Fehler beim Löschen");
    }
  }

  async function importDateiGewaehlt(e: ChangeEvent<HTMLInputElement>) {
    const datei = e.target.files?.[0];
    e.target.value = ""; // erlaubt erneute Auswahl derselben Datei
    if (!datei) return;

    setImportDatei(datei);
    setImportFehler("");
    setImportLaden(true);
    try {
      const vorschau = await api.gehaltstabelle.import(datei, true);
      setImportVorschau(vorschau);
    } catch (err) {
      setImportFehler(err instanceof Error ? err.message : "Vorschau fehlgeschlagen");
      setImportDatei(null);
    } finally {
      setImportLaden(false);
    }
  }

  async function importBestaetigen() {
    if (!importDatei) return;
    setImportLaden(true);
    setImportFehler("");
    try {
      await api.gehaltstabelle.import(importDatei, false);
      setImportVorschau(null);
      setImportDatei(null);
      await Promise.all([
        laden_(),
        api.abteilungen.liste().then(setAbteilungen).catch(() => {}),
        api.mitarbeiter.liste().then(setMitarbeiterListe).catch(() => {}),
      ]);
      alert("Import erfolgreich abgeschlossen.");
    } catch (err) {
      setImportFehler(err instanceof Error ? err.message : "Import fehlgeschlagen");
    } finally {
      setImportLaden(false);
    }
  }

  function importAbbrechen() {
    setImportVorschau(null);
    setImportDatei(null);
    setImportFehler("");
  }

  function aufMitarbeiterSpringen(mitarbeiterId: string) {
    setFilterMitarbeiter(mitarbeiterId);
    setTab("liste");
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgb(var(--accent) / 0.1)" }}>
            <Wallet className="w-5 h-5" style={{ color: "rgb(var(--accent))" }} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Gehaltstabelle</h1>
            <p className="text-sm text-gray-500">Gehaltsstufen-Historie je Mitarbeiter</p>
          </div>
        </div>
        <div className="flex gap-2">
          <input
            ref={importInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={importDateiGewaehlt}
          />
          <button
            onClick={() => importInputRef.current?.click()}
            disabled={importLaden}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60"
          >
            {importLaden ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} Import (CSV)
          </button>
          <button
            onClick={vorlageHerunterladen}
            title="Leere CSV mit den richtigen Spaltenüberschriften zum Ausfüllen – kein Datenexport"
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Download size={16} /> Vorlage (CSV)
          </button>
          <button
            onClick={() => { setBearbeitet(null); setNeuerEintragFuerId(undefined); setModal(true); }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white hover:brightness-90 transition-colors"
            style={{ backgroundColor: "rgb(var(--accent))" }}
          >
            <Plus size={16} /> Neuer Eintrag
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab("liste")}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === "liste" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
        >
          <List size={14} /> Liste
        </button>
        <button
          onClick={() => setTab("statistik")}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === "statistik" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
        >
          <BarChart3 size={14} /> Statistik
        </button>
      </div>

      {importFehler && !importVorschau && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl mb-5 flex items-center gap-2">
          <AlertTriangle size={16} /> {importFehler}
        </div>
      )}

      {tab === "statistik" && (
        <StatistikTab eintraege={alleEintraege} nurAktive={nurAktive} aufMitarbeiterSpringen={aufMitarbeiterSpringen} />
      )}

      {tab === "liste" && (
      <>
      {/* Filter */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5 flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-1.5 text-gray-400 text-xs">
          <Filter size={14} /> Filter:
        </div>
        <select
          value={filterAbteilung}
          onChange={e => setFilterAbteilung(e.target.value)}
          className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
        >
          <option value="">Alle Abteilungen</option>
          {abteilungenMitMitarbeitern.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select
          value={filterMitarbeiter}
          onChange={e => setFilterMitarbeiter(e.target.value)}
          className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
        >
          <option value="">Alle Mitarbeiter</option>
          {mitarbeiterListe.map(m => <option key={m.id} value={m.id}>{m.nachname}, {m.vorname}</option>)}
        </select>
        <input
          type="date"
          value={filterVon}
          onChange={e => setFilterVon(e.target.value)}
          className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
        />
        <span className="text-xs text-gray-400">bis</span>
        <input
          type="date"
          value={filterBis}
          onChange={e => setFilterBis(e.target.value)}
          className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
        />
        {(filterAbteilung || filterMitarbeiter || filterVon || filterBis) && (
          <button
            onClick={() => { setFilterAbteilung(""); setFilterMitarbeiter(""); setFilterVon(""); setFilterBis(""); }}
            className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
          >
            <X size={12} /> Zurücksetzen
          </button>
        )}
      </div>

      <label className="flex items-center gap-1.5 text-xs text-gray-600 mb-3 cursor-pointer w-fit">
        <input
          type="checkbox"
          checked={nurAktive}
          onChange={e => setNurAktive(e.target.checked)}
          className="rounded border-gray-300 focus:ring-2 focus:ring-[rgb(var(--accent))]"
        />
        Nur aktive Mitarbeiter
      </label>

      {mitarbeiterOhneEintrag.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={15} className="text-amber-600" />
            <p className="text-sm font-medium text-amber-900">
              {mitarbeiterOhneEintrag.length} Mitarbeiter ohne Gehaltseintrag
            </p>
          </div>
          <ul className="space-y-1 max-h-48 overflow-y-auto">
            {mitarbeiterOhneEintrag.map(m => (
              <li key={m.id} className="flex items-center justify-between text-sm bg-white border border-amber-100 rounded-lg px-3 py-1.5">
                <span className="text-gray-700">
                  {m.nachname}, {m.vorname}
                  {m.abteilung?.name && <span className="text-gray-400"> · {m.abteilung.name}</span>}
                </span>
                <span className="flex items-center gap-3 shrink-0">
                  <button
                    onClick={() => { setBearbeitet(null); setNeuerEintragFuerId(m.id); setModal(true); }}
                    className="text-xs text-amber-700 hover:text-amber-900 font-medium flex items-center gap-1"
                  >
                    <Plus size={12} /> Eintrag
                  </button>
                  <button
                    onClick={() => ignorieren(m.id)}
                    title="Nicht gehaltsrelevant (z.B. GF, Ausbildung) – nicht mehr in dieser Liste anzeigen"
                    className="text-xs text-gray-400 hover:text-gray-600 font-medium"
                  >
                    Ignorieren
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-gray-500 mb-3">
        {laden ? "Lade…" : `${listeGefiltert.length} Eintrag${listeGefiltert.length !== 1 ? "e" : ""} gefunden`}
      </p>

      {/* Tabelle */}
      {laden ? (
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Lade…
        </div>
      ) : listeGefiltert.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Wallet size={40} className="mx-auto mb-3 opacity-20" />
          <p className="font-medium">Noch keine Einträge</p>
          <p className="text-sm mt-1">Klicke auf „Neuer Eintrag" um eine Gehaltsstufe zu erfassen.</p>
        </div>
      ) : (
        <Sichtschutz>
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs text-gray-500 uppercase">
                  <th className="px-4 py-2.5">PNR</th>
                  <th className="px-4 py-2.5">Name</th>
                  <th className="px-4 py-2.5">Abteilung</th>
                  <th className="px-4 py-2.5">Gehaltsstufe</th>
                  <th className="px-4 py-2.5">Gültig ab</th>
                  <th className="px-4 py-2.5">Bemerkung</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {listeGefiltert.map(e => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-500">{e.mitarbeiter.pnr ?? "–"}</td>
                    <td className="px-4 py-2.5 font-medium text-gray-900">
                      <span className="inline-flex items-center gap-1.5">
                        {e.mitarbeiter.nachname}, {e.mitarbeiter.vorname}
                        {e.mitarbeiter.beschaeftigungsart && e.mitarbeiter.beschaeftigungsart !== "MITARBEITER" && (
                          <span
                            className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${BESCHAEFTIGUNGSART_FARBE[e.mitarbeiter.beschaeftigungsart].badge}`}
                            title={BESCHAEFTIGUNGSART_LABEL[e.mitarbeiter.beschaeftigungsart]}
                          >
                            {BESCHAEFTIGUNGSART_KUERZEL[e.mitarbeiter.beschaeftigungsart]}
                          </span>
                        )}
                        <button
                          onClick={() => setBearbeiteterMitarbeiter(mitarbeiterListe.find(m => m.id === e.mitarbeiterId) ?? null)}
                          className="text-gray-300 hover:text-[rgb(var(--accent))] transition-colors"
                          title="Stammdaten bearbeiten (Name, Ein-/Austritt, Abteilung)"
                        >
                          <UserCog size={13} />
                        </button>
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{e.mitarbeiter.abteilung?.name ?? "–"}</td>
                    <td className="px-4 py-2.5 text-gray-800 font-medium">{e.stufe}</td>
                    <td className="px-4 py-2.5 text-gray-600">{formatDatum(e.gueltigAb)}</td>
                    <td className="px-4 py-2.5 text-gray-500">{e.bemerkung ?? "–"}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <button
                        onClick={() => { setBearbeitet(e); setModal(true); }}
                        className="p-1.5 text-gray-400 hover:text-[rgb(var(--accent))] hover:bg-blue-50 rounded transition-colors"
                        title="Bearbeiten"
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        onClick={() => loeschen(e.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
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
        </Sichtschutz>
      )}
      </>
      )}

      {modal && (
        <EintragModal
          eintrag={bearbeitet}
          vorausgewaehlterMitarbeiterId={neuerEintragFuerId}
          mitarbeiterListe={mitarbeiterListe}
          abteilungen={abteilungen}
          onMitarbeiterErstellt={m => setMitarbeiterListe(prev => [...prev, m])}
          onSchliessen={() => setModal(false)}
          onErfolg={() => { setModal(false); laden_(); }}
        />
      )}

      {importVorschau && (
        <ImportVorschauModal
          vorschau={importVorschau}
          fehlerText={importFehler}
          laden={importLaden}
          onBestaetigen={importBestaetigen}
          onAbbrechen={importAbbrechen}
        />
      )}

      {bearbeiteterMitarbeiter && (
        <MitarbeiterBearbeitenModal
          mitarbeiter={bearbeiteterMitarbeiter}
          abteilungen={abteilungen}
          standorte={[...new Set(mitarbeiterListe.map(m => m.standort).filter((s): s is string => !!s))].sort()}
          onSchliessen={() => setBearbeiteterMitarbeiter(null)}
          onErfolg={async aktualisiert => {
            setMitarbeiterListe(prev => prev.map(m => m.id === aktualisiert.id ? aktualisiert : m));
            setBearbeiteterMitarbeiter(null);
            await laden_();
          }}
        />
      )}
    </div>
  );
}

// ── Modal: Import-Vorschau (Dry-Run) / Bestätigung ─────────────────
function ImportVorschauModal({
  vorschau, fehlerText, laden, onBestaetigen, onAbbrechen,
}: {
  vorschau: GehaltstabelleImportZusammenfassung;
  fehlerText: string;
  laden: boolean;
  onBestaetigen: () => void;
  onAbbrechen: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">Import-Vorschau</h2>
          <button onClick={onAbbrechen} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="text-xs text-gray-500">Neue Abteilungen</div>
              <div className="text-lg font-bold text-gray-900">{vorschau.neueAbteilungen.length}</div>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="text-xs text-gray-500">Neue Mitarbeiter</div>
              <div className="text-lg font-bold text-gray-900">{vorschau.neueMitarbeiter.length}</div>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="text-xs text-gray-500">Neue Einträge</div>
              <div className="text-lg font-bold text-gray-900">{vorschau.neueEintraege}</div>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="text-xs text-gray-500">Übersprungen / Fehler</div>
              <div className="text-lg font-bold text-gray-900">{vorschau.uebersprungen.length} / {vorschau.fehler.length}</div>
            </div>
          </div>

          {vorschau.neueAbteilungen.length > 0 && (
            <div>
              <p className="font-medium text-gray-700 mb-1">Neue Abteilungen</p>
              <ul className="list-disc list-inside text-gray-600 space-y-0.5">
                {vorschau.neueAbteilungen.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </div>
          )}

          {vorschau.neueMitarbeiter.length > 0 && (
            <div>
              <p className="font-medium text-gray-700 mb-1">Neue Mitarbeiter</p>
              <ul className="list-disc list-inside text-gray-600 space-y-0.5 max-h-32 overflow-y-auto">
                {vorschau.neueMitarbeiter.map((m, i) => <li key={i}>{m.name}{m.pnr ? ` (PNR ${m.pnr})` : ""}</li>)}
              </ul>
            </div>
          )}

          {vorschau.geaendert.length > 0 && (
            <div>
              <p className="font-medium text-amber-700 mb-1">Geänderte Abteilungen</p>
              <ul className="list-disc list-inside text-amber-700 space-y-0.5 max-h-32 overflow-y-auto">
                {vorschau.geaendert.map((g, i) => <li key={i}>{g.grund}</li>)}
              </ul>
            </div>
          )}

          {vorschau.uebersprungen.length > 0 && (
            <div>
              <p className="font-medium text-gray-700 mb-1">Übersprungene Zeilen</p>
              <ul className="list-disc list-inside text-gray-600 space-y-0.5 max-h-32 overflow-y-auto">
                {vorschau.uebersprungen.map((u, i) => <li key={i}>Zeile {u.zeile}: {u.grund}</li>)}
              </ul>
            </div>
          )}

          {vorschau.fehler.length > 0 && (
            <div>
              <p className="font-medium text-red-700 mb-1">Fehler</p>
              <ul className="list-disc list-inside text-red-600 space-y-0.5 max-h-32 overflow-y-auto">
                {vorschau.fehler.map((f, i) => <li key={i}>Zeile {f.zeile}: {f.grund}</li>)}
              </ul>
            </div>
          )}

          {fehlerText && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{fehlerText}</div>
          )}
        </div>

        <div className="flex gap-3 pt-5">
          <button type="button" onClick={onAbbrechen}
            className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
            Abbrechen
          </button>
          <button type="button" onClick={onBestaetigen} disabled={laden}
            className="flex-1 hover:brightness-90 disabled:opacity-60 text-white py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
            style={{ backgroundColor: "rgb(var(--accent))" }}>
            {laden && <Loader2 size={14} className="animate-spin" />}
            Import bestätigen
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal: Eintrag anlegen / bearbeiten ────────────────────────────
function EintragModal({
  eintrag, vorausgewaehlterMitarbeiterId, mitarbeiterListe, abteilungen, onMitarbeiterErstellt, onSchliessen, onErfolg,
}: {
  eintrag: GehaltsstufenEintrag | null;
  vorausgewaehlterMitarbeiterId?: string;
  mitarbeiterListe: Mitarbeiter[];
  abteilungen: Abteilung[];
  onMitarbeiterErstellt: (m: Mitarbeiter) => void;
  onSchliessen: () => void;
  onErfolg: () => void;
}) {
  const [neuerMitarbeiter, setNeuerMitarbeiter] = useState(false);
  const [mitarbeiterId, setMitarbeiterId] = useState(eintrag?.mitarbeiterId ?? vorausgewaehlterMitarbeiterId ?? "");
  const [vorname, setVorname]   = useState("");
  const [nachname, setNachname] = useState("");
  const [pnr, setPnr]           = useState("");
  const [eintritt, setEintritt] = useState("");
  const [austritt, setAustritt] = useState("");
  const [abteilungId, setAbteilungId] = useState("");
  const [stufe, setStufe]       = useState(eintrag?.stufe ?? "");
  const [gueltigAb, setGueltigAb] = useState(eintrag?.gueltigAb?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [bemerkung, setBemerkung] = useState(eintrag?.bemerkung ?? "");
  const [laden, setLaden]       = useState(false);
  const [fehler, setFehler]     = useState("");

  async function speichern(e: FormEvent) {
    e.preventDefault();
    setFehler("");
    setLaden(true);
    try {
      let zielMitarbeiterId = mitarbeiterId;

      if (neuerMitarbeiter) {
        if (!vorname.trim() || !nachname.trim()) {
          setFehler("Vor- und Nachname sind Pflicht");
          setLaden(false);
          return;
        }
        const m = await api.mitarbeiter.erstellen({
          vorname, nachname,
          abteilungId: abteilungId || undefined,
          pnr:         pnr.trim() || undefined,
          eintritt:    eintritt || undefined,
          austritt:    austritt || undefined,
        });
        onMitarbeiterErstellt(m);
        zielMitarbeiterId = m.id;
      }

      if (!zielMitarbeiterId) {
        setFehler("Bitte einen Mitarbeiter auswählen");
        setLaden(false);
        return;
      }
      if (!stufe.trim()) {
        setFehler("Gehaltsstufe ist ein Pflichtfeld");
        setLaden(false);
        return;
      }

      if (eintrag) {
        await api.gehaltstabelle.aktualisieren(eintrag.id, {
          stufe: stufe.trim(), gueltigAb, bemerkung: bemerkung || undefined,
        });
      } else {
        await api.gehaltstabelle.erstellen({
          mitarbeiterId: zielMitarbeiterId, stufe: stufe.trim(), gueltigAb, bemerkung: bemerkung || undefined,
        });
      }
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
          <h2 className="text-lg font-bold text-gray-900">
            {eintrag ? "Eintrag bearbeiten" : "Neuer Gehaltsstufen-Eintrag"}
          </h2>
          <button onClick={onSchliessen} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={speichern} className="space-y-4">
          {!eintrag && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mitarbeiter *</label>
              {!neuerMitarbeiter ? (
                <div className="flex gap-2">
                  <select
                    value={mitarbeiterId}
                    onChange={e => setMitarbeiterId(e.target.value)}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                  >
                    <option value="">– auswählen –</option>
                    {mitarbeiterListe.map(m => (
                      <option key={m.id} value={m.id}>{m.nachname}, {m.vorname}{m.abteilung ? ` (${m.abteilung.name})` : ""}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setNeuerMitarbeiter(true)}
                    className="px-3 py-2 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600 whitespace-nowrap"
                  >
                    + neuer Mitarbeiter
                  </button>
                </div>
              ) : (
                <div className="space-y-2 border border-gray-200 rounded-lg p-3 bg-gray-50">
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text" placeholder="Vorname" value={vorname} autoFocus
                      onChange={e => setVorname(e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                    />
                    <input
                      type="text" placeholder="Nachname" value={nachname}
                      onChange={e => setNachname(e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text" placeholder="PNR (optional)" value={pnr}
                      onChange={e => setPnr(e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                    />
                    <input
                      type="date" placeholder="Eintritt" value={eintritt}
                      onChange={e => setEintritt(e.target.value)}
                      title="Eintrittsdatum (optional)"
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date" placeholder="Austritt" value={austritt}
                      onChange={e => setAustritt(e.target.value)}
                      title="Austrittsdatum (optional)"
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                    />
                  </div>
                  <select
                    value={abteilungId}
                    onChange={e => setAbteilungId(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                  >
                    <option value="">Abteilung (optional)</option>
                    {abteilungen.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={() => setNeuerMitarbeiter(false)}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    Zurück zur Auswahl
                  </button>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Gehaltsstufe *</label>
            <input
              type="text" required
              value={stufe}
              onChange={e => setStufe(e.target.value)}
              placeholder="z.B. B:3.2 (Zeitmodell:Gruppe.Stufe)"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Gültig ab *</label>
            <input
              type="date" required
              value={gueltigAb}
              onChange={e => setGueltigAb(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bemerkung</label>
            <textarea
              rows={2}
              value={bemerkung}
              onChange={e => setBemerkung(e.target.value)}
              placeholder="Optional"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))] resize-y"
            />
          </div>

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

// ── Kleine Stat-Kachel für die Statistik-Ansicht ────────────────────
function MiniStat({ titel, wert }: { titel: string; wert: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <p className="text-2xl font-bold text-gray-900">{wert}</p>
      <p className="text-sm text-gray-500 mt-1">{titel}</p>
    </div>
  );
}

type EintragMitarbeiter = GehaltsstufenEintrag["mitarbeiter"];

interface GruppenZeile {
  name: string;
  proGruppe: Record<number, number>;
  gesamt: number;
}

// Gruppiert die aktuellsten Gehaltsstufen (mit gültigem Format) nach einem
// beliebigen Merkmal (z.B. Standort) und zählt je Gruppe (1-6).
function gruppiereNachMerkmal(
  geparst: { eintrag: GehaltsstufenEintrag; parsed: GeparsteStufe | null }[],
  merkmal: (m: EintragMitarbeiter) => string,
): GruppenZeile[] {
  const map = new Map<string, Record<number, number>>();
  for (const { eintrag, parsed } of geparst) {
    const key = merkmal(eintrag.mitarbeiter) || "– keine –";
    if (!map.has(key)) map.set(key, Object.fromEntries(GRUPPEN.map(g => [g, 0])));
    if (parsed) map.get(key)![parsed.gruppe]++;
  }
  return [...map.entries()]
    .map(([name, proGruppe]) => ({ name, proGruppe, gesamt: GRUPPEN.reduce((summe, g) => summe + proGruppe[g], 0) }))
    .filter(z => z.gesamt > 0)
    .sort((a, b) => b.gesamt - a.gesamt);
}

function GruppenTabelle({ titel, spaltenTitel, zeilen }: { titel: string; spaltenTitel: string; zeilen: GruppenZeile[] }) {
  if (zeilen.length === 0) return null;
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 overflow-x-auto">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">{titel}</h3>
      <table className="text-sm w-full">
        <thead>
          <tr className="text-xs text-gray-500">
            <th className="px-3 py-1.5 text-left">{spaltenTitel}</th>
            {GRUPPEN.map(g => <th key={g} className="px-2 py-1.5 text-center">{g}</th>)}
            <th className="px-3 py-1.5 text-center">Gesamt</th>
          </tr>
        </thead>
        <tbody>
          {zeilen.map(z => (
            <tr key={z.name} className="border-t border-gray-100">
              <td className="px-3 py-1.5 text-gray-700 truncate max-w-[12rem]" title={z.name}>{z.name}</td>
              {GRUPPEN.map(g => (
                <td key={g} className="px-2 py-1.5 text-center text-gray-600">{z.proGruppe[g] || "–"}</td>
              ))}
              <td className="px-3 py-1.5 text-center font-semibold text-gray-800">{z.gesamt}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Zählt die geparsten Gehaltsstufen als Gruppe(1-6) × Spalte-Matrix (Spalte = Zeitmodell oder Stufe)
function gruppeXSpalteMatrix(
  geparst: { parsed: GeparsteStufe | null }[],
  spalten: string[],
  spaltenWert: (p: GeparsteStufe) => string,
): Record<number, Record<string, number>> {
  const matrix: Record<number, Record<string, number>> = {};
  for (const g of GRUPPEN) matrix[g] = Object.fromEntries(spalten.map(s => [s, 0]));
  for (const { parsed } of geparst) if (parsed) matrix[parsed.gruppe][spaltenWert(parsed)]++;
  return matrix;
}

function GruppeMatrixTabelle({
  titel, unterschrift, spalten, matrix,
}: {
  titel: string;
  unterschrift?: string;
  spalten: string[];
  matrix: Record<number, Record<string, number>>;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 overflow-x-auto">
      <h2 className="text-sm font-semibold text-gray-700 mb-1">{titel}</h2>
      {unterschrift && <p className="text-xs text-gray-400 mb-3">{unterschrift}</p>}
      <table className="text-sm w-full">
        <thead>
          <tr className="text-xs text-gray-500">
            <th className="px-3 py-1.5 text-left"></th>
            {spalten.map(s => <th key={s} className="px-3 py-1.5 text-center">{s}</th>)}
            <th className="px-3 py-1.5 text-center">Gesamt</th>
          </tr>
        </thead>
        <tbody>
          {GRUPPEN.map(g => {
            const zeile = matrix[g];
            const summe = spalten.reduce((s, sp) => s + zeile[sp], 0);
            return (
              <tr key={g} className="border-t border-gray-100">
                <td className="px-3 py-1.5 font-medium text-gray-700">Gruppe {g}</td>
                {spalten.map(sp => <td key={sp} className="px-3 py-1.5 text-center text-gray-600">{zeile[sp] || "–"}</td>)}
                <td className="px-3 py-1.5 text-center font-semibold text-gray-800">{summe || "–"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Statistik-Tab: Kennzahlen auf Basis des jeweils aktuellsten Gehaltsstufen-
//    Eintrags je Mitarbeiter (per gueltigAb) ─────────────────────────
function StatistikTab({
  eintraege, nurAktive, aufMitarbeiterSpringen,
}: {
  eintraege: GehaltsstufenEintrag[];
  nurAktive: boolean;
  aufMitarbeiterSpringen: (mitarbeiterId: string) => void;
}) {
  const istAktiv = (m: EintragMitarbeiter) => !m.austritt || new Date(m.austritt) >= new Date();

  const neuesteProMitarbeiter = useMemo(() => {
    const map = new Map<string, GehaltsstufenEintrag>();
    for (const e of eintraege) {
      const bisher = map.get(e.mitarbeiterId);
      if (!bisher || new Date(e.gueltigAb) > new Date(bisher.gueltigAb)) map.set(e.mitarbeiterId, e);
    }
    return [...map.values()].filter(e => !nurAktive || istAktiv(e.mitarbeiter));
  }, [eintraege, nurAktive]);

  const anzahlProArt = useMemo(() => {
    const zaehler: Record<Beschaeftigungsart, number> = { MITARBEITER: 0, AZUBI: 0, STUDENT: 0, ZEITARBEITER: 0 };
    for (const e of neuesteProMitarbeiter) zaehler[e.mitarbeiter.beschaeftigungsart ?? "MITARBEITER"]++;
    return zaehler;
  }, [neuesteProMitarbeiter]);

  const standortVerteilung = useMemo(() => {
    const orte = new Map<string, Record<Beschaeftigungsart, number>>();
    for (const e of neuesteProMitarbeiter) {
      const key = e.mitarbeiter.standort || "– kein Standort –";
      if (!orte.has(key)) orte.set(key, { MITARBEITER: 0, AZUBI: 0, STUDENT: 0, ZEITARBEITER: 0 });
      orte.get(key)![e.mitarbeiter.beschaeftigungsart ?? "MITARBEITER"]++;
    }
    return [...orte.entries()]
      .map(([standort, zaehler]) => ({
        standort, zaehler,
        gesamt: ALLE_BESCHAEFTIGUNGSARTEN.reduce((summe, art) => summe + zaehler[art], 0),
      }))
      .sort((a, b) => b.gesamt - a.gesamt);
  }, [neuesteProMitarbeiter]);

  const maxStandort = Math.max(1, ...standortVerteilung.map(o => o.gesamt));
  const vorkommendeArten = ALLE_BESCHAEFTIGUNGSARTEN.filter(art => anzahlProArt[art] > 0);

  const geparst = useMemo(
    () => neuesteProMitarbeiter.map(eintrag => ({ eintrag, parsed: parseGehaltsstufe(eintrag.stufe) })),
    [neuesteProMitarbeiter],
  );

  const gruppeXZeitmodell = useMemo(
    () => gruppeXSpalteMatrix(geparst, ZEITMODELLE, p => p.zeitmodell),
    [geparst],
  );
  const gruppeXStufe = useMemo(
    () => gruppeXSpalteMatrix(geparst, STUFEN.map(String), p => String(p.stufe)),
    [geparst],
  );

  const standortXGruppe = useMemo(() => gruppiereNachMerkmal(geparst, m => m.standort ?? ""), [geparst]);

  // Abteilung × Gruppe × Stufe – je Abteilung eine eigene Matrix, damit man per
  // Dropdown gezielt eine Abteilung anschauen kann statt eine riesige Tabelle
  // mit allen Abteilungen auf einmal zu haben.
  const abteilungGruppeStufe = useMemo(() => {
    const map = new Map<string, Record<number, Record<string, number>>>();
    for (const { eintrag, parsed } of geparst) {
      if (!parsed) continue;
      const key = eintrag.mitarbeiter.abteilung?.name;
      if (!key) continue;
      if (!map.has(key)) {
        map.set(key, Object.fromEntries(GRUPPEN.map(g => [g, Object.fromEntries(STUFEN.map(s => [String(s), 0]))])));
      }
      map.get(key)![parsed.gruppe][String(parsed.stufe)]++;
    }
    return map;
  }, [geparst]);
  const abteilungenMitDaten = useMemo(() => [...abteilungGruppeStufe.keys()].sort((a, b) => a.localeCompare(b)), [abteilungGruppeStufe]);
  const [statistikAbteilung, setStatistikAbteilung] = useState("");
  const leereGruppeStufeMatrix = useMemo(
    () => Object.fromEntries(GRUPPEN.map(g => [g, Object.fromEntries(STUFEN.map(s => [String(s), 0]))])) as Record<number, Record<string, number>>,
    [],
  );

  // Datenqualität: ALLE Einträge (nicht nur der aktuellste je MA) prüfen –
  // ein historischer Tippfehler soll genauso auffallen.
  const nichtErkannt = useMemo(
    () => eintraege
      .filter(e => !parseGehaltsstufe(e.stufe))
      .sort((a, b) => new Date(b.gueltigAb).getTime() - new Date(a.gueltigAb).getTime()),
    [eintraege],
  );

  return (
    <div className="space-y-5 mb-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <MiniStat titel="MA mit Gehaltseintrag" wert={neuesteProMitarbeiter.length} />
        <MiniStat titel="Mitarbeiter" wert={anzahlProArt.MITARBEITER} />
        <MiniStat titel="Azubis" wert={anzahlProArt.AZUBI} />
        <MiniStat titel="Studenten" wert={anzahlProArt.STUDENT} />
        <MiniStat titel="Zeitarbeiter" wert={anzahlProArt.ZEITARBEITER} />
      </div>
      <p className="text-xs text-gray-400 -mt-3">
        Basis: Mitarbeiter mit mindestens einem Gehaltsstufen-Eintrag{nurAktive && " · nur aktive"}
      </p>

      {standortVerteilung.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="text-sm font-semibold text-gray-700">MA pro Werk (Standort)</h2>
            {vorkommendeArten.length > 1 && (
              <div className="flex items-center gap-3 flex-wrap">
                {vorkommendeArten.map(art => (
                  <span key={art} className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span className={`w-2.5 h-2.5 rounded-full ${BESCHAEFTIGUNGSART_FARBE[art].balken}`} />
                    {BESCHAEFTIGUNGSART_LABEL[art]}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-2">
            {standortVerteilung.map(({ standort, zaehler, gesamt }) => (
              <div key={standort} className="flex items-center gap-3">
                <span className="text-xs text-gray-600 w-40 shrink-0 truncate" title={standort}>{standort}</span>
                <div className="flex-1 h-2 flex gap-0.5">
                  {ALLE_BESCHAEFTIGUNGSARTEN.map(art => zaehler[art] > 0 && (
                    <div
                      key={art}
                      className={`h-full rounded-full ${BESCHAEFTIGUNGSART_FARBE[art].balken}`}
                      style={{ width: `${(zaehler[art] / maxStandort) * 100}%` }}
                      title={`${BESCHAEFTIGUNGSART_LABEL[art]}: ${zaehler[art]}`}
                    />
                  ))}
                </div>
                <span className="text-xs text-gray-500 w-8 text-right shrink-0">{gesamt}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <GruppeMatrixTabelle
        titel="Gruppe × Zeitmodell"
        unterschrift="Aktuellste Gehaltsstufe je Mitarbeiter, nur erkannte Einträge (siehe Datenqualität unten)"
        spalten={ZEITMODELLE}
        matrix={gruppeXZeitmodell}
      />
      <GruppeMatrixTabelle
        titel="Gruppe × Stufe"
        unterschrift="Stufenverteilung innerhalb jeder Gruppe"
        spalten={STUFEN.map(String)}
        matrix={gruppeXStufe}
      />

      <GruppenTabelle titel="Standort × Gruppe" spaltenTitel="Standort" zeilen={standortXGruppe} />

      {abteilungenMitDaten.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 overflow-x-auto">
          <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
            <h2 className="text-sm font-semibold text-gray-700">Abteilung × Gruppe/Stufe</h2>
            <select
              value={statistikAbteilung}
              onChange={e => setStatistikAbteilung(e.target.value)}
              className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
            >
              <option value="">– Abteilung wählen –</option>
              {abteilungenMitDaten.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          {statistikAbteilung ? (
            <table className="text-sm w-full mt-3">
              <thead>
                <tr className="text-xs text-gray-500">
                  <th className="px-3 py-1.5 text-left"></th>
                  {STUFEN.map(s => <th key={s} className="px-3 py-1.5 text-center">Stufe {s}</th>)}
                  <th className="px-3 py-1.5 text-center">Gesamt</th>
                </tr>
              </thead>
              <tbody>
                {GRUPPEN.map(g => {
                  const zeile = (abteilungGruppeStufe.get(statistikAbteilung) ?? leereGruppeStufeMatrix)[g];
                  const summe = STUFEN.reduce((s, stufe) => s + zeile[String(stufe)], 0);
                  return (
                    <tr key={g} className="border-t border-gray-100">
                      <td className="px-3 py-1.5 font-medium text-gray-700">Gruppe {g}</td>
                      {STUFEN.map(s => <td key={s} className="px-3 py-1.5 text-center text-gray-600">{zeile[String(s)] || "–"}</td>)}
                      <td className="px-3 py-1.5 text-center font-semibold text-gray-800">{summe || "–"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-gray-400 mt-2">Abteilung auswählen, um die Gruppen-/Stufenverteilung zu sehen.</p>
          )}
        </div>
      )}

      {nichtErkannt.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={15} className="text-red-600" />
            <p className="text-sm font-medium text-red-900">
              {nichtErkannt.length} Gehaltsstufe{nichtErkannt.length !== 1 ? "n" : ""} passen nicht ins Format „Zeitmodell:Gruppe.Stufe" (z.B. B:3.2) und fehlen daher oben in Gruppe/Zeitmodell
            </p>
          </div>
          <ul className="space-y-1 max-h-56 overflow-y-auto">
            {nichtErkannt.map(e => (
              <li key={e.id}>
                <button
                  onClick={() => aufMitarbeiterSpringen(e.mitarbeiterId)}
                  title="Zur Liste springen und auf diesen Mitarbeiter filtern"
                  className="w-full flex items-center justify-between text-sm bg-white border border-red-100 rounded-lg px-3 py-1.5 hover:bg-red-50 transition-colors text-left"
                >
                  <span className="text-gray-700">{e.mitarbeiter.nachname}, {e.mitarbeiter.vorname}</span>
                  <span className="text-gray-500 flex items-center gap-3 shrink-0">
                    <code className="font-mono bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5">{e.stufe}</code>
                    {formatDatum(e.gueltigAb)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
