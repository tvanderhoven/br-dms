import { useState, useEffect, useMemo } from "react";
import { MailPlus, Trash2, User, Loader2 } from "lucide-react";
import { api, KummerkastenEintrag, KummerkastenStatus, formatDatum } from "../lib/api";

const STATUS_LABEL: Record<KummerkastenStatus, string> = {
  NEU:            "Neu",
  IN_BEARBEITUNG: "In Bearbeitung",
  ERLEDIGT:       "Erledigt",
};
const STATUS_STYLE: Record<KummerkastenStatus, string> = {
  NEU:            "bg-accent/10 text-accent border-accent/25",
  IN_BEARBEITUNG: "bg-amber-100 text-amber-700 border-amber-200",
  ERLEDIGT:       "bg-green-100 text-green-700 border-green-200",
};

type FilterTyp = "offen" | "alle";

function EintragKarte({ eintrag, onAktualisieren, onLoeschen }: {
  eintrag: KummerkastenEintrag;
  onAktualisieren: (id: string, daten: Partial<{ status: KummerkastenStatus; notiz: string | null }>) => void;
  onLoeschen: (id: string) => void;
}) {
  const [notiz, setNotiz] = useState(eintrag.notiz ?? "");

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <User size={12} />
          {eintrag.absenderName || "Anonym"}
          <span className="text-gray-300">·</span>
          {formatDatum(eintrag.erstelltAm)}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <select
            value={eintrag.status}
            onChange={e => onAktualisieren(eintrag.id, { status: e.target.value as KummerkastenStatus })}
            className={`text-xs font-medium px-2 py-1 rounded-full border cursor-pointer ${STATUS_STYLE[eintrag.status]}`}
          >
            {(Object.keys(STATUS_LABEL) as KummerkastenStatus[]).map(s => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
          <button
            onClick={() => { if (confirm("Eintrag wirklich löschen?")) onLoeschen(eintrag.id); }}
            title="Löschen"
            className="text-gray-300 hover:text-red-500"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Nachricht als reiner Text gerendert (nie dangerouslySetInnerHTML) –
          kommt von einer nicht eingeloggten, öffentlichen Quelle. */}
      <p className="text-sm text-gray-800 whitespace-pre-wrap">{eintrag.nachricht}</p>

      <div className="mt-3 pt-3 border-t border-gray-100">
        <label className="block text-xs font-medium text-gray-500 mb-1">Interne Notiz (für den Absender nicht sichtbar)</label>
        <textarea
          value={notiz}
          onChange={e => setNotiz(e.target.value)}
          onBlur={() => { if (notiz !== (eintrag.notiz ?? "")) onAktualisieren(eintrag.id, { notiz: notiz || null }); }}
          rows={2}
          placeholder="z.B. wer sich kümmert, Stand der Klärung…"
          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))] resize-y bg-gray-50"
        />
      </div>
    </div>
  );
}

export default function KummerkastenVerwaltung() {
  const [eintraege, setEintraege] = useState<KummerkastenEintrag[]>([]);
  const [laden, setLaden] = useState(true);
  const [filter, setFilter] = useState<FilterTyp>("offen");

  useEffect(() => { laden_(); }, []);

  async function laden_() {
    setLaden(true);
    try {
      setEintraege(await api.kummerkasten.liste());
    } finally {
      setLaden(false);
    }
  }

  async function aktualisieren(id: string, daten: Partial<{ status: KummerkastenStatus; notiz: string | null }>) {
    const aktualisiert = await api.kummerkasten.aktualisieren(id, daten);
    setEintraege(e => e.map(x => x.id === id ? aktualisiert : x));
  }

  async function loeschen(id: string) {
    await api.kummerkasten.loeschen(id);
    setEintraege(e => e.filter(x => x.id !== id));
  }

  const gefiltert = useMemo(
    () => filter === "offen" ? eintraege.filter(e => e.status !== "ERLEDIGT") : eintraege,
    [eintraege, filter],
  );

  const offen = eintraege.filter(e => e.status !== "ERLEDIGT").length;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <MailPlus className="text-[rgb(var(--accent))]" size={26} />
          Kummerkasten
        </h1>
        <p className="text-gray-500 text-sm mt-0.5">
          {offen} offen · {eintraege.length} gesamt — eingereicht über die öffentliche Formularseite
        </p>
      </div>

      <div className="flex gap-2 mb-5">
        {([
          { key: "offen", label: `Offen (${offen})` },
          { key: "alle",  label: "Alle" },
        ] as { key: FilterTyp; label: string }[]).map(tab => (
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

      {laden ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 size={20} className="animate-spin mr-2" /> Laden…
        </div>
      ) : gefiltert.length === 0 ? (
        <div className="text-center text-gray-400 py-16">
          <MailPlus size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Keine Einträge</p>
        </div>
      ) : (
        <div className="space-y-3">
          {gefiltert.map(e => (
            <EintragKarte key={e.id} eintrag={e} onAktualisieren={aktualisieren} onLoeschen={loeschen} />
          ))}
        </div>
      )}
    </div>
  );
}
