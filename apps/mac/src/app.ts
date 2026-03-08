import type { Extension } from "@codemirror/state";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
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

function buildExtensions(baselineText: string): Extension[] {
  const extensions: Extension[] = [];
  const previewFeatureFlags = resolvePreviewFeatureFlags();

  extensions.push(
    diffGutter({
      baselineText,
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

function basename(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const slashIndex = normalized.lastIndexOf("/");
  return slashIndex >= 0 ? normalized.slice(slashIndex + 1) : normalized;
}

export function setupApp() {
  const editorHost = document.getElementById("editor");
  const openButton = document.getElementById("open-file");
  const saveButton = document.getElementById("save-file");
  const fileInfo = document.getElementById("file-info");
  const status = document.getElementById("status");
  const changeInfo = document.getElementById("change-info");

  if (!editorHost) {
    throw new Error("Missing editor host element");
  }

  let currentFilePath: string | null = null;
  let baselineText = initialText;

  const applyStatus = (text: string, hasChanged: boolean, message = "No changes yet.") => {
    if (status) {
      status.textContent = `Length: ${text.length}`;
    }
    if (changeInfo) {
      changeInfo.textContent = hasChanged ? `Last change at ${new Date().toLocaleTimeString()}` : message;
    }
  };

  const applyFileInfo = () => {
    if (!fileInfo) {
      return;
    }
    fileInfo.textContent = currentFilePath ? `File: ${basename(currentFilePath)}` : "File: sample.md";
  };

  const resetBaseline = (nextBaselineText: string) => {
    baselineText = nextBaselineText;
    handle.setExtensions(buildExtensions(baselineText));
  };

  const handle = createEditor({
    parent: editorHost,
    initialText,
    extensions: buildExtensions(baselineText),
    onChange: (text) => {
      applyStatus(text, true);
    },
  });

  const handleOpenFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [{ name: "Markdown", extensions: ["md", "markdown", "txt"] }],
      });
      if (typeof selected !== "string") {
        return;
      }
      await invoke("allow_markdown_path", { path: selected });
      const text = await invoke<string>("read_markdown_file", { path: selected });
      currentFilePath = selected;
      resetBaseline(text);
      handle.setText(text);
      applyFileInfo();
      applyStatus(text, false, `Loaded ${basename(selected)}`);
    } catch (error) {
      console.error(error);
      if (changeInfo) {
        changeInfo.textContent = "Failed to open file.";
      }
    }
  };

  const handleSaveFile = async () => {
    try {
      let targetPath = currentFilePath;
      if (!targetPath) {
        const selected = await save({
          filters: [{ name: "Markdown", extensions: ["md", "markdown", "txt"] }],
          defaultPath: "untitled.md",
        });
        if (typeof selected !== "string") {
          return;
        }
        targetPath = selected;
      }
      const text = handle.getText();
      await invoke("allow_markdown_path", { path: targetPath });
      await invoke("write_markdown_file", { path: targetPath, content: text });
      currentFilePath = targetPath;
      resetBaseline(text);
      applyFileInfo();
      applyStatus(text, false, `Saved ${basename(targetPath)}`);
    } catch (error) {
      console.error(error);
      if (changeInfo) {
        changeInfo.textContent = "Failed to save file.";
      }
    }
  };

  if (openButton) {
    openButton.addEventListener("click", () => {
      void handleOpenFile();
    });
  }

  if (saveButton) {
    saveButton.addEventListener("click", () => {
      void handleSaveFile();
    });
  }

  applyFileInfo();
  applyStatus(handle.getText(), false);

  return handle;
}
