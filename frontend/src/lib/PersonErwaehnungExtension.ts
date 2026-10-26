/**
 * TipTap Custom-Extension: PersonErwaehnung (@Name)
 *
 * Inline-Node für eine erwähnte Person in Kommentaren – das Backend liest daraus,
 * wer benachrichtigt wird (backend/src/lib/kommentarBenachrichtigung.ts).
 * Gespeichert als: { type: "personErwaehnung", attrs: { benutzerId, name } }
 */

import { Node, mergeAttributes } from "@tiptap/core";

export interface PersonErwaehnungAttrs {
  benutzerId: string;
  name:       string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    personErwaehnung: {
      insertPersonErwaehnung: (attrs: PersonErwaehnungAttrs) => ReturnType;
    };
  }
}

export const PersonErwaehnungExtension = Node.create({
  name:   "personErwaehnung",
  group:  "inline",
  inline: true,
  atom:   true,

  addAttributes() {
    return {
      benutzerId: {
        default:    null,
        parseHTML:  el => el.getAttribute("data-benutzer-id"),
        renderHTML: a => ({ "data-benutzer-id": a.benutzerId }),
      },
      name: {
        default:    "",
        parseHTML:  el => el.getAttribute("data-name") ?? "",
        renderHTML: a => ({ "data-name": a.name }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-benutzer-id]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        class: "bg-accent/10 text-accent font-medium px-1 rounded-sm mx-0.5 select-none",
        contenteditable: "false",
      }),
      `@${node.attrs.name}`,
    ];
  },

  addCommands() {
    return {
      insertPersonErwaehnung: (attrs: PersonErwaehnungAttrs) =>
        ({ commands }) => {
          return commands.insertContent([{ type: this.name, attrs }, { type: "text", text: " " }]);
        },
    };
  },
});
