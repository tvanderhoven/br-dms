import { useEffect, useState } from "react";
import { Loader2, Paperclip, Download, FilePlus2, FileCheck2, ShieldAlert } from "lucide-react";
import { api, EmailAnsicht, formatDateigroesse } from "../lib/api";

function datumZeit(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * HTML einer E-Mail als eigenes Dokument für ein abgeschottetes iframe:
 * keine Skripte (sandbox ohne allow-scripts), keine externen Inhalte (CSP) –
 * Tracking-Pixel und nachgeladene Bilder des Absenders werden nicht abgerufen.
 * Links öffnen in einem neuen Tab.
 */
function htmlDokument(html: string): string {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:">
<base target="_blank">
<style>body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;font-size:13px;line-height:1.45;color:#111;background:#fff;margin:12px;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}</style>
</head><body>${html}</body></html>`;
}

const EXTERNE_INHALTE = /<(img|link|iframe|video|audio|source)\b[^>]*\b(src|href)\s*=\s*["']?\s*(https?:)?\/\//i;

export default function EmailVorschau({ dokumentId, onDokumentOeffnen, onAbgelegt }: {
  dokumentId: string;
  onDokumentOeffnen: (id: string) => void;
  onAbgelegt: () => void;
}) {
  const [mail, setMail]         = useState<EmailAnsicht | null>(null);
  const [fehler, setFehler]     = useState("");
  const [nurText, setNurText]   = useState(false);
  const [ablegen, setAblegen]   = useState<number | null>(null);

  function laden() {
    api.dokumente.email(dokumentId)
      .then(m => { setMail(m); setFehler(""); })
      .catch(err => setFehler(err instanceof Error ? err.message : "E-Mail konnte nicht gelesen werden"));
  }

  useEffect(() => { setMail(null); setNurText(false); laden(); }, [dokumentId]); // eslint-disable-line react-hooks/exhaustive-deps

  function anhangHerunterladen(nr: number, name: string) {
    fetch(api.dokumente.emailAnhangUrl(dokumentId, nr), {
      headers: { Authorization: `Bearer ${localStorage.getItem("brdms_token")}` },
    })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.blob(); })
      .then(blob => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(err => alert(err instanceof Error ? err.message : "Anhang konnte nicht geladen werden"));
  }

  async function alsDokumentAblegen(nr: number) {
    setAblegen(nr);
    try {
      await api.dokumente.emailAnhangAblegen(dokumentId, nr);
      laden();
      onAbgelegt();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Anhang konnte nicht abgelegt werden");
    } finally {
      setAblegen(null);
    }
  }

  if (fehler) return <div className="p-4 text-sm text-red-700">{fehler}</div>;
  if (!mail) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        <Loader2 className="animate-spin mr-2" size={16} /> Lade E-Mail…
      </div>
    );
  }

  const zeigeHtml = !!mail.html && !nurText;

  return (
    <div className="flex flex-col h-full min-h-0 bg-white">
      {/* Kopf */}
      <dl className="px-4 py-3 border-b border-gray-100 text-xs grid grid-cols-[3.2rem_1fr] gap-x-2 gap-y-0.5">
        <dt className="text-gray-400">Von</dt><dd className="text-gray-800 break-words">{mail.von || "–"}</dd>
        <dt className="text-gray-400">An</dt><dd className="text-gray-700 break-words">{mail.an.join(", ") || "–"}</dd>
        {mail.cc.length > 0 && (<><dt className="text-gray-400">Cc</dt><dd className="text-gray-700 break-words">{mail.cc.join(", ")}</dd></>)}
        <dt className="text-gray-400">Datum</dt><dd className="text-gray-700">{mail.datum ? datumZeit(mail.datum) : "–"}</dd>
        <dt className="text-gray-400">Betreff</dt><dd className="text-gray-900 font-medium break-words">{mail.betreff || "(kein Betreff)"}</dd>
      </dl>

      {/* Anhänge */}
      {mail.anhaenge.length > 0 && (
        <div className="px-4 py-2 border-b border-gray-100 space-y-1">
          <p className="text-xs font-medium text-gray-500 flex items-center gap-1">
            <Paperclip size={12} /> {mail.anhaenge.length === 1 ? "1 Anhang" : `${mail.anhaenge.length} Anhänge`}
          </p>
          {mail.anhaenge.map(a => (
            <div key={a.nr} className="flex items-center gap-1.5 text-xs">
              <span className="truncate flex-1 text-gray-700" title={a.name}>{a.name}</span>
              <span className="text-gray-400 shrink-0">{formatDateigroesse(a.groesse)}</span>
              <button onClick={() => anhangHerunterladen(a.nr, a.name)} title="Herunterladen"
                className="p-1 text-gray-400 hover:text-[rgb(var(--accent))] hover:bg-accent/5 rounded shrink-0">
                <Download size={12} />
              </button>
              {a.dokument ? (
                <button onClick={() => onDokumentOeffnen(a.dokument!.id)} title="Als Dokument abgelegt – öffnen"
                  className="p-1 text-green-600 hover:bg-green-50 rounded shrink-0">
                  <FileCheck2 size={12} />
                </button>
              ) : a.ablegbar ? (
                <button onClick={() => alsDokumentAblegen(a.nr)} disabled={ablegen !== null} title="Als eigenes Dokument ablegen"
                  className="p-1 text-gray-400 hover:text-[rgb(var(--accent))] hover:bg-accent/5 rounded shrink-0 disabled:opacity-50">
                  {ablegen === a.nr ? <Loader2 size={12} className="animate-spin" /> : <FilePlus2 size={12} />}
                </button>
              ) : <span className="w-5 shrink-0" />}
            </div>
          ))}
        </div>
      )}

      {/* Inhalt */}
      {mail.html && (
        <div className="px-4 py-1.5 border-b border-gray-100 flex items-center justify-between gap-2 text-[11px] text-gray-500">
          {zeigeHtml && EXTERNE_INHALTE.test(mail.html)
            ? <span className="flex items-center gap-1"><ShieldAlert size={11} className="text-amber-500" /> Externe Bilder gesperrt</span>
            : <span />}
          <button onClick={() => setNurText(t => !t)} className="text-[rgb(var(--accent))] hover:underline shrink-0">
            {nurText ? "Formatiert anzeigen" : "Nur Text"}
          </button>
        </div>
      )}
      <div className="flex-1 min-h-0">
        {zeigeHtml ? (
          <iframe
            title="Inhalt der E-Mail"
            srcDoc={htmlDokument(mail.html!)}
            sandbox="allow-popups allow-popups-to-escape-sandbox"
            referrerPolicy="no-referrer"
            className="w-full h-full border-0 bg-white"
          />
        ) : (
          <pre className="h-full overflow-auto px-4 py-3 text-xs text-gray-800 whitespace-pre-wrap break-words font-sans">
            {mail.text || "(kein Text)"}
          </pre>
        )}
      </div>
    </div>
  );
}
