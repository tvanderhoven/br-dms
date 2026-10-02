import { useState, useEffect, useMemo, useRef, ChangeEvent } from "react";
import { Users, MapPin, Loader2, X, CheckSquare, Square, Pencil, Search, Upload, GraduationCap, Briefcase } from "lucide-react";
import {
  api, Mitarbeiter, Abteilung, MitarbeiterImportZusammenfassung, formatDatum,
  Beschaeftigungsart, ALLE_BESCHAEFTIGUNGSARTEN, BESCHAEFTIGUNGSART_LABEL, BESCHAEFTIGUNGSART_KUERZEL, BESCHAEFTIGUNGSART_FARBE,
} from "../lib/api";
import MitarbeiterBearbeitenModal from "../components/MitarbeiterBearbeitenModal";

// ── Modal: Import-Vorschau (Dry-Run) / Bestätigung ─────────────────
function ImportVorschauModal({
  vorschau, fehlerText, laden, onBestaetigen, onAbbrechen,
}: {
  vorschau: MitarbeiterImportZusammenfassung;
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
              <div className="text-xs text-gray-500">Neue Mitarbeiter</div>
              <div className="text-lg font-bold text-gray-900">{vorschau.neueMitarbeiter.length}</div>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="text-xs text-gray-500">Bereits vorhanden</div>
              <div className="text-lg font-bold text-gray-900">{vorschau.bereitsVorhanden.length}</div>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="text-xs text-gray-500">Neue Abteilungen</div>
              <div className="text-lg font-bold text-gray-900">{vorschau.neueAbteilungen.length}</div>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="text-xs text-gray-500">Übersprungen / Fehler</div>
              <div className="text-lg font-bold text-gray-900">{vorschau.uebersprungen.length} / {vorschau.fehler.length}</div>
            </div>
          </div>

          {vorschau.neueMitarbeiter.length > 0 && (
            <div>
              <p className="font-medium text-gray-700 mb-1">Neue Mitarbeiter</p>
              <ul className="list-disc list-inside text-gray-600 space-y-0.5 max-h-32 overflow-y-auto">
                {vorschau.neueMitarbeiter.map((m, i) => <li key={i}>{m.name}{m.pnr ? ` (PNR ${m.pnr})` : ""}</li>)}
              </ul>
            </div>
          )}

          {vorschau.bereitsVorhanden.length > 0 && (
            <div>
              <p className="font-medium text-gray-700 mb-1">Bereits vorhanden (werden nicht doppelt angelegt)</p>
              <ul className="list-disc list-inside text-gray-600 space-y-0.5 max-h-32 overflow-y-auto">
                {vorschau.bereitsVorhanden.map((m, i) => <li key={i}>{m.name}{m.pnr ? ` (PNR ${m.pnr})` : ""}</li>)}
              </ul>
            </div>
          )}

          {vorschau.neueAbteilungen.length > 0 && (
            <div>
              <p className="font-medium text-gray-700 mb-1">Neue Abteilungen</p>
              <ul className="list-disc list-inside text-gray-600 space-y-0.5">
                {vorschau.neueAbteilungen.map((a, i) => <li key={i}>{a}</li>)}
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
            className="flex-1 bg-[rgb(var(--accent))] hover:brightness-90 disabled:opacity-60 text-white py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2">
            {laden && <Loader2 size={14} className="animate-spin" />}
            Import bestätigen
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Stat-Karte ───────────────────────────────────────────────────────
function StatKarte({ icon, titel, wert, farbe }: {
  icon: React.ReactElement; titel: string; wert: number | string;
  farbe: "blue" | "green" | "gray" | "violet" | "amber" | "teal";
}) {
  const iconKlasse: Record<string, string> = {
    blue:   "text-blue-600 bg-blue-50",
    green:  "text-green-600 bg-green-50",
    gray:   "text-gray-600 bg-gray-100",
    violet: "text-violet-600 bg-violet-50",
    amber:  "text-amber-600 bg-amber-50",
    teal:   "text-teal-600 bg-teal-50",
  };
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className={`p-2 rounded-lg w-fit mb-3 ${iconKlasse[farbe]}`}>{icon}</div>
      <p className="text-2xl font-bold text-gray-900">{wert}</p>
      <p className="text-sm text-gray-500 mt-1">{titel}</p>
    </div>
  );
}

function istAktiv(m: Mitarbeiter): boolean {
  return !m.austritt || new Date(m.austritt) >= new Date();
}

export default function MitarbeiterUebersicht() {
  const [liste, setListe]           = useState<Mitarbeiter[]>([]);
  const [abteilungen, setAbteilungen] = useState<Abteilung[]>([]);
  const [laden, setLaden]           = useState(true);
  const [nurAktive, setNurAktive]   = useState(true);
  const [filterSuche, setFilterSuche]         = useState("");
  const [filterAbteilung, setFilterAbteilung] = useState("");
  const [filterStandort, setFilterStandort]   = useState("");
  const [filterBeschaeftigungsart, setFilterBeschaeftigungsart] = useState<"" | Beschaeftigungsart>("");
  const [ausgewaehlt, setAusgewaehlt] = useState<Set<string>>(new Set());
  const [standortEingabe, setStandortEingabe] = useState("");
  const [speichern, setSpeichern]   = useState(false);
  const [bearbeiten, setBearbeiten] = useState<Mitarbeiter | null>(null);

  const importInputRef = useRef<HTMLInputElement>(null);
  const [importDatei, setImportDatei] = useState<File | null>(null);
  const [importVorschau, setImportVorschau] = useState<MitarbeiterImportZusammenfassung | null>(null);
  const [importLaden, setImportLaden] = useState(false);
  const [importFehler, setImportFehler] = useState("");

  useEffect(() => { laden_(); }, []);

  async function laden_() {
    setLaden(true);
    try {
      const [m, a] = await Promise.all([api.mitarbeiter.liste(), api.abteilungen.liste()]);
      setListe(m);
      setAbteilungen(a);
    } finally {
      setLaden(false);
    }
  }

  const standorte = useMemo(
    () => [...new Set(liste.map(m => m.standort).filter((s): s is string => !!s))].sort(),
    [liste],
  );

  // Nur für den Filter oben: Abteilungen ohne jeden Mitarbeiter blähen die
  // Such-Vorschläge nur unnötig auf. Beim Zuordnen (Bearbeiten-Modal) bleiben
  // weiterhin alle Abteilungen wählbar.
  const abteilungenMitMitarbeitern = useMemo(
    () => abteilungen.filter(a => liste.some(m => m.abteilungId === a.id)),
    [abteilungen, liste],
  );

  const basisliste = nurAktive ? liste.filter(istAktiv) : liste;

  const gefiltert = useMemo(() => {
    const suchbegriff = filterAbteilung.trim().toLowerCase();
    const name = filterSuche.trim().toLowerCase();
    return basisliste.filter(m => {
      if (suchbegriff && !(m.abteilung?.name ?? "").toLowerCase().includes(suchbegriff)) return false;
      if (filterStandort === "__LEER__" && m.standort) return false;
      if (filterStandort && filterStandort !== "__LEER__" && (m.standort ?? "") !== filterStandort) return false;
      if (filterBeschaeftigungsart && (m.beschaeftigungsart ?? "MITARBEITER") !== filterBeschaeftigungsart) return false;
      if (name) {
        const treffer = `${m.vorname} ${m.nachname}`.toLowerCase().includes(name)
          || (m.pnr ?? "").toLowerCase().includes(name);
        if (!treffer) return false;
      }
      return true;
    });
  }, [basisliste, filterSuche, filterAbteilung, filterStandort, filterBeschaeftigungsart]);

  // Anzahl je Beschäftigungsart (auf Basis der aktiven/inaktiven-Auswahl, ohne die übrigen Filter)
  const anzahlProArt = useMemo(() => {
    const zaehler: Record<Beschaeftigungsart, number> = { MITARBEITER: 0, AZUBI: 0, STUDENT: 0, DUALER_STUDENT: 0, ZEITARBEITER: 0 };
    for (const m of basisliste) zaehler[m.beschaeftigungsart ?? "MITARBEITER"]++;
    return zaehler;
  }, [basisliste]);

  // Standort-Verteilung nach Beschäftigungsart aufgeschlüsselt (gestapelter Balken)
  const standortVerteilung = useMemo(() => {
    const orte = new Map<string, Record<Beschaeftigungsart, number>>();
    for (const m of basisliste) {
      const key = m.standort || "– kein Standort –";
      if (!orte.has(key)) orte.set(key, { MITARBEITER: 0, AZUBI: 0, STUDENT: 0, DUALER_STUDENT: 0, ZEITARBEITER: 0 });
      orte.get(key)![m.beschaeftigungsart ?? "MITARBEITER"]++;
    }
    return [...orte.entries()]
      .map(([standort, zaehler]) => ({
        standort,
        zaehler,
        gesamt: ALLE_BESCHAEFTIGUNGSARTEN.reduce((summe, art) => summe + zaehler[art], 0),
      }))
      .sort((a, b) => b.gesamt - a.gesamt);
  }, [basisliste]);

  const maxVerteilung = Math.max(1, ...standortVerteilung.map(o => o.gesamt));
  const vorkommendeArten = ALLE_BESCHAEFTIGUNGSARTEN.filter(art => anzahlProArt[art] > 0);

  function alleUmschalten() {
    if (gefiltert.every(m => ausgewaehlt.has(m.id))) {
      setAusgewaehlt(prev => { const n = new Set(prev); gefiltert.forEach(m => n.delete(m.id)); return n; });
    } else {
      setAusgewaehlt(prev => { const n = new Set(prev); gefiltert.forEach(m => n.add(m.id)); return n; });
    }
  }

  function einzelnUmschalten(id: string) {
    setAusgewaehlt(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function standortFuerAuswahlSetzen() {
    if (ausgewaehlt.size === 0) return;
    setSpeichern(true);
    try {
      await api.mitarbeiter.standortBatch([...ausgewaehlt], standortEingabe.trim() || null);
      await laden_();
      setAusgewaehlt(new Set());
      setStandortEingabe("");
    } finally {
      setSpeichern(false);
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
      const vorschau = await api.mitarbeiter.importieren(datei, true);
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
      await api.mitarbeiter.importieren(importDatei, false);
      setImportVorschau(null);
      setImportDatei(null);
      await laden_();
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

  if (laden) {
    return (
      <div className="p-6 flex items-center justify-center h-64 text-gray-400">
        <Loader2 size={20} className="animate-spin mr-2" /> Laden…
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="text-[rgb(var(--accent))]" size={26} />
            Mitarbeiter-Übersicht
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">Stammdaten, Standortverteilung und Sammel-Bearbeitung</p>
        </div>
        <div>
          <input ref={importInputRef} type="file" accept=".csv" className="hidden" onChange={importDateiGewaehlt} />
          <button
            onClick={() => importInputRef.current?.click()}
            disabled={importLaden}
            className="flex items-center gap-2 border border-gray-300 hover:bg-gray-50 disabled:opacity-60 text-gray-700 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            {importLaden ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
            Import (CSV)
          </button>
        </div>
      </div>

      {/* Stat-Karten */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4 mb-6">
        <StatKarte icon={<Users size={18} />} titel="Mitarbeiter aktiv" wert={liste.filter(istAktiv).length} farbe="green" />
        <StatKarte icon={<Users size={18} />} titel="Mitarbeiter gesamt" wert={liste.length} farbe="blue" />
        <StatKarte icon={<MapPin size={18} />} titel="Standorte erfasst" wert={standorte.length} farbe="gray" />
        <StatKarte icon={<GraduationCap size={18} />} titel="Azubis" wert={anzahlProArt.AZUBI} farbe="blue" />
        <StatKarte icon={<GraduationCap size={18} />} titel="Stud. Hilfskräfte" wert={anzahlProArt.STUDENT} farbe="violet" />
        <StatKarte icon={<GraduationCap size={18} />} titel="Duale Studenten" wert={anzahlProArt.DUALER_STUDENT} farbe="teal" />
        <StatKarte icon={<Briefcase size={18} />} titel="Zeitarbeiter" wert={anzahlProArt.ZEITARBEITER} farbe="amber" />
      </div>

      {/* Standort-Verteilung, nach Beschäftigungsart aufgeschlüsselt */}
      {standortVerteilung.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-6">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="text-sm font-semibold text-gray-700">Verteilung nach Standort {nurAktive && "(nur aktive)"}</h2>
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
                      style={{ width: `${(zaehler[art] / maxVerteilung) * 100}%` }}
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

      {/* Filter */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={filterSuche}
            onChange={e => setFilterSuche(e.target.value)}
            placeholder="Name oder Personalnummer…"
            className="border border-gray-300 rounded-lg pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))] w-52"
          />
        </div>

        <input
          type="text"
          value={filterAbteilung}
          onChange={e => setFilterAbteilung(e.target.value)}
          placeholder="Abteilung enthält… (z.B. E1)"
          list="abteilung-suchoptionen"
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))] w-56"
        />
        <datalist id="abteilung-suchoptionen">
          {abteilungenMitMitarbeitern.map(a => <option key={a.id} value={a.name} />)}
        </datalist>

        <select
          value={filterStandort}
          onChange={e => setFilterStandort(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
        >
          <option value="">Alle Standorte</option>
          <option value="__LEER__">– kein Standort –</option>
          {standorte.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <select
          value={filterBeschaeftigungsart}
          onChange={e => setFilterBeschaeftigungsart(e.target.value as "" | Beschaeftigungsart)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
        >
          <option value="">Alle Beschäftigungsarten</option>
          {ALLE_BESCHAEFTIGUNGSARTEN.map(art => <option key={art} value={art}>{BESCHAEFTIGUNGSART_LABEL[art]}</option>)}
        </select>

        <label className="flex items-center gap-1.5 text-sm text-gray-600 ml-1">
          <input type="checkbox" checked={nurAktive} onChange={e => setNurAktive(e.target.checked)} />
          Nur aktive
        </label>

        {(filterSuche || filterAbteilung || filterStandort || filterBeschaeftigungsart) && (
          <button
            onClick={() => { setFilterSuche(""); setFilterAbteilung(""); setFilterStandort(""); setFilterBeschaeftigungsart(""); }}
            className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
          >
            <X size={12} /> Filter zurücksetzen
          </button>
        )}

        <span className="text-xs text-gray-400 ml-auto">{gefiltert.length} {gefiltert.length === 1 ? "Mitarbeiter" : "Mitarbeiter"}</span>
      </div>

      {/* Sammel-Bearbeitung */}
      {ausgewaehlt.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 flex flex-wrap items-center gap-2">
          <span className="text-sm text-blue-800 font-medium">{ausgewaehlt.size} ausgewählt</span>
          <input
            type="text"
            value={standortEingabe}
            onChange={e => setStandortEingabe(e.target.value)}
            placeholder="Standort setzen auf…"
            list="standort-batch-optionen"
            className="border border-blue-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-52"
          />
          <datalist id="standort-batch-optionen">
            {standorte.map(s => <option key={s} value={s} />)}
          </datalist>
          <button
            onClick={standortFuerAuswahlSetzen}
            disabled={speichern}
            className="bg-[rgb(var(--accent))] hover:brightness-90 disabled:opacity-50 text-white text-sm font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5"
          >
            {speichern && <Loader2 size={13} className="animate-spin" />}
            Standort übernehmen
          </button>
          <button
            onClick={() => setAusgewaehlt(new Set())}
            className="text-xs text-blue-600 hover:text-blue-800"
          >
            Auswahl aufheben
          </button>
        </div>
      )}

      {/* Tabelle */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-2.5 w-8">
                <button onClick={alleUmschalten} className="text-gray-400 hover:text-gray-600" title="Alle sichtbaren auswählen/abwählen">
                  {gefiltert.length > 0 && gefiltert.every(m => ausgewaehlt.has(m.id))
                    ? <CheckSquare size={15} /> : <Square size={15} />}
                </button>
              </th>
              <th className="px-4 py-2.5 text-left">Name</th>
              <th className="px-4 py-2.5 text-left">PNR</th>
              <th className="px-4 py-2.5 text-left">Abteilung</th>
              <th className="px-4 py-2.5 text-left">Standort</th>
              <th className="px-4 py-2.5 text-left">Eintritt</th>
              <th className="px-4 py-2.5 text-left">Austritt</th>
              <th className="px-4 py-2.5 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {gefiltert.map(m => (
              <tr key={m.id} className={`hover:bg-gray-50 ${!istAktiv(m) ? "opacity-50" : ""}`}>
                <td className="px-4 py-2.5">
                  <button onClick={() => einzelnUmschalten(m.id)} className="text-gray-400 hover:text-gray-600">
                    {ausgewaehlt.has(m.id) ? <CheckSquare size={15} className="text-[rgb(var(--accent))]" /> : <Square size={15} />}
                  </button>
                </td>
                <td className="px-4 py-2.5 font-medium text-gray-800">
                  {m.nachname}, {m.vorname}
                  {m.beschaeftigungsart && m.beschaeftigungsart !== "MITARBEITER" && (
                    <span
                      className={`ml-2 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${BESCHAEFTIGUNGSART_FARBE[m.beschaeftigungsart].badge}`}
                      title={BESCHAEFTIGUNGSART_LABEL[m.beschaeftigungsart]}
                    >
                      {BESCHAEFTIGUNGSART_KUERZEL[m.beschaeftigungsart]}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-gray-500">{m.pnr ?? "–"}</td>
                <td className="px-4 py-2.5 text-gray-600">{m.abteilung?.name ?? "–"}</td>
                <td className="px-4 py-2.5 text-gray-600">{m.standort ?? "–"}</td>
                <td className="px-4 py-2.5 text-gray-500">{m.eintritt ? formatDatum(m.eintritt) : "–"}</td>
                <td className="px-4 py-2.5 text-gray-500">{m.austritt ? formatDatum(m.austritt) : "–"}</td>
                <td className="px-4 py-2.5">
                  <button
                    onClick={() => setBearbeiten(m)}
                    title="Stammdaten bearbeiten (Name, Abteilung, Standort, Ein-/Austritt)"
                    className="text-gray-300 hover:text-blue-500 transition-colors"
                  >
                    <Pencil size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {gefiltert.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Keine Mitarbeiter gefunden</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {bearbeiten && (
        <MitarbeiterBearbeitenModal
          mitarbeiter={bearbeiten}
          abteilungen={abteilungen}
          standorte={standorte}
          onSchliessen={() => setBearbeiten(null)}
          onErfolg={aktualisiert => {
            setListe(prev => prev.map(m => m.id === aktualisiert.id ? aktualisiert : m));
            setBearbeiten(null);
          }}
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
    </div>
  );
}
