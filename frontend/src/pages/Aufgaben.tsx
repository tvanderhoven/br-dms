import { useState, useEffect, FormEvent } from "react";
import { Plus, Trash2, Calendar, User, Flag, X, CheckSquare, Pencil } from "lucide-react";
import { api, Aufgabe, Benutzer, Prioritaet, Sichtbarkeit, formatDatum } from "../lib/api";

const PRIO_STYLE: Record<Prioritaet, string> = {
  HOCH:    "bg-red-100 text-red-700 border-red-200",
  MITTEL:  "bg-amber-100 text-amber-700 border-amber-200",
  NIEDRIG: "bg-green-100 text-green-700 border-green-200",
};
const PRIO_LABEL: Record<Prioritaet, string> = {
  HOCH: "Hoch", MITTEL: "Mittel", NIEDRIG: "Niedrig",
};

function faelligFarbe(datum?: string): string {
  if (!datum) return "text-gray-400";
  const tage = Math.ceil((new Date(datum).getTime() - Date.now()) / 86_400_000);
  if (tage < 0)  return "text-red-600 font-semibold";
  if (tage <= 3) return "text-red-500";
  if (tage <= 7) return "text-amber-600";
  return "text-gray-500";
}

interface FormState {
  titel: string;
  beschreibung: string;
  prioritaet: Prioritaet;
  faelligAm: string;
  zugewiesenAnId: string;
  sichtbarkeit: Sichtbarkeit;
}

const LEER: FormState = { titel: "", beschreibung: "", prioritaet: "MITTEL", faelligAm: "", zugewiesenAnId: "", sichtbarkeit: "OEFFENTLICH" };

export default function Aufgaben() {
  const [aufgaben,    setAufgaben]    = useState<Aufgabe[]>([]);
  const [benutzer,    setBenutzer]    = useState<Benutzer[]>([]);
  const [modal,       setModal]       = useState(false);
  const [bearbeiten,  setBearbeiten]  = useState<Aufgabe | null>(null);
  const [form,        setForm]        = useState<FormState>(LEER);
  const [laden,       setLaden]       = useState(false);
  const [filter,      setFilter]      = useState<"alle" | "offen" | "erledigt">("alle");

  useEffect(() => { laden_(); }, []);

  async function laden_() {
    const [a, b] = await Promise.all([api.aufgaben.liste(), api.get<Benutzer[]>("/api/benutzer")]);
    setAufgaben(a);
    setBenutzer(b);
  }

  function modalOeffnen(aufgabe?: Aufgabe) {
    if (aufgabe) {
      setBearbeiten(aufgabe);
      setForm({
        titel:          aufgabe.titel,
        beschreibung:   aufgabe.beschreibung ?? "",
        prioritaet:     aufgabe.prioritaet,
        faelligAm:      aufgabe.faelligAm ? aufgabe.faelligAm.slice(0, 10) : "",
        zugewiesenAnId: aufgabe.zugewiesenAn?.id ?? "",
        sichtbarkeit:   aufgabe.sichtbarkeit,
      });
    } else {
      setBearbeiten(null);
      setForm(LEER);
    }
    setModal(true);
  }

  function modalSchliessen() {
    setModal(false);
    setBearbeiten(null);
    setForm(LEER);
  }

  async function speichern(e: FormEvent) {
    e.preventDefault();
    setLaden(true);
    try {
      if (bearbeiten) {
        const aktualisiert = await api.aufgaben.aktualisieren(bearbeiten.id, {
          titel:          form.titel,
          beschreibung:   form.beschreibung || undefined,
          prioritaet:     form.prioritaet,
          faelligAm:      form.faelligAm || undefined,
          zugewiesenAnId: form.zugewiesenAnId || undefined,
          sichtbarkeit:   form.sichtbarkeit,
        });
        setAufgaben(a => a.map(x => x.id === bearbeiten.id ? aktualisiert : x));
      } else {
        const neu = await api.aufgaben.erstellen({
          titel:          form.titel,
          beschreibung:   form.beschreibung || undefined,
          prioritaet:     form.prioritaet,
          faelligAm:      form.faelligAm || undefined,
          zugewiesenAnId: form.zugewiesenAnId || undefined,
          sichtbarkeit:   form.sichtbarkeit,
        });
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

  async function loeschen(id: string) {
    await api.aufgaben.loeschen(id);
    setAufgaben(a => a.filter(x => x.id !== id));
  }

  const gefiltert = aufgaben.filter(a =>
    filter === "alle"     ? true :
    filter === "offen"    ? !a.erledigt :
    a.erledigt
  );

  const offen    = aufgaben.filter(a => !a.erledigt).length;
  const erledigt = aufgaben.filter(a =>  a.erledigt).length;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CheckSquare className="text-[rgb(var(--accent))]" size={26} />
            Aufgaben
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {offen} offen · {erledigt} erledigt
          </p>
        </div>
        <button
          onClick={() => modalOeffnen()}
          className="flex items-center gap-2 bg-[rgb(var(--accent))] hover:brightness-90 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} /> Neue Aufgabe
        </button>
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-5">
        {(["alle", "offen", "erledigt"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors capitalize ${
              filter === f ? "bg-[rgb(var(--accent))] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {f === "alle" ? "Alle" : f === "offen" ? "Offen" : "Erledigt"}
          </button>
        ))}
      </div>

      {/* Aufgaben-Liste */}
      {gefiltert.length === 0 ? (
        <div className="text-center text-gray-400 py-16">
          <CheckSquare size={40} className="mx-auto mb-3 opacity-30" />
          <p>Keine Aufgaben vorhanden</p>
        </div>
      ) : (
        <div className="space-y-3">
          {gefiltert.map(aufgabe => (
            <div
              key={aufgabe.id}
              className={`bg-white rounded-xl border p-4 flex gap-3 transition-opacity ${
                aufgabe.erledigt ? "opacity-60 border-gray-200" : "border-gray-200 shadow-sm"
              }`}
            >
              {/* Checkbox */}
              <button
                onClick={() => abhaken(aufgabe)}
                className={`mt-0.5 w-5 h-5 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${
                  aufgabe.erledigt
                    ? "bg-green-500 border-green-500 text-white"
                    : "border-gray-300 hover:border-blue-400"
                }`}
              >
                {aufgabe.erledigt && <svg viewBox="0 0 12 10" className="w-3 h-3 fill-current"><path d="M1 5l3 4L11 1"/></svg>}
              </button>

              {/* Inhalt */}
              <div className="flex-1 min-w-0">
                <p className={`font-medium text-gray-900 ${aufgabe.erledigt ? "line-through text-gray-400" : ""}`}>
                  {aufgabe.titel}
                </p>
                {aufgabe.beschreibung && (
                  <p className="text-sm text-gray-500 mt-0.5">{aufgabe.beschreibung}</p>
                )}
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${PRIO_STYLE[aufgabe.prioritaet]}`}>
                    <Flag size={10} className="inline mr-1" />
                    {PRIO_LABEL[aufgabe.prioritaet]}
                  </span>
                  {aufgabe.faelligAm && (
                    <span className={`text-xs flex items-center gap-1 ${faelligFarbe(aufgabe.faelligAm)}`}>
                      <Calendar size={11} />
                      {formatDatum(aufgabe.faelligAm)}
                    </span>
                  )}
                  {aufgabe.zugewiesenAn && (
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                      <User size={11} />
                      {aufgabe.zugewiesenAn.name}
                    </span>
                  )}
                  <span className="text-xs text-gray-400">
                    von {aufgabe.erstelltVon.name}
                  </span>
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
                  onClick={() => modalOeffnen(aufgabe)}
                  title="Bearbeiten"
                  className="text-gray-300 hover:text-blue-500 transition-colors"
                >
                  <Pencil size={15} />
                </button>
                <button
                  onClick={() => loeschen(aufgabe.id)}
                  title="Löschen"
                  className="text-gray-300 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">
                {bearbeiten ? "Aufgabe bearbeiten" : "Neue Aufgabe"}
              </h2>
              <button onClick={modalSchliessen} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={speichern} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Titel *</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={form.titel}
                  onChange={e => setForm(f => ({ ...f, titel: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Beschreibung</label>
                <textarea
                  rows={2}
                  value={form.beschreibung}
                  onChange={e => setForm(f => ({ ...f, beschreibung: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))] resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Priorität</label>
                  <select
                    value={form.prioritaet}
                    onChange={e => setForm(f => ({ ...f, prioritaet: e.target.value as Prioritaet }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                  >
                    <option value="HOCH">Hoch</option>
                    <option value="MITTEL">Mittel</option>
                    <option value="NIEDRIG">Niedrig</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fällig am</label>
                  <input
                    type="date"
                    value={form.faelligAm}
                    onChange={e => setForm(f => ({ ...f, faelligAm: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                  />
                </div>
              </div>

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
                  <option value="OEFFENTLICH">Für alle sichtbar</option>
                  <option value="PRIVAT">Nur für mich</option>
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={modalSchliessen}
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
      )}
    </div>
  );
}
