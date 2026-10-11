import { useEffect, useState } from "react";
import { ArrowUpCircle, X } from "lucide-react";
import { api } from "../lib/api";

type Hinweis = { version: string; name: string | null; url: string; veroeffentlichtAm: string | null };

// Pro Browser merken, welche Version weggeklickt wurde – erst die nächste neue Version zeigt wieder einen Hinweis
const AUSGEBLENDET_KEY = "brdms_update_ausgeblendet";

function ausgeblendeteVersion(): string | null {
  try { return localStorage.getItem(AUSGEBLENDET_KEY); } catch { return null; }
}

/**
 * Banner „Neue BR-DMS-Version verfügbar“. Die Daten kommen aus dem täglichen
 * Update-Check des Backends; ist der abgeschaltet oder schlägt etwas fehl,
 * erscheint einfach nichts.
 */
export default function UpdateBanner() {
  const [hinweis, setHinweis] = useState<Hinweis | null>(null);
  const [installiert, setInstalliert] = useState<string | null>(null);

  useEffect(() => {
    api.einstellungen.update()
      .then(r => {
        if (r.hinweis && r.hinweis.version !== ausgeblendeteVersion()) {
          setHinweis(r.hinweis);
          setInstalliert(r.installiert);
        }
      })
      .catch(() => {});
  }, []);

  if (!hinweis) return null;

  function ausblenden() {
    try { localStorage.setItem(AUSGEBLENDET_KEY, hinweis!.version); } catch { /* nur für diese Sitzung */ }
    setHinweis(null);
  }

  return (
    <div className="mx-4 mt-3 flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-900">
      <ArrowUpCircle size={18} className="mt-0.5 shrink-0 text-blue-600" />
      <div className="flex-1 min-w-0">
        <span className="font-medium">BR-DMS {hinweis.version.replace(/^v/, "")} ist erschienen</span>
        {installiert && <span className="text-blue-800/80"> – installiert ist {installiert}.</span>}{" "}
        <a href={hinweis.url} target="_blank" rel="noopener noreferrer" className="underline hover:no-underline">
          Was ist neu?
        </a>
        <span className="text-blue-800/80"> Das Update spielt der Admin des Servers ein (Handbuch Kapitel 13.1).</span>
      </div>
      <button onClick={ausblenden} title="Für diese Version ausblenden"
        className="shrink-0 rounded p-0.5 text-blue-700 hover:bg-blue-100">
        <X size={16} />
      </button>
    </div>
  );
}
