import { useEffect, useState } from "react";
import { api, Signatur, SignaturArt, SignaturStandard } from "../lib/api";

// Signatur für einen Mailversand wählen (Backend: lib/signaturen.ts). Zeigt den Text darunter,
// damit man vor dem Senden sieht, was angehängt wird (z. B. ein Einwahl-Link).

/** Lädt die Signaturen und wählt die Standardsignatur der Mailart vor */
export function useSignaturen(art: SignaturArt, aktiv = true) {
  const [signaturen, setSignaturen] = useState<Signatur[]>([]);
  const [standard, setStandard]     = useState<SignaturStandard | null>(null);
  const [gewaehlt, setGewaehlt]     = useState("");

  useEffect(() => {
    if (!aktiv) return;
    api.einstellungen.signaturen()
      .then(r => { setSignaturen(r.signaturen); setStandard(r.signaturStandard); setGewaehlt(r.signaturStandard[art]); })
      .catch(() => {});
  }, [art, aktiv]);

  return { signaturen, standard, gewaehlt, setGewaehlt };
}

export function SignaturAuswahl({ signaturen, value, onChange, standardId }: {
  signaturen: Signatur[];
  value: string;                       // Signatur-ID, "" = keine
  onChange: (id: string) => void;
  standardId?: string;
}) {
  const aktuell = signaturen.find(s => s.id === value);
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Signatur</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-[rgb(var(--accent))] w-full max-w-xs"
      >
        <option value="">Keine Signatur</option>
        {signaturen.map(s => <option key={s.id} value={s.id}>{s.name}{s.id === standardId ? " (Standard)" : ""}</option>)}
      </select>
      {aktuell?.text && (
        <p className="mt-1.5 text-xs text-gray-500 whitespace-pre-line border-l-2 border-gray-200 pl-2">{aktuell.text}</p>
      )}
      {signaturen.length === 0 && (
        <p className="mt-1 text-xs text-gray-400">Noch keine Signatur angelegt – Einstellungen → System → E-Mail-Absender.</p>
      )}
    </div>
  );
}
