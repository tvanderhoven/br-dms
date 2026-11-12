import { useState, FormEvent } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Copy, Loader2, Lock, Ticket } from "lucide-react";
import { api } from "../lib/api";
import BrDmsLogo from "../components/BrDmsLogo";

function codeAnzeige(code: string): string {
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

// ── Öffentliche Kummerkasten-Seite ──────────────────────────────────
// Bewusst KEIN Login, KEIN App-Layout/Sidebar – komplett eigenständige
// Seite, damit die Belegschaft (nicht nur BR-Mitglieder) anonym ein
// Anliegen einreichen kann. Name ist optional.
export default function KummerkastenOeffentlich() {
  const [nachricht, setNachricht] = useState("");
  const [absenderName, setAbsenderName] = useState("");
  const [webseite, setWebseite] = useState(""); // Honeypot – bleibt für Menschen unsichtbar
  const [senden, setSenden] = useState(false);
  const [fehler, setFehler] = useState("");
  const [gesendet, setGesendet] = useState(false);
  const [ticketCode, setTicketCode] = useState("");
  const [kopiert, setKopiert] = useState(false);

  async function absenden(e: FormEvent) {
    e.preventDefault();
    if (!nachricht.trim()) return;
    setFehler("");
    setSenden(true);
    try {
      const antwort = await api.kummerkasten.einreichen({
        nachricht: nachricht.trim(),
        absenderName: absenderName.trim() || undefined,
        webseite: webseite || undefined,
      });
      setTicketCode(antwort.ticketCode ?? "");
      setGesendet(true);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Senden fehlgeschlagen. Bitte später erneut versuchen.");
    } finally {
      setSenden(false);
    }
  }

  return (
    <div className="min-h-screen grid md:grid-cols-2 bg-white">
      {/* Linke, helle Fläche – Gegenstück zur dunklen Login-Seite */}
      <aside className="hidden md:flex relative overflow-hidden flex-col justify-between bg-[rgb(var(--bg-primary))] border-r border-gray-200 p-10 lg:p-14">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-60 bg-[radial-gradient(var(--color-gray-300)_1px,transparent_1px)] bg-[length:18px_18px] [mask-image:linear-gradient(120deg,transparent_30%,#000_100%)]"
        />
        <BrDmsLogo height={36} className="relative self-start text-gray-900" />
        <div className="relative max-w-md">
          <div className="w-14 h-1 rounded-full bg-brand-red mb-4" />
          <h2 className="text-3xl font-semibold leading-tight text-gray-900 mb-3">Sag dem Betriebsrat, was dich beschäftigt.</h2>
          <p className="text-gray-500 leading-relaxed">Kritik, Sorgen, Ideen – alles ist willkommen. Kein Konto nötig.</p>
          <ol className="mt-6 space-y-3 text-sm text-gray-700">
            {[
              "Schreib auf, was dich beschäftigt.",
              "Absenden – ohne Namen bleibst du anonym.",
              "Der Betriebsrat liest dein Anliegen und kümmert sich darum.",
            ].map((schritt, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="grid place-items-center w-6 h-6 rounded-full bg-white border border-gray-300 text-xs font-medium shrink-0">{i + 1}</span>
                <span className="pt-0.5">{schritt}</span>
              </li>
            ))}
          </ol>
        </div>
        <p className="relative text-xs text-gray-500">BR-DMS · Open Source (AGPL-3.0)</p>
      </aside>

      <main className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          <div className="md:hidden mb-8">
            <BrDmsLogo height={32} className="text-gray-900" />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">Kummerkasten</h1>
          <p className="text-gray-500 text-sm mt-1 mb-6">
            Deine Nachricht geht direkt an den Betriebsrat – anonym möglich, Name ist freiwillig.
          </p>

        {gesendet ? (
          <div className="py-6">
            <div className="text-center">
              <CheckCircle2 className="text-green-600 mx-auto mb-3" size={40} />
              <p className="font-medium text-gray-900">Danke, dein Anliegen wurde übermittelt.</p>
              <p className="text-sm text-gray-500 mt-1">Der Betriebsrat sieht sich das an.</p>
            </div>

            {ticketCode && (
              <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                  <Ticket size={16} className="text-brand-red" />
                  Dein Ticket-Code
                </div>
                <div className="text-center font-mono text-2xl font-semibold tracking-widest text-gray-900 select-all py-2">
                  {codeAnzeige(ticketCode)}
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">
                  <strong>Jetzt notieren</strong> – der Code wird nur dieses eine Mal angezeigt und kann
                  nicht wiederhergestellt werden. Damit kannst du jederzeit anonym nachsehen, ob der
                  Betriebsrat geantwortet hat. Eine Benachrichtigung gibt es nicht.
                </p>
                <div className="mt-3 flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(`${window.location.origin}/kummerkasten/ticket#${ticketCode}`);
                        setKopiert(true);
                        setTimeout(() => setKopiert(false), 2500);
                      } catch {
                        /* Zwischenablage nicht verfügbar – Code steht ja sichtbar da */
                      }
                    }}
                    className="flex-1 flex items-center justify-center gap-2 border border-gray-300 bg-white hover:bg-gray-100 text-gray-800 text-sm font-medium py-2 px-3 rounded-lg transition-colors"
                  >
                    <Copy size={14} />
                    {kopiert ? "Link kopiert!" : "Abruf-Link kopieren"}
                  </button>
                  <Link
                    to={`/kummerkasten/ticket#${ticketCode}`}
                    className="flex-1 text-center bg-brand-red hover:brightness-90 text-white text-sm font-medium py-2 px-3 rounded-lg transition-colors"
                  >
                    Zur Ticket-Seite
                  </Link>
                </div>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={absenden} className="space-y-4">
            <div>
              <label htmlFor="nachricht" className="block text-sm font-medium text-gray-700 mb-1">
                Dein Anliegen *
              </label>
              <textarea
                id="nachricht"
                required
                autoFocus
                rows={8}
                maxLength={5000}
                value={nachricht}
                onChange={e => setNachricht(e.target.value)}
                placeholder="Was möchtest du dem Betriebsrat mitteilen?"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-accent resize-y min-h-[180px]"
              />
            </div>

            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Name (optional)
              </label>
              <input
                id="name"
                type="text"
                maxLength={200}
                value={absenderName}
                onChange={e => setAbsenderName(e.target.value)}
                placeholder="Kannst du frei lassen, wenn du anonym bleiben möchtest"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-accent"
              />
            </div>

            {/* Honeypot – für Menschen unsichtbar, einfache Bots füllen es oft blind aus */}
            <div className="absolute left-[-9999px]" aria-hidden="true">
              <label htmlFor="webseite">Webseite</label>
              <input
                id="webseite"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={webseite}
                onChange={e => setWebseite(e.target.value)}
              />
            </div>

            {fehler && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
                {fehler}
              </div>
            )}

            <button
              type="submit"
              disabled={senden || !nachricht.trim()}
              className="w-full bg-brand-red hover:brightness-90 disabled:opacity-60 text-white font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {senden && <Loader2 size={16} className="animate-spin" />}
              Absenden
            </button>

            <div className="flex items-center gap-2.5 rounded-lg bg-gray-100 px-3 py-2.5 text-sm text-gray-500">
              <Lock size={16} className="text-brand-red shrink-0" />
              Ohne Namen wird nicht gespeichert, von wem die Nachricht kommt.
            </div>
          </form>
        )}

        <p className="text-center text-sm text-gray-500 mt-6">
          Schon ein Anliegen eingereicht?{" "}
          <Link to="/kummerkasten/ticket" className="font-medium text-gray-900 hover:underline">Stand mit Ticket-Code abrufen</Link>
        </p>
        <p className="text-center text-sm text-gray-500 mt-2">
          Für BR-Mitglieder:{" "}
          <Link to="/login" className="font-medium text-gray-900 hover:underline">Anmelden</Link>
        </p>
        </div>
      </main>
    </div>
  );
}
