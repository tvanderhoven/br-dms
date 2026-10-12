import { useState } from "react";
import { api } from "../lib/api";
import BrDmsLogo from "./BrDmsLogo";

// Online-Demo ohne Server: ein eigenes Logo gibt es dort nicht, und als <img> geladen
// käme die Anfrage am Mock-Backend vorbei (es fängt nur fetch ab) – gleich das BR-DMS-Logo zeigen
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";

/**
 * Zeigt das in Einstellungen → Design hochgeladene Logo (dieselbe Datei, die auch
 * im PDF-Kopf verwendet wird). Ist keines hochgeladen (oder lädt es nicht), erscheint
 * das BR-DMS-Logo – der Schriftzug übernimmt die Textfarbe aus textClassName.
 */
export default function BrandLogo({
  size = 22,
  textClassName = "",
  imgWrapClassName = "",
}: {
  size?: number;
  textClassName?: string;
  imgWrapClassName?: string;
}) {
  const [fehlt, setFehlt] = useState(DEMO_MODE);

  if (!fehlt) {
    return (
      <span className={imgWrapClassName}>
        <img
          src={api.einstellungen.logoUrl()}
          alt="Logo"
          style={{ height: size }}
          className="w-auto block"
          onError={() => setFehlt(true)}
        />
      </span>
    );
  }

  return <BrDmsLogo height={size} className={textClassName} />;
}
