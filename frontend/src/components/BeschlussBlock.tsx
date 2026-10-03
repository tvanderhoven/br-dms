import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, Lock, Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { api } from "../lib/api";

interface Beschluss {
  id: string;
  topId: string;
  antragstext: string;
  rechtsgrundlage: string;
  reihenfolge: number;
  jaStimmen: number;
  neinStimmen: number;
  enthaltungen: number;
  nichtTeilgenommen: number;
  anwesend: number;
  ergebnis: string | null;
  finalisiert: boolean;
  finalisiertAm?: string;
  erstelltAm: string;
}

const RECHTSGRUNDLAGEN = [
  "§ 87 BetrVG – Mitbestimmung",
  "§ 99 BetrVG – Einstellung / Versetzung",
  "§ 100 BetrVG – Vorläufige personelle Maßnahmen",
  "§ 102 BetrVG – Kündigung",
  "§ 112 BetrVG – Interessenausgleich / Sozialplan",
  "§ 37 BetrVG – Freistellung",
  "Sonstige Beschlussfassung",
];

function ergebnisBerechnen(ja: number, nein: number) {
  if (ja > nein) return "ANGENOMMEN";
  if (nein > ja) return "ABGELEHNT";
  return "UNENTSCHIEDEN";
}

interface Props {
  topId: string;
  sitzungId: string;
  readonly: boolean;
}

export default function BeschlussBlock({ topId, sitzungId, readonly }: Props) {
  const [beschluesse, setBeschluesse] = useState<Beschluss[]>([]);
  const [isLaden,     setIsLaden]     = useState(true);
  const [fehler,      setFehler]      = useState("");

  const ladeDaten = useCallback(async () => {
    setIsLaden(true);
    setFehler("");
    try {
      const b = await api.get<Beschluss[]>(
        `/api/sitzungen/${sitzungId}/tops/${topId}/beschluesse`
      );
      setBeschluesse(b);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler beim Laden");
    } finally {
      setIsLaden(false);
    }
  }, [sitzungId, topId]);

  useEffect(() => { ladeDaten(); }, [ladeDaten]);

  async function neuerBeschluss() {
    setFehler("");
    try {
      const b = await api.post<Beschluss>(
        `/api/sitzungen/${sitzungId}/tops/${topId}/beschluesse`,
        { antragstext: "", rechtsgrundlage: RECHTSGRUNDLAGEN[0] }
      );
      setBeschluesse(prev => [...prev, b]);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler");
    }
  }

  if (isLaden) {
    return (
      <div className="flex items-center gap-2 text-gray-400 text-xs mt-2 py-1">
        <Loader2 size={13} className="animate-spin" /> Beschlüsse laden…
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      {fehler && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-lg">
          <AlertTriangle size={13} /> {fehler}
        </div>
      )}

      {beschluesse.map((b, idx) => (
        <EinzelBeschluss
          key={b.id}
          beschluss={b}
          index={idx}
          sitzungId={sitzungId}
          topId={topId}
          readonly={readonly}
          onAktualisieren={ladeDaten}
          onLoeschen={() => setBeschluesse(prev => prev.filter(x => x.id !== b.id))}
        />
      ))}

      {!readonly && (
        <div className="flex items-center gap-3">
          <button
            onClick={neuerBeschluss}
            className="flex items-center gap-2 text-xs text-[rgb(var(--accent))] hover:brightness-90 hover:bg-accent/5 px-3 py-1.5 rounded-lg border border-accent/25 border-dashed transition-colors"
          >
            <Plus size={13} /> Beschluss hinzufügen
          </button>
          <button
            onClick={ladeDaten}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
          >
            <RefreshCw size={11} /> Aktualisieren
          </button>
        </div>
      )}
    </div>
  );
}

// ── Einzelne Beschluss-Karte ──────────────────────────────────────
function EinzelBeschluss({
  beschluss, index, sitzungId, topId, readonly, onAktualisieren, onLoeschen,
}: {
  beschluss:       Beschluss;
  index:           number;
  sitzungId:       string;
  topId:           string;
  readonly:        boolean;
  onAktualisieren: () => void;
  onLoeschen:      () => void;
}) {
  const [antragstext,     setAntragstext]     = useState(beschluss.antragstext);
  const [rechtsgrundlage, setRechtsgrundlage] = useState(beschluss.rechtsgrundlage);
  const [ja,              setJa]              = useState(beschluss.jaStimmen);
  const [nein,            setNein]            = useState(beschluss.neinStimmen);
  const [enthal,          setEnthal]          = useState(beschluss.enthaltungen);
  const [nichtTeilg,      setNichtTeilg]      = useState(beschluss.nichtTeilgenommen ?? 0);
  const [speichern,       setSpeichern]       = useState(false);
  const [loeschen,        setLoeschen]        = useState(false);
  const [fehler,          setFehler]          = useState("");

  const istFinalisiert   = beschluss.finalisiert;
  const vorschauErgebnis = ergebnisBerechnen(ja, nein);
  const hatStimmen       = ja + nein + enthal > 0;

  async function speichernFn(finalisieren = false) {
    setFehler("");
    setSpeichern(true);
    try {
      await api.patch(
        `/api/sitzungen/${sitzungId}/tops/${topId}/beschluesse/${beschluss.id}`,
        { antragstext: antragstext.trim(), rechtsgrundlage, jaStimmen: ja, neinStimmen: nein, enthaltungen: enthal, nichtTeilgenommen: nichtTeilg, finalisieren }
      );
      onAktualisieren();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler");
    } finally {
      setSpeichern(false);
    }
  }

  async function loeschenFn() {
    if (!confirm(`Beschluss ${index + 1} wirklich löschen?`)) return;
    setLoeschen(true);
    try {
      await api.delete(`/api/sitzungen/${sitzungId}/tops/${topId}/beschluesse/${beschluss.id}`);
      onLoeschen();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler");
      setLoeschen(false);
    }
  }

  const ergebnis = istFinalisiert ? beschluss.ergebnis : (hatStimmen ? vorschauErgebnis : null);

  return (
    <div className={`border rounded-xl overflow-hidden text-sm ${
      istFinalisiert ? "border-green-200 bg-green-50/20" : "border-gray-200"
    }`}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-100">
        <span className="text-xs font-semibold text-gray-600">Beschluss {index + 1}</span>
        {istFinalisiert ? (
          <span className="ml-auto flex items-center gap-1 text-[11px] font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
            <Lock size={10} /> Finalisiert
          </span>
        ) : (
          <span className="ml-auto text-[11px] text-yellow-600 bg-yellow-100 px-2 py-0.5 rounded-full">
            Entwurf
          </span>
        )}
        {!readonly && !istFinalisiert && (
          <button
            onClick={loeschenFn}
            disabled={loeschen}
            className="p-1 text-gray-300 hover:text-red-500 rounded transition-colors"
          >
            {loeschen ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
          </button>
        )}
      </div>

      <div className="p-3 space-y-3">
        {fehler && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-xs px-2 py-1.5 rounded-lg">
            <AlertTriangle size={12} /> {fehler}
          </div>
        )}

        {/* Antragstext */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Antragstext</label>
          {istFinalisiert ? (
            <p className="text-sm text-gray-800 bg-white border border-gray-100 rounded-lg px-3 py-2 italic">
              „{beschluss.antragstext}"
            </p>
          ) : (
            <textarea
              value={antragstext}
              onChange={e => setAntragstext(e.target.value)}
              rows={3}
              placeholder="Wortlaut des Antrags…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))] resize-y"
            />
          )}
        </div>

        {/* Rechtsgrundlage */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Rechtsgrundlage</label>
          {istFinalisiert ? (
            <p className="text-xs font-medium text-gray-700">{beschluss.rechtsgrundlage}</p>
          ) : (
            <select
              value={rechtsgrundlage}
              onChange={e => setRechtsgrundlage(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs bg-white focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
            >
              {RECHTSGRUNDLAGEN.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          )}
        </div>

        {/* Stimmergebnis – Zahleneingaben */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-2">Abstimmungsergebnis</label>
          <div className="grid grid-cols-4 gap-3">
            <StimmenFeld
              label="Ja"
              wert={istFinalisiert ? beschluss.jaStimmen : ja}
              onChange={setJa}
              farbe="green"
              readonly={readonly || istFinalisiert}
            />
            <StimmenFeld
              label="Nein"
              wert={istFinalisiert ? beschluss.neinStimmen : nein}
              onChange={setNein}
              farbe="red"
              readonly={readonly || istFinalisiert}
            />
            <StimmenFeld
              label="Enthaltung"
              wert={istFinalisiert ? beschluss.enthaltungen : enthal}
              onChange={setEnthal}
              farbe="gray"
              readonly={readonly || istFinalisiert}
            />
            <StimmenFeld
              label="Nicht teilg."
              titel="Anwesend, aber nicht stimmberechtigt (z.B. JAV)"
              wert={istFinalisiert ? (beschluss.nichtTeilgenommen ?? 0) : nichtTeilg}
              onChange={setNichtTeilg}
              farbe="amber"
              readonly={readonly || istFinalisiert}
            />
          </div>
        </div>

        {/* Ergebnis-Badge */}
        {ergebnis && (
          <div className={`rounded-lg border px-3 py-2 flex items-center justify-between gap-2 ${
            ergebnis === "ANGENOMMEN" ? "bg-green-50 border-green-200"
            : ergebnis === "ABGELEHNT" ? "bg-red-50 border-red-200"
            : "bg-gray-50 border-gray-200"
          }`}>
            <span className="text-xs text-gray-500">
              Gesamt: {istFinalisiert ? beschluss.anwesend : ja + nein + enthal} Stimmen
            </span>
            <div className="flex items-center gap-2">
              {ergebnis === "ANGENOMMEN" && (istFinalisiert ? beschluss.neinStimmen === 0 && beschluss.enthaltungen === 0 && beschluss.jaStimmen > 0 : nein === 0 && enthal === 0 && ja > 0) && (
                <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                  Einstimmig
                </span>
              )}
              <span className={`text-sm font-bold px-3 py-0.5 rounded-full ${
                ergebnis === "ANGENOMMEN" ? "bg-green-600 text-white"
                : ergebnis === "ABGELEHNT" ? "bg-red-600 text-white"
                : "bg-gray-400 text-white"
              }`}>
                {ergebnis === "ANGENOMMEN" ? "Angenommen"
                  : ergebnis === "ABGELEHNT" ? "Abgelehnt"
                  : "Unentschieden"}
              </span>
            </div>
          </div>
        )}

        {/* Aktionsleiste */}
        {!readonly && !istFinalisiert && (
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => speichernFn(false)}
              disabled={speichern}
              className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-800 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
            >
              {speichern && <Loader2 size={11} className="animate-spin" />}
              Speichern
            </button>
            <button
              onClick={() => speichernFn(true)}
              disabled={speichern || !antragstext.trim()}
              title={!antragstext.trim() ? "Antragstext erforderlich" : undefined}
              className="flex items-center gap-1 text-xs bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-medium px-3 py-1.5 rounded-lg ml-auto"
            >
              {speichern ? <Loader2 size={11} className="animate-spin" /> : <Lock size={11} />}
              Finalisieren
            </button>
          </div>
        )}

        {istFinalisiert && beschluss.finalisiertAm && (
          <p className="text-[10px] text-gray-400 text-right">
            Finalisiert am {new Date(beschluss.finalisiertAm).toLocaleString("de-DE")}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Stimmen-Zähler-Feld ───────────────────────────────────────────
function StimmenFeld({
  label, titel, wert, onChange, farbe, readonly,
}: {
  label:    string;
  titel?:   string;
  wert:     number;
  onChange: (v: number) => void;
  farbe:    "green" | "red" | "gray" | "amber";
  readonly: boolean;
}) {
  const farben = {
    green: { num: "text-green-700", bg: "bg-green-50 border-green-200", label: "text-green-600" },
    red:   { num: "text-red-700",   bg: "bg-red-50 border-red-200",     label: "text-red-600"   },
    gray:  { num: "text-gray-600",  bg: "bg-gray-50 border-gray-200",   label: "text-gray-500"  },
    amber: { num: "text-amber-700", bg: "bg-amber-50 border-amber-200", label: "text-amber-600" },
  }[farbe];

  if (readonly) {
    return (
      <div className={`rounded-lg border ${farben.bg} px-3 py-2 text-center`} title={titel}>
        <p className={`text-2xl font-bold ${farben.num}`}>{wert}</p>
        <p className={`text-xs ${farben.label}`}>{label}</p>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border ${farben.bg} px-3 py-2 text-center`} title={titel}>
      <input
        type="number"
        min={0}
        value={wert}
        onChange={e => onChange(Math.max(0, parseInt(e.target.value) || 0))}
        className={`w-full text-center text-2xl font-bold bg-transparent focus:outline-none ${farben.num}`}
      />
      <p className={`text-xs ${farben.label}`}>{label}</p>
    </div>
  );
}
