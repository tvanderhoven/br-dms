import { useState, useEffect } from "react";
import { EyeOff } from "lucide-react";

// ── Sichtschutz ──────────────────────────────────────────────────────
// Blendet sensible Inhalte (Gehaltsdaten) aus, sobald das Browser-Fenster/
// der Tab den Fokus verliert (Alt-Tab, anderes Fenster, Tab-Wechsel) – z.B.
// wenn kurz jemand anders ins Zimmer kommt oder man selbst wegschaut.
// Bewusst KEIN automatisches Wieder-Aufdecken bei Rückkehr des Fokus –
// sonst sieht jemand, der gerade über die Schulter schaut, die Daten sofort
// wieder. Erst ein bewusster Klick deckt wieder auf.
export default function Sichtschutz({ children }: { children: React.ReactNode }) {
  const [verdeckt, setVerdeckt] = useState(false);

  useEffect(() => {
    function verstecken() { setVerdeckt(true); }
    function sichtbarkeitGeaendert() { if (document.hidden) verstecken(); }
    window.addEventListener("blur", verstecken);
    document.addEventListener("visibilitychange", sichtbarkeitGeaendert);
    return () => {
      window.removeEventListener("blur", verstecken);
      document.removeEventListener("visibilitychange", sichtbarkeitGeaendert);
    };
  }, []);

  return (
    <div className="relative">
      <div className={verdeckt ? "blur-md select-none pointer-events-none" : ""}>
        {children}
      </div>
      {verdeckt && (
        <button
          onClick={() => setVerdeckt(false)}
          className="absolute inset-0 flex items-center justify-center bg-white/50 z-10"
        >
          <span className="bg-white shadow-lg border border-gray-200 rounded-xl px-5 py-3 flex items-center gap-2 text-sm font-medium text-gray-700 hover:border-gray-300">
            <EyeOff size={16} />
            Ausgeblendet — klicken zum Anzeigen
          </span>
        </button>
      )}
    </div>
  );
}
