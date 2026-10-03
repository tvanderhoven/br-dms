/**
 * SitzungsEditor – Rich-Text-Editor für Tagesordnungspunkte
 *
 * Funktionen:
 * - Formatierung: Fett, Kursiv, Unterstrichen, Überschriften H2/H3
 * - Listen: Aufzählung, Nummeriert
 * - Highlight (für Beschlüsse)
 * - Dokument-Referenz einfügen (custom Extension)
 * - Readonly-Modus für fixierte Versionen
 */

import { useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import {
  Bold, Italic, UnderlineIcon, Heading2, Heading3,
  List, ListOrdered, Highlighter, Link2, ExternalLink, X, Search, Loader2, AtSign,
} from "lucide-react";
import { DokumentReferenzExtension, DokumentReferenzAttrs } from "../lib/DokumentReferenzExtension";
import { TOPMention } from "../lib/TOPMentionExtension";
import { api, Dokument, KATEGORIE_LABEL, TOP } from "../lib/api";

interface Props {
  content:    object | null;
  onChange?:  (json: object) => void;
  readonly?:  boolean;
  placeholder?: string;
  minHeight?: string;
}

export default function SitzungsEditor({
  content, onChange, readonly = false, placeholder = "Inhalt eingeben…", minHeight = "120px",
}: Props) {
  const [dokPickerOffen, setDokPickerOffen] = useState(false);
  const [linkDialogOffen, setLinkDialogOffen] = useState(false);
  const [linkEingabe, setLinkEingabe]         = useState("");

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading:    { levels: [2, 3] },
        codeBlock:  false,
        code:       false,
      }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Highlight.configure({ multicolor: false }),
      Placeholder.configure({ placeholder }),
      Link.configure({
        openOnClick: true,
        autolink: true,
        linkOnPaste: true,
        protocols: ['lbo', 'lboffice', 'lbofficem', 'ftp', 'mailto', 'file', 'brdmsfile'],
        HTMLAttributes: {
          target: "_blank",
          rel: "noopener noreferrer",
          class: "text-accent underline hover:text-accent-hover cursor-pointer",
        },
      }),
      DokumentReferenzExtension,
    ],
    content:  content ?? "",
    editable: !readonly,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getJSON());
    },
  });

  // Inhalt von außen synchronisieren (z.B. nach Laden aus DB)
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const aktuell = JSON.stringify(editor.getJSON());
    const neu     = JSON.stringify(content ?? "");
    if (aktuell !== neu) {
      editor.commands.setContent(content ?? "", false);
    }
  }, [content]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.setEditable(!readonly);
  }, [readonly]);

  // Dokument-Chip Klick-Handler – capture-Phase damit ProseMirror den Click nicht abfängt
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const dom = editor.view.dom;

    function handleClick(e: MouseEvent) {
      const chip = (e.target as HTMLElement).closest("[data-dokument-id]") as HTMLElement | null;
      if (!chip) return;
      const dokumentId = chip.getAttribute("data-dokument-id");
      if (!dokumentId) return;

      e.preventDefault();
      e.stopPropagation();

      // Fenster synchron öffnen (noch im User-Gesture-Kontext) – sonst Popup-Blocker
      const tab = window.open("", "_blank");

      const token = localStorage.getItem("brdms_token");
      const authHeader: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

      fetch(api.dokumente.vorschauUrl(dokumentId), { headers: authHeader })
        .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.blob(); })
        .then(blob => {
          const url = URL.createObjectURL(blob);
          if (tab) tab.location.href = url; else window.location.href = url;
          setTimeout(() => URL.revokeObjectURL(url), 60_000);
        })
        .catch(() => {
          // Vorschau nicht möglich (z.B. kein PDF) – Download stattdessen authentifiziert laden.
          // Wichtig: auch hier den Auth-Header mitschicken, sonst 401 statt Datei.
          fetch(api.dokumente.downloadUrl(dokumentId), { headers: authHeader })
            .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.blob(); })
            .then(blob => {
              const url = URL.createObjectURL(blob);
              if (tab) tab.location.href = url; else window.location.href = url;
              setTimeout(() => URL.revokeObjectURL(url), 60_000);
            })
            .catch(() => {
              if (tab) tab.close();
              alert("Dokument konnte nicht geöffnet werden");
            });
        });
    }

    dom.addEventListener("click", handleClick, { capture: true });
    return () => dom.removeEventListener("click", handleClick, { capture: true });
  }, [editor]);

  function dokEinfuegen(attrs: DokumentReferenzAttrs) {
    editor?.chain().focus().insertDokumentReferenz(attrs).run();
    setDokPickerOffen(false);
  }

  function linkOeffnen() {
    if (editor?.isActive("link")) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    setLinkEingabe(editor?.getAttributes("link").href ?? "");
    setLinkDialogOffen(true);
  }

  function linkSetzen() {
    if (!linkEingabe.trim()) {
      editor?.chain().focus().unsetLink().run();
    } else {
      let url = linkEingabe.trim();
      // UNC-Pfad aus der Explorer-Adressleiste kopiert (\\server\freigabe\...) – in das
      // brdmsfile://-Protokoll umwandeln. file:// wird von Browsern für Netzwerkfreigaben
      // blockiert (SMB/NTLM-Schutz, siehe tools/brdmsfile-protokoll/), brdmsfile:// läuft
      // stattdessen über den lokal installierten Handler (wie die bekannten lbo://-Links).
      if (/^\\\\/.test(url)) url = "brdmsfile:" + url.replace(/\\/g, "/");
      // Nur https voranstellen wenn überhaupt kein Protokoll angegeben (z.B. nicht lbo://, ftp://, mailto:)
      else if (!/^[a-zA-Z][a-zA-Z0-9+\-.]*:\/?\/?/i.test(url)) url = "https://" + url;
      // file:// / brdmsfile://-Pfade werden oft mit rohen Leerzeichen/Umlauten eingefügt –
      // ohne Kodierung bricht die URL am ersten Leerzeichen ab.
      if (/^(file|brdmsfile):\/\//i.test(url)) {
        const idx = url.indexOf("://") + 3;
        url = url.slice(0, idx) + encodeURI(url.slice(idx));
      }
      editor?.chain().focus().setLink({ href: url }).run();
    }
    setLinkEingabe("");
    setLinkDialogOffen(false);
  }

  if (!editor) return null;

  return (
    <div className={`border rounded-lg overflow-hidden ${readonly ? "border-gray-100 bg-gray-50" : "border-gray-300 bg-white"}`}>
      {/* Toolbar */}
      {!readonly && (
        <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-gray-200 bg-gray-50">
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            aktiv={editor.isActive("bold")}
            title="Fett (Strg+B)"
          ><Bold size={14} /></ToolbarButton>

          <ToolbarButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            aktiv={editor.isActive("italic")}
            title="Kursiv (Strg+I)"
          ><Italic size={14} /></ToolbarButton>

          <ToolbarButton
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            aktiv={editor.isActive("underline")}
            title="Unterstrichen (Strg+U)"
          ><UnderlineIcon size={14} /></ToolbarButton>

          <div className="w-px h-4 bg-gray-300 mx-1" />

          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            aktiv={editor.isActive("heading", { level: 2 })}
            title="Überschrift 2"
          ><Heading2 size={14} /></ToolbarButton>

          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            aktiv={editor.isActive("heading", { level: 3 })}
            title="Überschrift 3"
          ><Heading3 size={14} /></ToolbarButton>

          <div className="w-px h-4 bg-gray-300 mx-1" />

          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            aktiv={editor.isActive("bulletList")}
            title="Aufzählung"
          ><List size={14} /></ToolbarButton>

          <ToolbarButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            aktiv={editor.isActive("orderedList")}
            title="Nummerierte Liste"
          ><ListOrdered size={14} /></ToolbarButton>

          <div className="w-px h-4 bg-gray-300 mx-1" />

          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHighlight().run()}
            aktiv={editor.isActive("highlight")}
            title="Markieren (für Beschlüsse)"
          ><Highlighter size={14} /></ToolbarButton>

          <div className="w-px h-4 bg-gray-300 mx-1" />

          <ToolbarButton
            onClick={linkOeffnen}
            aktiv={editor.isActive("link")}
            title="Weblink einfügen / entfernen"
          >
            <ExternalLink size={14} />
            <span className="text-xs ml-1 hidden sm:inline">Link</span>
          </ToolbarButton>

          <ToolbarButton
            onClick={() => setDokPickerOffen(true)}
            aktiv={false}
            title="Dokument verknüpfen"
          >
            <Link2 size={14} />
            <span className="text-xs ml-1 hidden sm:inline">Dokument</span>
          </ToolbarButton>
        </div>
      )}

      {/* Link-Eingabe-Leiste */}
      {!readonly && linkDialogOffen && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-accent/25 bg-accent/5">
          <ExternalLink size={13} className="text-accent/80 flex-shrink-0" />
          <input
            autoFocus
            type="url"
            value={linkEingabe}
            onChange={e => setLinkEingabe(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") { e.preventDefault(); linkSetzen(); }
              if (e.key === "Escape") { setLinkDialogOffen(false); }
            }}
            placeholder="https://..."
            className="flex-1 text-xs bg-transparent outline-none text-gray-700 placeholder-gray-400"
          />
          <button type="button" onClick={linkSetzen}
            className="text-xs font-medium text-accent hover:text-accent-hover px-2 py-0.5 rounded hover:bg-accent/10">
            OK
          </button>
          <button type="button" onClick={() => setLinkDialogOffen(false)} className="text-gray-400 hover:text-gray-600">
            <X size={13} />
          </button>
        </div>
      )}

      {/* Editor-Inhalt */}
      <EditorContent
        editor={editor}
        style={{ minHeight }}
        className="prose prose-sm max-w-none px-4 py-3 focus-within:outline-none
          [&_.ProseMirror]:outline-none
          [&_.ProseMirror_h2]:text-base [&_.ProseMirror_h2]:font-bold [&_.ProseMirror_h2]:mt-3 [&_.ProseMirror_h2]:mb-1
          [&_.ProseMirror_h3]:text-sm [&_.ProseMirror_h3]:font-semibold [&_.ProseMirror_h3]:mt-2 [&_.ProseMirror_h3]:mb-1
          [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-5 [&_.ProseMirror_ul]:my-1
          [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-5 [&_.ProseMirror_ol]:my-1
          [&_.ProseMirror_mark]:bg-yellow-200 [&_.ProseMirror_mark]:rounded-sm [&_.ProseMirror_mark]:px-0.5
          [&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]
          [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-gray-400
          [&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left
          [&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none"
      />

      {/* Dokument-Picker Modal */}
      {dokPickerOffen && (
        <DokumentPickerModal
          onEinfuegen={dokEinfuegen}
          onSchliessen={() => setDokPickerOffen(false)}
        />
      )}
    </div>
  );
}

// ── Toolbar-Button ────────────────────────────────────────────────
function ToolbarButton({
  onClick, aktiv, title, children,
}: { onClick: () => void; aktiv: boolean; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`flex items-center px-2 py-1 rounded text-sm transition-colors ${
        aktiv
          ? "bg-accent/10 text-accent"
          : "text-gray-600 hover:bg-gray-200"
      }`}
    >
      {children}
    </button>
  );
}

// ── Dokument-Picker ───────────────────────────────────────────────
function DokumentPickerModal({
  onEinfuegen, onSchliessen,
}: {
  onEinfuegen: (attrs: DokumentReferenzAttrs) => void;
  onSchliessen: () => void;
}) {
  const [dokumente, setDokumente] = useState<Dokument[]>([]);
  const [suche, setSuche]         = useState("");
  const [laden, setLaden]         = useState(true);

  useEffect(() => {
    api.dokumente.liste()
      .then(d => setDokumente(d.filter(x => x.status === "AKTIV")))
      .finally(() => setLaden(false));
  }, []);

  const gefiltert = dokumente.filter(d =>
    suche === "" ||
    (d.alias ?? d.titel).toLowerCase().includes(suche.toLowerCase()) ||
    d.aktenzeichen?.toLowerCase().includes(suche.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Dokument einfügen</h3>
          <button onClick={onSchliessen} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              autoFocus
              value={suche}
              onChange={e => setSuche(e.target.value)}
              placeholder="Titel oder Aktenzeichen…"
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent))]"
            />
          </div>

          <div className="border border-gray-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
            {laden ? (
              <div className="flex items-center justify-center h-20 text-gray-400">
                <Loader2 size={16} className="animate-spin mr-2" /> Laden…
              </div>
            ) : gefiltert.length === 0 ? (
              <div className="flex items-center justify-center h-20 text-gray-400 text-sm">
                Keine aktiven Dokumente gefunden
              </div>
            ) : (
              gefiltert.map(d => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => onEinfuegen({ dokumentId: d.id, titel: d.alias ?? d.titel, kategorie: d.kategorie })}
                  className="w-full flex items-start gap-3 px-4 py-2.5 text-left hover:bg-accent/5 border-b border-gray-50 last:border-0 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{d.alias ?? d.titel}</p>
                    <p className="text-xs text-gray-400">
                      {KATEGORIE_LABEL[d.kategorie]}
                      {d.aktenzeichen && ` · Az.: ${d.aktenzeichen}`}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
