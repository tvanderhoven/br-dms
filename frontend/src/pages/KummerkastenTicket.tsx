import { useCallback, useEffect, useRef, useState, FormEvent, KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { Loader2, Send, Ticket } from "lucide-react";
import { api, KummerkastenTicket as TicketDaten, KummerkastenStatus } from "../lib/api";
import BrDmsLogo from "../components/BrDmsLogo";

const STATUS_LABEL: Record<KummerkastenStatus, string> = {
  NEU:            "Eingegangen",
  IN_BEARBEITUNG: "In Bearbeitung",
  ERLEDIGT:       "Erledigt",
};
const STATUS_STYLE: Record<KummerkastenStatus, string> = {
  NEU:            "bg-blue-50 text-blue-700 border-blue-200",
  IN_BEARBEITUNG: "bg-amber-50 text-amber-700 border-amber-200",
  ERLEDIGT:       "bg-green-50 text-green-700 border-green-200",
};

const NACHRICHT_MAX = 2000;
const NACHLADEN_MS = 60_000;

function zeitpunkt(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ── Öffentliche Ticket-Seite (Rückkanal des Kummerkastens) ──────────
// Wie die Einreichen-Seite bewusst ohne Login und ohne App-Layout. Der
// Code steht im URL-Fragment (#…), das nie zum Server übertragen wird
// und damit in keinem Server-/Proxy-Log landet; abgefragt wird er per
// POST im Body. Der Verlauf ist ein Chat: Der Einreicher kann Rückfragen
// stellen, benachrichtigt wird er aber nie (das würde seine Anonymität
// kosten) – deshalb lädt die Seite bei geöffnetem Fenster regelmäßig nach.
export default function KummerkastenTicket() {
  const [code, setCode] = useState(() => window.location.hash.slice(1));
  const [aktiverCode, setAktiverCode] = useState("");
  const [laden, setLaden] = useState(false);
  const [fehler, setFehler] = useState("");
  const [ticket, setTicket] = useState<TicketDaten | null>(null);
  const [entwurf, setEntwurf] = useState("");
  const [sendet, setSendet] = useState(false);
  const [sendeFehler, setSendeFehler] = useState("");
  const verlaufEnde = useRef<HTMLDivElement>(null);
  const letzteAnzahl = useRef(0);

  async function abrufen(eingabe: string) {
    if (!eingabe.trim()) return;
    setFehler("");
    setSendeFehler("");
    setTicket(null);
    setAktiverCode("");
    setLaden(true);
    try {
      setTicket(await api.kummerkasten.ticket(eingabe.trim()));
      setAktiverCode(eingabe.trim());
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Abruf fehlgeschlagen. Bitte später erneut versuchen.");
    } finally {
      setLaden(false);
    }
  }

  // Code aus dem Link (#CODE) direkt abrufen
  useEffect(() => {
    const ausLink = window.location.hash.slice(1);
    if (ausLink) void abrufen(ausLink);
  }, []);

  // Still nachladen, solange das Fenster sichtbar ist; Fehler beim Nachladen stören nicht
  const nachladen = useCallback(async () => {
    if (!aktiverCode || document.visibilityState !== "visible") return;
    try {
      setTicket(await api.kummerkasten.ticket(aktiverCode));
    } catch {
      /* nächster Versuch in einer Minute */
    }
  }, [aktiverCode]);

  useEffect(() => {
    if (!aktiverCode) return;
    const timer = setInterval(() => void nachladen(), NACHLADEN_MS);
    return () => clearInterval(timer);
  }, [aktiverCode, nachladen]);

  // Bei neuen Nachrichten ans Ende des Verlaufs scrollen
  useEffect(() => {
    const anzahl = ticket?.nachrichten.length ?? 0;
    if (anzahl > letzteAnzahl.current) verlaufEnde.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    letzteAnzahl.current = anzahl;
  }, [ticket]);

  function absenden(e: FormEvent) {
    e.preventDefault();
    void abrufen(code);
  }

  async function schreiben(e?: FormEvent) {
    e?.preventDefault();
    const text = entwurf.trim();
    if (!text || !aktiverCode || sendet) return;
    setSendeFehler("");
    setSendet(true);
    try {
      setTicket(await api.kummerkasten.ticketNachricht(aktiverCode, text));
      setEntwurf("");
    } catch (err) {
      setSendeFehler(err instanceof Error ? err.message : "Senden fehlgeschlagen. Bitte später erneut versuchen.");
    } finally {
      setSendet(false);
    }
  }

  function taste(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void schreiben();
  }

  return (
    <div className="min-h-screen bg-[rgb(var(--bg-primary))] flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <BrDmsLogo height={32} className="text-gray-900" />
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Ticket size={20} className="text-brand-red" />
            Kummerkasten-Ticket
          </h1>
          <p className="text-gray-500 text-sm mt-1 mb-5">
            Gib den Code ein, den du beim Einreichen bekommen hast – anonym, ohne Anmeldung.
          </p>

          <form onSubmit={absenden} className="flex gap-2">
            <input
              type="text"
              value={code}
              onChange={e => setCode(e.target.value)}
              placeholder="z. B. K7F-3XH"
              maxLength={12}
              autoFocus={!code}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono tracking-widest uppercase focus:outline-hidden focus:ring-2 focus:ring-accent"
            />
            <button
              type="submit"
              disabled={laden || !code.trim()}
              className="bg-brand-red hover:brightness-90 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
            >
              {laden && <Loader2 size={14} className="animate-spin" />}
              Abrufen
            </button>
          </form>

          {fehler && (
            <div className="mt-4 bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
              {fehler}
            </div>
          )}

          {ticket && (
            <div className="mt-5 border-t border-gray-100 pt-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-gray-500">Dein Gespräch mit dem Betriebsrat</span>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${STATUS_STYLE[ticket.status]}`}>
                  {STATUS_LABEL[ticket.status]}
                </span>
              </div>

              {/* Verlauf – Texte als reiner Text, nie als HTML */}
              <div className="space-y-3 max-h-[26rem] overflow-y-auto pr-1" aria-live="polite">
                {ticket.nachrichten.map((n, i) => {
                  const eigene = n.absender === "EINREICHER";
                  return (
                    <div key={n.id ?? i} className={`flex flex-col ${eigene ? "items-end" : "items-start"}`}>
                      <div
                        className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words ${
                          eigene
                            ? "bg-gray-900 text-white rounded-br-md"
                            : "bg-gray-100 text-gray-900 border border-gray-200 rounded-bl-md"
                        }`}
                      >
                        {n.text}
                      </div>
                      <span className="text-[11px] text-gray-400 mt-1 px-1">
                        {eigene ? "Du" : "Betriebsrat"} · {zeitpunkt(n.erstelltAm)}
                      </span>
                    </div>
                  );
                })}
                <div ref={verlaufEnde} />
              </div>

              {ticket.nachrichten.every(n => n.absender === "EINREICHER") && (
                <p className="text-xs text-gray-500 mt-3">
                  Noch keine Antwort vom Betriebsrat. Schau gern später wieder vorbei – benachrichtigt wirst du
                  (deiner Anonymität zuliebe) nicht. Die Seite aktualisiert sich von selbst, solange sie offen ist.
                </p>
              )}

              <form onSubmit={schreiben} className="mt-4">
                <label htmlFor="rueckfrage" className="sr-only">Deine Nachricht an den Betriebsrat</label>
                <textarea
                  id="rueckfrage"
                  value={entwurf}
                  onChange={e => setEntwurf(e.target.value)}
                  onKeyDown={taste}
                  rows={3}
                  maxLength={NACHRICHT_MAX}
                  placeholder="Rückfrage oder Ergänzung schreiben…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-accent resize-y"
                />
                {sendeFehler && (
                  <div className="mt-2 bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
                    {sendeFehler}
                  </div>
                )}
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-[11px] text-gray-400">Strg + Enter sendet</span>
                  <button
                    type="submit"
                    disabled={sendet || !entwurf.trim()}
                    className="bg-brand-red hover:brightness-90 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
                  >
                    {sendet ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    Senden
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        <p className="text-center text-sm text-gray-500 mt-6">
          <Link to="/kummerkasten" className="font-medium text-gray-900 hover:underline">Neues Anliegen einreichen</Link>
        </p>
      </div>
    </div>
  );
}
