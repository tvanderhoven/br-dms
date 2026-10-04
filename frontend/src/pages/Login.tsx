import { useState, FormEvent } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { api } from "../lib/api";
import BrandLogo from "../components/BrandLogo";

export default function Login() {
  const [email, setEmail]       = useState("");
  const [passwort, setPasswort] = useState("");
  const [eingeloggtBleiben, setEingeloggtBleiben] = useState(true);
  const [fehler, setFehler]     = useState("");
  const [laden, setLaden]       = useState(false);

  async function anmelden(e: FormEvent) {
    e.preventDefault();
    setFehler("");
    setLaden(true);
    try {
      const { token } = await api.auth.login(email, passwort, eingeloggtBleiben);
      localStorage.setItem("brdms_token", token);
      const next = new URLSearchParams(window.location.search).get("next");
      // Nur relative Pfade zulassen (Schutz gegen offene Weiterleitungen z.B. "//evil.com")
      const ziel = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
      window.location.href = ziel;
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Anmeldung fehlgeschlagen");
    } finally {
      setLaden(false);
    }
  }

  return (
    <div className="min-h-screen bg-[rgb(var(--bg-primary))] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow w-full max-w-sm p-8">
        <div className="flex flex-col items-center mb-8">
          <div className="mb-3">
            <BrandLogo size={40} textClassName="text-2xl text-gray-900" />
          </div>
          <p className="text-gray-500 text-sm">Dokumentenmanagement für Betriebsräte</p>
        </div>

        <form onSubmit={anmelden} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              E-Mail oder Benutzername
            </label>
            <input
              id="email"
              name="email"
              type="text"
              autoComplete="username"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
              placeholder="name oder name@beispiel.de"
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

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={eingeloggtBleiben}
              onChange={e => setEingeloggtBleiben(e.target.checked)}
              className="rounded border-gray-300 text-[rgb(var(--accent))]"
            />
            <span className="text-sm text-gray-600">Eingeloggt bleiben</span>
          </label>

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
