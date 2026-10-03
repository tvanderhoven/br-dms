import { useState, useEffect, useMemo } from "react";
import {
  Plus, Trash2, Calendar, User, Flag, X, CheckSquare, Pencil,
  List, BarChart2, ChevronDown, ChevronRight, CalendarRange, Folder, ZoomIn, ZoomOut,
} from "lucide-react";
import {
  api, Aufgabe, AufgabeTyp, Benutzer, Prioritaet, Sichtbarkeit, formatDatum,
} from "../lib/api";
import SitzungsEditor from "../components/SitzungsEditor";
import { tiptapZuText, tiptapZuHtml, textZuTiptap } from "../lib/tiptap";

// ── Konstanten ───────────────────────────────────────────────────────
const PRIO_STYLE: Record<Prioritaet, string> = {
  HOCH:    "bg-red-100 text-red-700 border-red-200",
  MITTEL:  "bg-amber-100 text-amber-700 border-amber-200",
  NIEDRIG: "bg-green-100 text-green-700 border-green-200",
};
const PRIO_LABEL: Record<Prioritaet, string> = {
  HOCH: "Hoch", MITTEL: "Mittel", NIEDRIG: "Niedrig",
};
const FARB_PALETTE = [
  "#3B82F6", "#10B981", "#F59E0B", "#EF4444",
  "#8B5CF6", "#EC4899", "#14B8A6", "#F97316",
];

type Ansicht = "gantt" | "liste";
type FilterTyp = "alle" | "erledigt";

interface FormState {
  typ: AufgabeTyp;
  titel: string;
  beschreibungJson: object | null;
  prioritaet: Prioritaet;
  startDatum: string;
  endDatum: string;
  faelligAm: string;
  zugewiesenAnId: string;
  sichtbarkeit: Sichtbarkeit;
  oberProjektId: string;
  farbe: string;
}

const LEER: FormState = {
  typ: "PROJEKT",
  titel: "",
  beschreibungJson: null,
  prioritaet: "MITTEL",
  startDatum: "",
  endDatum: "",
  faelligAm: "",
  zugewiesenAnId: "",
  sichtbarkeit: "OEFFENTLICH",
  oberProjektId: "",
  farbe: "#3B82F6",
};

// ── Hilfsfunktionen ──────────────────────────────────────────────────
function datumFarbe(datum?: string): string {
  if (!datum) return "text-gray-400";
  const tage = Math.ceil((new Date(datum).getTime() - Date.now()) / 86_400_000);
  if (tage < 0)  return "text-red-600 font-semibold";
  if (tage <= 3) return "text-red-500";
  if (tage <= 7) return "text-amber-600";
  return "text-gray-500";
}

// ── Gantt-Ansicht ────────────────────────────────────────────────────
function GanttAnsicht({
  aufgaben,
  filter,
  onBearbeiten,
}: {
  aufgaben: Aufgabe[];
  filter: FilterTyp;
  onBearbeiten: (a: Aufgabe) => void;
}) {
  const heute = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const { minDate, maxDate } = useMemo(() => {
    const daten = aufgaben.flatMap(a => [
      a.startDatum ? new Date(a.startDatum).getTime() : null,
      a.endDatum   ? new Date(a.endDatum).getTime()   : null,
      a.faelligAm  ? new Date(a.faelligAm).getTime()  : null,
    ]).filter((d): d is number => d !== null);

    const fruehestes = daten.length > 0 ? Math.min(...daten) - 7 * 86_400_000 : heute.getTime();
    const spaetestes = daten.length > 0 ? Math.max(...daten) + 7 * 86_400_000 : heute.getTime();

    return {
      minDate: new Date(Math.min(fruehestes, heute.getTime() - 60 * 86_400_000)),
      // Immer mind. 18 Monate in die Zukunft → genug Scroll-Raum
      maxDate: new Date(Math.max(spaetestes, heute.getTime() + 548 * 86_400_000)),
    };
  }, [aufgaben, heute]);

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
  const LABEL_W = 220;
  const ZEILE_H = 44;

  // Breite pro Monat einstellbar (Zoom) – Balken/Zeitachse basieren weiterhin auf
  // Prozentwerten (pct()), daher skaliert bei Änderung einfach die Gesamtbreite mit.
  const [monatBreite, setMonatBreite] = useState(90);
  const MONAT_BREITE_MIN = 50;
  const MONAT_BREITE_MAX = 220;
  const zeitachseBreite = Math.max(1200, monate.length * monatBreite);

  function Balken({
    aufgabe,
    farbe,
    barH,
  }: {
    aufgabe: Aufgabe;
    farbe: string;
    barH: number;
  }) {
    const start = aufgabe.startDatum ? new Date(aufgabe.startDatum) : null;
    const end   = aufgabe.endDatum   ? new Date(aufgabe.endDatum)
                : aufgabe.faelligAm  ? new Date(aufgabe.faelligAm) : null;
    if (!start && !end) return null;

    const l = start ? pct(start) : pct(end!);
    const r = end   ? pct(end)   : pct(start!);
    const w = Math.max(0.5, r - l);
    const top = Math.round((ZEILE_H - barH) / 2);

    const tooltip = [
      aufgabe.titel,
      start ? `Von: ${formatDatum(aufgabe.startDatum!)}` : "",
      end   ? `Bis: ${formatDatum(aufgabe.endDatum ?? aufgabe.faelligAm!)}` : "",
      aufgabe.zugewiesenAn ? `→ ${aufgabe.zugewiesenAn.name}` : "",
    ].filter(Boolean).join("\n");

    return (
      <div
        className="absolute rounded flex items-center px-2 text-white text-xs font-medium cursor-pointer transition-all overflow-hidden"
        style={{
          left:            `${l}%`,
          width:           `${w}%`,
          height:          `${barH}px`,
          top:             `${top}px`,
          backgroundColor: farbe,
          opacity:         aufgabe.erledigt ? 0.45 : 0.9,
        }}
        title={tooltip}
        onClick={() => onBearbeiten(aufgabe)}
      >
        {w > 6 && <span className="truncate">{aufgabe.titel}</span>}
      </div>
    );
  }

  const topLevel = useMemo(() => {
    let items = aufgaben.filter(a => !a.oberProjektId);
    if (filter === "erledigt") items = items.filter(a => a.erledigt);
    return items;
  }, [aufgaben, filter]);
  const hatEintraege = topLevel.length > 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Zoom-Steuerung */}
      <div className="flex items-center justify-end gap-1 px-3 py-1.5 border-b border-gray-100 bg-gray-50">
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
      <div className="overflow-x-auto">
        <div style={{ minWidth: LABEL_W + zeitachseBreite }}>
          {/* ── Header ── */}
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
              <div
                className="absolute top-0 h-full w-0.5 bg-red-400 z-10"
                style={{ left: `${heutePct}%` }}
              />
            </div>
          </div>

          {/* ── Zeilen ── */}
          {!hatEintraege && (
            <div className="text-center text-gray-400 py-16 text-sm">
              Keine Zeiträume vorhanden
            </div>
          )}

          {topLevel.map(eintrag => {
            const kinder = aufgaben.filter(a => a.oberProjektId === eintrag.id);
            const projektFarbe = eintrag.farbe || "#3B82F6";

            return (
              <div key={eintrag.id}>
                {/* Hauptzeile */}
                <div
                  className="flex border-b border-gray-100 hover:bg-gray-50 transition-colors"
                  style={{ height: ZEILE_H }}
                >
                  <div
                    className="shrink-0 border-r border-gray-200 px-3 flex items-center gap-2 sticky left-0 bg-white hover:bg-gray-50 z-10"
                    style={{ width: LABEL_W }}
                  >
                    <span
                      className="w-3 h-3 rounded-sm shrink-0"
                      style={{ backgroundColor: projektFarbe }}
                    />
                    <span
                      className={`text-sm truncate font-semibold text-gray-800 ${eintrag.erledigt ? "line-through text-gray-400" : ""}`}
                    >
                      {eintrag.titel}
                    </span>
                  </div>
                  <div className="flex-1 relative" style={{ height: ZEILE_H }}>
                    <Balken aufgabe={eintrag} farbe={projektFarbe} barH={24} />
                    <div
                      className="absolute top-0 h-full w-px bg-red-200 z-10 pointer-events-none"
                      style={{ left: `${heutePct}%` }}
                    />
                  </div>
                </div>

                {/* Kind-Zeilen – gleicher Titel (z.B. dieselbe Abteilung/Mitarbeiter in
                    mehreren Monaten) wird zu EINER Zeile mit mehreren Balken zusammengefasst,
                    statt für jeden Monat eine eigene Zeile zu erzeugen */}
                {(() => {
                  const gruppen: Record<string, Aufgabe[]> = {};
                  for (const kind of kinder) {
                    const schluessel = kind.titel.trim().toLowerCase();
                    if (!gruppen[schluessel]) gruppen[schluessel] = [];
                    gruppen[schluessel].push(kind);
                  }
                  return Object.values(gruppen).map(gruppe => {
                    const erstes = gruppe[0];
                    const alleErledigt = gruppe.every(k => k.erledigt);
                    return (
                      <div
                        key={erstes.id}
                        className="flex border-b border-gray-50 hover:bg-gray-50 transition-colors"
                        style={{ height: ZEILE_H }}
                      >
                        <div
                          className="shrink-0 border-r border-gray-200 px-3 flex items-center gap-1.5 pl-8 sticky left-0 bg-white hover:bg-gray-50 z-10"
                          style={{ width: LABEL_W }}
                        >
                          <span className="text-gray-300 text-xs select-none">└</span>
                          <span
                            className={`text-xs truncate text-gray-600 ${
                              alleErledigt ? "line-through text-gray-400" : ""
                            }`}
                          >
                            {erstes.titel}
                          </span>
                        </div>
                        <div className="flex-1 relative" style={{ height: ZEILE_H }}>
                          {gruppe.map(kind => (
                            <Balken
                              key={kind.id}
                              aufgabe={kind}
                              farbe={kind.farbe || projektFarbe + "bb"}
                              barH={16}
                            />
                          ))}
                          <div
                            className="absolute top-0 h-full w-px bg-red-200 z-10 pointer-events-none"
                            style={{ left: `${heutePct}%` }}
                          />
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            );
          })}

          {/* Heute-Legende */}
          <div className="px-4 py-2 flex items-center gap-1.5 text-xs text-gray-400 border-t border-gray-100">
            <div className="w-3 h-0.5 bg-red-400 rounded" />
            Heute
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Listenansicht ────────────────────────────────────────────────────
function ListenAnsicht({
  aufgaben,
  filter,
  expandiert,
  onExpandieren,
  onAbhaken,
  onBearbeiten,
  onLoeschen,
}: {
  aufgaben: Aufgabe[];
  filter: FilterTyp;
  expandiert: Set<string>;
  onExpandieren: (id: string) => void;
  onAbhaken: (a: Aufgabe) => void;
  onBearbeiten: (a: Aufgabe) => void;
  onLoeschen: (id: string) => void;
}) {
  // Top-Level Einträge (kein Oberprojekt) = die Zeiträume selbst
  const topLevel = aufgaben.filter(a => {
    if (a.oberProjektId) return false;
    if (filter === "erledigt") return a.erledigt;
    return true;
  });

  if (topLevel.length === 0) {
    return (
      <div className="text-center text-gray-400 py-16">
        <CalendarRange size={40} className="mx-auto mb-3 opacity-30" />
        <p className="text-sm">Keine Zeiträume vorhanden</p>
      </div>
    );
  }

  function ZeitraumBadge({ aufgabe }: { aufgabe: Aufgabe }) {
    const start = aufgabe.startDatum;
    const end   = aufgabe.endDatum ?? aufgabe.faelligAm;
    if (!start && !end) return null;
    const farbe = datumFarbe(end);
    return (
      <span className={`text-xs flex items-center gap-1 ${farbe}`}>
        <Calendar size={11} />
        {start && end
          ? `${formatDatum(start)} – ${formatDatum(end)}`
          : start
          ? `ab ${formatDatum(start)}`
          : `bis ${formatDatum(end!)}`}
      </span>
    );
  }

  function EintragZeile({
    aufgabe,
    einrueckung = 0,
  }: {
    aufgabe: Aufgabe;
    einrueckung?: number;
  }) {
    const alleKinder = aufgaben.filter(a => a.oberProjektId === aufgabe.id);
    const kinder = alleKinder.filter(a => filter === "erledigt" ? a.erledigt : true);
    const hatKinder = alleKinder.length > 0;
    const istOffen = expandiert.has(aufgabe.id);
    const istProjekt = aufgabe.typ === "PROJEKT";

    return (
      <>
        <div
          className={`bg-white rounded-xl border p-4 flex gap-3 transition-opacity ${
            aufgabe.erledigt ? "opacity-60 border-gray-200" : "border-gray-200 shadow-sm"
          }`}
          style={{ marginLeft: einrueckung * 24 }}
        >
          {/* Expand-Toggle für Projekte, Abhak-Kästchen für Kind-Aufgaben */}
          {istProjekt ? (
            <button
              onClick={() => onExpandieren(aufgabe.id)}
              className="mt-0.5 w-5 h-5 shrink-0 flex items-center justify-center text-gray-400 hover:text-gray-700 transition-colors"
            >
              {hatKinder
                ? (istOffen ? <ChevronDown size={15} /> : <ChevronRight size={15} />)
                : <span
                    className="w-3 h-3 rounded-sm shrink-0"
                    style={{ backgroundColor: aufgabe.farbe || "#3B82F6" }}
                  />
              }
            </button>
          ) : (
            <button
              onClick={() => onAbhaken(aufgabe)}
              className={`mt-0.5 w-5 h-5 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${
                aufgabe.erledigt
                  ? "bg-green-500 border-green-500 text-white"
                  : "border-gray-300 hover:border-accent/60"
              }`}
            >
              {aufgabe.erledigt && (
                <svg viewBox="0 0 12 10" className="w-3 h-3 fill-current">
                  <path d="M1 5l3 4L11 1" />
                </svg>
              )}
            </button>
          )}

          {/* Inhalt */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {istProjekt && (
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: aufgabe.farbe || "#3B82F6" }}
                />
              )}
              <p
                className={`font-medium ${istProjekt ? "text-gray-900" : "text-gray-800"} ${aufgabe.erledigt ? "line-through text-gray-400" : ""}`}
              >
                {aufgabe.titel}
              </p>
              {istProjekt && hatKinder && (
                <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
                  {kinder.length}
                </span>
              )}
            </div>

            {aufgabe.beschreibungJson ? (
              <div
                className="text-sm text-gray-500 mt-0.5 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0.5 [&_p]:my-0.5 [&_strong]:font-semibold [&_em]:italic"
                dangerouslySetInnerHTML={{ __html: tiptapZuHtml(aufgabe.beschreibungJson) }}
              />
            ) : aufgabe.beschreibung && (
              <p className="text-sm text-gray-500 mt-0.5">{aufgabe.beschreibung}</p>
            )}

            <div className="flex flex-wrap items-center gap-2 mt-2">
              {istProjekt ? (
                <span className="text-xs px-2 py-0.5 rounded-full border font-medium bg-accent/5 text-accent border-accent/25">
                  <CalendarRange size={10} className="inline mr-1" />
                  Zeitraum
                </span>
              ) : (
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${PRIO_STYLE[aufgabe.prioritaet]}`}>
                  <Flag size={10} className="inline mr-1" />
                  {PRIO_LABEL[aufgabe.prioritaet]}
                </span>
              )}

              <ZeitraumBadge aufgabe={aufgabe} />

              {aufgabe.zugewiesenAn && (
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <User size={11} />
                  {aufgabe.zugewiesenAn.name}
                </span>
              )}

              <span className="text-xs text-gray-400">von {aufgabe.erstelltVon.name}</span>

              {aufgabe.sichtbarkeit === "PRIVAT" && (
                <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full border border-gray-200">
                  Privat
                </span>
              )}
            </div>
          </div>

          {/* Aktionen */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => onBearbeiten(aufgabe)}
              title="Bearbeiten"
              className="text-gray-300 hover:text-accent transition-colors"
            >
              <Pencil size={15} />
            </button>
            <button
              onClick={() => onLoeschen(aufgabe.id)}
              title="Löschen"
              className="text-gray-300 hover:text-red-500 transition-colors"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        {/* Kinder wenn expandiert */}
        {hatKinder && istOffen && (
          <div className="space-y-2 mt-2">
            {kinder.map(kind => (
              <EintragZeile key={kind.id} aufgabe={kind} einrueckung={einrueckung + 1} />
            ))}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="space-y-2">
      {topLevel.map(eintrag => (
        <EintragZeile key={eintrag.id} aufgabe={eintrag} />
      ))}
    </div>
  );
}

// ── Modal-Formular ───────────────────────────────────────────────────
function EintragModal({
  bearbeiten,
  projekte,
  benutzer,
  laden,
  onSpeichern,
  onSchliessen,
  initialTyp,
}: {
  bearbeiten: Aufgabe | null;
  projekte: Aufgabe[];
  benutzer: Benutzer[];
  laden: boolean;
  onSpeichern: (form: FormState) => void;
  onSchliessen: () => void;
  initialTyp?: AufgabeTyp;
}) {
  const [form, setForm] = useState<FormState>(() => {
    if (bearbeiten) {
      return {
        typ:            bearbeiten.typ,
        titel:          bearbeiten.titel,
        beschreibungJson: bearbeiten.beschreibungJson ?? textZuTiptap(bearbeiten.beschreibung),
        prioritaet:     bearbeiten.prioritaet,
        startDatum:     bearbeiten.startDatum?.slice(0, 10) ?? "",
        endDatum:       bearbeiten.endDatum?.slice(0, 10)   ?? "",
        faelligAm:      bearbeiten.faelligAm?.slice(0, 10)  ?? "",
        zugewiesenAnId: bearbeiten.zugewiesenAn?.id ?? "",
        sichtbarkeit:   bearbeiten.sichtbarkeit,
        oberProjektId:  bearbeiten.oberProjektId ?? "",
        farbe:          bearbeiten.farbe ?? "#3B82F6",
      };
    }
    return { ...LEER, typ: initialTyp ?? "PROJEKT" };
  });

  const istProjekt = form.typ === "PROJEKT";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">
            {bearbeiten
              ? (bearbeiten.typ === "PROJEKT" ? "Zeitraum bearbeiten" : "Eintrag bearbeiten")
              : (istProjekt ? "Neuer Zeitraum" : "Neuer Eintrag in Zeitraum")}
          </h2>
          <button onClick={onSchliessen} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <form
          onSubmit={e => { e.preventDefault(); onSpeichern(form); }}
          className="space-y-4"
        >
          {/* Typ-Toggle (nur bei Neuanlage) */}
          {!bearbeiten && (
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {(["PROJEKT", "AUFGABE"] as AufgabeTyp[]).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm(f => ({
                    ...f,
                    typ: t,
                    farbe: t === "PROJEKT" ? f.farbe || "#3B82F6" : f.farbe,
                  }))}
                  className={`flex-1 py-2 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                    form.typ === t
                      ? "bg-[rgb(var(--accent))] text-white"
                      : "bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {t === "PROJEKT"
                    ? <><Folder size={14} /> Zeitraum</>
                    : <><CheckSquare size={14} /> Eintrag im Zeitraum</>}
                </button>
              ))}
            </div>
          )}

          {/* Titel */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {istProjekt ? "Name des Zeitraums" : "Titel"} *
            </label>
            <input
              type="text"
              required
              autoFocus
              value={form.titel}
              onChange={e => setForm(f => ({ ...f, titel: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
            />
          </div>

          {/* Beschreibung */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Beschreibung</label>
            <SitzungsEditor
              content={form.beschreibungJson}
              onChange={json => setForm(f => ({ ...f, beschreibungJson: json }))}
              placeholder="Optional…"
              minHeight="70px"
            />
          </div>

          {/* Farbe (nur Projekte) */}
          {istProjekt && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Farbe</label>
              <div className="flex items-center gap-2 flex-wrap">
                {FARB_PALETTE.map(f => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setForm(s => ({ ...s, farbe: f }))}
                    className={`w-7 h-7 rounded-full transition-all ${
                      form.farbe === f ? "ring-2 ring-offset-2 ring-gray-400 scale-110" : "hover:scale-105"
                    }`}
                    style={{ backgroundColor: f }}
                  />
                ))}
                <input
                  type="color"
                  value={form.farbe}
                  onChange={e => setForm(f => ({ ...f, farbe: e.target.value }))}
                  className="w-7 h-7 rounded cursor-pointer border border-gray-200"
                  title="Benutzerdefinierte Farbe"
                />
              </div>
            </div>
          )}

          {/* Oberprojekt (nur Aufgaben oder Unterprojekte) */}
          {projekte.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {istProjekt ? "Übergeordneter Zeitraum" : "Gehört zu Zeitraum"}
              </label>
              <select
                value={form.oberProjektId}
                onChange={e => setForm(f => ({ ...f, oberProjektId: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
              >
                <option value="">– keines –</option>
                {projekte
                  .filter(p => !bearbeiten || p.id !== bearbeiten.id)
                  .map(p => (
                    <option key={p.id} value={p.id}>{p.titel}</option>
                  ))}
              </select>
            </div>
          )}

          {/* Zeitraum */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Von</label>
              <input
                type="date"
                value={form.startDatum}
                onChange={e => setForm(f => ({ ...f, startDatum: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bis</label>
              <input
                type="date"
                value={form.endDatum}
                onChange={e => setForm(f => ({ ...f, endDatum: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
              />
            </div>
          </div>

          {/* Priorität (nur Kind-Einträge) */}
          {!istProjekt && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Priorität</label>
                <select
                  value={form.prioritaet}
                  onChange={e => setForm(f => ({ ...f, prioritaet: e.target.value as Prioritaet }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                >
                  <option value="HOCH">Hoch</option>
                  <option value="MITTEL">Mittel</option>
                  <option value="NIEDRIG">Niedrig</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fälligkeit</label>
                <input
                  type="date"
                  value={form.faelligAm}
                  onChange={e => setForm(f => ({ ...f, faelligAm: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                />
              </div>
            </div>
          )}

          {/* Zuweisung + Sichtbarkeit */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Zugewiesen an</label>
              <select
                value={form.zugewiesenAnId}
                onChange={e => setForm(f => ({ ...f, zugewiesenAnId: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
              >
                <option value="">– niemand –</option>
                {benutzer.filter(b => b.aktiv).map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sichtbarkeit</label>
              <select
                value={form.sichtbarkeit}
                onChange={e => setForm(f => ({ ...f, sichtbarkeit: e.target.value as Sichtbarkeit }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
              >
                <option value="OEFFENTLICH">Für alle</option>
                <option value="PRIVAT">Nur für mich</option>
              </select>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onSchliessen}
              className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={laden}
              className="flex-1 bg-[rgb(var(--accent))] hover:brightness-90 disabled:opacity-60 text-white py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Speichern
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Hauptkomponente ──────────────────────────────────────────────────
export default function Zeitraeume() {
  const [aufgaben,   setAufgaben]   = useState<Aufgabe[]>([]);
  const [benutzer,   setBenutzer]   = useState<Benutzer[]>([]);
  const [ansicht,    setAnsicht]    = useState<Ansicht>("gantt");
  const [filter,     setFilter]     = useState<FilterTyp>("alle");
  const [modal,      setModal]      = useState(false);
  const [bearbeiten, setBearbeiten] = useState<Aufgabe | null>(null);
  const [laden,      setLaden]      = useState(false);
  const [expandiert, setExpandiert] = useState<Set<string>>(new Set());
  const [initialTyp, setInitialTyp] = useState<AufgabeTyp>("PROJEKT");

  useEffect(() => { laden_(); }, []);

  async function laden_() {
    // Getrennt statt gemeinsam scheitern lassen, damit ein fehlschlagender
    // Aufruf nicht auch die eigentlich erfolgreiche Aufgabenliste mitreißt.
    const [a, b] = await Promise.all([
      api.aufgaben.liste().catch(() => [] as Aufgabe[]),
      api.get<Benutzer[]>("/api/benutzer").catch(() => [] as Benutzer[]),
    ]);
    setAufgaben(a);
    setBenutzer(b);
    // Alle Zeiträume beim Start expandieren
    setExpandiert(new Set(a.filter(x => x.typ === "PROJEKT").map(x => x.id)));
  }

  const projekte = useMemo(
    () => aufgaben.filter(a => a.typ === "PROJEKT" && !a.oberProjektId),
    [aufgaben],
  );

  // Nur Zeiträume + ihre Kind-Einträge – eigenständige ToDos (Seite "Aufgaben")
  // und Themen-Backlog-Einträge bleiben hier außen vor.
  const zeitraumEintraege = useMemo(
    () => aufgaben.filter(a => a.kanbanStatus == null && (a.typ === "PROJEKT" || a.oberProjektId)),
    [aufgaben],
  );

  function modalOeffnen(aufgabe?: Aufgabe, typ?: AufgabeTyp) {
    setBearbeiten(aufgabe ?? null);
    setInitialTyp(aufgabe?.typ ?? typ ?? "PROJEKT");
    setModal(true);
  }

  function modalSchliessen() {
    setModal(false);
    setBearbeiten(null);
  }

  async function speichern(form: FormState) {
    setLaden(true);
    try {
      const payload = {
        titel:          form.titel,
        beschreibung:   tiptapZuText(form.beschreibungJson) || undefined,
        beschreibungJson: form.beschreibungJson ?? undefined,
        typ:            form.typ,
        prioritaet:     form.prioritaet,
        startDatum:     form.startDatum || undefined,
        endDatum:       form.endDatum   || undefined,
        faelligAm:      form.faelligAm  || undefined,
        farbe:          form.typ === "PROJEKT" ? (form.farbe || undefined) : undefined,
        zugewiesenAnId: form.zugewiesenAnId || undefined,
        sichtbarkeit:   form.sichtbarkeit,
        oberProjektId:  form.oberProjektId  || undefined,
      };

      if (bearbeiten) {
        const aktualisiert = await api.aufgaben.aktualisieren(bearbeiten.id, payload);
        setAufgaben(a => a.map(x => x.id === bearbeiten.id ? aktualisiert : x));
      } else {
        const neu = await api.aufgaben.erstellen(payload);
        setAufgaben(a => [neu, ...a]);
        // Neuer Zeitraum gleich aufklappen
        if (neu.typ === "PROJEKT") {
          setExpandiert(s => new Set([...s, neu.id]));
        }
      }
      modalSchliessen();
    } finally {
      setLaden(false);
    }
  }

  async function abhaken(aufgabe: Aufgabe) {
    const aktualisiert = await api.aufgaben.aktualisieren(aufgabe.id, { erledigt: !aufgabe.erledigt });
    setAufgaben(a => a.map(x => x.id === aufgabe.id ? aktualisiert : x));
  }

  async function loeschen(id: string) {
    await api.aufgaben.loeschen(id);
    setAufgaben(a => a.filter(x => x.id !== id));
  }

  function toggleExpandieren(id: string) {
    setExpandiert(s => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const offeneProjekte = projekte.filter(p => !p.erledigt).length;
  const offeneEintraege = zeitraumEintraege.filter(a => a.oberProjektId && !a.erledigt).length;

  const FILTER_TABS: { key: FilterTyp; label: string }[] = [
    { key: "alle",     label: "Alle" },
    { key: "erledigt", label: "Erledigt" },
  ];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CalendarRange className="text-[rgb(var(--accent))]" size={26} />
            Zeiträume
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {offeneProjekte} {offeneProjekte === 1 ? "Zeitraum" : "Zeiträume"} · {offeneEintraege} offene Einträge darin
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Ansicht-Toggle */}
          <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => setAnsicht("gantt")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors ${
                ansicht === "gantt"
                  ? "bg-[rgb(var(--accent))] text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              <BarChart2 size={14} />
              Gantt
            </button>
            <button
              onClick={() => setAnsicht("liste")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors ${
                ansicht === "liste"
                  ? "bg-[rgb(var(--accent))] text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              <List size={14} />
              Liste
            </button>
          </div>

          {/* Neu-Buttons */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => modalOeffnen(undefined, "PROJEKT")}
              className="flex items-center gap-1.5 border border-[rgb(var(--accent))] text-[rgb(var(--accent))] hover:bg-[rgb(var(--accent))] hover:text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
            >
              <Plus size={15} />
              Zeitraum
            </button>
            <button
              onClick={() => modalOeffnen(undefined, "AUFGABE")}
              className="flex items-center gap-1.5 bg-[rgb(var(--accent))] hover:brightness-90 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
            >
              <Plus size={15} />
              Eintrag
            </button>
          </div>
        </div>
      </div>

      {/* Filter-Tabs */}
      <div className="flex gap-2 mb-5">
        {FILTER_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === tab.key
                ? "bg-[rgb(var(--accent))] text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Inhalt */}
      {ansicht === "gantt" ? (
        <GanttAnsicht
          aufgaben={zeitraumEintraege}
          filter={filter}
          onBearbeiten={a => modalOeffnen(a)}
        />
      ) : (
        <ListenAnsicht
          aufgaben={zeitraumEintraege}
          filter={filter}
          expandiert={expandiert}
          onExpandieren={toggleExpandieren}
          onAbhaken={abhaken}
          onBearbeiten={a => modalOeffnen(a)}
          onLoeschen={loeschen}
        />
      )}

      {/* Modal */}
      {modal && (
        <EintragModal
          bearbeiten={bearbeiten}
          projekte={projekte}
          benutzer={benutzer}
          laden={laden}
          onSpeichern={speichern}
          onSchliessen={modalSchliessen}
          initialTyp={initialTyp}
        />
      )}
    </div>
  );
}
