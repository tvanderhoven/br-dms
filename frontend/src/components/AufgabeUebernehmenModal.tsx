import { useState, useEffect, FormEvent } from "react";
import { X, CheckSquare, Folder, Loader2 } from "lucide-react";
import { api } from "../lib/api";
import SitzungsEditor from "./SitzungsEditor";
import { tiptapZuText, textZuTiptap } from "../lib/tiptap";

// ── Text/TOP-Inhalt (oder Kommentar) als vollwertige Aufgabe/Vorhaben übernehmen ──
// Gleiches Formular wie "Neue Aufgabe" auf der Aufgaben-Seite (Typ-Toggle, Vorhaben,
// Priorität, Fälligkeit, Zuweisung) – bewusst identisch, egal ob man von einem TOP
// oder einem Kommentar aus startet.
export default function AufgabeUebernehmenModal({
  headerTitel = "Als Aufgabe übernehmen",
  titelVorschlag,
  beschreibungVorschlag = "",
  onSchliessen,
  onErfolg,
}: {
  headerTitel?: string;
  titelVorschlag: string;
  beschreibungVorschlag?: string;
  onSchliessen: () => void;
  onErfolg: () => void;
}) {
  const [laden, setLaden]         = useState(false);
  const [fehler, setFehler]       = useState("");
  const [erfolg, setErfolg]       = useState(false);
  const [typ, setTyp]             = useState<"AUFGABE" | "PROJEKT">("AUFGABE");
  const [titel, setTitel]         = useState(titelVorschlag);
  const [beschreibungJson, setBeschreibungJson] = useState<object | null>(textZuTiptap(beschreibungVorschlag));
  const [prioritaet, setPrioritaet] = useState("MITTEL");
  const [faelligAm, setFaelligAm] = useState("");
  const [startDatum, setStartDatum] = useState("");
  const [endDatum, setEndDatum]   = useState("");
  const [zugewiesenAnId, setZugewiesenAnId] = useState("");
  const [oberProjektId, setOberProjektId]   = useState("");
  const [mitglieder, setMitglieder]         = useState<{ id: string; name: string }[]>([]);
  const [zeitraeume, setZeitraeume]         = useState<{ id: string; titel: string }[]>([]);

  useEffect(() => {
    api.get<{ id: string; name: string }[]>("/api/benutzer").then(setMitglieder).catch(() => {});
    api.aufgaben.liste().then(a => setZeitraeume(a.filter(x => x.typ === "PROJEKT" && !x.oberProjektId))).catch(() => {});
  }, []);

  const istZeitraum = typ === "PROJEKT";

  async function speichern(e: FormEvent) {
    e.preventDefault();
    if (!titel) return;
    setFehler("");
    setLaden(true);
    try {
      await api.aufgaben.erstellen({
        titel,
        typ,
        beschreibung:     tiptapZuText(beschreibungJson) || undefined,
        beschreibungJson: beschreibungJson ?? undefined,
        oberProjektId:    oberProjektId || undefined,
        ...(istZeitraum
          ? {
              startDatum: startDatum || undefined,
              endDatum:   endDatum   || undefined,
            }
          : {
              prioritaet:     prioritaet as "HOCH" | "MITTEL" | "NIEDRIG",
              faelligAm:      faelligAm || undefined,
              zugewiesenAnId: zugewiesenAnId || undefined,
            }
        ),
      });
      setErfolg(true);
      setTimeout(onErfolg, 1200);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler");
    } finally {
      setLaden(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{headerTitel}</h2>
          <button onClick={onSchliessen} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        {erfolg ? (
          <div className="px-6 py-8 text-center text-emerald-600 font-medium">
            <CheckSquare size={32} className="mx-auto mb-2" />
            {istZeitraum ? "Vorhaben wurde erstellt." : "Aufgabe wurde erstellt."}
          </div>
        ) : (
          <form onSubmit={speichern} className="px-6 py-4 space-y-4">
            {/* Typ-Toggle */}
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              <button
                type="button"
                onClick={() => setTyp("AUFGABE")}
                className={`flex-1 py-2 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                  typ === "AUFGABE"
                    ? "bg-[rgb(var(--accent))] text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                <CheckSquare size={14} /> Aufgabe
              </button>
              <button
                type="button"
                onClick={() => setTyp("PROJEKT")}
                className={`flex-1 py-2 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                  typ === "PROJEKT"
                    ? "bg-[rgb(var(--accent))] text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                <Folder size={14} /> Vorhaben
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Titel *</label>
              <input value={titel} onChange={e => setTitel(e.target.value)} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Beschreibung</label>
              <SitzungsEditor
                content={beschreibungJson}
                onChange={setBeschreibungJson}
                placeholder="Optional"
                minHeight="70px"
              />
            </div>

            {/* Vorhaben */}
            {zeitraeume.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {istZeitraum ? "Übergeordnetes Vorhaben" : "Vorhaben"}
                </label>
                <select value={oberProjektId} onChange={e => setOberProjektId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))] bg-white">
                  <option value="">– ohne Vorhaben –</option>
                  {zeitraeume.map(z => <option key={z.id} value={z.id}>{z.titel}</option>)}
                </select>
              </div>
            )}

            {/* Felder je nach Typ */}
            {istZeitraum ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Von</label>
                  <input type="date" value={startDatum} onChange={e => setStartDatum(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bis</label>
                  <input type="date" value={endDatum} onChange={e => setEndDatum(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]" />
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Priorität</label>
                    <select value={prioritaet} onChange={e => setPrioritaet(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))] bg-white">
                      <option value="HOCH">Hoch</option>
                      <option value="MITTEL">Mittel</option>
                      <option value="NIEDRIG">Niedrig</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Fällig am</label>
                    <input type="date" value={faelligAm} onChange={e => setFaelligAm(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]" />
                  </div>
                </div>
                {mitglieder.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Zuweisen an</label>
                    <select value={zugewiesenAnId} onChange={e => setZugewiesenAnId(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))] bg-white">
                      <option value="">Niemanden zuweisen</option>
                      {mitglieder.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </div>
                )}
              </>
            )}

            {fehler && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{fehler}</div>}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onSchliessen}
                className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Abbrechen</button>
              <button type="submit" disabled={laden}
                className="flex-1 px-4 py-2 text-sm bg-accent hover:brightness-90 disabled:opacity-60 text-white rounded-lg flex items-center justify-center gap-2">
                {laden && <Loader2 size={14} className="animate-spin" />}
                {istZeitraum ? "Vorhaben erstellen" : "Aufgabe erstellen"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
