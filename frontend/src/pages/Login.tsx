import { useState, FormEvent } from "react";
import { Link } from "react-router-dom";
import { Loader2, ShieldCheck } from "lucide-react";
import { api, ZweiFaktorEinrichtung } from "../lib/api";
import BrandLogo from "../components/BrandLogo";
import { CodeFeld, Fehler, QrEinrichtung, Wiederherstellungscodes } from "../components/ZweiFaktorBausteine";

// Ziel nach dem Login (?next=…) nur auf diesem Server zulassen. Erst vollständig auflösen,
// dann den Server vergleichen – eine reine Präfix-Prüfung ließe "/\evil.example" durch,
// das Browser wie "//evil.example" lesen (offene Weiterleitung, z. B. für Phishing).
function sicheresZiel(next: string | null): string {
  if (!next) return "/dashboard";
  try {
    const ziel = new URL(next, window.location.origin);
    if (ziel.origin !== window.location.origin) return "/dashboard";
    return ziel.pathname + ziel.search + ziel.hash;
  } catch {
    return "/dashboard";
  }
}

// Schritte nach dem Passwort, wenn die Zwei-Faktor-Anmeldung greift
type Schritt =
  | { art: "passwort" }
  | { art: "code"; zwischenToken: string }
  | { art: "einrichten"; zwischenToken: string; daten: ZweiFaktorEinrichtung | null }
  | { art: "codes"; token: string; codes: string[] };

export default function Login() {
  const [email, setEmail]       = useState("");
  const [passwort, setPasswort] = useState("");
  const [eingeloggtBleiben, setEingeloggtBleiben] = useState(true);
  const [fehler, setFehler]     = useState("");
  const [laden, setLaden]       = useState(false);
  const [schritt, setSchritt]   = useState<Schritt>({ art: "passwort" });
  const [code, setCode]         = useState("");
  const [mitWiederherstellung, setMitWiederherstellung] = useState(false);

  function fertig(token: string) {
    localStorage.setItem("brdms_token", token);
    window.location.href = sicheresZiel(new URLSearchParams(window.location.search).get("next"));
  }

  async function anmelden(e: FormEvent) {
    e.preventDefault();
    setFehler("");
    setLaden(true);
    try {
      const antwort = await api.auth.login(email, passwort, eingeloggtBleiben);
      if (antwort.zweiterFaktor) {
        setSchritt({ art: "code", zwischenToken: antwort.zwischenToken });
      } else if (antwort.einrichtungNoetig) {
        const daten = await api.auth.einrichtenStart(antwort.zwischenToken);
        setSchritt({ art: "einrichten", zwischenToken: antwort.zwischenToken, daten });
      } else {
        fertig(antwort.token);
      }
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Anmeldung fehlgeschlagen");
    } finally {
      setLaden(false);
    }
  }

  async function codeSenden(e: FormEvent) {
    e.preventDefault();
    if (schritt.art !== "code") return;
    setFehler("");
    setLaden(true);
    try {
      const { token, restCodes } = await api.auth.zweiterFaktor(schritt.zwischenToken, code);
      if (restCodes !== undefined && restCodes <= 3) {
        alert(`Noch ${restCodes} Wiederherstellungscode(s) übrig. Unter „Mein Konto“ kannst du neue erzeugen.`);
      }
      fertig(token);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Anmeldung fehlgeschlagen");
      setCode("");
      if (err instanceof Error && err.message.includes("abgelaufen")) zurueck();
    } finally {
      setLaden(false);
    }
  }

  function zurueck() {
    setSchritt({ art: "passwort" });
    setCode("");
    setPasswort("");
    setMitWiederherstellung(false);
  }

  if (schritt.art !== "passwort") {
    return (
      <Rahmen>
        {schritt.art === "code" && (
          <form onSubmit={codeSenden} className="space-y-4">
            <Titel text="Bestätigungscode" />
            <p className="text-sm text-gray-600">
              {mitWiederherstellung
                ? "Einen deiner Wiederherstellungscodes eingeben – er ist danach verbraucht."
                : "Den 6-stelligen Code aus deiner Authenticator-App eingeben."}
            </p>
            <CodeFeld key={String(mitWiederherstellung)} wert={code} onAendern={setCode} wiederherstellung={mitWiederherstellung} />
            {fehler && <Fehler text={fehler} />}
            <button
              type="submit"
              disabled={laden || !code.trim()}
              className="w-full bg-[rgb(var(--accent))] hover:brightness-90 disabled:opacity-60 text-white font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {laden && <Loader2 size={16} className="animate-spin" />}
              Anmelden
            </button>
            <div className="flex justify-between text-sm">
              <button type="button" onClick={zurueck} className="text-gray-500 hover:underline">Zurück</button>
              <button type="button" onClick={() => { setMitWiederherstellung(w => !w); setCode(""); setFehler(""); }}
                className="text-[rgb(var(--accent))] hover:underline">
                {mitWiederherstellung ? "Code aus der App" : "Handy nicht zur Hand?"}
              </button>
            </div>
          </form>
        )}

        {schritt.art === "einrichten" && schritt.daten && (
          <div className="space-y-4">
            <Titel text="Zwei-Faktor-Anmeldung einrichten" />
            <p className="text-sm text-gray-600">
              Für deine Rolle ist ein zweiter Faktor Pflicht. Das geht einmalig und dauert eine Minute.
            </p>
            <QrEinrichtung
              daten={schritt.daten}
              onBestaetigen={async c => {
                const r = await api.auth.einrichtenBestaetigen(schritt.zwischenToken, c);
                setSchritt({ art: "codes", token: r.token, codes: r.wiederherstellungscodes });
              }}
            />
            <button type="button" onClick={zurueck} className="text-sm text-gray-500 hover:underline">Abbrechen</button>
          </div>
        )}

        {schritt.art === "codes" && (
          <div className="space-y-4">
            <Titel text="Wiederherstellungscodes" />
            <Wiederherstellungscodes codes={schritt.codes} onFertig={() => fertig(schritt.token)} fertigText="Weiter zu BR-DMS" />
          </div>
        )}
      </Rahmen>
    );
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

function Rahmen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[rgb(var(--bg-primary))] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow w-full max-w-sm p-8">
        <div className="flex justify-center mb-6">
          <BrandLogo size={32} textClassName="text-xl text-gray-900" />
        </div>
        {children}
      </div>
    </div>
  );
}

function Titel({ text }: { text: string }) {
  return (
    <h1 className="font-semibold text-gray-900 flex items-center gap-2">
      <ShieldCheck size={18} className="text-[rgb(var(--accent))]" /> {text}
    </h1>
  );
}
