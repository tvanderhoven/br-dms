import { useState, useEffect, useMemo, useRef, FormEvent, ChangeEvent } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Wallet, Plus, Trash2, Download, Upload, X, Loader2, Edit3, Filter, AlertTriangle, UserCog, List, BarChart3, BarChart2, Clock, Timer, ZoomIn, ZoomOut, CheckSquare, Square, ChevronDown, ChevronRight, Link2 } from "lucide-react";
import {
  api, GehaltsstufenEintrag, Abteilung, Mitarbeiter, GehaltstabelleImportZusammenfassung, formatDatum,
  Beschaeftigungsart, ALLE_BESCHAEFTIGUNGSARTEN, BESCHAEFTIGUNGSART_FARBE, BESCHAEFTIGUNGSART_KUERZEL, BESCHAEFTIGUNGSART_LABEL,
  Zeitmodell, ZeitmodellEintrag, UeberstundenEintrag,
} from "../lib/api";
import MitarbeiterBearbeitenModal from "../components/MitarbeiterBearbeitenModal";
import Sichtschutz from "../components/Sichtschutz";

// Eingruppierung: Gruppe 1-6, Stufe 1-4 (siehe backend/prisma/schema.prisma)
const GRUPPEN = [1, 2, 3, 4, 5, 6];
const STUFEN = [1, 2, 3, 4];

function formatGehalt(betrag: string | number): string {
  return Number(betrag).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

// Kleiner Rückverweis-Link, wenn ein Eintrag direkt aus einem Sitzungs-TOP
// heraus angelegt wurde (TopGehaltModal in Sitzungen.tsx setzt dafür sitzungId).
function SitzungLink({ sitzung }: { sitzung?: { id: string; titel: string; sitzungsdatum: string } | null }) {
  if (!sitzung) return null;
  return (
    <RouterLink
      to={`/sitzungen?id=${sitzung.id}`}
      onClick={e => e.stopPropagation()}
      title={`Aus Sitzung übernommen: ${sitzung.titel} (${formatDatum(sitzung.sitzungsdatum)})`}
      className="inline-flex items-center text-gray-300 hover:text-[rgb(var(--accent))] transition-colors"
    >
      <Link2 size={12} />
    </RouterLink>
  );
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
  // Stammdaten der Mitarbeiter ändern nur Vorsitz/Stellvertretung (Backend prüft ebenso)
  const [darfStammdaten, setDarfStammdaten] = useState(false);
  useEffect(() => {
    api.auth.me().then(b => setDarfStammdaten(["VORSITZ", "STELLVERTRETER", "ADMIN"].includes(b.rolle))).catch(() => {});
  }, []);
  const [mitarbeiterIdsMitEintrag, setMitarbeiterIdsMitEintrag] = useState<Set<string>>(new Set());
  const [alleEintraege, setAlleEintraege] = useState<GehaltsstufenEintrag[]>([]);
  const [tab, setTab] = useState<"liste" | "zeitmodell" | "ueberstunden" | "statistik">("ueberstunden");

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
  const [filterBeschaeftigungsart, setFilterBeschaeftigungsart] = useState<"" | Beschaeftigungsart>("");

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

  const listeGefiltert = liste.filter(e =>
    (!nurAktive || !e.mitarbeiter.austritt || new Date(e.mitarbeiter.austritt) >= new Date()) &&
    (!filterBeschaeftigungsart || (e.mitarbeiter.beschaeftigungsart ?? "MITARBEITER") === filterBeschaeftigungsart)
  );

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
            <h1 className="text-xl font-bold text-gray-900">Eingruppierung</h1>
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
          onClick={() => setTab("ueberstunden")}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === "ueberstunden" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
        >
          <Timer size={14} /> Überstunden
        </button>
        <button
          onClick={() => setTab("zeitmodell")}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === "zeitmodell" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
        >
          <Clock size={14} /> Zeitmodell
        </button>
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

      {tab === "zeitmodell" && (
        <ZeitmodellTab mitarbeiterListe={mitarbeiterListe} abteilungen={abteilungen} />
      )}

      {tab === "ueberstunden" && (
        <UeberstundenTab mitarbeiterListe={mitarbeiterListe} abteilungen={abteilungen} />
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
        <select
          value={filterBeschaeftigungsart}
          onChange={e => setFilterBeschaeftigungsart(e.target.value as "" | Beschaeftigungsart)}
          className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
        >
          <option value="">Alle Beschäftigungsarten</option>
          {ALLE_BESCHAEFTIGUNGSARTEN.map(art => <option key={art} value={art}>{BESCHAEFTIGUNGSART_LABEL[art]}</option>)}
        </select>
        {(filterAbteilung || filterMitarbeiter || filterVon || filterBis || filterBeschaeftigungsart) && (
          <button
            onClick={() => { setFilterAbteilung(""); setFilterMitarbeiter(""); setFilterVon(""); setFilterBis(""); setFilterBeschaeftigungsart(""); }}
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
                        {darfStammdaten && (
                          <button
                            onClick={() => setBearbeiteterMitarbeiter(mitarbeiterListe.find(m => m.id === e.mitarbeiterId) ?? null)}
                            className="text-gray-300 hover:text-[rgb(var(--accent))] transition-colors"
                            title="Stammdaten bearbeiten (Name, Ein-/Austritt, Abteilung)"
                          >
                            <UserCog size={13} />
                          </button>
                        )}
                        <SitzungLink sitzung={e.sitzung} />
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{e.mitarbeiter.abteilung?.name ?? "–"}</td>
                    <td className="px-4 py-2.5 text-gray-800 font-medium">
                      {e.gruppe != null && e.stufe != null
                        ? `Gruppe ${e.gruppe}.${e.stufe}`
                        : e.gehaltAt != null
                          ? <span className="text-violet-700">AT · {formatGehalt(e.gehaltAt)}</span>
                          : "– nicht zugeordnet –"}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{formatDatum(e.gueltigAb)}</td>
                    <td className="px-4 py-2.5 text-gray-500">{e.bemerkung ?? "–"}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <button
                        onClick={() => { setBearbeitet(e); setModal(true); }}
                        className="p-1.5 text-gray-400 hover:text-[rgb(var(--accent))] hover:bg-accent/5 rounded transition-colors"
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
  const [istAt, setIstAt]       = useState(eintrag?.gehaltAt != null);
  const [gruppe, setGruppe]     = useState(eintrag?.gruppe != null ? String(eintrag.gruppe) : "");
  const [stufe, setStufe]       = useState(eintrag?.stufe != null ? String(eintrag.stufe) : "");
  const [gehaltAt, setGehaltAt] = useState(eintrag?.gehaltAt ?? "");
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
      let werteFeld: { gruppe: number; stufe: number; gehaltAt?: undefined } | { gruppe?: undefined; stufe?: undefined; gehaltAt: number };
      if (istAt) {
        const gehaltNr = Number(gehaltAt.replace(",", "."));
        if (!gehaltAt || !Number.isFinite(gehaltNr) || gehaltNr <= 0) {
          setFehler("Bitte ein gültiges Gehalt eingeben");
          setLaden(false);
          return;
        }
        werteFeld = { gehaltAt: gehaltNr };
      } else {
        const gruppeNr = Number(gruppe);
        const stufeNr  = Number(stufe);
        if (!gruppe || !Number.isInteger(gruppeNr) || gruppeNr < 1 || gruppeNr > 6) {
          setFehler("Bitte eine Gruppe (1-6) auswählen");
          setLaden(false);
          return;
        }
        if (!stufe || !Number.isInteger(stufeNr) || stufeNr < 1 || stufeNr > 4) {
          setFehler("Bitte eine Stufe (1-4) auswählen");
          setLaden(false);
          return;
        }
        werteFeld = { gruppe: gruppeNr, stufe: stufeNr };
      }

      if (eintrag) {
        await api.gehaltstabelle.aktualisieren(eintrag.id, {
          ...werteFeld, gueltigAb, bemerkung: bemerkung || undefined,
        });
      } else {
        await api.gehaltstabelle.erstellen({
          mitarbeiterId: zielMitarbeiterId, ...werteFeld, gueltigAb, bemerkung: bemerkung || undefined,
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

          <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden w-fit">
            <button
              type="button"
              onClick={() => setIstAt(false)}
              className={`px-3 py-1.5 text-sm transition-colors ${!istAt ? "bg-[rgb(var(--accent))] text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              Tarif (Gruppe/Stufe)
            </button>
            <button
              type="button"
              onClick={() => setIstAt(true)}
              className={`px-3 py-1.5 text-sm transition-colors ${istAt ? "bg-[rgb(var(--accent))] text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              AT (reales Gehalt)
            </button>
          </div>

          {istAt ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Gehalt (€) *</label>
              <input
                type="text" required value={gehaltAt}
                onChange={e => setGehaltAt(e.target.value)}
                placeholder="z.B. 4200"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
              />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Gruppe *</label>
                  <select
                    required value={gruppe}
                    onChange={e => setGruppe(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                  >
                    <option value="">– wählen –</option>
                    {[1, 2, 3, 4, 5, 6].map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Stufe *</label>
                  <select
                    required value={stufe}
                    onChange={e => setStufe(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                  >
                    <option value="">– wählen –</option>
                    {[1, 2, 3, 4].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <p className="text-xs text-gray-400 -mt-2">
                Das Zeitmodell wird getrennt im Tab „Zeitmodell" verwaltet.
              </p>
            </>
          )}

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

// ── Gemeinsame Gantt-Ansicht für Zeitmodell/Überstunden – eine Zeile pro
//    Mitarbeiter, ein Balken pro Zeitraum. Angelehnt an GanttAnsicht in
//    Zeitraeume.tsx, aber ohne Projekt-Hierarchie (hier reicht eine flache
//    Mitarbeiter-Liste, da Zeiträume je Mitarbeiter serverseitig nie
//    überlappen).
interface GanttBalken { id: string; von: string; bis: string | null; farbe: string; titel: string; quelle?: string; }
interface GanttZeile { id: string; name: string; abteilung: string; balken: GanttBalken[]; }

// Fasst überlappende/aneinander anschließende Zeiträume (z.B. mehrere
// Mitarbeiter derselben Abteilung) zu durchgehenden Blöcken zusammen – für die
// Abteilungs-Übersichtszeile, die zeigen soll "wann war in dieser Abteilung
// überhaupt was aktiv", ohne jeden einzelnen Mitarbeiter-Balken zu zeigen.
// bis=null heißt "läuft noch" und bleibt das für den ganzen Block, sobald ein
// offener Zeitraum mit reinfällt.
function intervalleZusammenfassen(balken: GanttBalken[]): { von: number; bis: number | null }[] {
  const roh = balken
    .map(b => ({ von: new Date(b.von).getTime(), bis: b.bis ? new Date(b.bis).getTime() : null }))
    .sort((a, b) => a.von - b.von);

  const ergebnis: { von: number; bis: number | null }[] = [];
  for (const i of roh) {
    const letzte = ergebnis[ergebnis.length - 1];
    if (letzte && (letzte.bis === null || i.von <= letzte.bis)) {
      if (i.bis === null) letzte.bis = null;
      else if (letzte.bis !== null) letzte.bis = Math.max(letzte.bis, i.bis);
    } else {
      ergebnis.push({ von: i.von, bis: i.bis });
    }
  }
  return ergebnis;
}

function PeriodenGantt({ zeilen, leerText, onBalkenDoppelklick }: {
  zeilen: GanttZeile[];
  leerText: string;
  onBalkenDoppelklick?: (balkenId: string) => void;
}) {
  const heute = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  const { minDate, maxDate } = useMemo(() => {
    const daten = zeilen.flatMap(z => z.balken.flatMap(b => [
      new Date(b.von).getTime(),
      b.bis ? new Date(b.bis).getTime() : null,
    ])).filter((d): d is number => d !== null);

    const fruehestes = daten.length > 0 ? Math.min(...daten) - 30 * 86_400_000 : heute.getTime() - 60 * 86_400_000;
    const spaetestes = daten.length > 0 ? Math.max(...daten) + 30 * 86_400_000 : heute.getTime() + 180 * 86_400_000;

    return {
      minDate: new Date(Math.min(fruehestes, heute.getTime() - 60 * 86_400_000)),
      maxDate: new Date(Math.max(spaetestes, heute.getTime() + 180 * 86_400_000)),
    };
  }, [zeilen, heute]);

  const totalMs = maxDate.getTime() - minDate.getTime();
  function pct(date: Date): number {
    return Math.max(0, Math.min(100, ((date.getTime() - minDate.getTime()) / totalMs) * 100));
  }

  const monate = useMemo(() => {
    const result: { label: string; left: number; width: number }[] = [];
    let cur = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    while (cur <= maxDate) {
      const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      const start = Math.max(cur.getTime(), minDate.getTime());
      const end   = Math.min(next.getTime(), maxDate.getTime());
      result.push({
        label: cur.toLocaleDateString("de-DE", { month: "short", year: "2-digit" }),
        left:  ((start - minDate.getTime()) / totalMs) * 100,
        width: ((end   - start)              / totalMs) * 100,
      });
      cur = next;
    }
    return result;
  }, [minDate, maxDate, totalMs]);

  const heutePct = pct(heute);
  const LABEL_W = 200;
  const ZEILE_H = 40;
  const GRUPPE_H = 32;
  const GRUPPE_BAR_H = 14;
  const BAR_H = 22;

  // Gruppierung nach Abteilung – "– keine Abteilung –" immer ans Ende, sonst
  // alphabetisch. Eingeklappte Abteilungen nur per Name gemerkt, damit der
  // Zustand auch über Filterwechsel (Zoom, Zeitmodell-Toggle etc.) stabil bleibt.
  // Zusätzlich pro Abteilung die zusammengefassten Zeiträume aller Mitarbeiter
  // (für die Übersichtsbalken in der Gruppenzeile, auch im eingeklappten Zustand sichtbar).
  const gruppen = useMemo(() => {
    const map = new Map<string, GanttZeile[]>();
    for (const z of zeilen) {
      if (!map.has(z.abteilung)) map.set(z.abteilung, []);
      map.get(z.abteilung)!.push(z);
    }
    return [...map.entries()]
      .sort(([a], [b]) => {
        if (a === "– keine Abteilung –") return 1;
        if (b === "– keine Abteilung –") return -1;
        return a.localeCompare(b, "de", { numeric: true });
      })
      .map(([abteilung, mitarbeiterZeilen]) => ({
        abteilung, mitarbeiterZeilen,
        zusammengefasst: intervalleZusammenfassen(mitarbeiterZeilen.flatMap(z => z.balken)),
      }));
  }, [zeilen]);

  const [eingeklappt, setEingeklappt] = useState<Set<string>>(new Set());
  function gruppeUmschalten(abteilung: string) {
    setEingeklappt(prev => {
      const n = new Set(prev);
      if (n.has(abteilung)) n.delete(abteilung); else n.add(abteilung);
      return n;
    });
  }

  const [monatBreite, setMonatBreite] = useState(90);
  const MONAT_BREITE_MIN = 50;
  const MONAT_BREITE_MAX = 220;
  const zeitachseBreite = Math.max(1000, monate.length * monatBreite);

  // Standardmäßig auf "heute" scrollen statt auf den Anfang der Daten – sonst
  // müsste man sich bei viel Historie erst mühsam nach rechts durchklicken.
  const scrollRef = useRef<HTMLDivElement>(null);
  function zuHeuteScrollen() {
    if (!scrollRef.current) return;
    const heutePx = (heutePct / 100) * zeitachseBreite;
    scrollRef.current.scrollLeft = Math.max(0, heutePx - 40);
  }
  useEffect(zuHeuteScrollen, [heutePct, zeitachseBreite, zeilen]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-end gap-2 px-3 py-1.5 border-b border-gray-100 bg-gray-50">
        <button
          onClick={zuHeuteScrollen}
          className="text-xs text-gray-500 hover:text-gray-800 px-2 py-1 rounded hover:bg-gray-200 transition-colors"
        >
          Heute
        </button>
        <span className="text-xs text-gray-400 mr-1">Zoom:</span>
        <button
          onClick={() => setMonatBreite(b => Math.max(MONAT_BREITE_MIN, b - 20))}
          disabled={monatBreite <= MONAT_BREITE_MIN}
          title="Monate schmaler"
          className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
        >
          <ZoomOut size={14} />
        </button>
        <button
          onClick={() => setMonatBreite(b => Math.min(MONAT_BREITE_MAX, b + 20))}
          disabled={monatBreite >= MONAT_BREITE_MAX}
          title="Monate breiter"
          className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
        >
          <ZoomIn size={14} />
        </button>
      </div>
      <div className="overflow-x-auto" ref={scrollRef}>
        <div style={{ minWidth: LABEL_W + zeitachseBreite }}>
          <div className="flex border-b border-gray-200 bg-gray-50">
            <div
              className="shrink-0 border-r border-gray-200 px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-20"
              style={{ width: LABEL_W }}
            >
              Name
            </div>
            <div className="flex-1 relative bg-gray-50" style={{ height: 36 }}>
              {monate.map((m, i) => (
                <div
                  key={i}
                  className="absolute top-0 h-full border-l border-gray-200 flex items-center px-1.5 text-xs text-gray-400"
                  style={{ left: `${m.left}%`, width: `${m.width}%` }}
                >
                  {m.label}
                </div>
              ))}
              <div className="absolute top-0 h-full w-0.5 bg-red-400 z-10" style={{ left: `${heutePct}%` }} />
            </div>
          </div>

          {zeilen.length === 0 && (
            <div className="text-center text-gray-400 py-16 text-sm">{leerText}</div>
          )}

          {gruppen.map(({ abteilung, mitarbeiterZeilen, zusammengefasst }) => {
            const zu = eingeklappt.has(abteilung);
            return (
              <div key={abteilung}>
                <div
                  onClick={() => gruppeUmschalten(abteilung)}
                  className="flex border-b border-gray-200 bg-gray-100 hover:bg-gray-200 cursor-pointer select-none"
                >
                  <div
                    className="shrink-0 px-3 flex items-center gap-1.5 text-xs font-semibold text-gray-600 sticky left-0 bg-gray-100 z-10 truncate"
                    style={{ width: LABEL_W, height: GRUPPE_H }}
                    title={abteilung}
                  >
                    {zu ? <ChevronRight size={13} className="shrink-0" /> : <ChevronDown size={13} className="shrink-0" />}
                    <span className="truncate">{abteilung}</span>
                    <span className="text-gray-400 font-normal shrink-0">({mitarbeiterZeilen.length})</span>
                  </div>
                  <div className="flex-1 relative bg-gray-100" style={{ height: GRUPPE_H }}>
                    {zusammengefasst.map((iv, i) => {
                      const bisDate = iv.bis !== null ? new Date(iv.bis) : maxDate;
                      const l = pct(new Date(iv.von));
                      const r = pct(bisDate);
                      const w = Math.max(0.4, r - l);
                      const top = Math.round((GRUPPE_H - GRUPPE_BAR_H) / 2);
                      return (
                        <div
                          key={i}
                          className="absolute rounded-sm"
                          style={{ left: `${l}%`, width: `${w}%`, height: `${GRUPPE_BAR_H}px`, top: `${top}px`, backgroundColor: "rgba(55, 65, 81, 0.55)" }}
                          title={`${abteilung}: ${formatDatum(new Date(iv.von).toISOString())} – ${iv.bis !== null ? formatDatum(new Date(iv.bis).toISOString()) : "laufend"}`}
                        />
                      );
                    })}
                  </div>
                </div>

                {!zu && mitarbeiterZeilen.map(zeile => (
                  <div key={zeile.id} className="flex border-b border-gray-100 hover:bg-gray-50">
                    <div
                      className="shrink-0 border-r border-gray-200 pl-7 pr-3 flex items-center text-sm text-gray-700 sticky left-0 bg-white z-10 truncate"
                      style={{ width: LABEL_W, height: ZEILE_H }}
                      title={zeile.name}
                    >
                      {zeile.name}
                    </div>
                    <div className="flex-1 relative" style={{ height: ZEILE_H }}>
                      {zeile.balken.map((b, i) => {
                        const von = new Date(b.von);
                        const bis = b.bis ? new Date(b.bis) : maxDate;
                        const l = pct(von);
                        const r = pct(bis);
                        const w = Math.max(0.4, r - l);
                        const top = Math.round((ZEILE_H - BAR_H) / 2);
                        return (
                          <div
                            key={i}
                            className={`absolute rounded flex items-center px-2 text-white text-xs font-medium overflow-hidden ${onBalkenDoppelklick ? "cursor-pointer" : ""}`}
                            style={{ left: `${l}%`, width: `${w}%`, height: `${BAR_H}px`, top: `${top}px`, backgroundColor: b.farbe }}
                            title={[
                              b.titel,
                              b.quelle ? `Aus Sitzung: ${b.quelle}` : null,
                              onBalkenDoppelklick ? "(Doppelklick zum Bearbeiten)" : null,
                            ].filter(Boolean).join("\n")}
                            onDoubleClick={() => onBalkenDoppelklick?.(b.id)}
                          >
                            {w > 6 && <span className="truncate">{b.titel}</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Tab: Zeitmodell – eigene Historie mit echtem Von/Bis-Zeitraum ──────
const ZEITMODELLE_ALLE: Zeitmodell[] = ["A", "B", "C", "D"];

// Feste, nicht rotierende Farbzuordnung – vier klar unterscheidbare Farben
const ZEITMODELL_FARBE: Record<Zeitmodell, string> = {
  A: "#3b82f6", // blue-500
  B: "#8b5cf6", // violet-500
  C: "#f59e0b", // amber-500
  D: "#10b981", // emerald-500
};

function mitarbeiterIstAktiv(m: { austritt?: string | null }): boolean {
  return !m.austritt || new Date(m.austritt) >= new Date();
}

function ZeitmodellTab({ mitarbeiterListe, abteilungen }: { mitarbeiterListe: Mitarbeiter[]; abteilungen: Abteilung[] }) {
  const [zeitraeume, setZeitraeume]       = useState<ZeitmodellEintrag[]>([]);
  const [baldAblaufend, setBaldAblaufend] = useState<ZeitmodellEintrag[]>([]);
  const [laden, setLaden]                 = useState(true);
  const [filterMitarbeiter, setFilterMitarbeiter] = useState("");
  const [filterAbteilung, setFilterAbteilung]     = useState("");
  const [nurAktive, setNurAktive] = useState(true);
  const [filterBefristung, setFilterBefristung] = useState<"" | "befristet" | "unbefristet">("");
  const [filterBeschaeftigungsart, setFilterBeschaeftigungsart] = useState<"" | Beschaeftigungsart>("");
  // B ist das Standardmodell, das fast alle haben – standardmäßig ausgeblendet,
  // sonst zeigt die Ansicht kaum mehr als eine Wand aus B-Balken.
  const [zeitmodelleAn, setZeitmodelleAn] = useState<Record<Zeitmodell, boolean>>({ A: true, B: false, C: true, D: true });
  const [ansicht, setAnsicht]     = useState<"tabelle" | "gantt">("tabelle");
  const [modal, setModal]         = useState(false);
  const [bearbeitet, setBearbeitet] = useState<ZeitmodellEintrag | null>(null);
  const [ausgewaehlt, setAusgewaehlt] = useState<Set<string>>(new Set());

  useEffect(() => { laden_(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function laden_() {
    setLaden(true);
    try {
      const [alle, bald] = await Promise.all([
        api.zeitmodell.liste(),
        api.zeitmodell.laufenBaldAb(30),
      ]);
      setZeitraeume(alle);
      setBaldAblaufend(bald);
    } finally {
      setLaden(false);
    }
  }

  async function loeschen(id: string) {
    if (!confirm("Zeitraum wirklich löschen?")) return;
    try {
      await api.zeitmodell.loeschen(id);
      await laden_();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Fehler beim Löschen");
    }
  }

  function einzelnUmschalten(id: string) {
    setAusgewaehlt(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function mehrereLoeschen() {
    if (ausgewaehlt.size === 0) return;
    if (!confirm(`${ausgewaehlt.size} Zeitraum${ausgewaehlt.size !== 1 ? "e" : ""} wirklich löschen?`)) return;
    try {
      await Promise.all([...ausgewaehlt].map(id => api.zeitmodell.loeschen(id)));
      setAusgewaehlt(new Set());
      await laden_();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Fehler beim Löschen");
    }
  }

  const gefiltert = zeitraeume.filter(z =>
    (!filterMitarbeiter || z.mitarbeiterId === filterMitarbeiter) &&
    (!filterAbteilung || z.mitarbeiter.abteilung?.id === filterAbteilung) &&
    (!nurAktive || mitarbeiterIstAktiv(z.mitarbeiter)) &&
    (!filterBefristung || (filterBefristung === "befristet" ? z.gueltigBis !== null : z.gueltigBis === null)) &&
    (!filterBeschaeftigungsart || (z.mitarbeiter.beschaeftigungsart ?? "MITARBEITER") === filterBeschaeftigungsart) &&
    zeitmodelleAn[z.zeitmodell]
  );

  function alleUmschalten() {
    if (gefiltert.every(z => ausgewaehlt.has(z.id))) {
      setAusgewaehlt(prev => { const n = new Set(prev); gefiltert.forEach(z => n.delete(z.id)); return n; });
    } else {
      setAusgewaehlt(prev => { const n = new Set(prev); gefiltert.forEach(z => n.add(z.id)); return n; });
    }
  }

  const ganttZeilen: GanttZeile[] = useMemo(() => {
    const proMitarbeiter = new Map<string, GanttZeile>();
    for (const z of gefiltert) {
      const key = z.mitarbeiterId;
      if (!proMitarbeiter.has(key)) {
        proMitarbeiter.set(key, {
          id: key, name: `${z.mitarbeiter.nachname}, ${z.mitarbeiter.vorname}`,
          abteilung: z.mitarbeiter.abteilung?.name ?? "– keine Abteilung –",
          balken: [],
        });
      }
      proMitarbeiter.get(key)!.balken.push({
        id: z.id,
        von: z.gueltigVon, bis: z.gueltigBis ?? null,
        farbe: ZEITMODELL_FARBE[z.zeitmodell],
        titel: `Zeitmodell ${z.zeitmodell}${z.bemerkung ? ` – ${z.bemerkung}` : ""}`,
        quelle: z.sitzung ? `${z.sitzung.titel} (${formatDatum(z.sitzung.sitzungsdatum)})` : undefined,
      });
    }
    return [...proMitarbeiter.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [gefiltert]);

  function ganttBalkenBearbeiten(balkenId: string) {
    const eintrag = zeitraeume.find(z => z.id === balkenId);
    if (eintrag) { setBearbeitet(eintrag); setModal(true); }
  }

  return (
    <div>
      {baldAblaufend.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={15} className="text-amber-600" />
            <p className="text-sm font-medium text-amber-900">
              {baldAblaufend.length} Zeitmodell{baldAblaufend.length !== 1 ? "e" : ""} laufen in den nächsten 30 Tagen ab
            </p>
          </div>
          <ul className="space-y-1 max-h-48 overflow-y-auto">
            {baldAblaufend.map(z => (
              <li key={z.id} className="flex items-center justify-between text-sm bg-white border border-amber-100 rounded-lg px-3 py-1.5">
                <span className="text-gray-700">
                  {z.mitarbeiter.nachname}, {z.mitarbeiter.vorname}
                  <span className="text-gray-400"> · Zeitmodell {z.zeitmodell}</span>
                </span>
                <span className="text-xs text-amber-700 font-medium shrink-0">bis {formatDatum(z.gueltigBis!)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={filterMitarbeiter}
            onChange={e => setFilterMitarbeiter(e.target.value)}
            className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
          >
            <option value="">Alle Mitarbeiter</option>
            {mitarbeiterListe.map(m => <option key={m.id} value={m.id}>{m.nachname}, {m.vorname}</option>)}
          </select>
          <select
            value={filterAbteilung}
            onChange={e => setFilterAbteilung(e.target.value)}
            className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
          >
            <option value="">Alle Abteilungen</option>
            {abteilungen.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-sm text-gray-600">
            <input type="checkbox" checked={nurAktive} onChange={e => setNurAktive(e.target.checked)} />
            Nur aktive
          </label>
          <select
            value={filterBefristung}
            onChange={e => setFilterBefristung(e.target.value as "" | "befristet" | "unbefristet")}
            className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
          >
            <option value="">Befristet & unbefristet</option>
            <option value="befristet">Nur befristete</option>
            <option value="unbefristet">Nur unbefristete</option>
          </select>
          <select
            value={filterBeschaeftigungsart}
            onChange={e => setFilterBeschaeftigungsart(e.target.value as "" | Beschaeftigungsart)}
            className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
          >
            <option value="">Alle Beschäftigungsarten</option>
            {ALLE_BESCHAEFTIGUNGSARTEN.map(art => <option key={art} value={art}>{BESCHAEFTIGUNGSART_LABEL[art]}</option>)}
          </select>
          <div className="flex items-center gap-1">
            {ZEITMODELLE_ALLE.map(z => (
              <button
                key={z}
                onClick={() => setZeitmodelleAn(prev => ({ ...prev, [z]: !prev[z] }))}
                title={zeitmodelleAn[z] ? `Zeitmodell ${z} ausblenden` : `Zeitmodell ${z} einblenden`}
                className={`w-7 h-7 rounded-full text-xs font-semibold flex items-center justify-center border transition-colors ${
                  zeitmodelleAn[z]
                    ? "text-white border-transparent"
                    : "text-gray-400 border-gray-300 bg-white hover:bg-gray-50"
                }`}
                style={zeitmodelleAn[z] ? { backgroundColor: ZEITMODELL_FARBE[z] } : undefined}
              >
                {z}
              </button>
            ))}
          </div>
          <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => setAnsicht("tabelle")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors ${ansicht === "tabelle" ? "bg-[rgb(var(--accent))] text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              <List size={14} /> Tabelle
            </button>
            <button
              onClick={() => setAnsicht("gantt")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors ${ansicht === "gantt" ? "bg-[rgb(var(--accent))] text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              <BarChart2 size={14} /> Gantt
            </button>
          </div>
        </div>
        <button
          onClick={() => { setBearbeitet(null); setModal(true); }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white hover:brightness-90 transition-colors"
          style={{ backgroundColor: "rgb(var(--accent))" }}
        >
          <Plus size={16} /> Neuer Zeitraum
        </button>
      </div>

      {laden ? (
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Lade…
        </div>
      ) : ansicht === "gantt" ? (
        <PeriodenGantt zeilen={ganttZeilen} leerText="Keine Zeitmodell-Zeiträume für diese Auswahl" onBalkenDoppelklick={ganttBalkenBearbeiten} />
      ) : gefiltert.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Clock size={40} className="mx-auto mb-3 opacity-20" />
          <p className="font-medium">Noch keine Zeitmodell-Zeiträume</p>
        </div>
      ) : (
        <>
          {ausgewaehlt.size > 0 && (
            <div className="bg-accent/5 border border-accent/25 rounded-xl p-3 mb-3 flex items-center gap-3">
              <span className="text-sm text-accent font-medium">{ausgewaehlt.size} ausgewählt</span>
              <button
                onClick={mehrereLoeschen}
                className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
              >
                <Trash2 size={14} /> Löschen
              </button>
              <button
                onClick={() => setAusgewaehlt(new Set())}
                className="text-xs text-accent hover:text-accent-hover"
              >
                Auswahl aufheben
              </button>
            </div>
          )}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs text-gray-500 uppercase">
                <th className="px-4 py-2.5 w-8">
                  <button onClick={alleUmschalten} className="text-gray-400 hover:text-gray-600" title="Alle sichtbaren auswählen/abwählen">
                    {gefiltert.length > 0 && gefiltert.every(z => ausgewaehlt.has(z.id))
                      ? <CheckSquare size={15} /> : <Square size={15} />}
                  </button>
                </th>
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Zeitmodell</th>
                <th className="px-4 py-2.5">Von</th>
                <th className="px-4 py-2.5">Bis</th>
                <th className="px-4 py-2.5">Bemerkung</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {gefiltert.map(z => (
                <tr key={z.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <button onClick={() => einzelnUmschalten(z.id)} className="text-gray-400 hover:text-gray-600">
                      {ausgewaehlt.has(z.id) ? <CheckSquare size={15} className="text-[rgb(var(--accent))]" /> : <Square size={15} />}
                    </button>
                  </td>
                  <td className="px-4 py-2.5 font-medium text-gray-900">
                    <span className="inline-flex items-center gap-1.5">
                      {z.mitarbeiter.nachname}, {z.mitarbeiter.vorname}
                      <SitzungLink sitzung={z.sitzung} />
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-800 font-medium">{z.zeitmodell}</td>
                  <td className="px-4 py-2.5 text-gray-600">{formatDatum(z.gueltigVon)}</td>
                  <td className="px-4 py-2.5 text-gray-600">{z.gueltigBis ? formatDatum(z.gueltigBis) : "unbefristet"}</td>
                  <td className="px-4 py-2.5 text-gray-500">{z.bemerkung ?? "–"}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <button
                      onClick={() => { setBearbeitet(z); setModal(true); }}
                      className="p-1.5 text-gray-400 hover:text-[rgb(var(--accent))] hover:bg-accent/5 rounded transition-colors"
                      title="Bearbeiten"
                    >
                      <Edit3 size={14} />
                    </button>
                    <button
                      onClick={() => loeschen(z.id)}
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
        </>
      )}

      {modal && (
        <ZeitmodellModal
          zeitraum={bearbeitet}
          mitarbeiterListe={mitarbeiterListe}
          onSchliessen={() => setModal(false)}
          onErfolg={() => { setModal(false); laden_(); }}
        />
      )}
    </div>
  );
}

// ── Modal: Zeitmodell-Zeitraum anlegen / bearbeiten ─────────────────
function ZeitmodellModal({
  zeitraum, mitarbeiterListe, onSchliessen, onErfolg,
}: {
  zeitraum: ZeitmodellEintrag | null;
  mitarbeiterListe: Mitarbeiter[];
  onSchliessen: () => void;
  onErfolg: () => void;
}) {
  const [mitarbeiterId, setMitarbeiterId] = useState(zeitraum?.mitarbeiterId ?? "");
  const [zeitmodell, setZeitmodell]       = useState<Zeitmodell>(zeitraum?.zeitmodell ?? "A");
  const [gueltigVon, setGueltigVon]       = useState(zeitraum?.gueltigVon?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [unbefristet, setUnbefristet]     = useState(zeitraum ? !zeitraum.gueltigBis : true);
  const [gueltigBis, setGueltigBis]       = useState(zeitraum?.gueltigBis?.slice(0, 10) ?? "");
  const [bemerkung, setBemerkung]         = useState(zeitraum?.bemerkung ?? "");
  const [laden, setLaden]                 = useState(false);
  const [fehler, setFehler]               = useState("");

  async function speichern(e: FormEvent) {
    e.preventDefault();
    setFehler("");
    if (!mitarbeiterId) { setFehler("Bitte einen Mitarbeiter auswählen"); return; }
    if (!unbefristet && !gueltigBis) { setFehler('Bitte ein Enddatum angeben oder "unbefristet" wählen'); return; }
    setLaden(true);
    try {
      if (zeitraum) {
        await api.zeitmodell.aktualisieren(zeitraum.id, {
          zeitmodell, gueltigVon, gueltigBis: unbefristet ? null : gueltigBis, bemerkung: bemerkung || undefined,
        });
      } else {
        await api.zeitmodell.erstellen({
          mitarbeiterId, zeitmodell, gueltigVon, gueltigBis: unbefristet ? null : gueltigBis, bemerkung: bemerkung || undefined,
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">{zeitraum ? "Zeitraum bearbeiten" : "Neuer Zeitmodell-Zeitraum"}</h2>
          <button onClick={onSchliessen} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <form onSubmit={speichern} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mitarbeiter *</label>
            <select
              required disabled={!!zeitraum} value={mitarbeiterId}
              onChange={e => setMitarbeiterId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))] disabled:bg-gray-100"
            >
              <option value="">– auswählen –</option>
              {mitarbeiterListe.map(m => <option key={m.id} value={m.id}>{m.nachname}, {m.vorname}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Zeitmodell *</label>
              <select
                required value={zeitmodell}
                onChange={e => setZeitmodell(e.target.value as Zeitmodell)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
              >
                {ZEITMODELLE_ALLE.map(z => <option key={z} value={z}>{z}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Von *</label>
              <input
                type="date" required value={gueltigVon}
                onChange={e => setGueltigVon(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
              />
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer mb-2">
              <input
                type="checkbox" checked={unbefristet}
                onChange={e => setUnbefristet(e.target.checked)}
                className="rounded border-gray-300 text-[rgb(var(--accent))]"
              />
              <span className="text-sm text-gray-700">Unbefristet</span>
            </label>
            {!unbefristet && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bis *</label>
                <input
                  type="date" required value={gueltigBis}
                  onChange={e => setGueltigBis(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bemerkung</label>
            <textarea
              rows={2} value={bemerkung}
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
              {zeitraum ? "Speichern" : "Erstellen"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Tab: Überstunden – wie Zeitmodell, aber Regelung ist Freitext ──────
function UeberstundenTab({ mitarbeiterListe, abteilungen }: { mitarbeiterListe: Mitarbeiter[]; abteilungen: Abteilung[] }) {
  const [zeitraeume, setZeitraeume]       = useState<UeberstundenEintrag[]>([]);
  const [baldAblaufend, setBaldAblaufend] = useState<UeberstundenEintrag[]>([]);
  const [laden, setLaden]                 = useState(true);
  const [filterMitarbeiter, setFilterMitarbeiter] = useState("");
  const [filterAbteilung, setFilterAbteilung]     = useState("");
  const [nurAktive, setNurAktive] = useState(true);
  const [filterBeschaeftigungsart, setFilterBeschaeftigungsart] = useState<"" | Beschaeftigungsart>("");
  const [ansicht, setAnsicht]     = useState<"tabelle" | "gantt">("tabelle");
  const [modal, setModal]         = useState(false);
  const [bearbeitet, setBearbeitet] = useState<UeberstundenEintrag | null>(null);

  useEffect(() => { laden_(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function laden_() {
    setLaden(true);
    try {
      const [alle, bald] = await Promise.all([
        api.ueberstunden.liste(),
        api.ueberstunden.laufenBaldAb(30),
      ]);
      setZeitraeume(alle);
      setBaldAblaufend(bald);
    } finally {
      setLaden(false);
    }
  }

  async function loeschen(id: string) {
    if (!confirm("Zeitraum wirklich löschen?")) return;
    try {
      await api.ueberstunden.loeschen(id);
      await laden_();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Fehler beim Löschen");
    }
  }

  const gefiltert = zeitraeume.filter(z =>
    (!filterMitarbeiter || z.mitarbeiterId === filterMitarbeiter) &&
    (!filterAbteilung || z.mitarbeiter.abteilung?.id === filterAbteilung) &&
    (!nurAktive || mitarbeiterIstAktiv(z.mitarbeiter)) &&
    (!filterBeschaeftigungsart || (z.mitarbeiter.beschaeftigungsart ?? "MITARBEITER") === filterBeschaeftigungsart)
  );

  const ganttZeilen: GanttZeile[] = useMemo(() => {
    const proMitarbeiter = new Map<string, GanttZeile>();
    for (const z of gefiltert) {
      const key = z.mitarbeiterId;
      if (!proMitarbeiter.has(key)) {
        proMitarbeiter.set(key, {
          id: key, name: `${z.mitarbeiter.nachname}, ${z.mitarbeiter.vorname}`,
          abteilung: z.mitarbeiter.abteilung?.name ?? "– keine Abteilung –",
          balken: [],
        });
      }
      proMitarbeiter.get(key)!.balken.push({
        id: z.id,
        von: z.gueltigVon, bis: z.gueltigBis ?? null,
        farbe: "rgb(var(--accent))",
        titel: z.regelung || "Überstunden (ohne Regelungstext)",
        quelle: z.sitzung ? `${z.sitzung.titel} (${formatDatum(z.sitzung.sitzungsdatum)})` : undefined,
      });
    }
    return [...proMitarbeiter.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [gefiltert]);

  function ganttBalkenBearbeiten(balkenId: string) {
    const eintrag = zeitraeume.find(z => z.id === balkenId);
    if (eintrag) { setBearbeitet(eintrag); setModal(true); }
  }

  return (
    <div>
      {baldAblaufend.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={15} className="text-amber-600" />
            <p className="text-sm font-medium text-amber-900">
              {baldAblaufend.length} Überstunden-Regelung{baldAblaufend.length !== 1 ? "en" : ""} laufen in den nächsten 30 Tagen ab
            </p>
          </div>
          <ul className="space-y-1 max-h-48 overflow-y-auto">
            {baldAblaufend.map(z => (
              <li key={z.id} className="flex items-center justify-between text-sm bg-white border border-amber-100 rounded-lg px-3 py-1.5">
                <span className="text-gray-700">
                  {z.mitarbeiter.nachname}, {z.mitarbeiter.vorname}
                  {z.regelung && <span className="text-gray-400"> · {z.regelung}</span>}
                </span>
                <span className="text-xs text-amber-700 font-medium shrink-0">bis {formatDatum(z.gueltigBis!)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={filterMitarbeiter}
            onChange={e => setFilterMitarbeiter(e.target.value)}
            className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
          >
            <option value="">Alle Mitarbeiter</option>
            {mitarbeiterListe.map(m => <option key={m.id} value={m.id}>{m.nachname}, {m.vorname}</option>)}
          </select>
          <select
            value={filterAbteilung}
            onChange={e => setFilterAbteilung(e.target.value)}
            className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
          >
            <option value="">Alle Abteilungen</option>
            {abteilungen.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-sm text-gray-600">
            <input type="checkbox" checked={nurAktive} onChange={e => setNurAktive(e.target.checked)} />
            Nur aktive
          </label>
          <select
            value={filterBeschaeftigungsart}
            onChange={e => setFilterBeschaeftigungsart(e.target.value as "" | Beschaeftigungsart)}
            className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
          >
            <option value="">Alle Beschäftigungsarten</option>
            {ALLE_BESCHAEFTIGUNGSARTEN.map(art => <option key={art} value={art}>{BESCHAEFTIGUNGSART_LABEL[art]}</option>)}
          </select>
          <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => setAnsicht("tabelle")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors ${ansicht === "tabelle" ? "bg-[rgb(var(--accent))] text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              <List size={14} /> Tabelle
            </button>
            <button
              onClick={() => setAnsicht("gantt")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors ${ansicht === "gantt" ? "bg-[rgb(var(--accent))] text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              <BarChart2 size={14} /> Gantt
            </button>
          </div>
        </div>
        <button
          onClick={() => { setBearbeitet(null); setModal(true); }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white hover:brightness-90 transition-colors"
          style={{ backgroundColor: "rgb(var(--accent))" }}
        >
          <Plus size={16} /> Neuer Zeitraum
        </button>
      </div>

      {laden ? (
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Lade…
        </div>
      ) : ansicht === "gantt" ? (
        <PeriodenGantt zeilen={ganttZeilen} leerText="Keine Überstunden-Zeiträume für diese Auswahl" onBalkenDoppelklick={ganttBalkenBearbeiten} />
      ) : gefiltert.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Timer size={40} className="mx-auto mb-3 opacity-20" />
          <p className="font-medium">Noch keine Überstunden-Zeiträume</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs text-gray-500 uppercase">
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Regelung</th>
                <th className="px-4 py-2.5">Von</th>
                <th className="px-4 py-2.5">Bis</th>
                <th className="px-4 py-2.5">Bemerkung</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {gefiltert.map(z => (
                <tr key={z.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-900">
                    <span className="inline-flex items-center gap-1.5">
                      {z.mitarbeiter.nachname}, {z.mitarbeiter.vorname}
                      <SitzungLink sitzung={z.sitzung} />
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-800">{z.regelung || "–"}</td>
                  <td className="px-4 py-2.5 text-gray-600">{formatDatum(z.gueltigVon)}</td>
                  <td className="px-4 py-2.5 text-gray-600">{z.gueltigBis ? formatDatum(z.gueltigBis) : "unbefristet"}</td>
                  <td className="px-4 py-2.5 text-gray-500">{z.bemerkung ?? "–"}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <button
                      onClick={() => { setBearbeitet(z); setModal(true); }}
                      className="p-1.5 text-gray-400 hover:text-[rgb(var(--accent))] hover:bg-accent/5 rounded transition-colors"
                      title="Bearbeiten"
                    >
                      <Edit3 size={14} />
                    </button>
                    <button
                      onClick={() => loeschen(z.id)}
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
      )}

      {modal && (
        <UeberstundenModal
          zeitraum={bearbeitet}
          mitarbeiterListe={mitarbeiterListe}
          onSchliessen={() => setModal(false)}
          onErfolg={() => { setModal(false); laden_(); }}
        />
      )}
    </div>
  );
}

// ── Modal: Überstunden-Zeitraum anlegen / bearbeiten ────────────────
function UeberstundenModal({
  zeitraum, mitarbeiterListe, onSchliessen, onErfolg,
}: {
  zeitraum: UeberstundenEintrag | null;
  mitarbeiterListe: Mitarbeiter[];
  onSchliessen: () => void;
  onErfolg: () => void;
}) {
  const [mitarbeiterId, setMitarbeiterId] = useState(zeitraum?.mitarbeiterId ?? "");
  const [regelung, setRegelung]           = useState(zeitraum?.regelung ?? "");
  const [gueltigVon, setGueltigVon]       = useState(zeitraum?.gueltigVon?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [unbefristet, setUnbefristet]     = useState(zeitraum ? !zeitraum.gueltigBis : true);
  const [gueltigBis, setGueltigBis]       = useState(zeitraum?.gueltigBis?.slice(0, 10) ?? "");
  const [bemerkung, setBemerkung]         = useState(zeitraum?.bemerkung ?? "");
  const [laden, setLaden]                 = useState(false);
  const [fehler, setFehler]               = useState("");

  async function speichern(e: FormEvent) {
    e.preventDefault();
    setFehler("");
    if (!mitarbeiterId) { setFehler("Bitte einen Mitarbeiter auswählen"); return; }
    if (!unbefristet && !gueltigBis) { setFehler('Bitte ein Enddatum angeben oder "unbefristet" wählen'); return; }
    setLaden(true);
    try {
      if (zeitraum) {
        await api.ueberstunden.aktualisieren(zeitraum.id, {
          regelung: regelung.trim(), gueltigVon, gueltigBis: unbefristet ? null : gueltigBis, bemerkung: bemerkung || undefined,
        });
      } else {
        await api.ueberstunden.erstellen({
          mitarbeiterId, regelung: regelung.trim(), gueltigVon, gueltigBis: unbefristet ? null : gueltigBis, bemerkung: bemerkung || undefined,
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">{zeitraum ? "Zeitraum bearbeiten" : "Neuer Überstunden-Zeitraum"}</h2>
          <button onClick={onSchliessen} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <form onSubmit={speichern} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mitarbeiter *</label>
            <select
              required disabled={!!zeitraum} value={mitarbeiterId}
              onChange={e => setMitarbeiterId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))] disabled:bg-gray-100"
            >
              <option value="">– auswählen –</option>
              {mitarbeiterListe.map(m => <option key={m.id} value={m.id}>{m.nachname}, {m.vorname}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Regelung</label>
            <input
              type="text" value={regelung}
              onChange={e => setRegelung(e.target.value)}
              placeholder="Optional – z.B. Ausgleich in Freizeit, Auszahlung ab 20h"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Von *</label>
            <input
              type="date" required value={gueltigVon}
              onChange={e => setGueltigVon(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
            />
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer mb-2">
              <input
                type="checkbox" checked={unbefristet}
                onChange={e => setUnbefristet(e.target.checked)}
                className="rounded border-gray-300 text-[rgb(var(--accent))]"
              />
              <span className="text-sm text-gray-700">Unbefristet</span>
            </label>
            {!unbefristet && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bis *</label>
                <input
                  type="date" required value={gueltigBis}
                  onChange={e => setGueltigBis(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bemerkung</label>
            <textarea
              rows={2} value={bemerkung}
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
              {zeitraum ? "Speichern" : "Erstellen"}
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

// Gruppiert Eingruppierungs-Einträge (bereits auf gruppe != null gefiltert)
// nach einem beliebigen Merkmal (z.B. Standort) und zählt je Gruppe (1-6).
function gruppiereNachMerkmal(
  eintraege: GehaltsstufenEintrag[],
  merkmal: (m: EintragMitarbeiter) => string,
): GruppenZeile[] {
  const map = new Map<string, Record<number, number>>();
  for (const e of eintraege) {
    const key = merkmal(e.mitarbeiter) || "– keine –";
    if (!map.has(key)) map.set(key, Object.fromEntries(GRUPPEN.map(g => [g, 0])));
    map.get(key)![e.gruppe!]++;
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

// Zählt eine Liste von (Gruppe, Spaltenwert)-Paaren als Gruppe(1-6) × Spalte-Matrix
// (Spalte = Zeitmodell-Buchstabe oder Stufen-Zahl, je nach Aufrufer)
function gruppeXSpalteMatrix(
  paare: { gruppe: number; wert: string }[],
  spalten: string[],
): Record<number, Record<string, number>> {
  const matrix: Record<number, Record<string, number>> = {};
  for (const g of GRUPPEN) matrix[g] = Object.fromEntries(spalten.map(s => [s, 0]));
  for (const { gruppe, wert } of paare) matrix[gruppe][wert]++;
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

  // Zeitmodell hat eine eigene Historie (siehe ZeitmodellTab) – für die
  // Statistik brauchen wir nur, welches Zeitmodell HEUTE je Mitarbeiter aktiv ist.
  const [alleZeitraeume, setAlleZeitraeume] = useState<ZeitmodellEintrag[]>([]);
  useEffect(() => { api.zeitmodell.liste().then(setAlleZeitraeume).catch(() => {}); }, []);

  const zeitmodellAktuellProMitarbeiter = useMemo(() => {
    const heute = new Date();
    const map = new Map<string, Zeitmodell>();
    for (const z of alleZeitraeume) {
      const von = new Date(z.gueltigVon);
      const bis = z.gueltigBis ? new Date(z.gueltigBis) : null;
      if (von <= heute && (!bis || bis >= heute)) map.set(z.mitarbeiterId, z.zeitmodell);
    }
    return map;
  }, [alleZeitraeume]);

  const neuesteProMitarbeiter = useMemo(() => {
    const map = new Map<string, GehaltsstufenEintrag>();
    for (const e of eintraege) {
      const bisher = map.get(e.mitarbeiterId);
      if (!bisher || new Date(e.gueltigAb) > new Date(bisher.gueltigAb)) map.set(e.mitarbeiterId, e);
    }
    return [...map.values()].filter(e => !nurAktive || istAktiv(e.mitarbeiter));
  }, [eintraege, nurAktive]);

  const anzahlProArt = useMemo(() => {
    const zaehler: Record<Beschaeftigungsart, number> = { MITARBEITER: 0, AZUBI: 0, STUDENT: 0, DUALER_STUDENT: 0, ZEITARBEITER: 0 };
    for (const e of neuesteProMitarbeiter) zaehler[e.mitarbeiter.beschaeftigungsart ?? "MITARBEITER"]++;
    return zaehler;
  }, [neuesteProMitarbeiter]);

  const standortVerteilung = useMemo(() => {
    const orte = new Map<string, Record<Beschaeftigungsart, number>>();
    for (const e of neuesteProMitarbeiter) {
      const key = e.mitarbeiter.standort || "– kein Standort –";
      if (!orte.has(key)) orte.set(key, { MITARBEITER: 0, AZUBI: 0, STUDENT: 0, DUALER_STUDENT: 0, ZEITARBEITER: 0 });
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

  // Nur Einträge mit vollständig zugeordneter Gruppe/Stufe fließen in die
  // Gruppe/Stufe/Zeitmodell-Auswertungen ein (siehe "nicht zugeordnet" unten).
  const mitGruppeStufe = useMemo(
    () => neuesteProMitarbeiter.filter((e): e is GehaltsstufenEintrag & { gruppe: number; stufe: number } => e.gruppe != null && e.stufe != null),
    [neuesteProMitarbeiter],
  );

  const gruppeXZeitmodell = useMemo(() => {
    const paare = mitGruppeStufe
      .map(e => ({ gruppe: e.gruppe, wert: zeitmodellAktuellProMitarbeiter.get(e.mitarbeiterId) }))
      .filter((p): p is { gruppe: number; wert: Zeitmodell } => p.wert !== undefined);
    return gruppeXSpalteMatrix(paare, ZEITMODELLE_ALLE);
  }, [mitGruppeStufe, zeitmodellAktuellProMitarbeiter]);

  const gruppeXStufe = useMemo(
    () => gruppeXSpalteMatrix(mitGruppeStufe.map(e => ({ gruppe: e.gruppe, wert: String(e.stufe) })), STUFEN.map(String)),
    [mitGruppeStufe],
  );

  const standortXGruppe = useMemo(() => gruppiereNachMerkmal(mitGruppeStufe, m => m.standort ?? ""), [mitGruppeStufe]);

  // Abteilung × Gruppe × Stufe – je Abteilung eine eigene Matrix, damit man per
  // Dropdown gezielt eine Abteilung anschauen kann statt eine riesige Tabelle
  // mit allen Abteilungen auf einmal zu haben.
  const abteilungGruppeStufe = useMemo(() => {
    const map = new Map<string, Record<number, Record<string, number>>>();
    for (const e of mitGruppeStufe) {
      const key = e.mitarbeiter.abteilung?.name;
      if (!key) continue;
      if (!map.has(key)) {
        map.set(key, Object.fromEntries(GRUPPEN.map(g => [g, Object.fromEntries(STUFEN.map(s => [String(s), 0]))])));
      }
      map.get(key)![e.gruppe][String(e.stufe)]++;
    }
    return map;
  }, [mitGruppeStufe]);
  const abteilungenMitDaten = useMemo(() => [...abteilungGruppeStufe.keys()].sort((a, b) => a.localeCompare(b)), [abteilungGruppeStufe]);
  const [statistikAbteilung, setStatistikAbteilung] = useState("");
  const leereGruppeStufeMatrix = useMemo(
    () => Object.fromEntries(GRUPPEN.map(g => [g, Object.fromEntries(STUFEN.map(s => [String(s), 0]))])) as Record<number, Record<string, number>>,
    [],
  );

  // AT ("außer Tarif") – reales Gehalt statt Gruppe/Stufe, kein Datenproblem,
  // taucht deshalb bewusst nicht in den Gruppe/Stufe-Auswertungen oben auf.
  const atEintraege = useMemo(() => neuesteProMitarbeiter.filter(e => e.gehaltAt != null), [neuesteProMitarbeiter]);
  const atDurchschnitt = atEintraege.length > 0
    ? atEintraege.reduce((summe, e) => summe + Number(e.gehaltAt), 0) / atEintraege.length
    : 0;

  // Einzige echten Ausreißer: weder Gruppe/Stufe noch AT-Gehalt gesetzt – kann
  // nur bei sehr alten, händisch verpfuschten Einträgen vorkommen.
  // ALLE Einträge prüfen, nicht nur der aktuellste je Mitarbeiter.
  const nichtZugeordnet = useMemo(
    () => eintraege
      .filter(e => e.gruppe == null && e.stufe == null && e.gehaltAt == null)
      .sort((a, b) => new Date(b.gueltigAb).getTime() - new Date(a.gueltigAb).getTime()),
    [eintraege],
  );

  return (
    <div className="space-y-5 mb-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
        <MiniStat titel="MA mit Gehaltseintrag" wert={neuesteProMitarbeiter.length} />
        <MiniStat titel="Mitarbeiter" wert={anzahlProArt.MITARBEITER} />
        <MiniStat titel="Azubis" wert={anzahlProArt.AZUBI} />
        <MiniStat titel="Stud. Hilfskräfte" wert={anzahlProArt.STUDENT} />
        <MiniStat titel="Duale Studenten" wert={anzahlProArt.DUALER_STUDENT} />
        <MiniStat titel="Zeitarbeiter" wert={anzahlProArt.ZEITARBEITER} />
        <MiniStat titel="AT" wert={atEintraege.length} />
      </div>
      <p className="text-xs text-gray-400 -mt-3">
        Basis: Mitarbeiter mit mindestens einem Gehaltsstufen-Eintrag{nurAktive && " · nur aktive"}
        {atEintraege.length > 0 && ` · Ø AT-Gehalt ${formatGehalt(atDurchschnitt)}`}
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
        unterschrift="Aktuelle Eingruppierung × aktuell gültiges Zeitmodell je Mitarbeiter"
        spalten={ZEITMODELLE_ALLE}
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

      {nichtZugeordnet.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={15} className="text-red-600" />
            <p className="text-sm font-medium text-red-900">
              {nichtZugeordnet.length} Eintrag{nichtZugeordnet.length !== 1 ? "e" : ""} ohne Gruppe/Stufe und ohne AT-Gehalt –
              bitte einmalig in der Liste nachpflegen (fehlen oben in den Auswertungen)
            </p>
          </div>
          <ul className="space-y-1 max-h-56 overflow-y-auto">
            {nichtZugeordnet.map(e => (
              <li key={e.id}>
                <button
                  onClick={() => aufMitarbeiterSpringen(e.mitarbeiterId)}
                  title="Zur Liste springen und auf diesen Mitarbeiter filtern"
                  className="w-full flex items-center justify-between text-sm bg-white border border-red-100 rounded-lg px-3 py-1.5 hover:bg-red-50 transition-colors text-left"
                >
                  <span className="text-gray-700">{e.mitarbeiter.nachname}, {e.mitarbeiter.vorname}</span>
                  <span className="text-gray-500 shrink-0">{formatDatum(e.gueltigAb)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
