import { useState, FormEvent } from "react";
import { X, Loader2, KeyRound } from "lucide-react";
import { api } from "../lib/api";

// ── Eigenes Passwort ändern (eingeloggt) ────────────────────────────
export default function PasswortAendernModal({ onSchliessen }: { onSchliessen: () => void }) {
  const [aktuelles, setAktuelles] = useState("");
  const [neues, setNeues]         = useState("");
  const [wdh, setWdh]             = useState("");
  const [laden, setLaden]         = useState(false);
  const [fehler, setFehler]       = useState("");
  const [erfolg, setErfolg]       = useState(false);

  async function speichern(e: FormEvent) {
    e.preventDefault();
    if (neues !== wdh) { setFehler("Neue Passwörter stimmen nicht überein"); return; }
    if (neues.length < 8) { setFehler("Neues Passwort muss mindestens 8 Zeichen haben"); return; }
    setFehler("");
    setLaden(true);
    try {
      await api.auth.passwortAendern(aktuelles, neues);
      setErfolg(true);
      setTimeout(onSchliessen, 1200);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler");
    } finally {
      setLaden(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <KeyRound size={17} className="text-[rgb(var(--accent))]" />
            Passwort ändern
          </h2>
          <button onClick={onSchliessen} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="px-6 py-4">
          {erfolg ? (
            <p className="text-sm text-green-600 text-center py-4">Passwort erfolgreich geändert.</p>
          ) : (
            <form onSubmit={speichern} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Aktuelles Passwort *</label>
                <input
                  type="password" required autoFocus
                  value={aktuelles} onChange={e => setAktuelles(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Neues Passwort *</label>
                <input
                  type="password" required minLength={8}
                  value={neues} onChange={e => setNeues(e.target.value)}
                  placeholder="Mindestens 8 Zeichen"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Neues Passwort wiederholen *</label>
                <input
                  type="password" required
                  value={wdh} onChange={e => setWdh(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                />
              </div>
              {fehler && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{fehler}</div>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={onSchliessen} className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
                  Abbrechen
                </button>
                <button type="submit" disabled={laden} className="flex-1 px-4 py-2 text-sm bg-[rgb(var(--accent))] hover:brightness-90 disabled:opacity-60 text-white rounded-lg flex items-center justify-center gap-2">
                  {laden && <Loader2 size={14} className="animate-spin" />}
                  Speichern
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
