/**
 * Bausteine der Zwei-Faktor-Anmeldung, gebraucht beim Login (Pflicht-Einrichtung)
 * und unter „Mein Konto“.
 */

import { useState, FormEvent } from "react";
import { Loader2, Copy, Check, Printer } from "lucide-react";
import type { ZweiFaktorEinrichtung } from "../lib/api";

const eingabeKlasse =
  "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]";

/** QR-Code + Geheimnis zum Abtippen + Feld für den ersten Code */
export function QrEinrichtung({ daten, onBestaetigen }: {
  daten: ZweiFaktorEinrichtung;
  onBestaetigen: (code: string) => Promise<void>;
}) {
  const [code, setCode]     = useState("");
  const [laden, setLaden]   = useState(false);
  const [fehler, setFehler] = useState("");

  async function absenden(e: FormEvent) {
    e.preventDefault();
    setFehler("");
    setLaden(true);
    try {
      await onBestaetigen(code);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler");
      setCode("");
    } finally {
      setLaden(false);
    }
  }

  return (
    <form onSubmit={absenden} className="space-y-4">
      <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
        <li>Authenticator-App auf dem Diensthandy öffnen (z. B. Microsoft oder Google Authenticator, FreeOTP).</li>
        <li>Den QR-Code scannen – oder den Schlüssel darunter von Hand eingeben.</li>
        <li>Den 6-stelligen Code aus der App hier eintragen.</li>
      </ol>
      <div className="flex flex-col items-center gap-2">
        <img src={daten.qrCode} alt="QR-Code für die Authenticator-App" width={220} height={220} className="border border-gray-200 rounded-lg" />
        <code className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded px-2 py-1 select-all break-all text-center">
          {daten.geheimnis}
        </code>
      </div>
      <CodeFeld wert={code} onAendern={setCode} />
      {fehler && <Fehler text={fehler} />}
      <button
        type="submit"
        disabled={laden || code.replace(/\s/g, "").length !== 6}
        className="w-full bg-[rgb(var(--accent))] hover:brightness-90 disabled:opacity-60 text-white font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
      >
        {laden && <Loader2 size={16} className="animate-spin" />}
        Bestätigen
      </button>
    </form>
  );
}

export function CodeFeld({ wert, onAendern, wiederherstellung = false }: {
  wert: string; onAendern: (v: string) => void; wiederherstellung?: boolean;
}) {
  return (
    <input
      value={wert}
      onChange={e => onAendern(e.target.value)}
      autoFocus
      autoComplete="one-time-code"
      inputMode={wiederherstellung ? "text" : "numeric"}
      maxLength={wiederherstellung ? 12 : 7}
      placeholder={wiederherstellung ? "xxxx-xxxx" : "123 456"}
      className={`${eingabeKlasse} text-center tracking-widest font-mono text-lg`}
      aria-label={wiederherstellung ? "Wiederherstellungscode" : "Code aus der Authenticator-App"}
    />
  );
}

export function Fehler({ text }: { text: string }) {
  return <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{text}</div>;
}

/** Wiederherstellungscodes einmalig anzeigen – kopieren oder drucken */
export function Wiederherstellungscodes({ codes, onFertig, fertigText = "Weiter" }: {
  codes: string[]; onFertig: () => void; fertigText?: string;
}) {
  const [kopiert, setKopiert]   = useState(false);
  const [notiert, setNotiert]   = useState(false);

  async function kopieren() {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setKopiert(true);
      setTimeout(() => setKopiert(false), 2000);
    } catch { /* Zwischenablage gesperrt (kein HTTPS) – dann eben abschreiben */ }
  }

  function drucken() {
    const w = window.open("", "_blank", "width=400,height=600");
    if (!w) return;
    w.document.title = "BR-DMS – Wiederherstellungscodes";
    const pre = w.document.createElement("pre");
    pre.style.font = "16px monospace";
    pre.textContent = `BR-DMS – Wiederherstellungscodes\n(jeder Code gilt einmal)\n\n${codes.join("\n")}`;
    w.document.body.appendChild(pre);
    w.print();
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Falls das Handy verloren geht: Mit diesen Codes kommst du trotzdem hinein – jeder gilt <strong>einmal</strong>.
        Sie werden nur jetzt angezeigt. Bitte ausdrucken oder sicher aufbewahren, nicht auf dem Handy.
      </p>
      <div className="grid grid-cols-2 gap-2 bg-gray-50 border border-gray-200 rounded-lg p-3 font-mono text-sm text-center">
        {codes.map(c => <span key={c}>{c}</span>)}
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={kopieren}
          className="flex-1 flex items-center justify-center gap-1.5 border border-gray-300 rounded-lg py-1.5 text-sm text-gray-700 hover:bg-gray-50">
          {kopiert ? <Check size={14} className="text-green-600" /> : <Copy size={14} />} {kopiert ? "Kopiert" : "Kopieren"}
        </button>
        <button type="button" onClick={drucken}
          className="flex-1 flex items-center justify-center gap-1.5 border border-gray-300 rounded-lg py-1.5 text-sm text-gray-700 hover:bg-gray-50">
          <Printer size={14} /> Drucken
        </button>
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
        <input type="checkbox" checked={notiert} onChange={e => setNotiert(e.target.checked)} className="rounded border-gray-300" />
        Ich habe die Codes gesichert
      </label>
      <button
        type="button"
        disabled={!notiert}
        onClick={onFertig}
        className="w-full bg-[rgb(var(--accent))] hover:brightness-90 disabled:opacity-60 text-white font-medium py-2 rounded-lg transition-colors"
      >
        {fertigText}
      </button>
    </div>
  );
}
