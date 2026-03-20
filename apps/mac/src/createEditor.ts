import { EditorState, Compartment, type Extension, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { invoke } from "@tauri-apps/api/core";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { search, searchKeymap } from "@codemirror/search";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { GFM, Strikethrough } from "@lezer/markdown";
import {
  markdownSmartBol,
  type MarkdownSmartBolShortcut,
} from "@yuya296/cm6-markdown-smart-bol";

export type CreateEditorOptions = {
  parent: HTMLElement;
  initialText?: string;
  extensions?: Extension[];
  onChange?: (text: string) => void;
};

export type EditorHandle = {
  view: EditorView;
  getText: () => string;
  setText: (nextText: string) => void;
  setExtensions: (nextExtensions?: Extension[]) => void;
  destroy: () => void;
};

function slugifyHeading(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function findHeadingLineForId(view: EditorView, targetId: string) {
  const used = new Map<string, number>();
  for (let i = 1; i <= view.state.doc.lines; i += 1) {
    const line = view.state.doc.line(i);
    const match = line.text.match(/^\s{0,3}#{1,6}\s+(.+)$/);
    if (!match) {
      continue;
    }
    const headingText = match[1].replace(/\s+#*\s*$/, "");
    const base = slugifyHeading(headingText);
    if (!base) {
      continue;
    }
    const count = used.get(base) ?? 0;
    used.set(base, count + 1);
    const id = count === 0 ? base : `${base}-${count}`;
    if (id === targetId) {
      return line;
    }
  }
  return null;
}

function getDefaultSmartBolShortcuts(): readonly MarkdownSmartBolShortcut[] {
  const platform =
    (
      navigator as Navigator & {
        userAgentData?: { platform?: string };
      }
    ).userAgentData?.platform ??
    navigator.platform ??
    "";
  const userAgent = navigator.userAgent ?? "";
  const isMac = /Mac|iPhone|iPad|iPod/u.test(`${platform} ${userAgent}`);
  if (isMac) {
    return [{ mac: "Ctrl-a" }, { mac: "Cmd-ArrowLeft" }];
  }
  return [{ key: "Home" }];
}

export function createEditor({
  parent,
  initialText = "",
  extensions = [],
  onChange,
}: CreateEditorOptions): EditorHandle {
  if (!parent) {
    throw new Error("createEditor: parent is required");
  }

  const dynamicExtensions = new Compartment();
  const baseExtensions = [
    EditorView.domEventHandlers({
      click: (event) => {
        if (!(event.target instanceof HTMLElement)) {
          return false;
        }
        const link = event.target.closest(".mb-link[data-href]");
        if (!(link instanceof HTMLElement)) {
          return false;
        }
        const href = link.dataset.href;
        if (!href) {
          return false;
        }
        const view = EditorView.findFromDOM(event.target);
        if (!view) {
          return false;
        }
        if (href.startsWith("#")) {
          event.preventDefault();
          event.stopPropagation();
          const targetId = decodeURIComponent(href.slice(1));
          const targetLine = findHeadingLineForId(view, targetId);
          if (targetLine) {
            view.dispatch({
              selection: { anchor: targetLine.from },
              scrollIntoView: true,
            });
            return true;
          }
          return false;
        }

        event.preventDefault();
        event.stopPropagation();
        if (!/^https?:\/\//iu.test(href)) {
          return true;
        }
        void invoke("open_external_url", { url: href }).catch((error) => {
          console.error("Failed to open external url", error);
        });
        return true;
      },
    }),
    history({
      newGroupDelay: 1500,
      joinToEvent: (tr, isAdjacent) => {
        return isAdjacent || tr.docChanged;
      },
    }),
    Prec.high(markdownSmartBol({ shortcuts: getDefaultSmartBolShortcuts() })),
    search({ top: true }),
    keymap.of([...historyKeymap, ...searchKeymap, ...defaultKeymap]),
    markdown({
      extensions: [Strikethrough, GFM],
      codeLanguages: languages,
    }),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChange?.(update.state.doc.toString());
      }
    }),
    dynamicExtensions.of(extensions),
  ];

  const state = EditorState.create({
    doc: initialText,
    extensions: baseExtensions,
  });

  const view = new EditorView({
    state,
    parent,
  });

  return {
    view,
    getText: () => view.state.doc.toString(),
    setText(nextText: string) {
      const currentText = view.state.doc.toString();
      if (currentText === nextText) {
        return;
      }
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: nextText,
        },
      });
    },
    setExtensions(nextExtensions: Extension[] = []) {
      view.dispatch({
        effects: dynamicExtensions.reconfigure(nextExtensions),
      });
    },
    destroy() {
      view.destroy();
    },
  };
}
