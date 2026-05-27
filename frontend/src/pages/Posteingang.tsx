import { useEffect, useState, FormEvent } from "react";
import { Mail, Send, Trash2, Loader2, PenSquare, X, Users, User, ChevronRight } from "lucide-react";
import { api, Nachricht, NachrichtGesendet, Benutzer, formatDatum } from "../lib/api";

type Ansicht = "eingang" | "gesendet";

const TYP_BADGE: Record<string, string> = {
  NORMAL:       "",
  TAGESORDNUNG: "bg-amber-100 text-amber-700",
  PROTOKOLL:    "bg-green-100 text-green-700",
  SYSTEM:       "bg-gray-100 text-gray-600",
};
const TYP_LABEL: Record<string, string> = {
  TAGESORDNUNG: "Tagesordnung",
  PROTOKOLL:    "Protokoll",
  SYSTEM:       "System",
};

export default function Posteingang() {
  const [ansicht, setAnsicht]           = useState<Ansicht>("eingang");
  const [nachrichten, setNachrichten]   = useState<Nachricht[]>([]);
  const [gesendet, setGesendet]         = useState<NachrichtGesendet[]>([]);
  const [ausgewaehlt, setAusgewaehlt]   = useState<Nachricht | NachrichtGesendet | null>(null);
  const [laden, setLaden]               = useState(true);
  const [composeOffen, setComposeOffen] = useState(false);

  useEffect(() => { ladeAlles(); }, []);

  async function ladeAlles() {
    setLaden(true);
    try {
      const [inp, sent] = await Promise.all([
        api.nachrichten.liste(),
        api.nachrichten.gesendet(),
      ]);
      setNachrichten(inp);
      setGesendet(sent);
    } catch { /* ignore */ } finally {
      setLaden(false);
    }
  }

  async function oeffnen(n: Nachricht) {
    setAusgewaehlt(n);
    if (!n.gelesen) {
      await api.nachrichten.alsGelesen(n.id).catch(() => {});
      setNachrichten(prev => prev.map(x => x.id === n.id ? { ...x, gelesen: true } : x));
    }
  }

  async function loeschen(id: string) {
    await api.nachrichten.loeschen(id).catch(() => {});
    setNachrichten(prev => prev.filter(x => x.id !== id));
    if (ausgewaehlt?.id === id) setAusgewaehlt(null);
  }

  const liste = ansicht === "eingang" ? nachrichten : gesendet;
  const ungelesen = nachrichten.filter(n => !n.gelesen).length;

  return (
    <div className="flex flex-col md:flex-row h-full">
      {/* Linke Spalte */}
      <div className="w-full md:w-80 flex-shrink-0 border-r md:border-b-0 border-b border-gray-200 flex flex-col bg-white">
        {/* Header */}
        <div className="px-4 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-[rgb(var(--accent))]" />
              <span className="font-semibold text-gray-900">Nachrichten</span>
              {ungelesen > 0 && (
                <span className="bg-[rgb(var(--accent))] text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  {ungelesen}
                </span>
              )}
            </div>
            <button
              onClick={() => setComposeOffen(true)}
              className="flex items-center gap-1.5 bg-[rgb(var(--accent))] hover:brightness-90 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
            >
              <PenSquare size={13} />
              Neu
            </button>
          </div>
          {/* Tabs */}
          <div className="flex rounded-lg bg-gray-100 p-0.5">
            <button
              onClick={() => setAnsicht("eingang")}
              className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${ansicht === "eingang" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
            >
              Eingang
            </button>
            <button
              onClick={() => setAnsicht("gesendet")}
              className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${ansicht === "gesendet" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
            >
              Gesendet
            </button>
          </div>
        </div>

        {/* Liste */}
        <div className="flex-1 overflow-y-auto">
          {laden ? (
            <div className="flex items-center justify-center h-32 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Lade…
            </div>
          ) : liste.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400 text-sm">
              <Mail size={32} className="mb-2 opacity-30" />
              {ansicht === "eingang" ? "Keine Nachrichten" : "Keine gesendeten Nachrichten"}
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {liste.map(n => {
                const istGelesen = "gelesen" in n ? n.gelesen : true;
                const isSelected = ausgewaehlt?.id === n.id;
                return (
                  <li
                    key={n.id}
                    onClick={() => ansicht === "eingang" ? oeffnen(n as Nachricht) : setAusgewaehlt(n)}
                    className={`px-4 py-3 cursor-pointer transition-colors ${isSelected ? "bg-[rgb(var(--accent)/0.1)] border-r-2 border-[rgb(var(--accent))]" : "hover:bg-gray-50"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          {!istGelesen && <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />}
                          <p className={`text-sm truncate ${!istGelesen ? "font-semibold text-gray-900" : "text-gray-700"}`}>
                            {n.betreff}
                          </p>
                        </div>
                        <p className="text-xs text-gray-400 truncate">
                          {ansicht === "eingang"
                            ? (n.absender?.name ?? "System")
                            : `An: ${"empfaenger" in n ? (n as NachrichtGesendet).empfaenger.name : "–"}`
                          }
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-xs text-gray-400">
                          {new Date(n.erstelltAm).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
                        </span>
                        {TYP_LABEL[n.typ] && (
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${TYP_BADGE[n.typ]}`}>
                            {TYP_LABEL[n.typ]}
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Detail */}
      <div className="flex-1 flex flex-col bg-white">
        {ausgewaehlt ? (
          <>
            <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{ausgewaehlt.betreff}</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {ansicht === "eingang"
                    ? `Von: ${ausgewaehlt.absender?.name ?? "System"}`
                    : `An: ${"empfaenger" in ausgewaehlt ? (ausgewaehlt as NachrichtGesendet).empfaenger.name : "–"}`
                  }
                  {" · "}
                  {new Date(ausgewaehlt.erstelltAm).toLocaleString("de-DE", {
                    day: "2-digit", month: "2-digit", year: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  })}
                </p>
                {ausgewaehlt.sitzung && (
                  <p className="text-xs text-[rgb(var(--accent))] mt-0.5">
                    Sitzung: {ausgewaehlt.sitzung.titel} · {formatDatum(ausgewaehlt.sitzung.sitzungsdatum)}
                  </p>
                )}
              </div>
              {ansicht === "eingang" && (
                <button
                  onClick={() => loeschen(ausgewaehlt.id)}
                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Löschen"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>

            {(ausgewaehlt.typ === "TAGESORDNUNG" || ausgewaehlt.typ === "PROTOKOLL") && (
              <div className={`mx-6 mt-4 px-4 py-2 rounded-lg text-sm ${TYP_BADGE[ausgewaehlt.typ]}`}>
                {ausgewaehlt.typ === "TAGESORDNUNG" ? "Tagesordnung für die Sitzung" : "Finalisiertes Sitzungsprotokoll"}
              </div>
            )}

            <div className="flex-1 px-6 py-4 overflow-y-auto">
              <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{ausgewaehlt.inhalt}</p>
            </div>

            {"gelesen" in ausgewaehlt && ausgewaehlt.gelesenAm && (
              <div className="px-6 py-3 border-t border-gray-100 text-xs text-gray-400">
                Gelesen am {new Date(ausgewaehlt.gelesenAm).toLocaleString("de-DE")}
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <Mail size={48} className="mb-3 opacity-20" />
            <p className="text-sm">Nachricht auswählen</p>
          </div>
        )}
      </div>

      {/* Compose-Modal */}
      {composeOffen && (
        <ComposeModal
          onSchliessen={() => setComposeOffen(false)}
          onErfolg={() => { setComposeOffen(false); ladeAlles(); }}
        />
      )}
    </div>
  );
}

// ── Compose-Modal ─────────────────────────────────────────────────
function ComposeModal({ onSchliessen, onErfolg }: {
  onSchliessen: () => void;
  onErfolg: () => void;
}) {
  const [laden, setLaden]               = useState(false);
  const [fehler, setFehler]             = useState("");
  const [benutzer, setBenutzer]         = useState<Benutzer[]>([]);
  const [empfaengerId, setEmpfaengerId] = useState<string>("alle");
  const [betreff, setBetreff]           = useState("");
  const [inhalt, setInhalt]             = useState("");

  useEffect(() => {
    api.get<Benutzer[]>("/api/benutzer")
      .then(b => setBenutzer(b.filter(u => u.aktiv)))
      .catch(() => {});
  }, []);

  async function senden(e: FormEvent) {
    e.preventDefault();
    if (!betreff.trim() || !inhalt.trim()) return;
    setFehler("");
    setLaden(true);
    try {
      await api.nachrichten.senden({
        betreff: betreff.trim(),
        inhalt:  inhalt.trim(),
        ...(empfaengerId === "alle" ? { alle: true } : { empfaengerId }),
      });
      onErfolg();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler beim Senden");
    } finally {
      setLaden(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <PenSquare size={16} className="text-[rgb(var(--accent))]" />
            <h2 className="font-semibold text-gray-900">Neue Nachricht</h2>
          </div>
          <button onClick={onSchliessen} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={senden} className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Empfänger</label>
            <div className="relative">
              <select
                value={empfaengerId}
                onChange={e => setEmpfaengerId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))] bg-white"
              >
                <option value="alle">Alle BR-Mitglieder</option>
                {benutzer.map(b => (
                  <option key={b.id} value={b.id}>{b.name} ({b.rolle})</option>
                ))}
              </select>
              {empfaengerId === "alle"
                ? <Users size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                : <User  size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              }
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Betreff</label>
            <input
              value={betreff}
              onChange={e => setBetreff(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
              placeholder="Betreff eingeben…"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nachricht</label>
            <textarea
              value={inhalt}
              onChange={e => setInhalt(e.target.value)}
              required
              rows={6}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))] resize-y"
              placeholder="Nachricht eingeben…"
            />
          </div>

          {fehler && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
              {fehler}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onSchliessen} className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={laden || !betreff.trim() || !inhalt.trim()}
              className="flex-1 px-4 py-2 text-sm bg-[rgb(var(--accent))] hover:brightness-90 disabled:opacity-60 text-white rounded-lg flex items-center justify-center gap-2"
            >
              {laden ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Senden
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
