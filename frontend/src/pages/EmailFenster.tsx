// E-Mail in einem eigenen Fenster (Doppelklick in der Dokumentliste, „Neues Fenster“,
// Verweise in Protokollen) – ohne Seitenleiste, mit Kopf, Anhängen und Inhalt.
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Download, Mail, Loader2 } from "lucide-react";
import { api, Dokument, formatDateigroesse } from "../lib/api";
import EmailVorschau from "../components/EmailVorschau";
import { dokumentInNeuemTabOeffnen } from "../lib/dokumentOeffnen";

export default function EmailFenster() {
  const { id = "" } = useParams();
  const [dokument, setDokument] = useState<Dokument | null>(null);
  const [fehler, setFehler]     = useState("");

  useEffect(() => {
    api.dokumente.einzel(id)
      .then(d => { setDokument(d); document.title = `${d.alias ?? d.titel} – BR-DMS`; })
      .catch(err => setFehler(err instanceof Error ? err.message : "E-Mail nicht gefunden"));
  }, [id]);

  function originalHerunterladen() {
    if (!dokument) return;
    fetch(api.dokumente.downloadUrl(dokument.id), {
      headers: { Authorization: `Bearer ${localStorage.getItem("brdms_token")}` },
    })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.blob(); })
      .then(blob => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = dokument.dateiname;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(err => alert(err instanceof Error ? err.message : "Download fehlgeschlagen"));
  }

  if (fehler) return <div className="p-6 text-sm text-red-700">{fehler}</div>;
  if (!dokument) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-400 text-sm">
        <Loader2 className="animate-spin mr-2" size={16} /> Lade E-Mail…
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-white">
      <header className="px-4 py-3 border-b border-gray-200 flex items-center justify-between gap-3">
        <div className="min-w-0 flex items-center gap-2">
          <Mail size={18} className="text-[rgb(var(--accent))] shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 truncate">{dokument.alias ?? dokument.titel}</p>
            <p className="text-xs text-gray-400 truncate">{dokument.dateiname} · {formatDateigroesse(dokument.dateigroesse)}</p>
          </div>
        </div>
        <button
          onClick={originalHerunterladen}
          title="Die unveränderte E-Mail-Datei, z. B. zum Öffnen im Mailprogramm"
          className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-[rgb(var(--accent))] px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-accent/5 shrink-0"
        >
          <Download size={14} /> Original herunterladen
        </button>
      </header>
      <div className="flex-1 min-h-0 max-w-5xl w-full mx-auto">
        <EmailVorschau
          dokumentId={dokument.id}
          onDokumentOeffnen={anhangId => dokumentInNeuemTabOeffnen(anhangId)}
          onAbgelegt={() => {}}
        />
      </div>
    </div>
  );
}
