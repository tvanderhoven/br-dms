import { useEffect, useState, FormEvent } from "react";
import {
  Mail, Send, Trash2, Loader2, PenSquare, X, Users, User, ChevronDown, ChevronUp,
} from "lucide-react";
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
  const [ausgeklappt, setAusgeklappt]   = useState<string | null>(null);
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
    } catch { /* ignore */ }
    finally { setLaden(false); }
  }

  async function toggle(n: Nachricht | NachrichtGesendet) {
    if (ausgeklappt === n.id) { setAusgeklappt(null); return; }
    setAusgeklappt(n.id);
    if (ansicht === "eingang" && "gelesen" in n && !n.gelesen) {
      await api.nachrichten.alsGelesen(n.id).catch(() => {});
      setNachrichten(prev => prev.map(x => x.id === n.id ? { ...x, gelesen: true } : x));
    }
  }

  async function loeschen(id: string) {
    await api.nachrichten.loeschen(id).catch(() => {});
    setNachrichten(prev => prev.filter(x => x.id !== id));
    if (ausgeklappt === id) setAusgeklappt(null);
  }

  const liste    = ansicht === "eingang" ? nachrichten : gesendet;
  const ungelesen = nachrichten.filter(n => !n.gelesen).length;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgb(var(--accent) / 0.1)" }}>
            <Mail className="w-5 h-5" style={{ color: "rgb(var(--accent))" }} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              Nachrichten
              {ungelesen > 0 && (
                <span className="bg-[rgb(var(--accent))] text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  {ungelesen}
                </span>
              )}
            </h1>
            <p className="text-sm text-gray-500">Interne BR-Kommunikation</p>
          </div>
        </div>
        <button
          onClick={() => setComposeOffen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white hover:brightness-90 transition-colors"
          style={{ backgroundColor: "rgb(var(--accent))" }}
        >
          <PenSquare size={15} /> Neu
        </button>
      </div>

      {/* Tabs */}
      <div className="flex rounded-xl bg-gray-100 p-1 mb-5 w-fit">
        <button
          onClick={() => { setAnsicht("eingang"); setAusgeklappt(null); }}
          className={`px-5 py-2 text-sm font-medium rounded-lg transition-colors ${ansicht === "eingang" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
        >
          Eingang {ungelesen > 0 && <span className="ml-1.5 text-xs bg-[rgb(var(--accent))] text-white px-1.5 py-0.5 rounded-full">{ungelesen}</span>}
        </button>
        <button
          onClick={() => { setAnsicht("gesendet"); setAusgeklappt(null); }}
          className={`px-5 py-2 text-sm font-medium rounded-lg transition-colors ${ansicht === "gesendet" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
        >
          Gesendet
        </button>
      </div>

      {/* Zähler */}
      <p className="text-xs text-gray-500 mb-3">
        {laden ? "Lade…" : `${liste.length} Nachricht${liste.length !== 1 ? "en" : ""}`}
      </p>

      {/* Liste */}
      {laden ? (
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Lade…
        </div>
      ) : liste.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Mail size={40} className="mx-auto mb-3 opacity-20" />
          <p className="font-medium">
            {ansicht === "eingang" ? "Keine Nachrichten" : "Keine gesendeten Nachrichten"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {liste.map(n => {
            const istGelesen = "gelesen" in n ? n.gelesen : true;
            const offen      = ausgeklappt === n.id;
            const datum      = new Date(n.erstelltAm).toLocaleString("de-DE", {
              day: "2-digit", month: "2-digit", year: "numeric",
              hour: "2-digit", minute: "2-digit",
            });

            return (
              <div key={n.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => toggle(n)}
                  className="w-full text-left px-5 py-4 flex items-start gap-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      {!istGelesen && <span className="w-2 h-2 rounded-full bg-[rgb(var(--accent))] flex-shrink-0" />}
                      {TYP_LABEL[n.typ] && (
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${TYP_BADGE[n.typ]}`}>
                          {TYP_LABEL[n.typ]}
                        </span>
                      )}
                      <span className="text-xs text-gray-400">
                        {ansicht === "eingang"
                          ? (n.absender?.name ?? "System")
                          : `An: ${"empfaenger" in n ? (n as NachrichtGesendet).empfaenger.name : "–"}`}
                      </span>
                      <span className="text-xs text-gray-400 ml-auto">
                        {new Date(n.erstelltAm).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
                      </span>
                    </div>
                    <p className={`font-semibold truncate ${!istGelesen ? "text-gray-900" : "text-gray-700"}`}>
                      {n.betreff}
                    </p>
                    {!offen && (
                      <p className="text-xs text-gray-400 line-clamp-1 mt-0.5">{n.inhalt}</p>
                    )}
                  </div>
                  {offen
                    ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
                    : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />}
                </button>

                {offen && (
                  <div className="px-5 pb-5 border-t border-gray-100 bg-gray-50">
                    {/* Meta */}
                    <div className="flex items-start justify-between mt-4 mb-3">
                      <div>
                        <p className="text-xs text-gray-500">
                          {ansicht === "eingang"
                            ? `Von: ${n.absender?.name ?? "System"}`
                            : `An: ${"empfaenger" in n ? (n as NachrichtGesendet).empfaenger.name : "–"}`}
                          {" · "}{datum}
                        </p>
                        {n.sitzung && (
                          <p className="text-xs mt-0.5" style={{ color: "rgb(var(--accent))" }}>
                            Sitzung: {n.sitzung.titel} · {formatDatum(n.sitzung.sitzungsdatum)}
                          </p>
                        )}
                      </div>
                      {ansicht === "eingang" && (
                        <button
                          onClick={() => loeschen(n.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Löschen"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>

                    {/* Typ-Banner */}
                    {(n.typ === "TAGESORDNUNG" || n.typ === "PROTOKOLL") && (
                      <div className={`px-4 py-2 rounded-lg text-sm mb-3 ${TYP_BADGE[n.typ]}`}>
                        {n.typ === "TAGESORDNUNG" ? "Tagesordnung für die Sitzung" : "Finalisiertes Sitzungsprotokoll"}
                      </div>
                    )}

                    {/* Inhalt */}
                    <div className="bg-white rounded-xl border border-gray-200 p-4">
                      <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{n.inhalt}</p>
                    </div>

                    {"gelesen" in n && n.gelesenAm && (
                      <p className="text-xs text-gray-400 mt-2">
                        Gelesen am {new Date(n.gelesenAm).toLocaleString("de-DE")}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

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
                className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))] bg-white"
              >
                <option value="alle">Alle BR-Mitglieder</option>
                {benutzer.map(b => (
                  <option key={b.id} value={b.id}>{b.name} ({b.rolle})</option>
                ))}
              </select>
              {empfaengerId === "alle"
                ? <Users size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                : <User  size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Betreff</label>
            <input
              value={betreff} onChange={e => setBetreff(e.target.value)} required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
              placeholder="Betreff eingeben…"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nachricht</label>
            <textarea
              value={inhalt} onChange={e => setInhalt(e.target.value)} required rows={6}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))] resize-y"
              placeholder="Nachricht eingeben…"
            />
          </div>

          {fehler && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
              {fehler}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onSchliessen}
              className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
              Abbrechen
            </button>
            <button type="submit" disabled={laden || !betreff.trim() || !inhalt.trim()}
              className="flex-1 px-4 py-2 text-sm hover:brightness-90 disabled:opacity-60 text-white rounded-lg flex items-center justify-center gap-2"
              style={{ backgroundColor: "rgb(var(--accent))" }}>
              {laden ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Senden
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
