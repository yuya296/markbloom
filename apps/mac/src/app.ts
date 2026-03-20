import type { Extension } from "@codemirror/state";
import { undo, redo } from "@codemirror/commands";
import { openSearchPanel } from "@codemirror/search";
import { EditorView } from "@codemirror/view";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { Menu, Submenu } from "@tauri-apps/api/menu";
import { open, save } from "@tauri-apps/plugin-dialog";
import { diffGutter } from "@yuya296/cm6-diff-gutter";
import { livePreviewPreset, resolveImageBasePath } from "@yuya296/cm6-live-preview";
import initialText from "../assets/sample.md?raw";
import { createEditor } from "./createEditor";
import { editorTheme } from "./editorTheme";
import { editorHighlightStyle } from "./editorHighlightStyle";
import { resolveMermaidPreviewEnabled, resolvePreviewFeatureFlags } from "./featureFlags";

type AppMenuAction =
  | "open-file"
  | "save-file"
  | "new-file"
  | "find-replace"
  | "settings"
  | "undo"
  | "redo";

type BuildExtensionOptions = {
  baselineText: string;
  wrapLines: boolean;
};

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

function buildExtensions({ baselineText, wrapLines }: BuildExtensionOptions): Extension[] {
  const extensions: Extension[] = [];
  const previewFeatureFlags = resolvePreviewFeatureFlags();

  extensions.push(
    diffGutter({
      baselineText,
      ignoreLine: isTableLine,
    }),
  );

  if (wrapLines) {
    extensions.push(EditorView.lineWrapping);
  }

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

async function setupAppMenu(actions: Record<AppMenuAction, () => void | Promise<void>>) {
  if (!isTauri()) {
    return;
  }

  const appMenu = await Submenu.new({
    text: "MarkBloom",
    items: [
      {
        id: "settings",
        text: "Settings...",
        accelerator: "Cmd+.",
        action: () => {
          void actions.settings();
        },
      },
      { item: "Separator" },
      { item: { About: null } },
      { item: "Separator" },
      { item: "Quit" },
    ],
  });

  const fileMenu = await Submenu.new({
    text: "File",
    items: [
      {
        id: "new-file",
        text: "New File",
        accelerator: "Cmd+N",
        action: () => {
          void actions["new-file"]();
        },
      },
      {
        id: "open-file",
        text: "Open...",
        accelerator: "Cmd+O",
        action: () => {
          void actions["open-file"]();
        },
      },
      {
        id: "save-file",
        text: "Save",
        accelerator: "Cmd+S",
        action: () => {
          void actions["save-file"]();
        },
      },
    ],
  });

  const editMenu = await Submenu.new({
    text: "Edit",
    items: [
      {
        id: "undo",
        text: "Undo",
        accelerator: "Cmd+Z",
        action: () => {
          void actions.undo();
        },
      },
      {
        id: "redo",
        text: "Redo",
        accelerator: "Cmd+Shift+Z",
        action: () => {
          void actions.redo();
        },
      },
      { item: "Separator" },
      {
        id: "find-replace",
        text: "Find / Replace",
        accelerator: "Cmd+F",
        action: () => {
          void actions["find-replace"]();
        },
      },
      { item: "Separator" },
      { item: "Cut" },
      { item: "Copy" },
      { item: "Paste" },
      { item: "SelectAll" },
    ],
  });

  const menu = await Menu.new({
    items: [appMenu, fileMenu, editMenu],
  });

  await menu.setAsAppMenu();
}

export function setupApp() {
  const editorHost = document.getElementById("editor");
  const openButton = document.getElementById("open-file");
  const saveButton = document.getElementById("save-file");
  const settingsButton = document.getElementById("settings-toggle");
  const settingsPanel = document.getElementById("settings-panel");
  const wrapLinesToggle = document.getElementById("toggle-wrap-lines");
  const fileInfo = document.getElementById("file-info");
  const status = document.getElementById("status");
  const changeInfo = document.getElementById("change-info");

  if (!(editorHost instanceof HTMLElement)) {
    throw new Error("Missing editor host element");
  }

  if (
    !(settingsButton instanceof HTMLButtonElement) ||
    !(settingsPanel instanceof HTMLDivElement) ||
    !(wrapLinesToggle instanceof HTMLInputElement)
  ) {
    throw new Error("Missing settings controls");
  }

  let currentFilePath: string | null = null;
  let currentFileLabel = "sample.md";
  let baselineText = initialText;
  let wrapLines = true;

  const handle = createEditor({
    parent: editorHost,
    initialText,
    extensions: buildExtensions({ baselineText, wrapLines }),
    onChange: (text) => {
      applyStatus(text);
    },
  });

  const isDirty = () => handle.getText() !== baselineText;

  const applyStatus = (text: string, cleanMessage = "No changes yet.") => {
    if (status) {
      status.textContent = `Length: ${text.length}`;
    }
    if (changeInfo) {
      changeInfo.textContent = isDirty() ? "Editing..." : cleanMessage;
    }
  };

  const applyFileInfo = () => {
    if (!fileInfo) {
      return;
    }
    fileInfo.textContent = `File: ${currentFileLabel}`;
  };

  const applyExtensions = () => {
    handle.setExtensions(buildExtensions({ baselineText, wrapLines }));
  };

  const resetBaseline = (nextBaselineText: string) => {
    baselineText = nextBaselineText;
    applyExtensions();
  };

  const setSettingsMenuOpen = (openState: boolean) => {
    settingsButton.setAttribute("aria-expanded", openState ? "true" : "false");
    settingsPanel.hidden = !openState;
  };

  const isSettingsMenuOpen = () => settingsButton.getAttribute("aria-expanded") === "true";

  const openSettings = () => {
    setSettingsMenuOpen(true);
    wrapLinesToggle.focus();
  };

  const closeSettings = () => {
    setSettingsMenuOpen(false);
    settingsButton.focus();
  };

  const confirmDiscardIfDirty = (nextAction: string) => {
    if (!isDirty()) {
      return true;
    }
    return window.confirm(`You have unsaved changes. Discard them and ${nextAction}?`);
  };

  const handleOpenFile = async () => {
    if (!confirmDiscardIfDirty("open another file")) {
      return;
    }
    if (!isTauri()) {
      if (changeInfo) {
        changeInfo.textContent = "Open is available in the mac app only.";
      }
      return;
    }

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
      currentFileLabel = basename(selected);
      resetBaseline(text);
      handle.setText(text);
      applyFileInfo();
      applyStatus(text, `Loaded ${basename(selected)}`);
    } catch (error) {
      console.error(error);
      if (changeInfo) {
        changeInfo.textContent = "Failed to open file.";
      }
    }
  };

  const handleSaveFile = async () => {
    if (!isTauri()) {
      if (changeInfo) {
        changeInfo.textContent = "Save is available in the mac app only.";
      }
      return;
    }

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
      currentFileLabel = basename(targetPath);
      resetBaseline(text);
      applyFileInfo();
      applyStatus(text, `Saved ${basename(targetPath)}`);
    } catch (error) {
      console.error(error);
      if (changeInfo) {
        changeInfo.textContent = "Failed to save file.";
      }
    }
  };

  const handleNewFile = () => {
    if (!confirmDiscardIfDirty("create a new file")) {
      return;
    }
    const text = "";
    currentFilePath = null;
    currentFileLabel = "untitled.md";
    resetBaseline(text);
    handle.setText(text);
    applyFileInfo();
    applyStatus(text, "Created untitled.md");
  };

  const handleFindReplace = () => {
    openSearchPanel(handle.view);
    handle.view.focus();
  };

  const handleUndo = () => {
    undo(handle.view);
    handle.view.focus();
  };

  const handleRedo = () => {
    redo(handle.view);
    handle.view.focus();
  };

  settingsButton.addEventListener("click", () => {
    const nextOpen = !isSettingsMenuOpen();
    setSettingsMenuOpen(nextOpen);
    if (nextOpen) {
      wrapLinesToggle.focus();
    }
  });

  settingsPanel.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }
    event.preventDefault();
    closeSettings();
  });

  document.addEventListener("pointerdown", (event) => {
    if (!isSettingsMenuOpen()) {
      return;
    }
    if (!(event.target instanceof Node)) {
      return;
    }
    if (settingsPanel.contains(event.target) || settingsButton.contains(event.target)) {
      return;
    }
    closeSettings();
  });

  wrapLinesToggle.addEventListener("change", () => {
    wrapLines = wrapLinesToggle.checked;
    applyExtensions();
    handle.view.focus();
  });

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

  const menuActions: Record<AppMenuAction, () => void | Promise<void>> = {
    "open-file": handleOpenFile,
    "save-file": handleSaveFile,
    "new-file": handleNewFile,
    "find-replace": handleFindReplace,
    settings: openSettings,
    undo: handleUndo,
    redo: handleRedo,
  };

  void setupAppMenu(menuActions).catch((error) => {
    console.error("Failed to set up app menu", error);
  });

  if (!isTauri()) {
    document.addEventListener("keydown", (event) => {
      if (!event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }

      const map: Partial<Record<string, AppMenuAction>> = {
        ".": "settings",
        f: "find-replace",
        n: "new-file",
        o: "open-file",
        s: "save-file",
      };

      const action = map[key];
      if (!action) {
        return;
      }

      event.preventDefault();
      void menuActions[action]();
    });
  }

  wrapLinesToggle.checked = wrapLines;
  setSettingsMenuOpen(false);
  applyFileInfo();
  applyStatus(handle.getText());

  return handle;
}
