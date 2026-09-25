import { FormEvent, useEffect, useState } from "react";
import { Loader2, Send, Trash2, CheckSquare } from "lucide-react";
import { api, Kommentar } from "../lib/api";
import SitzungsEditor from "./SitzungsEditor";
import { tiptapZuText, tiptapZuHtml } from "../lib/tiptap";
import AufgabeUebernehmenModal from "./AufgabeUebernehmenModal";

export default function KommentarBlock({
  ladeUrl,
  erstellenUrl,
  loeschenUrl,
  compact = false,
  onAnzahlAendert,
}: {
  ladeUrl: string;
  erstellenUrl: string;
  loeschenUrl: (id: string) => string;
  compact?: boolean;
  onAnzahlAendert?: (anzahl: number) => void;
}) {
  const [kommentare, setKommentare]     = useState<Kommentar[]>([]);
  const [inhaltJson, setInhaltJson]     = useState<object | null>(null);
  const [laden, setLaden]               = useState(true);
  const [senden, setSenden]             = useState(false);
  const [aufgabeOffen, setAufgabeOffen] = useState<string | null>(null);

  useEffect(() => {
    let aktiv = true;
    setLaden(true);
    api.get<Kommentar[]>(ladeUrl)
      .then(d => { if (aktiv) { setKommentare(d); onAnzahlAendert?.(d.length); } })
      .catch(() => {})
      .finally(() => { if (aktiv) setLaden(false); });
    return () => { aktiv = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ladeUrl]);

  async function hinzufuegen(e: FormEvent) {
    e.preventDefault();
    const text = tiptapZuText(inhaltJson);
    if (!text.trim()) return;
    setSenden(true);
    try {
      const k = await api.post<Kommentar>(erstellenUrl, { inhalt: text.trim(), inhaltJson });
      setKommentare(prev => { const next = [...prev, k]; onAnzahlAendert?.(next.length); return next; });
      setInhaltJson(null);
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
      setKommentare(prev => { const next = prev.filter(k => k.id !== id); onAnzahlAendert?.(next.length); return next; });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Fehler");
    }
  }

  const textKlasse = compact ? "text-xs" : "text-sm";

  const hatInhalt = tiptapZuText(inhaltJson).trim().length > 0;

  return (
    <div className="space-y-2">
      <form onSubmit={hinzufuegen} className="space-y-1.5">
        <SitzungsEditor
          content={inhaltJson}
          onChange={setInhaltJson}
          placeholder="Kommentar hinzufügen…"
          minHeight={compact ? "60px" : "80px"}
        />
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={senden || !hatInhalt}
            className="flex items-center gap-1.5 bg-[rgb(var(--accent))] hover:brightness-90 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 rounded-lg"
          >
            {senden ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
            Senden
          </button>
        </div>
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
                  {k.inhaltJson ? (
                    <div
                      className={`text-gray-800 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0.5 [&_p]:my-0.5 [&_strong]:font-semibold [&_em]:italic [&_blockquote]:border-l-2 [&_blockquote]:border-gray-300 [&_blockquote]:pl-2 [&_blockquote]:text-gray-400 ${textKlasse}`}
                      dangerouslySetInnerHTML={{ __html: tiptapZuHtml(k.inhaltJson) }}
                    />
                  ) : (
                    <p className={`text-gray-800 whitespace-pre-wrap ${textKlasse}`}>{k.inhalt}</p>
                  )}
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
                <AufgabeUebernehmenModal
                  headerTitel="Aus Kommentar übernehmen"
                  titelVorschlag={k.inhalt}
                  onSchliessen={() => setAufgabeOffen(null)}
                  onErfolg={() => setAufgabeOffen(null)}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
