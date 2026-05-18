import { useState, FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Shield, Loader2 } from "lucide-react";
import { api } from "../lib/api";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail]       = useState("");
  const [passwort, setPasswort] = useState("");
  const [fehler, setFehler]     = useState("");
  const [laden, setLaden]       = useState(false);

  async function anmelden(e: FormEvent) {
    e.preventDefault();
    setFehler("");
    setLaden(true);
    try {
      const { token } = await api.auth.login(email, passwort);
      localStorage.setItem("brdms_token", token);
      navigate("/");
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Anmeldung fehlgeschlagen");
    } finally {
      setLaden(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-800 to-blue-950 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8">
        <div className="flex flex-col items-center mb-8">
          <div className="bg-blue-100 p-3 rounded-full mb-3">
            <Shield className="text-blue-700" size={28} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">BR-DMS</h1>
          <p className="text-gray-500 text-sm mt-1">Betriebsrats-Dokumentensystem</p>
        </div>

        <form onSubmit={anmelden} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              E-Mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
              placeholder="name@beispiel.de"
            />
          </div>

          <div>
            <label htmlFor="passwort" className="block text-sm font-medium text-gray-700 mb-1">
              Passwort
            </label>
            <input
              id="passwort"
              name="passwort"
              type="password"
              autoComplete="current-password"
              value={passwort}
              onChange={e => setPasswort(e.target.value)}
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
            Anmelden
          </button>

          <div className="text-center">
            <Link to="/passwort-vergessen" className="text-[rgb(var(--accent))] text-sm hover:underline">
              Passwort vergessen?
            </Link>
          </div>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          Nur für autorisierte BR-Mitglieder
        </p>
      </div>
    </div>
  );
}
