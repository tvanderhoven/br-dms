import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Plus, Trash2, Calendar, User, Flag, X, CheckSquare, Pencil, Folder,
  Kanban as KanbanIcon, List as ListIcon, BarChart2, Lightbulb,
  ChevronDown, ChevronRight, ZoomIn, ZoomOut,
} from "lucide-react";
import {
  api, Aufgabe, AufgabeTyp, Benutzer, Prioritaet, Sichtbarkeit, AufgabenStatus, formatDatum,
} from "../lib/api";
import SitzungsEditor from "../components/SitzungsEditor";
import { tiptapZuText, tiptapZuHtml, textZuTiptap } from "../lib/tiptap";

// Aufgaben und Vorhaben auf einer Seite. Ein Vorhaben (DB: typ = PROJEKT) ist
// eine Klammer um mehrere Aufgaben mit Zeitraum, z. B. "JAV-Wahl 2026" –
// früher eine eigene Seite "Zeiträume". Themen-Backlog-Einträge (kanbanStatus
// gesetzt) gehören nicht hierher.

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
  "#222327", "#C8102E", "#86888A", "#3B82F6",
  "#10B981", "#F59E0B", "#8B5CF6", "#14B8A6",
];
const STANDARD_FARBE = "#86888A";

type Ansicht = "board" | "liste" | "zeitplan";
type StatusFilter = "alle" | "offen" | "erledigt";
const OHNE_VORHABEN = "__ohne__";
const ANSICHT_SPEICHER = "brdms_aufgaben_ansicht";

const AUFGABEN_SPALTEN: { status: AufgabenStatus; label: string; hinweis?: string }[] = [
  { status: "NEU",            label: "Neu" },
  { status: "IN_BEARBEITUNG", label: "In Bearbeitung" },
  { status: "AUF_HOLD",       label: "Auf Hold", hinweis: "Pausiert / wartet auf Feedback" },
  { status: "ERLEDIGT",       label: "Erledigt" },
];

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
  typ: "AUFGABE",
  titel: "",
  beschreibungJson: null,
  prioritaet: "MITTEL",
  startDatum: "",
  endDatum: "",
  faelligAm: "",
  zugewiesenAnId: "",
  sichtbarkeit: "OEFFENTLICH",
  oberProjektId: "",
  farbe: STANDARD_FARBE,
};

const inputKlasse = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]";

// ── Hilfsfunktionen ──────────────────────────────────────────────────
function datumFarbe(datum?: string): string {
  if (!datum) return "text-gray-400";
  const tage = Math.ceil((new Date(datum).getTime() - Date.now()) / 86_400_000);
  if (tage < 0)  return "text-red-600 font-semibold";
  if (tage <= 3) return "text-red-500";
  if (tage <= 7) return "text-amber-600";
  return "text-gray-500";
}

function DatumBadge({ aufgabe }: { aufgabe: Aufgabe }) {
  const start = aufgabe.startDatum;
  const end   = aufgabe.endDatum ?? aufgabe.faelligAm;
  if (!start && !end) return null;
  return (
    <span className={`text-xs flex items-center gap-1 ${datumFarbe(end)}`}>
      <Calendar size={11} />
      {start && end
        ? `${formatDatum(start)} – ${formatDatum(end)}`
        : start
        ? `ab ${formatDatum(start)}`
        : aufgabe.typ === "AUFGABE" ? `fällig ${formatDatum(end!)}` : `bis ${formatDatum(end!)}`}
    </span>
  );
}

function VorhabenBadge({ aufgabe }: { aufgabe: Aufgabe }) {
  if (!aufgabe.oberProjekt) return null;
  return (
    <span className="text-xs text-gray-500 flex items-center gap-1 min-w-0" title={`Vorhaben: ${aufgabe.oberProjekt.titel}`}>
      <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: aufgabe.oberProjekt.farbe || STANDARD_FARBE }} />
      <span className="truncate">{aufgabe.oberProjekt.titel}</span>
    </span>
  );
}

function Haken({ erledigt, onClick }: { erledigt: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`mt-0.5 w-5 h-5 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${
        erledigt ? "bg-green-500 border-green-500 text-white" : "border-gray-300 hover:border-accent/60"
      }`}
    >
      {erledigt && (
        <svg viewBox="0 0 12 10" className="w-3 h-3 fill-current">
          <path d="M1 5l3 4L11 1" />
        </svg>
      )}
    </button>
  );
}

// ── Board (Kanban) ───────────────────────────────────────────────────
function BoardAnsicht({
  aufgaben, onSchnellErstellen, onStatusAendern, onBearbeiten, onLoeschen,
}: {
  aufgaben: Aufgabe[];
  onSchnellErstellen: (titel: string, status: AufgabenStatus) => void;
  onStatusAendern: (aufgabe: Aufgabe, status: AufgabenStatus) => void;
  onBearbeiten: (a: Aufgabe) => void;
  onLoeschen: (a: Aufgabe) => void;
}) {
  const [neuTitel, setNeuTitel] = useState<Record<string, string>>({});
  const [ziehtUeber, setZiehtUeber] = useState<AufgabenStatus | null>(null);

  function absenden(status: AufgabenStatus) {
    const titel = (neuTitel[status] ?? "").trim();
    if (!titel) return;
    onSchnellErstellen(titel, status);
    setNeuTitel(s => ({ ...s, [status]: "" }));
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {AUFGABEN_SPALTEN.map(spalte => {
        const karten = aufgaben.filter(a => (a.aufgabenStatus ?? "NEU") === spalte.status);
        return (
          <div
            key={spalte.status}
            onDragOver={e => { e.preventDefault(); setZiehtUeber(spalte.status); }}
            onDragLeave={() => setZiehtUeber(s => (s === spalte.status ? null : s))}
            onDrop={e => {
              e.preventDefault();
              setZiehtUeber(null);
              const id = e.dataTransfer.getData("text/aufgabe-id");
              const aufgabe = aufgaben.find(a => a.id === id);
              if (aufgabe && (aufgabe.aufgabenStatus ?? "NEU") !== spalte.status) {
                onStatusAendern(aufgabe, spalte.status);
              }
            }}
            className={`rounded-xl border transition-colors ${
              ziehtUeber === spalte.status
                ? "border-[rgb(var(--accent))] bg-[rgb(var(--accent))]/5"
                : "border-gray-200 bg-gray-50"
            }`}
          >
            <div className="px-3 py-2.5 border-b border-gray-200 flex items-center justify-between" title={spalte.hinweis}>
              <h3 className="text-sm font-semibold text-gray-700">{spalte.label}</h3>
              <span className="text-xs text-gray-400 bg-gray-200 px-1.5 py-0.5 rounded-full">{karten.length}</span>
            </div>

            <div className="p-2.5 space-y-2 min-h-[80px]">
              {karten.map(karte => (
                <div
                  key={karte.id}
                  draggable
                  onDragStart={e => e.dataTransfer.setData("text/aufgabe-id", karte.id)}
                  onDoubleClick={() => onBearbeiten(karte)}
                  className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 cursor-grab active:cursor-grabbing group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm font-medium flex-1 min-w-0 break-words ${
                      spalte.status === "ERLEDIGT" ? "text-gray-400 line-through" : "text-gray-800"
                    }`}>
                      {karte.titel}
                    </p>
                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => onBearbeiten(karte)} title="Bearbeiten" className="text-gray-300 hover:text-accent">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => onLoeschen(karte)} title="Löschen" className="text-gray-300 hover:text-red-500">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {karte.beschreibungJson ? (
                    <div
                      className="text-xs text-gray-500 mt-1 line-clamp-3 [&_p]:my-0 [&_strong]:font-semibold [&_em]:italic"
                      dangerouslySetInnerHTML={{ __html: tiptapZuHtml(karte.beschreibungJson) }}
                    />
                  ) : karte.beschreibung && (
                    <p className="text-xs text-gray-500 mt-1 line-clamp-3">{karte.beschreibung}</p>
                  )}

                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded-full border font-medium ${PRIO_STYLE[karte.prioritaet]}`}>
                      <Flag size={9} className="inline mr-0.5" />
                      {PRIO_LABEL[karte.prioritaet]}
                    </span>
                    {karte.faelligAm && (
                      <span className={`text-xs flex items-center gap-1 ${datumFarbe(karte.faelligAm)}`}>
                        <Calendar size={10} />
                        {formatDatum(karte.faelligAm)}
                      </span>
                    )}
                    {karte.zugewiesenAn && (
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <User size={10} />
                        {karte.zugewiesenAn.name}
                      </span>
                    )}
                  </div>
                  {karte.oberProjekt && <div className="mt-1.5"><VorhabenBadge aufgabe={karte} /></div>}
                </div>
              ))}

              {karten.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">Keine Aufgaben</p>
              )}

              <div className="flex items-center gap-1.5 pt-1">
                <Lightbulb size={13} className="text-gray-300 shrink-0" />
                <input
                  type="text"
                  value={neuTitel[spalte.status] ?? ""}
                  onChange={e => setNeuTitel(s => ({ ...s, [spalte.status]: e.target.value }))}
                  onKeyDown={e => { if (e.key === "Enter") absenden(spalte.status); }}
                  placeholder="+ Aufgabe…"
                  className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Liste (gruppiert nach Vorhaben) ──────────────────────────────────
function ListenAnsicht({
  wurzeln, ohneVorhaben, alle, statusFilter, expandiert,
  onExpandieren, onAbhaken, onBearbeiten, onLoeschen, onNeueAufgabeIn,
}: {
  wurzeln: Aufgabe[];               // anzuzeigende Vorhaben (oberste Ebene)
  ohneVorhaben: Aufgabe[] | null;   // eigenständige Aufgaben; null = Abschnitt ausblenden
  alle: Aufgabe[];                  // alle Aufgaben + Vorhaben (für Kinder-Suche)
  statusFilter: StatusFilter;
  expandiert: Set<string>;
  onExpandieren: (id: string) => void;
  onAbhaken: (a: Aufgabe) => void;
  onBearbeiten: (a: Aufgabe) => void;
  onLoeschen: (a: Aufgabe) => void;
  onNeueAufgabeIn: (vorhabenId: string) => void;
}) {
  const passt = (a: Aufgabe) =>
    statusFilter === "alle" || (statusFilter === "offen" ? !a.erledigt : a.erledigt);

  function Zeile({ aufgabe, einrueckung = 0 }: { aufgabe: Aufgabe; einrueckung?: number }) {
    const istVorhaben = aufgabe.typ === "PROJEKT";
    const kinder = alle.filter(a => a.oberProjektId === aufgabe.id);
    const sichtbareKinder = kinder.filter(k => k.typ === "PROJEKT" || passt(k));
    const offeneKinder = kinder.filter(k => k.typ === "AUFGABE" && !k.erledigt).length;
    const istOffen = expandiert.has(aufgabe.id);

    return (
      <>
        <div
          onDoubleClick={() => onBearbeiten(aufgabe)}
          className={`bg-white rounded-xl border p-4 flex gap-3 transition-opacity ${
            aufgabe.erledigt ? "opacity-60 border-gray-200" : "border-gray-200 shadow-sm"
          } ${istVorhaben ? "border-l-4" : ""}`}
          style={{ marginLeft: einrueckung * 24, ...(istVorhaben ? { borderLeftColor: aufgabe.farbe || STANDARD_FARBE } : {}) }}
        >
          {istVorhaben ? (
            <button
              onClick={() => onExpandieren(aufgabe.id)}
              className="mt-0.5 w-5 h-5 shrink-0 flex items-center justify-center text-gray-400 hover:text-gray-700 transition-colors"
              title={istOffen ? "Zuklappen" : "Aufklappen"}
            >
              {istOffen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            </button>
          ) : (
            <Haken erledigt={aufgabe.erledigt} onClick={() => onAbhaken(aufgabe)} />
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {istVorhaben && <Folder size={14} className="text-gray-400 shrink-0" />}
              <p className={`font-medium ${istVorhaben ? "text-gray-900" : "text-gray-800"} ${aufgabe.erledigt ? "line-through text-gray-400" : ""}`}>
                {aufgabe.titel}
              </p>
              {istVorhaben && kinder.length > 0 && (
                <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full" title="offene Aufgaben">
                  {offeneKinder} offen
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
              {istVorhaben ? (
                <span className="text-xs px-2 py-0.5 rounded-full border font-medium bg-gray-50 text-gray-600 border-gray-200">
                  Vorhaben
                </span>
              ) : (
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${PRIO_STYLE[aufgabe.prioritaet]}`}>
                  <Flag size={10} className="inline mr-1" />
                  {PRIO_LABEL[aufgabe.prioritaet]}
                </span>
              )}
              <DatumBadge aufgabe={aufgabe} />
              {aufgabe.zugewiesenAn && (
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <User size={11} />
                  {aufgabe.zugewiesenAn.name}
                </span>
              )}
              <span className="text-xs text-gray-400">von {aufgabe.erstelltVon.name}</span>
              {aufgabe.sichtbarkeit === "PRIVAT" && (
                <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full border border-gray-200">Privat</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {istVorhaben && (
              <button onClick={() => onNeueAufgabeIn(aufgabe.id)} title="Aufgabe in diesem Vorhaben anlegen"
                className="text-gray-300 hover:text-accent transition-colors">
                <Plus size={16} />
              </button>
            )}
            <button onClick={() => onBearbeiten(aufgabe)} title="Bearbeiten" className="text-gray-300 hover:text-accent transition-colors">
              <Pencil size={15} />
            </button>
            <button onClick={() => onLoeschen(aufgabe)} title="Löschen" className="text-gray-300 hover:text-red-500 transition-colors">
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        {istVorhaben && istOffen && (
          <div className="space-y-2 mt-2">
            {sichtbareKinder.map(kind => (
              <Zeile key={kind.id} aufgabe={kind} einrueckung={einrueckung + 1} />
            ))}
            {sichtbareKinder.length === 0 && (
              <p className="text-xs text-gray-400 py-1" style={{ marginLeft: (einrueckung + 1) * 24 + 8 }}>
                {kinder.length === 0 ? "Noch keine Aufgaben in diesem Vorhaben." : "Keine Aufgaben für diesen Filter."}
              </p>
            )}
          </div>
        )}
      </>
    );
  }

  const eigenstaendig = (ohneVorhaben ?? []).filter(passt);
  const leer = wurzeln.length === 0 && eigenstaendig.length === 0;

  if (leer) {
    return (
      <div className="text-center text-gray-400 py-16">
        <CheckSquare size={40} className="mx-auto mb-3 opacity-30" />
        <p className="text-sm">Keine Aufgaben vorhanden</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {wurzeln.map(v => <Zeile key={v.id} aufgabe={v} />)}
      {ohneVorhaben !== null && eigenstaendig.length > 0 && (
        <>
          {wurzeln.length > 0 && (
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 pt-4 pb-1">Ohne Vorhaben</h3>
          )}
          {eigenstaendig.map(a => <Zeile key={a.id} aufgabe={a} />)}
        </>
      )}
    </div>
  );
}

// ── Zeitplan (Gantt) ─────────────────────────────────────────────────
function ZeitplanAnsicht({
  aufgaben, wurzeln, onBearbeiten,
}: {
  aufgaben: Aufgabe[];   // Vorhaben + ihre Aufgaben
  wurzeln: Aufgabe[];    // Vorhaben der obersten Ebene, die gezeigt werden
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

  function Balken({ aufgabe, farbe, barH }: { aufgabe: Aufgabe; farbe: string; barH: number }) {
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
          left: `${l}%`, width: `${w}%`, height: `${barH}px`, top: `${top}px`,
          backgroundColor: farbe, opacity: aufgabe.erledigt ? 0.45 : 0.9,
        }}
        title={tooltip}
        onClick={() => onBearbeiten(aufgabe)}
      >
        {w > 6 && <span className="truncate">{aufgabe.titel}</span>}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
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
          <div className="flex border-b border-gray-200 bg-gray-50">
            <div
              className="shrink-0 border-r border-gray-200 px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-20"
              style={{ width: LABEL_W }}
            >
              Vorhaben
            </div>
            <div className="flex-1 relative bg-gray-50" style={{ height: 36 }}>
              {monate.map((m, i) => (
                <div
                  key={i}
                  className="absolute top-0 h-full border-l border-gray-200 flex items-center px-1.5 text-xs text-gray-400"
                  style={{ left: `${m.left}%`, width: `${m.width}%` }}
                >
                  {/* angeschnittene Randmonate ohne Platz für die Beschriftung leer lassen */}
                  {m.width * zeitachseBreite / 100 >= 40 && m.label}
                </div>
              ))}
              <div className="absolute top-0 h-full w-0.5 bg-red-400 z-10" style={{ left: `${heutePct}%` }} />
            </div>
          </div>

          {wurzeln.length === 0 && (
            <div className="text-center text-gray-400 py-16 text-sm">
              Keine Vorhaben vorhanden – über „Vorhaben“ oben rechts anlegen.
            </div>
          )}

          {wurzeln.map(eintrag => {
            const kinder = aufgaben.filter(a => a.oberProjektId === eintrag.id);
            const projektFarbe = eintrag.farbe || STANDARD_FARBE;

            return (
              <div key={eintrag.id}>
                <div className="flex border-b border-gray-100 hover:bg-gray-50 transition-colors" style={{ height: ZEILE_H }}>
                  <div
                    className="shrink-0 border-r border-gray-200 px-3 flex items-center gap-2 sticky left-0 bg-white hover:bg-gray-50 z-10"
                    style={{ width: LABEL_W }}
                  >
                    <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: projektFarbe }} />
                    <span className={`text-sm truncate font-semibold text-gray-800 ${eintrag.erledigt ? "line-through text-gray-400" : ""}`}>
                      {eintrag.titel}
                    </span>
                  </div>
                  <div className="flex-1 relative" style={{ height: ZEILE_H }}>
                    <Balken aufgabe={eintrag} farbe={projektFarbe} barH={24} />
                    <div className="absolute top-0 h-full w-px bg-red-200 z-10 pointer-events-none" style={{ left: `${heutePct}%` }} />
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
                      <div key={erstes.id} className="flex border-b border-gray-50 hover:bg-gray-50 transition-colors" style={{ height: ZEILE_H }}>
                        <div
                          className="shrink-0 border-r border-gray-200 px-3 flex items-center gap-1.5 pl-8 sticky left-0 bg-white hover:bg-gray-50 z-10"
                          style={{ width: LABEL_W }}
                        >
                          <span className="text-gray-300 text-xs select-none">└</span>
                          <span className={`text-xs truncate text-gray-600 ${alleErledigt ? "line-through text-gray-400" : ""}`}>
                            {erstes.titel}
                          </span>
                        </div>
                        <div className="flex-1 relative" style={{ height: ZEILE_H }}>
                          {gruppe.map(kind => (
                            <Balken key={kind.id} aufgabe={kind} farbe={kind.farbe || projektFarbe + "bb"} barH={16} />
                          ))}
                          <div className="absolute top-0 h-full w-px bg-red-200 z-10 pointer-events-none" style={{ left: `${heutePct}%` }} />
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            );
          })}

          <div className="px-4 py-2 flex items-center gap-1.5 text-xs text-gray-400 border-t border-gray-100">
            <div className="w-3 h-0.5 bg-red-400 rounded" />
            Heute · Aufgaben erscheinen hier mit Zeitraum oder Fälligkeit
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Formular für Aufgabe und Vorhaben ────────────────────────────────
function EintragModal({
  bearbeiten, vorgabe, vorhaben, benutzer, laden, onSpeichern, onSchliessen,
}: {
  bearbeiten: Aufgabe | null;
  vorgabe: Partial<FormState>;
  vorhaben: Aufgabe[];
  benutzer: Benutzer[];
  laden: boolean;
  onSpeichern: (form: FormState) => void;
  onSchliessen: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => {
    if (bearbeiten) {
      return {
        typ:              bearbeiten.typ,
        titel:            bearbeiten.titel,
        beschreibungJson: bearbeiten.beschreibungJson ?? textZuTiptap(bearbeiten.beschreibung),
        prioritaet:       bearbeiten.prioritaet,
        startDatum:       bearbeiten.startDatum?.slice(0, 10) ?? "",
        endDatum:         bearbeiten.endDatum?.slice(0, 10)   ?? "",
        faelligAm:        bearbeiten.faelligAm?.slice(0, 10)  ?? "",
        zugewiesenAnId:   bearbeiten.zugewiesenAn?.id ?? "",
        sichtbarkeit:     bearbeiten.sichtbarkeit,
        oberProjektId:    bearbeiten.oberProjektId ?? "",
        farbe:            bearbeiten.farbe ?? STANDARD_FARBE,
      };
    }
    return { ...LEER, ...vorgabe };
  });
  const [zeitraumZeigen, setZeitraumZeigen] = useState(!!(form.startDatum || form.endDatum));

  const istVorhaben = form.typ === "PROJEKT";
  const setzen = (teil: Partial<FormState>) => setForm(f => ({ ...f, ...teil }));

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">
            {bearbeiten
              ? (istVorhaben ? "Vorhaben bearbeiten" : "Aufgabe bearbeiten")
              : (istVorhaben ? "Neues Vorhaben" : "Neue Aufgabe")}
          </h2>
          <button onClick={onSchliessen} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <form onSubmit={e => { e.preventDefault(); onSpeichern(form); }} className="space-y-4">
          {!bearbeiten && (
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {(["AUFGABE", "PROJEKT"] as AufgabeTyp[]).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setzen({ typ: t })}
                  className={`flex-1 py-2 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                    form.typ === t ? "bg-[rgb(var(--accent))] text-white" : "bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {t === "PROJEKT" ? <><Folder size={14} /> Vorhaben</> : <><CheckSquare size={14} /> Aufgabe</>}
                </button>
              ))}
            </div>
          )}
          {!bearbeiten && istVorhaben && (
            <p className="text-xs text-gray-500 -mt-2">
              Ein Vorhaben bündelt mehrere Aufgaben über einen Zeitraum, z. B. „JAV-Wahl 2026“ oder „Betriebsversammlung Q4“.
            </p>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{istVorhaben ? "Name des Vorhabens" : "Titel"} *</label>
            <input type="text" required autoFocus value={form.titel}
              onChange={e => setzen({ titel: e.target.value })} className={inputKlasse} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Beschreibung</label>
            <SitzungsEditor
              content={form.beschreibungJson}
              onChange={json => setzen({ beschreibungJson: json })}
              placeholder="Optional…"
              minHeight="70px"
            />
          </div>

          {istVorhaben && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Farbe im Zeitplan</label>
              <div className="flex items-center gap-2 flex-wrap">
                {FARB_PALETTE.map(f => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setzen({ farbe: f })}
                    className={`w-7 h-7 rounded-full transition-all ${form.farbe === f ? "ring-2 ring-offset-2 ring-gray-400 scale-110" : "hover:scale-105"}`}
                    style={{ backgroundColor: f }}
                  />
                ))}
                <input type="color" value={form.farbe} onChange={e => setzen({ farbe: e.target.value })}
                  className="w-7 h-7 rounded cursor-pointer border border-gray-200" title="Eigene Farbe" />
              </div>
            </div>
          )}

          {vorhaben.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {istVorhaben ? "Übergeordnetes Vorhaben" : "Vorhaben"}
              </label>
              <select value={form.oberProjektId} onChange={e => setzen({ oberProjektId: e.target.value })} className={inputKlasse}>
                <option value="">{istVorhaben ? "– keines –" : "– ohne Vorhaben –"}</option>
                {vorhaben.filter(p => !bearbeiten || p.id !== bearbeiten.id).map(p => (
                  <option key={p.id} value={p.id}>{p.titel}</option>
                ))}
              </select>
            </div>
          )}

          {!istVorhaben && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Priorität</label>
                <select value={form.prioritaet} onChange={e => setzen({ prioritaet: e.target.value as Prioritaet })} className={inputKlasse}>
                  <option value="HOCH">Hoch</option>
                  <option value="MITTEL">Mittel</option>
                  <option value="NIEDRIG">Niedrig</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fälligkeit</label>
                <input type="date" value={form.faelligAm} onChange={e => setzen({ faelligAm: e.target.value })} className={inputKlasse} />
              </div>
            </div>
          )}

          {istVorhaben || zeitraumZeigen ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Von</label>
                <input type="date" value={form.startDatum} onChange={e => setzen({ startDatum: e.target.value })} className={inputKlasse} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bis</label>
                <input type="date" value={form.endDatum} onChange={e => setzen({ endDatum: e.target.value })} className={inputKlasse} />
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setZeitraumZeigen(true)} className="text-xs text-gray-500 hover:text-accent">
              + Zeitraum angeben (Von/Bis für den Zeitplan)
            </button>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{istVorhaben ? "Verantwortlich" : "Zugewiesen an"}</label>
              <select value={form.zugewiesenAnId} onChange={e => setzen({ zugewiesenAnId: e.target.value })} className={inputKlasse}>
                <option value="">– niemand –</option>
                {benutzer.filter(b => b.aktiv).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sichtbarkeit</label>
              <select value={form.sichtbarkeit} onChange={e => setzen({ sichtbarkeit: e.target.value as Sichtbarkeit })} className={inputKlasse}>
                <option value="OEFFENTLICH">Für alle</option>
                <option value="PRIVAT">Nur für mich</option>
              </select>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onSchliessen}
              className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
              Abbrechen
            </button>
            <button type="submit" disabled={laden}
              className="flex-1 bg-[rgb(var(--accent))] hover:brightness-90 disabled:opacity-60 text-white py-2 rounded-lg text-sm font-medium transition-colors">
              Speichern
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Hauptkomponente ──────────────────────────────────────────────────
export default function Aufgaben() {
  const [suchParameter] = useSearchParams();
  const [aufgaben,   setAufgaben]   = useState<Aufgabe[]>([]);
  const [benutzer,   setBenutzer]   = useState<Benutzer[]>([]);
  const [ansicht,    setAnsichtState] = useState<Ansicht>(() => {
    const ausUrl = suchParameter.get("ansicht");
    if (ausUrl === "board" || ausUrl === "liste" || ausUrl === "zeitplan") return ausUrl;
    try {
      const gemerkt = localStorage.getItem(ANSICHT_SPEICHER);
      if (gemerkt === "board" || gemerkt === "liste" || gemerkt === "zeitplan") return gemerkt;
    } catch { /* localStorage gesperrt */ }
    return "board";
  });
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("alle");
  const [vorhabenFilter, setVorhabenFilter] = useState("");   // "" = alle, OHNE_VORHABEN oder Vorhaben-ID
  const [modal, setModal] = useState<{ bearbeiten: Aufgabe | null; vorgabe: Partial<FormState> } | null>(null);
  const [laden,      setLaden]      = useState(false);
  const [expandiert, setExpandiert] = useState<Set<string>>(new Set());

  useEffect(() => { laden_(); }, []);

  function setAnsicht(a: Ansicht) {
    setAnsichtState(a);
    try { localStorage.setItem(ANSICHT_SPEICHER, a); } catch { /* egal */ }
  }

  async function laden_() {
    // Getrennt statt gemeinsam scheitern lassen, damit ein fehlschlagender Aufruf
    // (z.B. fehlende Berechtigung für die Benutzerliste) die Aufgaben nicht mitreißt.
    const [a, b] = await Promise.all([
      api.aufgaben.liste().catch(() => [] as Aufgabe[]),
      api.get<Benutzer[]>("/api/benutzer").catch(() => [] as Benutzer[]),
    ]);
    setAufgaben(a);
    setBenutzer(b);
    setExpandiert(new Set(a.filter(x => x.typ === "PROJEKT").map(x => x.id)));
  }

  // Themen-Backlog-Einträge (kanbanStatus gesetzt) leben auf ihrer eigenen Seite
  const eintraege = useMemo(() => aufgaben.filter(a => a.kanbanStatus == null), [aufgaben]);
  const vorhaben  = useMemo(() => eintraege.filter(a => a.typ === "PROJEKT"), [eintraege]);
  const todos     = useMemo(() => eintraege.filter(a => a.typ === "AUFGABE"), [eintraege]);

  // Gehört ein Eintrag (direkt oder über Unter-Vorhaben) zum gewählten Vorhaben?
  const elternVon = useMemo(() => new Map(eintraege.map(a => [a.id, a.oberProjektId ?? null])), [eintraege]);
  function liegtIn(a: Aufgabe, vorhabenId: string): boolean {
    let p = a.oberProjektId ?? null;
    const gesehen = new Set<string>();
    while (p && !gesehen.has(p)) {
      if (p === vorhabenId) return true;
      gesehen.add(p);
      p = elternVon.get(p) ?? null;
    }
    return false;
  }

  const gefilterteTodos = useMemo(() => {
    if (vorhabenFilter === OHNE_VORHABEN) return todos.filter(a => !a.oberProjektId);
    if (vorhabenFilter) return todos.filter(a => liegtIn(a, vorhabenFilter));
    return todos;
  }, [todos, vorhabenFilter, elternVon]); // eslint-disable-line react-hooks/exhaustive-deps

  const wurzelVorhaben = useMemo(() => {
    if (vorhabenFilter === OHNE_VORHABEN) return [];
    if (vorhabenFilter) return vorhaben.filter(v => v.id === vorhabenFilter);
    return vorhaben.filter(v => !v.oberProjektId);
  }, [vorhaben, vorhabenFilter]);

  function modalOeffnen(aufgabe?: Aufgabe, vorgabe: Partial<FormState> = {}) {
    // Bei gefiltertem Vorhaben landet eine neue Aufgabe direkt darin
    const imVorhaben = vorhabenFilter && vorhabenFilter !== OHNE_VORHABEN ? { oberProjektId: vorhabenFilter } : {};
    setModal({ bearbeiten: aufgabe ?? null, vorgabe: { ...imVorhaben, ...vorgabe } });
  }

  async function speichern(form: FormState) {
    setLaden(true);
    try {
      const istVorhaben = form.typ === "PROJEKT";
      const payload = {
        titel:            form.titel,
        beschreibung:     tiptapZuText(form.beschreibungJson) || undefined,
        beschreibungJson: form.beschreibungJson ?? undefined,
        typ:              form.typ,
        prioritaet:       form.prioritaet,
        sichtbarkeit:     form.sichtbarkeit,
        farbe:            istVorhaben ? form.farbe : undefined,
      };

      if (modal?.bearbeiten) {
        // Leere Felder ausdrücklich mitschicken, damit sie sich auch wieder leeren lassen
        const aktualisiert = await api.aufgaben.aktualisieren(modal.bearbeiten.id, {
          ...payload,
          startDatum:     form.startDatum,
          endDatum:       form.endDatum,
          faelligAm:      istVorhaben ? undefined : form.faelligAm,
          zugewiesenAnId: form.zugewiesenAnId,
          oberProjektId:  form.oberProjektId,
        });
        // Das Vorhaben eines anderen Eintrags (oberProjekt) kann sich mitgeändert haben
        setAufgaben(a => a.map(x => x.id === aktualisiert.id ? aktualisiert : x));
        if (istVorhaben) laden_();
      } else {
        const neu = await api.aufgaben.erstellen({
          ...payload,
          startDatum:     form.startDatum || undefined,
          endDatum:       form.endDatum   || undefined,
          faelligAm:      istVorhaben ? undefined : (form.faelligAm || undefined),
          zugewiesenAnId: form.zugewiesenAnId || undefined,
          oberProjektId:  form.oberProjektId  || undefined,
        });
        setAufgaben(a => [neu, ...a]);
        if (neu.typ === "PROJEKT") setExpandiert(s => new Set([...s, neu.id]));
        if (neu.oberProjektId) setExpandiert(s => new Set([...s, neu.oberProjektId!]));
      }
      setModal(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    } finally {
      setLaden(false);
    }
  }

  async function abhaken(aufgabe: Aufgabe) {
    const aktualisiert = await api.aufgaben.aktualisieren(aufgabe.id, { erledigt: !aufgabe.erledigt });
    setAufgaben(a => a.map(x => x.id === aufgabe.id ? aktualisiert : x));
  }

  async function statusAendern(aufgabe: Aufgabe, aufgabenStatus: AufgabenStatus) {
    const aktualisiert = await api.aufgaben.aktualisieren(aufgabe.id, { aufgabenStatus });
    setAufgaben(a => a.map(x => x.id === aufgabe.id ? aktualisiert : x));
  }

  async function schnellErstellen(titel: string, aufgabenStatus: AufgabenStatus) {
    const neu = await api.aufgaben.erstellen({
      titel,
      typ: "AUFGABE",
      sichtbarkeit: "OEFFENTLICH",
      aufgabenStatus,
      ...(vorhabenFilter && vorhabenFilter !== OHNE_VORHABEN ? { oberProjektId: vorhabenFilter } : {}),
    });
    setAufgaben(a => [neu, ...a]);
  }

  async function loeschen(eintrag: Aufgabe) {
    const istVorhaben = eintrag.typ === "PROJEKT";
    const frage = istVorhaben
      ? `Vorhaben „${eintrag.titel}“ löschen? Die zugehörigen Aufgaben bleiben erhalten und stehen danach ohne Vorhaben da.`
      : `Aufgabe „${eintrag.titel}“ löschen?`;
    if (!confirm(frage)) return;
    await api.aufgaben.loeschen(eintrag.id);
    if (istVorhaben) {
      if (vorhabenFilter === eintrag.id) setVorhabenFilter("");
      laden_();
    } else {
      setAufgaben(a => a.filter(x => x.id !== eintrag.id));
    }
  }

  function toggleExpandieren(id: string) {
    setExpandiert(s => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const offen = gefilterteTodos.filter(a => !a.erledigt).length;
  const offeneVorhaben = vorhaben.filter(v => !v.erledigt).length;

  // Zeitplan: gewählte Vorhaben samt allem, was darin liegt
  const zeitplanEintraege = useMemo(
    () => eintraege.filter(a => wurzelVorhaben.some(w => a.id === w.id || liegtIn(a, w.id))),
    [eintraege, wurzelVorhaben, elternVon], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const ANSICHTEN: { key: Ansicht; label: string; icon: React.ReactNode }[] = [
    { key: "board",    label: "Board",    icon: <KanbanIcon size={14} /> },
    { key: "liste",    label: "Liste",    icon: <ListIcon size={14} /> },
    { key: "zeitplan", label: "Zeitplan", icon: <BarChart2 size={14} /> },
  ];

  return (
    <div className="p-6">
      {/* Kopf */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CheckSquare className="text-[rgb(var(--accent))]" size={26} />
            Aufgaben
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {offen} offene {offen === 1 ? "Aufgabe" : "Aufgaben"} · {offeneVorhaben} {offeneVorhaben === 1 ? "Vorhaben" : "Vorhaben"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden">
            {ANSICHTEN.map(a => (
              <button
                key={a.key}
                onClick={() => setAnsicht(a.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors ${
                  ansicht === a.key ? "bg-[rgb(var(--accent))] text-white" : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {a.icon}
                {a.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => modalOeffnen(undefined, { typ: "PROJEKT" })}
            className="flex items-center gap-1.5 border border-[rgb(var(--accent))] text-[rgb(var(--accent))] hover:bg-[rgb(var(--accent))] hover:text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={15} />
            Vorhaben
          </button>
          <button
            onClick={() => modalOeffnen(undefined, { typ: "AUFGABE" })}
            className="flex items-center gap-1.5 bg-[rgb(var(--accent))] hover:brightness-90 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={15} />
            Aufgabe
          </button>
        </div>
      </div>

      {/* Filter */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <select
          value={vorhabenFilter}
          onChange={e => setVorhabenFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
        >
          <option value="">Alle Vorhaben</option>
          <option value={OHNE_VORHABEN}>Ohne Vorhaben</option>
          {vorhaben.map(v => (
            <option key={v.id} value={v.id}>{v.oberProjektId ? "↳ " : ""}{v.titel}</option>
          ))}
        </select>
        {ansicht !== "board" && (
          <div className="flex gap-2">
            {([["alle", "Alle"], ["offen", `Offen (${offen})`], ["erledigt", "Erledigt"]] as [StatusFilter, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  statusFilter === key ? "bg-[rgb(var(--accent))] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Inhalt */}
      {ansicht === "board" && (
        <BoardAnsicht
          aufgaben={gefilterteTodos}
          onSchnellErstellen={schnellErstellen}
          onStatusAendern={statusAendern}
          onBearbeiten={a => modalOeffnen(a)}
          onLoeschen={loeschen}
        />
      )}
      {ansicht === "liste" && (
        <ListenAnsicht
          wurzeln={wurzelVorhaben}
          ohneVorhaben={vorhabenFilter && vorhabenFilter !== OHNE_VORHABEN ? null : todos.filter(a => !a.oberProjektId)}
          alle={eintraege}
          statusFilter={statusFilter}
          expandiert={expandiert}
          onExpandieren={toggleExpandieren}
          onAbhaken={abhaken}
          onBearbeiten={a => modalOeffnen(a)}
          onLoeschen={loeschen}
          onNeueAufgabeIn={id => modalOeffnen(undefined, { typ: "AUFGABE", oberProjektId: id })}
        />
      )}
      {ansicht === "zeitplan" && (
        <ZeitplanAnsicht
          aufgaben={zeitplanEintraege.filter(a =>
            a.typ === "PROJEKT" || statusFilter === "alle" || (statusFilter === "offen" ? !a.erledigt : a.erledigt))}
          wurzeln={wurzelVorhaben}
          onBearbeiten={a => modalOeffnen(a)}
        />
      )}

      {modal && (
        <EintragModal
          bearbeiten={modal.bearbeiten}
          vorgabe={modal.vorgabe}
          vorhaben={vorhaben}
          benutzer={benutzer}
          laden={laden}
          onSpeichern={speichern}
          onSchliessen={() => setModal(null)}
        />
      )}
    </div>
  );
}
