import { FormEvent, useState } from "react";
import { Loader2, Mail, Pencil, Trash2, UserRound, X } from "lucide-react";
import { api, GAST_FUNKTION_LABEL, GastFunktion, TopGast } from "../lib/api";

// Gäste je TOP ohne Konto (Roadmap Paket 5, Backend: routes/gaeste.ts)

const FUNKTION_KURZ: Record<GastFunktion, string> = {
  ARBEITGEBER: "Arbeitgeber", GEWERKSCHAFT: "Gewerkschaft", SACHVERSTAENDIGER: "Sachverständige/r",
  AUSKUNFTSPERSON: "Auskunftsperson", SONSTIGE: "Gast",
};

const datum = (iso: string) => new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

export function TopGaesteListe({
  sitzungId, topId, gaeste, verwalten, vorSitzung, imProtokoll, readonly, onBearbeiten, onAktualisieren,
}: {
  sitzungId: string;
  topId: string;
  gaeste: TopGast[];
  /** Vorsitz/Stellvertretung: eintragen, ändern, einladen, entfernen */
  verwalten: boolean;
  vorSitzung: boolean;
  imProtokoll: boolean;
  readonly: boolean;
  onBearbeiten: (g: TopGast) => void;
  onAktualisieren: () => void;
}) {
  const [arbeitet, setArbeitet] = useState<string | null>(null);

  async function ausfuehren(gastId: string, fn: () => Promise<unknown>) {
    setArbeitet(gastId);
    try {
      await fn();
      onAktualisieren();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Fehler");
    } finally {
      setArbeitet(null);
    }
  }

  function einladen(g: TopGast) {
    const zusatz = prompt(
      `Mail an ${g.name} (${g.email}) mit Termin und nur diesem TOP senden.\n\n` +
      "Zusatz für die Mail (optional, z. B. ungefähre Uhrzeit des TOPs):",
      "",
    );
    if (zusatz === null) return;
    ausfuehren(g.id, () => api.sitzungen.gastEinladen(sitzungId, topId, g.id, zusatz));
  }

  function entfernen(g: TopGast) {
    if (!confirm(`${g.name} als Gast entfernen?`)) return;
    ausfuehren(g.id, () => api.sitzungen.gastLoeschen(sitzungId, topId, g.id));
  }

  return (
    <div className="mt-2 space-y-1">
      {gaeste.map(g => (
        <div key={g.id} className={`flex items-center gap-2 flex-wrap text-xs ${g.anwesend ? "text-gray-700" : "text-gray-400 line-through"}`}>
          <UserRound size={12} className="text-gray-400 shrink-0" />
          <span className="font-medium">{g.name}</span>
          <span className="text-gray-500">{[FUNKTION_KURZ[g.funktion], g.organisation].filter(Boolean).join(", ")}</span>
          {g.eingeladenAm && (
            <span className="flex items-center gap-1 text-green-700 no-underline" title={`Einladung an ${g.email}`}>
              <Mail size={10} /> eingeladen {datum(g.eingeladenAm)}
            </span>
          )}
          {arbeitet === g.id && <Loader2 size={11} className="animate-spin text-gray-400" />}
          {imProtokoll && !readonly && (
            <label className="flex items-center gap-1 text-gray-600 cursor-pointer" title="Im Protokoll unter Anwesenheit aufführen">
              <input type="checkbox" checked={g.anwesend} disabled={arbeitet === g.id}
                onChange={e => ausfuehren(g.id, () => api.sitzungen.gastAktualisieren(sitzungId, topId, g.id, { anwesend: e.target.checked }))}
                className="rounded-sm border-gray-300 text-[rgb(var(--accent))]" />
              erschienen
            </label>
          )}
          {verwalten && !readonly && (
            <span className="flex items-center gap-0.5 ml-1">
              {vorSitzung && g.email && (
                <button onClick={() => einladen(g)} disabled={arbeitet === g.id}
                  title={g.eingeladenAm ? "Einladung erneut senden" : "Einladung per Mail (Termin und nur dieser TOP)"}
                  className="p-1 text-gray-400 hover:text-[rgb(var(--accent))] hover:bg-accent/5 rounded-sm">
                  <Mail size={12} />
                </button>
              )}
              <button onClick={() => onBearbeiten(g)} title="Gast bearbeiten"
                className="p-1 text-gray-400 hover:text-[rgb(var(--accent))] hover:bg-accent/5 rounded-sm">
                <Pencil size={12} />
              </button>
              <button onClick={() => entfernen(g)} disabled={arbeitet === g.id} title="Gast entfernen"
                className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-sm">
                <Trash2 size={12} />
              </button>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export function GastModal({
  sitzungId, topId, topNummer, gast, onSchliessen, onErfolg,
}: {
  sitzungId: string;
  topId: string;
  topNummer: number;
  gast?: TopGast;
  onSchliessen: () => void;
  onErfolg: () => void;
}) {
  const [name, setName]                 = useState(gast?.name ?? "");
  const [funktion, setFunktion]         = useState<GastFunktion>(gast?.funktion ?? "ARBEITGEBER");
  const [organisation, setOrganisation] = useState(gast?.organisation ?? "");
  const [email, setEmail]               = useState(gast?.email ?? "");
  const [laden, setLaden]               = useState(false);
  const [fehler, setFehler]             = useState("");

  async function speichern(e: FormEvent) {
    e.preventDefault();
    setFehler("");
    setLaden(true);
    try {
      const daten = { name, funktion, organisation: organisation || null, email: email || null };
      if (gast) await api.sitzungen.gastAktualisieren(sitzungId, topId, gast.id, daten);
      else await api.sitzungen.gastHinzufuegen(sitzungId, topId, daten);
      onErfolg();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler");
    } finally {
      setLaden(false);
    }
  }

  const feld = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-[rgb(var(--accent))]";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{gast ? "Gast bearbeiten" : `Gast zu TOP ${topNummer} eintragen`}</h2>
          <button onClick={onSchliessen} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={speichern} className="px-6 py-4 space-y-4">
          <p className="text-xs text-gray-500">
            Gäste bekommen kein Konto. Sie erscheinen bei der Anwesenheit im Protokoll und auf der Anwesenheitsliste;
            auf Wunsch geht eine Mail mit dem Termin und nur diesem TOP an sie.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} required autoFocus maxLength={200} className={feld} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Funktion *</label>
              <select value={funktion} onChange={e => setFunktion(e.target.value as GastFunktion)} className={`${feld} bg-white`}>
                {(Object.keys(GAST_FUNKTION_LABEL) as GastFunktion[]).map(f => (
                  <option key={f} value={f}>{GAST_FUNKTION_LABEL[f]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Organisation / Abteilung</label>
              <input value={organisation} onChange={e => setOrganisation(e.target.value)} maxLength={200}
                placeholder="z. B. Personalabteilung, IG Metall" className={feld} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">E-Mail (optional, für die Einladung)</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={feld} />
          </div>
          {fehler && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{fehler}</div>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onSchliessen} className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Abbrechen</button>
            <button type="submit" disabled={laden}
              className="flex-1 px-4 py-2 text-sm bg-[rgb(var(--accent))] hover:brightness-90 disabled:opacity-60 text-white rounded-lg flex items-center justify-center gap-2">
              {laden && <Loader2 size={14} className="animate-spin" />}
              {gast ? "Speichern" : "Eintragen"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
