import { useState, FormEvent } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Loader2 } from "lucide-react";
import { api } from "../lib/api";
import BrandLogo from "../components/BrandLogo";

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

  async function absenden(e: FormEvent) {
    e.preventDefault();
    if (!nachricht.trim()) return;
    setFehler("");
    setSenden(true);
    try {
      await api.kummerkasten.einreichen({
        nachricht: nachricht.trim(),
        absenderName: absenderName.trim() || undefined,
        webseite: webseite || undefined,
      });
      setGesendet(true);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Senden fehlgeschlagen. Bitte später erneut versuchen.");
    } finally {
      setSenden(false);
    }
  }

  return (
    <div className="min-h-screen bg-[rgb(var(--bg-primary))] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow w-full max-w-xl p-8">
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="mb-3">
            <BrandLogo size={40} textClassName="text-xl text-gray-900" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Kummerkasten</h1>
          <p className="text-gray-500 text-sm mt-1">
            Anliegen, Kritik oder Ideen an den Betriebsrat — anonym möglich, Name ist freiwillig.
          </p>
        </div>

        {gesendet ? (
          <div className="text-center py-6">
            <CheckCircle2 className="text-green-600 mx-auto mb-3" size={40} />
            <p className="font-medium text-gray-900">Danke, dein Anliegen wurde übermittelt.</p>
            <p className="text-sm text-gray-500 mt-1">Der Betriebsrat sieht sich das an.</p>
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
                rows={11}
                maxLength={5000}
                value={nachricht}
                onChange={e => setNachricht(e.target.value)}
                placeholder="Was möchtest du dem Betriebsrat mitteilen?"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent resize-y min-h-[220px]"
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
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            {/* Honeypot – für Menschen unsichtbar, einfache Bots füllen es oft blind aus */}
            <div className="absolute -left-[9999px]" aria-hidden="true">
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
              className="w-full bg-accent hover:bg-accent-hover disabled:opacity-60 text-white font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {senden && <Loader2 size={16} className="animate-spin" />}
              Absenden
            </button>
          </form>
        )}

        <p className="text-center text-xs text-gray-300 mt-6">
          <Link to="/login" className="hover:text-gray-400 hover:underline">Für BR-Mitglieder: Anmelden</Link>
          {" · "}BR-DMS · Open Source (AGPL-3.0)
        </p>
      </div>
    </div>
  );
}
