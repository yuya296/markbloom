import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

export function editorTheme(): Extension {
  return EditorView.theme({
    "&": {
      color: "var(--editor-text-color)",
      backgroundColor: "var(--editor-surface)",
      borderRadius: "12px",
    },
    ".cm-content": {
      caretColor: "var(--editor-caret-color)",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "var(--editor-caret-color)",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
      backgroundColor: "var(--editor-selection-bg)",
    },
    ".cm-panels": {
      backgroundColor: "var(--editor-surface)",
      color: "var(--editor-text-color)",
    },
    ".cm-activeLine": {
      backgroundColor: "var(--editor-active-line-bg)",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "var(--editor-active-line-gutter-bg)",
    },
    ".cm-gutters": {
      backgroundColor: "var(--editor-gutter-bg)",
      color: "var(--editor-gutter-color)",
      borderRight: "none",
    },
    ".cm-diff-gutter": {
      width: "10px",
      minWidth: "10px",
    },
    ".cm-diff-gutter .cm-gutterElement": {
      padding: "0",
      display: "flex",
      alignItems: "stretch",
      justifyContent: "center",
    },
    ".cm-line": {
      color: "var(--editor-text-color)",
    },
  });
}
