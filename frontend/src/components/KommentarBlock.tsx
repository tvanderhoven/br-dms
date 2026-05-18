import { FormEvent, useEffect, useState } from "react";
import { Loader2, Send, Trash2, CheckSquare, X } from "lucide-react";
import { api, Kommentar, Benutzer } from "../lib/api";

function AufgabeForm({
  kommentarText,
  onSchliessen,
}: {
  kommentarText: string;
  onSchliessen: () => void;
}) {
  const [titel, setTitel]         = useState(kommentarText);
  const [mitglied, setMitglied]   = useState("");
  const [prio, setPrio]           = useState("MITTEL");
  const [faellig, setFaellig]     = useState("");
  const [benutzer, setBenutzer]   = useState<Benutzer[]>([]);
  const [laden, setLaden]         = useState(false);
  const [erfolg, setErfolg]       = useState(false);

  useEffect(() => {
    api.get<Benutzer[]>("/api/benutzer")
      .then(d => setBenutzer(d.filter(b => b.aktiv)))
      .catch(() => {});
  }, []);

  async function speichern(e: FormEvent) {
    e.preventDefault();
    if (!titel.trim()) return;
    setLaden(true);
    try {
      await api.aufgaben.erstellen({
        titel:          titel.trim(),
        prioritaet:     prio as any,
        zugewiesenAnId: mitglied || undefined,
        faelligAm:      faellig || undefined,
      });
      setErfolg(true);
      setTimeout(onSchliessen, 1000);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Fehler");
      setLaden(false);
    }
  }

  if (erfolg) {
    return (
      <div className="mt-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
        ✓ Aufgabe erstellt
      </div>
    );
  }

  return (
    <form onSubmit={speichern} className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-amber-800">Aufgabe erstellen</span>
        <button type="button" onClick={onSchliessen} className="text-amber-400 hover:text-amber-700">
          <X size={12} />
        </button>
      </div>
      <input
        value={titel}
        onChange={e => setTitel(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400"
        placeholder="Aufgabentitel"
        required
      />
      <div className="flex gap-2">
        <select
          value={mitglied}
          onChange={e => setMitglied(e.target.value)}
          className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
        >
          <option value="">– Zuweisung –</option>
          {benutzer.map(b => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <select
          value={prio}
          onChange={e => setPrio(e.target.value)}
          className="border border-gray-300 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
        >
          <option value="HOCH">Hoch</option>
          <option value="MITTEL">Mittel</option>
          <option value="NIEDRIG">Niedrig</option>
        </select>
      </div>
      <div className="flex gap-2 items-center">
        <input
          type="date"
          value={faellig}
          onChange={e => setFaellig(e.target.value)}
          className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
        <button
          type="submit"
          disabled={laden || !titel.trim()}
          className="flex items-center gap-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs px-3 py-1 rounded-lg"
        >
          {laden ? <Loader2 size={11} className="animate-spin" /> : <CheckSquare size={11} />}
          Erstellen
        </button>
      </div>
    </form>
  );
}

export default function KommentarBlock({
  ladeUrl,
  erstellenUrl,
  loeschenUrl,
  compact = false,
}: {
  ladeUrl: string;
  erstellenUrl: string;
  loeschenUrl: (id: string) => string;
  compact?: boolean;
}) {
  const [kommentare, setKommentare]     = useState<Kommentar[]>([]);
  const [text, setText]                 = useState("");
  const [laden, setLaden]               = useState(true);
  const [senden, setSenden]             = useState(false);
  const [aufgabeOffen, setAufgabeOffen] = useState<string | null>(null);

  useEffect(() => {
    let aktiv = true;
    setLaden(true);
    api.get<Kommentar[]>(ladeUrl)
      .then(d => { if (aktiv) setKommentare(d); })
      .catch(() => {})
      .finally(() => { if (aktiv) setLaden(false); });
    return () => { aktiv = false; };
  }, [ladeUrl]);

  async function hinzufuegen(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSenden(true);
    try {
      const k = await api.post<Kommentar>(erstellenUrl, { inhalt: text.trim() });
      setKommentare(prev => [...prev, k]);
      setText("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Fehler");
    } finally {
      setSenden(false);
    }
  }

  async function loeschen(id: string) {
    if (!confirm("Kommentar wirklich löschen?")) return;
    try {
      await api.delete(loeschenUrl(id));
      setKommentare(prev => prev.filter(k => k.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Fehler");
    }
  }

  const textKlasse = compact ? "text-xs" : "text-sm";

  return (
    <div className="space-y-2">
      <form onSubmit={hinzufuegen} className="flex gap-2">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Kommentar hinzufügen…"
          className={`flex-1 border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))] ${textKlasse}`}
        />
        <button
          type="submit"
          disabled={senden || !text.trim()}
          className="flex items-center gap-1 bg-[rgb(var(--accent))] hover:brightness-90 disabled:opacity-50 text-white text-xs px-2.5 py-1.5 rounded-lg"
        >
          {senden ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
        </button>
      </form>

      {laden ? (
        <div className="flex items-center gap-1 text-gray-400 text-xs py-1">
          <Loader2 size={11} className="animate-spin" /> Laden…
        </div>
      ) : kommentare.length === 0 ? (
        <p className={`text-gray-400 text-center py-2 ${textKlasse}`}>Noch keine Kommentare</p>
      ) : (
        <div className="space-y-1.5">
          {kommentare.map(k => (
            <div key={k.id} className="bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className={`text-gray-800 whitespace-pre-wrap ${textKlasse}`}>{k.inhalt}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs text-gray-400">
                      {k.autor.name} · {new Date(k.erstelltAm).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </p>
                    <button
                      onClick={() => setAufgabeOffen(aufgabeOffen === k.id ? null : k.id)}
                      className="text-xs text-amber-600 hover:text-amber-800 flex items-center gap-0.5"
                      title="Als Aufgabe anlegen"
                    >
                      <CheckSquare size={11} />
                      Aufgabe
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => loeschen(k.id)}
                  className="text-gray-300 hover:text-red-500 p-0.5 flex-shrink-0"
                  title="Löschen"
                >
                  <Trash2 size={12} />
                </button>
              </div>
              {aufgabeOffen === k.id && (
                <AufgabeForm
                  kommentarText={k.inhalt}
                  onSchliessen={() => setAufgabeOffen(null)}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
