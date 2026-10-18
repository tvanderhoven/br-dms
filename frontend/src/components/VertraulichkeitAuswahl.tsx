// Drei Stufen für Dokumente; gespeichert als zwei Felder (vertraulich, vertraulichFuerMitglieder)
export type Vertraulichkeit = "OFFEN" | "BETRIEBSRAT" | "STRENG";

export const VERTRAULICHKEIT_TEXT: Record<Vertraulichkeit, { label: string; hinweis: string }> = {
  OFFEN:       { label: "Offen",                      hinweis: "Alle mit Zugriff auf Dokumente sehen es" },
  BETRIEBSRAT: { label: "Vertraulich: Betriebsrat",   hinweis: "Vorsitz, Stellvertretung und Mitglieder, keine Ersatzmitglieder" },
  STRENG:      { label: "Vertraulich: nur Vorsitz",   hinweis: "Nur Vorsitz und Stellvertretung" },
};

export function stufeVon(d: { vertraulich: boolean; vertraulichFuerMitglieder?: boolean }): Vertraulichkeit {
  if (!d.vertraulich) return "OFFEN";
  return d.vertraulichFuerMitglieder ? "BETRIEBSRAT" : "STRENG";
}

export function felderVon(s: Vertraulichkeit) {
  return { vertraulich: s !== "OFFEN", vertraulichFuerMitglieder: s === "BETRIEBSRAT" };
}

export default function VertraulichkeitAuswahl({ wert, onChange }: { wert: Vertraulichkeit; onChange: (s: Vertraulichkeit) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Vertraulichkeit</label>
      <select
        value={wert}
        onChange={e => onChange(e.target.value as Vertraulichkeit)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-[rgb(var(--accent))]"
      >
        {(Object.keys(VERTRAULICHKEIT_TEXT) as Vertraulichkeit[]).map(s => (
          <option key={s} value={s}>{VERTRAULICHKEIT_TEXT[s].label}</option>
        ))}
      </select>
      <p className="text-xs text-gray-500 mt-1">{VERTRAULICHKEIT_TEXT[wert].hinweis}. Wer das Dokument hochlädt, sieht es immer.</p>
    </div>
  );
}
