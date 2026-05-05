/**
 * TOP Mention Extension für TipTap
 * Ermöglicht @TOP3 Referenzen im Editor
 */
import { Mark, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export interface TOPMentionOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    topMention: {
      setTopMention: (topId: string, topNummer: number) => ReturnType;
      unsetTopMention: () => ReturnType;
    };
  }
}

export const TOPMention = Mark.create<TOPMentionOptions>({
  name: "topMention",

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      topId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-top-id"),
        renderHTML: (attributes) => {
          if (!attributes.topId) return {};
          return {
            "data-top-id": attributes.topId,
            class: "top-mention",
          };
        },
      },
      topNummer: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-top-nummer"),
        renderHTML: (attributes) => {
          if (!attributes.topNummer) return {};
          return {
            "data-top-nummer": attributes.topNummer,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-top-id]",
      },
    ];
  },

  renderHTML({ mark, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-top-id": mark.attrs.topId,
        "data-top-nummer": mark.attrs.topNummer,
        class: "top-mention px-1 py-0.5 bg-blue-100 text-blue-700 rounded font-medium",
      }),
      `@TOP${mark.attrs.topNummer}`,
    ];
  },

  addCommands() {
    return {
      setTopMention:
        (topId: string, topNummer: number) =>
        ({ commands }) => {
          return commands.setMark(this.name, { topId, topNummer });
        },
      unsetTopMention:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name);
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("topMention"),
        props: {
          handleKeyDown(view, event) {
            // Öffnet Mention-Popup bei @ Zeichen
            if (event.key === "@") {
              // Dispatch Event für UI
              window.dispatchEvent(new CustomEvent("top-mention-trigger"));
              return false;
            }
            return false;
          },
        },
      }),
    ];
  },
});
