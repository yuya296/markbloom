import type { Extension } from "@codemirror/state";
import { diffGutter } from "@yuya296/cm6-diff-gutter";
import { livePreviewPreset, resolveImageBasePath } from "@yuya296/cm6-live-preview";
import initialText from "../assets/sample.md?raw";
import { createEditor } from "./createEditor";
import { editorTheme } from "./editorTheme";
import { editorHighlightStyle } from "./editorHighlightStyle";
import { resolveMermaidPreviewEnabled, resolvePreviewFeatureFlags } from "./featureFlags";

function isTableLine(lineText: string): boolean {
  const line = lineText.trim();
  if (line.length === 0 || !line.includes("|")) {
    return false;
  }
  if (/^\|?[-:\s]+(\|[-:\s]+)+\|?$/u.test(line)) {
    return true;
  }
  return /^\|.*\|$/u.test(line);
}

function buildExtensions(): Extension[] {
  const extensions: Extension[] = [];
  const previewFeatureFlags = resolvePreviewFeatureFlags();

  extensions.push(
    diffGutter({
      baselineText: initialText,
      ignoreLine: isTableLine,
    }),
  );

  extensions.push(editorHighlightStyle());
  extensions.push(editorTheme());

  extensions.push(
    livePreviewPreset({
      livePreview: {
        blockRevealEnabled: true,
        imageBasePath: resolveImageBasePath(import.meta.env.BASE_URL),
        imageRawShowsPreview: true,
      },
      mermaid: resolveMermaidPreviewEnabled({
        livePreviewEnabled: true,
        featureFlags: previewFeatureFlags,
      }),
      table: true,
    }),
  );

  return extensions;
}

export function setupApp() {
  const editorHost = document.getElementById("editor");
  const status = document.getElementById("status");
  const changeInfo = document.getElementById("change-info");

  if (!editorHost) {
    throw new Error("Missing editor host element");
  }

  const applyStatus = (text: string, hasChanged: boolean) => {
    if (status) {
      status.textContent = `Length: ${text.length}`;
    }
    if (changeInfo) {
      changeInfo.textContent = hasChanged
        ? `Last change at ${new Date().toLocaleTimeString()}`
        : "No changes yet.";
    }
  };

  const handle = createEditor({
    parent: editorHost,
    initialText,
    extensions: buildExtensions(),
    onChange: (text) => {
      applyStatus(text, true);
    },
  });

  applyStatus(handle.getText(), false);

  return handle;
}
