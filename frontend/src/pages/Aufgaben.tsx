import { useState, useEffect, useMemo } from "react";
import {
  Plus, Trash2, Calendar, User, Flag, X, CheckSquare, Pencil,
  Kanban as KanbanIcon, List as ListIcon, Lightbulb,
} from "lucide-react";
import {
  api, Aufgabe, Benutzer, Prioritaet, Sichtbarkeit, AufgabenStatus, formatDatum,
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

type FilterTyp = "alle" | "offen" | "erledigt";
type Ansicht = "kanban" | "liste";

const AUFGABEN_SPALTEN: { status: AufgabenStatus; label: string; hinweis?: string }[] = [
  { status: "NEU",            label: "Neu" },
  { status: "IN_BEARBEITUNG", label: "In Bearbeitung" },
  { status: "AUF_HOLD",       label: "Auf Hold", hinweis: "Pausiert / wartet auf Feedback" },
  { status: "ERLEDIGT",       label: "Erledigt" },
];

interface FormState {
  titel: string;
  beschreibungJson: object | null;
  prioritaet: Prioritaet;
  faelligAm: string;
  zugewiesenAnId: string;
  sichtbarkeit: Sichtbarkeit;
}

const LEER: FormState = {
  titel: "",
  beschreibungJson: null,
  prioritaet: "MITTEL",
  faelligAm: "",
  zugewiesenAnId: "",
  sichtbarkeit: "OEFFENTLICH",
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

// ── Listenansicht (flach – ToDos haben keine Kind-Einträge) ───────────
function ListenAnsicht({
  aufgaben,
  filter,
  onAbhaken,
  onBearbeiten,
  onLoeschen,
}: {
  aufgaben: Aufgabe[];
  filter: FilterTyp;
  onAbhaken: (a: Aufgabe) => void;
  onBearbeiten: (a: Aufgabe) => void;
  onLoeschen: (id: string) => void;
}) {
  const gefiltert = aufgaben.filter(a => {
    if (filter === "offen")    return !a.erledigt;
    if (filter === "erledigt") return  a.erledigt;
    return true;
  });

  if (gefiltert.length === 0) {
    return (
      <div className="text-center text-gray-400 py-16">
        <CheckSquare size={40} className="mx-auto mb-3 opacity-30" />
        <p className="text-sm">Keine Aufgaben vorhanden</p>
      </div>
    );
  }

  function ZeitraumBadge({ aufgabe }: { aufgabe: Aufgabe }) {
    if (!aufgabe.faelligAm) return null;
    const farbe = datumFarbe(aufgabe.faelligAm);
    return (
      <span className={`text-xs flex items-center gap-1 ${farbe}`}>
        <Calendar size={11} />
        fällig {formatDatum(aufgabe.faelligAm)}
      </span>
    );
  }

  return (
    <div className="space-y-2">
      {gefiltert.map(aufgabe => (
        <div
          key={aufgabe.id}
          onDoubleClick={() => onBearbeiten(aufgabe)}
          className={`bg-white rounded-xl border p-4 flex gap-3 transition-opacity cursor-pointer ${
            aufgabe.erledigt ? "opacity-60 border-gray-200" : "border-gray-200 shadow-sm"
          }`}
        >
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

          <div className="flex-1 min-w-0">
            <p className={`font-medium text-gray-800 ${aufgabe.erledigt ? "line-through text-gray-400" : ""}`}>
              {aufgabe.titel}
            </p>

            {aufgabe.beschreibungJson ? (
              <div
                className="text-sm text-gray-500 mt-0.5 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0.5 [&_p]:my-0.5 [&_strong]:font-semibold [&_em]:italic"
                dangerouslySetInnerHTML={{ __html: tiptapZuHtml(aufgabe.beschreibungJson) }}
              />
            ) : aufgabe.beschreibung && (
              <p className="text-sm text-gray-500 mt-0.5">{aufgabe.beschreibung}</p>
            )}

            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${PRIO_STYLE[aufgabe.prioritaet]}`}>
                <Flag size={10} className="inline mr-1" />
                {PRIO_LABEL[aufgabe.prioritaet]}
              </span>

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
      ))}
    </div>
  );
}

// ── Kanban-Ansicht ───────────────────────────────────────────────────
function KanbanAnsicht({
  aufgaben,
  onSchnellErstellen,
  onStatusAendern,
  onBearbeiten,
  onLoeschen,
}: {
  aufgaben: Aufgabe[];
  onSchnellErstellen: (titel: string, status: AufgabenStatus) => void;
  onStatusAendern: (aufgabe: Aufgabe, status: AufgabenStatus) => void;
  onBearbeiten: (a: Aufgabe) => void;
  onLoeschen: (id: string) => void;
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
              <span className="text-xs text-gray-400 bg-gray-200 px-1.5 py-0.5 rounded-full">
                {karten.length}
              </span>
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
                      <button onClick={() => onLoeschen(karte.id)} title="Löschen" className="text-gray-300 hover:text-red-500">
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

// ── Modal-Formular ───────────────────────────────────────────────────
function EintragModal({
  bearbeiten,
  benutzer,
  laden,
  onSpeichern,
  onSchliessen,
}: {
  bearbeiten: Aufgabe | null;
  benutzer: Benutzer[];
  laden: boolean;
  onSpeichern: (form: FormState) => void;
  onSchliessen: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => {
    if (bearbeiten) {
      return {
        titel:            bearbeiten.titel,
        beschreibungJson: bearbeiten.beschreibungJson ?? textZuTiptap(bearbeiten.beschreibung),
        prioritaet:       bearbeiten.prioritaet,
        faelligAm:        bearbeiten.faelligAm?.slice(0, 10) ?? "",
        zugewiesenAnId:   bearbeiten.zugewiesenAn?.id ?? "",
        sichtbarkeit:     bearbeiten.sichtbarkeit,
      };
    }
    return { ...LEER };
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">
            {bearbeiten ? "Aufgabe bearbeiten" : "Neue Aufgabe"}
          </h2>
          <button onClick={onSchliessen} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <form
          onSubmit={e => { e.preventDefault(); onSpeichern(form); }}
          className="space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Titel *</label>
            <input
              type="text"
              required
              autoFocus
              value={form.titel}
              onChange={e => setForm(f => ({ ...f, titel: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Beschreibung</label>
            <SitzungsEditor
              content={form.beschreibungJson}
              onChange={json => setForm(f => ({ ...f, beschreibungJson: json }))}
              placeholder="Optional…"
              minHeight="70px"
            />
          </div>

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
export default function Aufgaben() {
  const [aufgaben,   setAufgaben]   = useState<Aufgabe[]>([]);
  const [benutzer,   setBenutzer]   = useState<Benutzer[]>([]);
  const [filter,     setFilter]     = useState<FilterTyp>("alle");
  const [ansicht,    setAnsicht]    = useState<Ansicht>("kanban");
  const [modal,      setModal]      = useState(false);
  const [bearbeiten, setBearbeiten] = useState<Aufgabe | null>(null);
  const [laden,      setLaden]      = useState(false);

  useEffect(() => { laden_(); }, []);

  async function laden_() {
    // Getrennt statt Promise.all, damit ein fehlschlagender Aufruf (z.B. fehlende
    // Berechtigung für die Benutzerliste) nicht auch die eigentlich erfolgreiche
    // Aufgabenliste mit in den Fehler reißt und die ganze Seite leer bleibt.
    const [a, b] = await Promise.all([
      api.aufgaben.liste().catch(() => [] as Aufgabe[]),
      api.get<Benutzer[]>("/api/benutzer").catch(() => [] as Benutzer[]),
    ]);
    setAufgaben(a);
    setBenutzer(b);
  }

  // Nur eigenständige ToDos: kein Themen-Backlog-Eintrag, kein Zeitraum,
  // und keinem Zeitraum zugeordnet (die leben jetzt auf der Zeiträume-Seite).
  const todos = useMemo(
    () => aufgaben.filter(a => a.kanbanStatus == null && a.typ === "AUFGABE" && !a.oberProjektId),
    [aufgaben],
  );

  function modalOeffnen(aufgabe?: Aufgabe) {
    setBearbeiten(aufgabe ?? null);
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
        titel:            form.titel,
        beschreibung:     tiptapZuText(form.beschreibungJson) || undefined,
        beschreibungJson: form.beschreibungJson ?? undefined,
        typ:              "AUFGABE" as const,
        prioritaet:       form.prioritaet,
        faelligAm:        form.faelligAm || undefined,
        zugewiesenAnId:   form.zugewiesenAnId || undefined,
        sichtbarkeit:     form.sichtbarkeit,
      };

      if (bearbeiten) {
        const aktualisiert = await api.aufgaben.aktualisieren(bearbeiten.id, payload);
        setAufgaben(a => a.map(x => x.id === bearbeiten.id ? aktualisiert : x));
      } else {
        const neu = await api.aufgaben.erstellen(payload);
        setAufgaben(a => [neu, ...a]);
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
    });
    setAufgaben(a => [neu, ...a]);
  }

  async function loeschen(id: string) {
    await api.aufgaben.loeschen(id);
    setAufgaben(a => a.filter(x => x.id !== id));
  }

  const offen    = todos.filter(a => !a.erledigt).length;
  const erledigt = todos.filter(a =>  a.erledigt).length;

  const FILTER_TABS: { key: FilterTyp; label: string }[] = [
    { key: "alle",     label: "Alle" },
    { key: "offen",    label: `Offen (${offen})` },
    { key: "erledigt", label: "Erledigt" },
  ];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CheckSquare className="text-[rgb(var(--accent))]" size={26} />
            Aufgaben
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {offen} offene Aufgaben · {erledigt} erledigt
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => setAnsicht("kanban")}
              title="Kanban-Board"
              className={`p-2 transition-colors ${ansicht === "kanban" ? "bg-[rgb(var(--accent))] text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
            >
              <KanbanIcon size={16} />
            </button>
            <button
              onClick={() => setAnsicht("liste")}
              title="Liste"
              className={`p-2 transition-colors ${ansicht === "liste" ? "bg-[rgb(var(--accent))] text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
            >
              <ListIcon size={16} />
            </button>
          </div>
          <button
            onClick={() => modalOeffnen()}
            className="flex items-center gap-1.5 bg-[rgb(var(--accent))] hover:brightness-90 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={15} />
            Aufgabe
          </button>
        </div>
      </div>

      {/* Inhalt */}
      {ansicht === "kanban" ? (
        <KanbanAnsicht
          aufgaben={todos}
          onSchnellErstellen={schnellErstellen}
          onStatusAendern={statusAendern}
          onBearbeiten={a => modalOeffnen(a)}
          onLoeschen={loeschen}
        />
      ) : (
        <>
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

          <ListenAnsicht
            aufgaben={todos}
            filter={filter}
            onAbhaken={abhaken}
            onBearbeiten={a => modalOeffnen(a)}
            onLoeschen={loeschen}
          />
        </>
      )}

      {/* Modal */}
      {modal && (
        <EintragModal
          bearbeiten={bearbeiten}
          benutzer={benutzer}
          laden={laden}
          onSpeichern={speichern}
          onSchliessen={modalSchliessen}
        />
      )}
    </div>
  );
}
