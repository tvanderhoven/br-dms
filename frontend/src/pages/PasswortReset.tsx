import { useState, FormEvent } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { Shield, Loader2, CheckCircle } from "lucide-react";
import { api } from "../lib/api";

export default function PasswortReset() {
  const [params]                      = useSearchParams();
  const navigate                      = useNavigate();
  const token                         = params.get("token") ?? "";
  const [neuesPasswort, setNeues]     = useState("");
  const [wiederholen,   setWieder]    = useState("");
  const [laden, setLaden]             = useState(false);
  const [fehler, setFehler]           = useState("");
  const [erfolg, setErfolg]           = useState(false);

  async function absenden(e: FormEvent) {
    e.preventDefault();
    setFehler("");
    if (neuesPasswort !== wiederholen) {
      setFehler("Passwörter stimmen nicht überein.");
      return;
    }
    if (neuesPasswort.length < 8) {
      setFehler("Passwort muss mindestens 8 Zeichen lang sein.");
      return;
    }
    setLaden(true);
    try {
      await api.post("/api/auth/passwort-reset", { token, neuesPasswort });
      setErfolg(true);
      setTimeout(() => navigate("/login"), 3000);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler beim Zurücksetzen");
    } finally {
      setLaden(false);
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-[rgb(var(--bg-primary))] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-gray-200 shadow w-full max-w-sm p-8 text-center">
          <p className="text-red-600 mb-4">Ungültiger Link – kein Token vorhanden.</p>
          <Link to="/login" className="text-[rgb(var(--accent))] text-sm hover:underline">Zum Login</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[rgb(var(--bg-primary))] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow w-full max-w-sm p-8">
        <div className="flex flex-col items-center mb-8">
          <div className="bg-accent/10 p-3 rounded-full mb-3">
            <Shield className="text-accent" size={28} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Neues Passwort</h1>
        </div>

        {erfolg ? (
          <div className="text-center space-y-4">
            <CheckCircle className="text-green-500 mx-auto" size={48} />
            <p className="text-gray-700 text-sm">
              Passwort erfolgreich geändert. Du wirst weitergeleitet...
            </p>
          </div>
        ) : (
          <form onSubmit={absenden} className="space-y-4">
            <div>
              <label htmlFor="neues-passwort" className="block text-sm font-medium text-gray-700 mb-1">Neues Passwort</label>
              <input
                id="neues-passwort"
                name="neues-passwort"
                type="password"
                autoComplete="new-password"
                value={neuesPasswort}
                onChange={e => setNeues(e.target.value)}
                required
                autoFocus
                minLength={8}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
              />
            </div>
            <div>
              <label htmlFor="passwort-wiederholen" className="block text-sm font-medium text-gray-700 mb-1">Passwort wiederholen</label>
              <input
                id="passwort-wiederholen"
                name="passwort-wiederholen"
                type="password"
                autoComplete="new-password"
                value={wiederholen}
                onChange={e => setWieder(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
              />
            </div>

            {fehler && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
                {fehler}
              </div>
            )}

            <button
              type="submit"
              disabled={laden}
              className="w-full bg-[rgb(var(--accent))] hover:brightness-90 disabled:opacity-60 text-white font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {laden && <Loader2 size={16} className="animate-spin" />}
              Passwort speichern
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
