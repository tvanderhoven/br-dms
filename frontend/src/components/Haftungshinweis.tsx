/**
 * Haftungshinweis/Disclaimer – ein Text, mehrere Stellen: einmaliger Pflicht-Dialog
 * nach dem Login, freiwillig erneut aufrufbar über den Footer-Hinweis und im
 * "Über BR-DMS"-Dialog. DisclaimerInhalt ist die gemeinsame Quelle, damit der
 * Wortlaut nicht an mehreren Stellen gepflegt werden muss.
 */
import { AlertTriangle, X } from "lucide-react";

export const DISCLAIMER_LOCALSTORAGE_KEY = "brdms_disclaimer_bestaetigt_v1";

export function disclaimerBereitsBestaetigt(): boolean {
  return localStorage.getItem(DISCLAIMER_LOCALSTORAGE_KEY) === "true";
}

export function disclaimerBestaetigen(): void {
  localStorage.setItem(DISCLAIMER_LOCALSTORAGE_KEY, "true");
}

export function DisclaimerInhalt() {
  return (
    <>
      <p>BR-DMS ist ein Community-Projekt und keine Rechtsberatung.</p>
      <ul className="list-disc pl-5 space-y-2">
        <li>
          Alle rechtlichen Bezüge (z.&nbsp;B. auf das Betriebsverfassungsgesetz, die DSGVO oder das
          BDSG) sowie alle Vorlagen und Texte geben die persönliche Auslegung und das
          Rechtsverständnis des Entwicklers wieder.
        </li>
        <li>
          Sie wurden nicht von einer Rechtsanwältin oder einem Rechtsanwalt geprüft und können
          unvollständig, veraltet oder fehlerhaft sein.
        </li>
        <li>
          Die Nutzung erfolgt in eigener Verantwortung. Bitte prüft vor dem Einsatz, ob die Inhalte
          für euer Gremium und eure Situation passen, und holt euch im Zweifel rechtlichen Rat
          (z.&nbsp;B. Gewerkschaft oder Fachanwalt für Arbeitsrecht).
        </li>
        <li>
          Hinweise, Korrekturen und abweichende Rechtsauffassungen sind ausdrücklich willkommen
          (Issue oder Pull Request).
        </li>
      </ul>
      <p className="text-xs text-gray-500">
        Soweit gesetzlich zulässig, wird keine Gewähr für Richtigkeit, Vollständigkeit und Aktualität
        übernommen. Gesetzliche Haftungsregelungen, die sich nicht ausschließen lassen, bleiben
        unberührt.
      </p>
    </>
  );
}

/**
 * pflicht=true: direkt nach dem Login, muss bestätigt werden (kein X, kein Klick auf den
 * Hintergrund). pflicht=false: freiwillig erneut geöffnet (Footer-Hinweis, "Über BR-DMS") –
 * dann schließbar wie jeder andere Dialog.
 */
export default function HaftungshinweisModal({ onSchliessen, pflicht = false }: { onSchliessen: () => void; pflicht?: boolean }) {
  function bestaetigen() {
    disclaimerBestaetigen();
    onSchliessen();
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4" onClick={pflicht ? undefined : onSchliessen}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="text-amber-500 shrink-0" />
            <h2 className="font-semibold text-gray-900">Wichtiger Hinweis (Disclaimer)</h2>
          </div>
          {!pflicht && (
            <button onClick={onSchliessen} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          )}
        </div>
        <div className="px-6 py-5 space-y-3 text-sm text-gray-700">
          <DisclaimerInhalt />
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
          <button
            onClick={bestaetigen}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-[rgb(var(--accent))] hover:opacity-90"
          >
            Zur Kenntnis genommen
          </button>
        </div>
      </div>
    </div>
  );
}

/** Kurzer, dauerhaft sichtbarer Footer-Hinweis mit Link auf den vollständigen Dialog. */
export function DisclaimerFooterZeile({ onMehrErfahren, className = "" }: { onMehrErfahren: () => void; className?: string }) {
  return (
    <p className={`text-[11px] ${className}`}>
      BR-DMS ist ein Community-Projekt. Rechtliche Hinweise geben die persönliche Auslegung des
      Autors wieder und ersetzen keine Rechtsberatung.{" "}
      <button onClick={onMehrErfahren} className="underline hover:opacity-80 text-inherit">Mehr erfahren</button>
    </p>
  );
}
