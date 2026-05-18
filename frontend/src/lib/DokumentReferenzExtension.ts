/**
 * TipTap Custom-Extension: DokumentReferenz
 *
 * Inline-Node der ein verknüpftes BR-DMS-Dokument als Chip darstellt.
 * Gespeichert als: { type: "dokumentReferenz", attrs: { dokumentId, titel, kategorie } }
 *
 * Der Klick-Handler wird via Event-Delegation in SitzungsEditor registriert
 * (capture-Phase, damit ProseMirror den Click nicht abfängt).
 */

import { Node, mergeAttributes } from "@tiptap/core";

export interface DokumentReferenzAttrs {
  dokumentId: string;
  titel:      string;
  kategorie:  string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    dokumentReferenz: {
      insertDokumentReferenz: (attrs: DokumentReferenzAttrs) => ReturnType;
    };
  }
}

export const DokumentReferenzExtension = Node.create({
  name:   "dokumentReferenz",
  group:  "inline",
  inline: true,
  atom:   true,

  addAttributes() {
    return {
      dokumentId: { default: null },
      titel:      { default: "" },
      kategorie:  { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-dokument-id]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-dokument-id": HTMLAttributes.dokumentId,
        class: "inline-flex items-center gap-1 bg-blue-100 text-blue-800 text-xs font-medium px-2 py-0.5 rounded-full border border-blue-200 cursor-pointer hover:bg-blue-200 hover:border-blue-300 mx-0.5 transition-colors select-none",
        contenteditable: "false",
        title: `Dokument öffnen: ${HTMLAttributes.titel}`,
      }),
      `📎 ${HTMLAttributes.titel}`,
    ];
  },

  addCommands() {
    return {
      insertDokumentReferenz: (attrs: DokumentReferenzAttrs) =>
        ({ commands }) => {
          return commands.insertContent({
            type:  this.name,
            attrs,
          });
        },
    };
  },
});
