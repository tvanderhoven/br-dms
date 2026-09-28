// Hilfsfunktionen für TipTap-JSON-Inhalte (Rich-Text), gemeinsam genutzt von
// Sitzungen.tsx (TOP-Inhalt/Ergebnis) und KommentarBlock.tsx (Kommentare).

// Extrahiert Plaintext aus TipTap-JSON (für Fallback-Anzeige, Suche und PDF)
export function tiptapZuText(json: object | null | undefined): string {
  if (!json) return "";
  const node = json as { text?: string; content?: object[] };
  if (node.text) return node.text;
  if (!node.content) return "";
  return node.content.map(tiptapZuText).join(" ").replace(/\s+/g, " ").trim();
}

// Wandelt reinen Text in ein minimales TipTap-Dokument um – für Alt-Datensätze,
// die noch kein beschreibungJson haben, aber einen Plaintext-Wert (z.B. Aufgabe.beschreibung).
// So startet der Editor beim Bearbeiten nicht leer, sondern mit dem alten Text.
export function textZuTiptap(text: string | null | undefined): object | null {
  if (!text || !text.trim()) return null;
  return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: text.trim() }] }] };
}

// Rendert TipTap-JSON als einfaches HTML (nur für die Anzeige, kein WYSIWYG)
export function tiptapZuHtml(json: object | null | undefined): string {
  if (!json) return "";
  type N = { type?: string; text?: string; marks?: { type: string }[]; content?: N[]; attrs?: Record<string, unknown> };
  function r(node: N): string {
    if (node.type === "text") {
      let t = (node.text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      if (node.marks?.some(m => m.type === "bold"))      t = `<strong>${t}</strong>`;
      if (node.marks?.some(m => m.type === "italic"))    t = `<em>${t}</em>`;
      if (node.marks?.some(m => m.type === "underline")) t = `<u>${t}</u>`;
      return t;
    }
    if (node.type === "hardBreak") return "<br>";
    const ch = (node.content ?? []).map(r).join("");
    switch (node.type) {
      case "paragraph":   return `<p>${ch}</p>`;
      case "heading": {
        // attrs.level kommt aus dem gespeicherten JSON und ist nicht vertrauenswürdig
        // (die API validiert die JSON-Struktur nicht) - ungeprüft eingesetzt wäre das
        // eine HTML/Attribut-Injection in den <h*>-Tag. Nur echte Heading-Level erlauben.
        const level = node.attrs?.level;
        const sicheresLevel = typeof level === "number" && Number.isInteger(level) && level >= 1 && level <= 6 ? level : 1;
        return `<h${sicheresLevel}>${ch}</h${sicheresLevel}>`;
      }
      case "bulletList":  return `<ul>${ch}</ul>`;
      case "orderedList": return `<ol>${ch}</ol>`;
      case "listItem":    return `<li>${ch}</li>`;
      case "blockquote":  return `<blockquote>${ch}</blockquote>`;
      default:            return ch;
    }
  }
  return r(json as N);
}
