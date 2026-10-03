import { useState, FormEvent } from "react";
import { Link } from "react-router-dom";
import { Shield, Loader2, ArrowLeft, CheckCircle } from "lucide-react";
import { api } from "../lib/api";

export default function PasswortVergessen() {
  const [email, setEmail]       = useState("");
  const [laden, setLaden]       = useState(false);
  const [fehler, setFehler]     = useState("");
  const [gesendet, setGesendet] = useState(false);

  async function absenden(e: FormEvent) {
    e.preventDefault();
    setFehler("");
    setLaden(true);
    try {
      await api.post("/api/auth/passwort-vergessen", { email });
      setGesendet(true);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler beim Senden");
    } finally {
      setLaden(false);
    }
  }

  return (
    <div className="min-h-screen bg-[rgb(var(--bg-primary))] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow w-full max-w-sm p-8">
        <div className="flex flex-col items-center mb-8">
          <div className="bg-accent/10 p-3 rounded-full mb-3">
            <Shield className="text-accent" size={28} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Passwort vergessen</h1>
          <p className="text-gray-500 text-sm mt-1 text-center">
            Wir senden dir einen Reset-Link per E-Mail
          </p>
        </div>

        {gesendet ? (
          <div className="text-center space-y-4">
            <CheckCircle className="text-green-500 mx-auto" size={48} />
            <p className="text-gray-700 text-sm">
              Falls die E-Mail-Adresse bekannt ist, wurde ein Link gesendet.
              Bitte prüfe deinen Posteingang.
            </p>
            <Link to="/login" className="text-[rgb(var(--accent))] text-sm hover:underline flex items-center justify-center gap-1">
              <ArrowLeft size={14} /> Zurück zum Login
            </Link>
          </div>
        ) : (
          <form onSubmit={absenden} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">E-Mail</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
                placeholder="name@beispiel.de"
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
              Reset-Link senden
            </button>

            <Link to="/login" className="text-[rgb(var(--accent))] text-sm hover:underline flex items-center gap-1">
              <ArrowLeft size={14} /> Zurück zum Login
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
