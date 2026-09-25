import { useState, FormEvent } from "react";
import { X, Loader2 } from "lucide-react";
import { api, Abteilung, Mitarbeiter, Beschaeftigungsart, ALLE_BESCHAEFTIGUNGSARTEN, BESCHAEFTIGUNGSART_LABEL } from "../lib/api";

// ── Modal: Mitarbeiter-Stammdaten bearbeiten ───────────────────────
// Gemeinsam genutzt von Gehaltstabelle.tsx (Bearbeiten-Icon neben dem Eintrag)
// und MitarbeiterUebersicht.tsx (Bearbeiten-Icon in der Tabellenzeile).
export default function MitarbeiterBearbeitenModal({
  mitarbeiter, abteilungen, standorte, onSchliessen, onErfolg,
}: {
  mitarbeiter: Mitarbeiter;
  abteilungen: Abteilung[];
  standorte: string[];
  onSchliessen: () => void;
  onErfolg: (m: Mitarbeiter) => void;
}) {
  const [vorname, setVorname]         = useState(mitarbeiter.vorname);
  const [nachname, setNachname]       = useState(mitarbeiter.nachname);
  const [pnr, setPnr]                 = useState(mitarbeiter.pnr ?? "");
  const [abteilungId, setAbteilungId] = useState(mitarbeiter.abteilungId ?? mitarbeiter.abteilung?.id ?? "");
  const [eintritt, setEintritt]       = useState(mitarbeiter.eintritt?.slice(0, 10) ?? "");
  const [austritt, setAustritt]       = useState(mitarbeiter.austritt?.slice(0, 10) ?? "");
  const [standort, setStandort]       = useState(mitarbeiter.standort ?? "");
  const [gehaltIgnorieren, setGehaltIgnorieren] = useState(mitarbeiter.gehaltIgnorieren ?? false);
  const [beschaeftigungsart, setBeschaeftigungsart] = useState<Beschaeftigungsart>(mitarbeiter.beschaeftigungsart ?? "MITARBEITER");
  const [laden, setLaden]             = useState(false);
  const [fehler, setFehler]           = useState("");

  async function speichern(e: FormEvent) {
    e.preventDefault();
    if (!vorname.trim() || !nachname.trim()) {
      setFehler("Vor- und Nachname sind Pflicht");
      return;
    }
    setFehler("");
    setLaden(true);
    try {
      const aktualisiert = await api.mitarbeiter.aktualisieren(mitarbeiter.id, {
        vorname:     vorname.trim(),
        nachname:    nachname.trim(),
        pnr:         pnr.trim(),
        abteilungId: abteilungId || null,
        eintritt,
        austritt,
        standort:    standort.trim() || null,
        gehaltIgnorieren,
        beschaeftigungsart,
      });
      onErfolg(aktualisiert);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler beim Speichern");
    } finally {
      setLaden(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">Mitarbeiter-Stammdaten bearbeiten</h2>
          <button onClick={onSchliessen} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={speichern} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vorname *</label>
              <input
                type="text" required value={vorname} autoFocus
                onChange={e => setVorname(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nachname *</label>
              <input
                type="text" required value={nachname}
                onChange={e => setNachname(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">PNR</label>
              <input
                type="text" value={pnr} placeholder="optional"
                onChange={e => setPnr(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Abteilung</label>
              <select
                value={abteilungId}
                onChange={e => setAbteilungId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
              >
                <option value="">– keine –</option>
                {abteilungen.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Eintritt</label>
              <input
                type="date" value={eintritt}
                onChange={e => setEintritt(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Austritt</label>
              <input
                type="date" value={austritt}
                onChange={e => setAustritt(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Standort</label>
              <input
                type="text" value={standort} placeholder="z.B. Oberhausen" list="standort-optionen"
                onChange={e => setStandort(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
              />
              <datalist id="standort-optionen">
                {standorte.map(s => <option key={s} value={s} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Beschäftigungsart</label>
              <select
                value={beschaeftigungsart}
                onChange={e => setBeschaeftigungsart(e.target.value as Beschaeftigungsart)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
              >
                {ALLE_BESCHAEFTIGUNGSARTEN.map(b => <option key={b} value={b}>{BESCHAEFTIGUNGSART_LABEL[b]}</option>)}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={gehaltIgnorieren}
              onChange={e => setGehaltIgnorieren(e.target.checked)}
              className="rounded border-gray-300 text-[rgb(var(--accent))]"
            />
            <span className="text-sm text-gray-700">Nicht gehaltsrelevant (z.B. GF, Ausbildung) — erscheint nicht in "ohne Gehaltseintrag"</span>
          </label>

          {fehler && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{fehler}</div>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onSchliessen}
              className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
              Abbrechen
            </button>
            <button type="submit" disabled={laden}
              className="flex-1 hover:brightness-90 disabled:opacity-60 text-white py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
              style={{ backgroundColor: "rgb(var(--accent))" }}>
              {laden && <Loader2 size={14} className="animate-spin" />}
              Speichern
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
