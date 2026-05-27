import { useState, useCallback } from "react";
import { Newspaper, Search, Download, Printer, Loader2, CalendarDays, Info } from "lucide-react";
import { api, ThemenEintrag, formatDatum } from "../lib/api";

// ── TipTap JSON → HTML String ────────────────────────────────────
function tiptapZuHtml(json: unknown): string {
  if (!json || typeof json !== "object") return "";
  const node = json as { type?: string; text?: string; marks?: { type: string }[]; attrs?: Record<string, unknown>; content?: unknown[] };

  const kinder = (node.content ?? []).map(tiptapZuHtml).join("");

  switch (node.type) {
    case "doc":        return kinder;
    case "paragraph":  return `<p>${kinder || ""}</p>`;
    case "bulletList": return `<ul>${kinder}</ul>`;
    case "orderedList":return `<ol>${kinder}</ol>`;
    case "listItem":   return `<li>${kinder}</li>`;
    case "blockquote": return `<blockquote>${kinder}</blockquote>`;
    case "hardBreak":  return "<br>";
    case "heading": {
      const l = (node.attrs?.level as number) ?? 2;
      return `<h${l}>${kinder}</h${l}>`;
    }
    case "text": {
      let t = (node.text ?? "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      if (node.marks?.some(m => m.type === "bold"))      t = `<strong>${t}</strong>`;
      if (node.marks?.some(m => m.type === "italic"))    t = `<em>${t}</em>`;
      if (node.marks?.some(m => m.type === "underline")) t = `<u>${t}</u>`;
      return t;
    }
    default: return kinder;
  }
}

// ── HTML-Export generieren ────────────────────────────────────────
function htmlDokumentGenerieren(
  eintraege:  ThemenEintrag[],
  von:        string,
  bis:        string,
  brName:     string,
): string {
  // Einträge nach Sitzung gruppieren
  const sitzungen = new Map<string, { titel: string; datum: string; eintraege: ThemenEintrag[] }>();
  for (const e of eintraege) {
    if (!sitzungen.has(e.sitzung.id)) {
      sitzungen.set(e.sitzung.id, { titel: e.sitzung.titel, datum: e.sitzung.sitzungsdatum, eintraege: [] });
    }
    sitzungen.get(e.sitzung.id)!.eintraege.push(e);
  }

  const sitzungsBlöcke = [...sitzungen.values()].map(s => {
    const themen = s.eintraege.map(e => {
      const text = e.ergebnisJson
        ? tiptapZuHtml(e.ergebnisJson)
        : e.ergebnis
          ? `<p>${e.ergebnis.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`
          : "<p><em>Kein Text eingetragen.</em></p>";
      return `<div class="thema">${text}</div>`;
    }).join("\n");

    const datum = new Date(s.datum).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" });
    return `
    <section>
      <h2>${s.titel}</h2>
      <p class="datum">${datum}</p>
      ${themen}
    </section>`;
  }).join("\n");

  const vonFmt = new Date(von).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" });
  const bisFmt = new Date(bis).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" });

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${brName} – Themenübersicht</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 14px;
      color: #1f2937;
      max-width: 780px;
      margin: 0 auto;
      padding: 32px 24px;
      line-height: 1.6;
    }
    header {
      border-bottom: 3px solid #1e40af;
      padding-bottom: 12px;
      margin-bottom: 8px;
    }
    header h1 {
      font-size: 22px;
      color: #1e3a8a;
      font-weight: bold;
    }
    header p {
      font-size: 12px;
      color: #6b7280;
      margin-top: 4px;
    }
    .zeitraum {
      font-size: 12px;
      color: #6b7280;
      margin-bottom: 28px;
    }
    section {
      margin-bottom: 28px;
      padding-bottom: 20px;
      border-bottom: 1px solid #e5e7eb;
    }
    section:last-child { border-bottom: none; }
    h2 {
      font-size: 15px;
      font-weight: bold;
      color: #111827;
      margin-bottom: 2px;
    }
    .datum {
      font-size: 11px;
      color: #9ca3af;
      margin-bottom: 10px;
    }
    .thema {
      padding-left: 12px;
      border-left: 3px solid #dbeafe;
    }
    .thema p { margin: 4px 0; }
    .thema ul, .thema ol {
      margin: 4px 0;
      padding-left: 18px;
    }
    .thema li { margin: 2px 0; }
    .thema blockquote {
      border-left: 2px solid #9ca3af;
      padding-left: 8px;
      color: #6b7280;
      font-style: italic;
      margin: 6px 0;
    }
    strong { font-weight: bold; }
    em { font-style: italic; }
    footer {
      margin-top: 32px;
      font-size: 11px;
      color: #9ca3af;
      border-top: 1px solid #e5e7eb;
      padding-top: 8px;
    }
    @media print {
      body { padding: 16px; }
      section { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <header>
    <h1>${brName}</h1>
    <p>Informationen aus der Betriebsratsarbeit</p>
  </header>
  <p class="zeitraum">Zeitraum: ${vonFmt} – ${bisFmt}  ·  ${eintraege.length} Thema${eintraege.length !== 1 ? "en" : ""} aus ${sitzungen.size} Sitzung${sitzungen.size !== 1 ? "en" : ""}</p>

  ${sitzungsBlöcke}

  <footer>Erstellt aus BR-DMS · ${new Date().toLocaleDateString("de-DE")} · Zur internen Veröffentlichung</footer>
</body>
</html>`;
}

// ── Hauptkomponente ───────────────────────────────────────────────
export default function Themensammlung() {
  const heute  = new Date();
  const jahresStart = `${heute.getFullYear()}-01-01`;
  const heuteStr    = heute.toISOString().slice(0, 10);

  const [von,        setVon]        = useState(jahresStart);
  const [bis,        setBis]        = useState(heuteStr);
  const [stichwort,  setStichwort]  = useState("öffentlich");
  const [eintraege,  setEintraege]  = useState<ThemenEintrag[] | null>(null);
  const [laden,      setLaden]      = useState(false);

  const suchen = useCallback(async () => {
    setLaden(true);
    try {
      const data = await api.themen.liste({ von, bis, stichwort: stichwort || "öffentlich" });
      setEintraege(data);
    } catch {
      setEintraege([]);
    } finally {
      setLaden(false);
    }
  }, [von, bis, stichwort]);

  function htmlHerunterladen() {
    if (!eintraege?.length) return;
    const html = htmlDokumentGenerieren(eintraege, von, bis, "Betriebsrat");
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `br-themen-${von}-${bis}.html`;
    a.click();
  }

  function drucken() {
    if (!eintraege?.length) return;
    const html = htmlDokumentGenerieren(eintraege, von, bis, "Betriebsrat");
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  }

  // Einträge nach Sitzung gruppieren (für Vorschau)
  const gruppiertNachSitzung = eintraege
    ? [...new Map(eintraege.map(e => [e.sitzung.id, e.sitzung])).values()]
        .map(s => ({
          ...s,
          tops: eintraege.filter(e => e.sitzung.id === s.id),
        }))
    : [];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <Newspaper className="w-5 h-5 text-[rgb(var(--accent))]" />
        <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100">Themensammlung</h1>
        <span className="text-xs text-gray-400 ml-1">Öffentlichkeitsarbeit</span>
      </div>

      {/* Hinweis */}
      <div className="flex gap-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl px-4 py-3 mb-5 text-xs text-blue-700 dark:text-blue-300">
        <Info size={14} className="shrink-0 mt-0.5" />
        <span>
          Sammelt alle TOPs aus Protokollen deren Titel das Stichwort enthält.
          Fülle dazu in der Sitzung den Ergebnis-Editor des jeweiligen TOPs mit dem öffentlichen Text.
        </span>
      </div>

      {/* Filter */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 mb-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Von</label>
            <input
              type="date"
              value={von}
              onChange={e => setVon(e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent)/0.3)]"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Bis</label>
            <input
              type="date"
              value={bis}
              onChange={e => setBis(e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent)/0.3)]"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Stichwort im TOP-Titel</label>
            <input
              type="text"
              value={stichwort}
              onChange={e => setStichwort(e.target.value)}
              placeholder="z.B. öffentlich"
              className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent)/0.3)]"
            />
          </div>
        </div>
        <button
          onClick={suchen}
          disabled={laden}
          className="flex items-center gap-2 px-4 py-2 bg-[rgb(var(--accent))] hover:brightness-90 disabled:opacity-60 text-white text-sm rounded-lg"
        >
          {laden ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          Themen laden
        </button>
      </div>

      {/* Ergebnisse */}
      {eintraege !== null && (
        <>
          {/* Aktionsleiste */}
          {eintraege.length > 0 && (
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-500">
                {eintraege.length} Thema{eintraege.length !== 1 ? "en" : ""} aus {gruppiertNachSitzung.length} Sitzung{gruppiertNachSitzung.length !== 1 ? "en" : ""}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={drucken}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 dark:border-gray-600 text-xs text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <Printer size={13} /> Drucken
                </button>
                <button
                  onClick={htmlHerunterladen}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[rgb(var(--accent))] hover:brightness-90 text-white text-xs rounded-lg"
                >
                  <Download size={13} /> HTML herunterladen
                </button>
              </div>
            </div>
          )}

          {eintraege.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Newspaper size={40} className="mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium">Keine Themen gefunden</p>
              <p className="text-xs mt-1">
                Prüfe den Zeitraum oder das Stichwort.<br />
                TOPs müssen ein ausgefülltes Ergebnis-Feld haben.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {gruppiertNachSitzung.map(sitzung => (
                <div key={sitzung.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                  {/* Sitzungs-Header */}
                  <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
                    <CalendarDays size={14} className="text-gray-400" />
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{sitzung.titel}</span>
                    <span className="text-xs text-gray-400 ml-auto">{formatDatum(sitzung.sitzungsdatum)}</span>
                  </div>

                  {/* TOPs */}
                  <div className="divide-y divide-gray-100 dark:divide-gray-700">
                    {sitzung.tops.map(top => (
                      <div key={top.id} className="px-4 py-3">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                          {top.nummer}. {top.titel}
                        </p>
                        {top.ergebnisJson || top.ergebnis ? (
                          <div className="text-sm text-gray-700 dark:text-gray-300 border-l-2 border-blue-100 dark:border-blue-800 pl-3 prose-like">
                            {top.ergebnisJson
                              ? <div dangerouslySetInnerHTML={{ __html: tiptapZuHtml(top.ergebnisJson) }} />
                              : <p>{top.ergebnis}</p>
                            }
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400 italic">Kein öffentlicher Text eingetragen.</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {eintraege === null && !laden && (
        <div className="text-center py-16 text-gray-300 dark:text-gray-600">
          <Newspaper size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Filter setzen und „Themen laden" klicken</p>
        </div>
      )}
    </div>
  );
}
