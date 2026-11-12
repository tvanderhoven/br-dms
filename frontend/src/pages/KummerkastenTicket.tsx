import { useEffect, useState, FormEvent } from "react";
import { Link } from "react-router-dom";
import { Loader2, MessageCircle, Ticket } from "lucide-react";
import { api, KummerkastenTicket as TicketDaten, KummerkastenStatus, formatDatum } from "../lib/api";
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

// ── Öffentliche Ticket-Seite (Rückkanal des Kummerkastens) ──────────
// Wie die Einreichen-Seite bewusst ohne Login und ohne App-Layout. Der
// Code steht im URL-Fragment (#…), das nie zum Server übertragen wird
// und damit in keinem Server-/Proxy-Log landet; abgefragt wird er per
// POST im Body.
export default function KummerkastenTicket() {
  const [code, setCode] = useState(() => window.location.hash.slice(1));
  const [laden, setLaden] = useState(false);
  const [fehler, setFehler] = useState("");
  const [ticket, setTicket] = useState<TicketDaten | null>(null);

  async function abrufen(eingabe: string) {
    if (!eingabe.trim()) return;
    setFehler("");
    setTicket(null);
    setLaden(true);
    try {
      setTicket(await api.kummerkasten.ticket(eingabe.trim()));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function absenden(e: FormEvent) {
    e.preventDefault();
    void abrufen(code);
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
            <div className="mt-5 border-t border-gray-100 pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Eingereicht am {formatDatum(ticket.erstelltAm)}</span>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${STATUS_STYLE[ticket.status]}`}>
                  {STATUS_LABEL[ticket.status]}
                </span>
              </div>

              {ticket.antwort ? (
                <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-gray-500 mb-1.5">
                    <MessageCircle size={14} className="text-brand-red" />
                    Antwort des Betriebsrats{ticket.antwortAm ? ` · ${formatDatum(ticket.antwortAm)}` : ""}
                  </div>
                  {/* Reiner Text, nie HTML – gleiche Vorsicht wie bei der Nachricht selbst */}
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{ticket.antwort}</p>
                </div>
              ) : (
                <p className="text-sm text-gray-500">
                  Noch keine Antwort – schau gern später wieder vorbei. Eine Benachrichtigung gibt es
                  (bewusst, deiner Anonymität zuliebe) nicht.
                </p>
              )}
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
