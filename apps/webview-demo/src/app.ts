import { EditorState, Extension } from "@codemirror/state";
import { lineNumbers, EditorView } from "@codemirror/view";
import initialText from "../assets/sample.md?raw";
import { diffGutter } from "@yuya296/cm6-diff-gutter";
import { livePreviewPreset, resolveImageBasePath } from "@yuya296/cm6-live-preview";
import { createEditor } from "./createEditor";
import {
  type ExtensionOptions,
  readExtensionOptionsFromControls,
} from "./editorSettings";
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

function buildExtensions({
  showLineNumbers,
  wrapLines,
  tabSize,
  livePreviewEnabled,
  blockRevealEnabled,
  diffBaselineText,
}: ExtensionOptions): Extension[] {
  const extensions: Extension[] = [];
  const previewFeatureFlags = resolvePreviewFeatureFlags();

  extensions.push(
    diffGutter({
      baselineText: diffBaselineText,
      ignoreLine: isTableLine,
    })
  );

  if (showLineNumbers) {
    extensions.push(lineNumbers());
  }

  if (wrapLines) {
    extensions.push(EditorView.lineWrapping);
  }

  if (Number.isFinite(tabSize)) {
    extensions.push(EditorState.tabSize.of(tabSize));
  }

  extensions.push(editorHighlightStyle());
  extensions.push(editorTheme());

  extensions.push(
    livePreviewPreset({
      livePreview: livePreviewEnabled
        ? {
            blockRevealEnabled,
            imageBasePath: resolveImageBasePath(import.meta.env.BASE_URL),
            imageRawShowsPreview: true,
          }
        : false,
      // Mermaid is paused for now. Re-enable by flipping the feature flag.
      mermaid: resolveMermaidPreviewEnabled({
        livePreviewEnabled,
        featureFlags: previewFeatureFlags,
      }),
      table: true,
    })
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

  const controls = {
    lineNumbers: document.getElementById("toggle-line-numbers"),
    wrap: document.getElementById("toggle-wrap"),
    livePreview: document.getElementById("toggle-live-preview"),
    blockReveal: document.getElementById("toggle-block-reveal"),
    themeToggle: document.getElementById("toggle-theme"),
    tabSize: document.getElementById("tab-size"),
    apply: document.getElementById("apply"),
    settingsToggle: document.getElementById("settings-toggle"),
    settingsPanel: document.getElementById("settings-panel"),
  };

  if (
    !(controls.lineNumbers instanceof HTMLInputElement) ||
    !(controls.wrap instanceof HTMLInputElement) ||
    !(controls.livePreview instanceof HTMLInputElement) ||
    !(controls.blockReveal instanceof HTMLInputElement) ||
    !(controls.themeToggle instanceof HTMLButtonElement) ||
    !(controls.tabSize instanceof HTMLInputElement) ||
    !(controls.apply instanceof HTMLButtonElement) ||
    !(controls.settingsToggle instanceof HTMLButtonElement) ||
    !(controls.settingsPanel instanceof HTMLDivElement)
  ) {
    throw new Error("Missing control elements");
  }

  const lineNumbersControl = controls.lineNumbers;
  const wrapControl = controls.wrap;
  const livePreviewControl = controls.livePreview;
  const blockRevealControl = controls.blockReveal;
  const themeToggleControl = controls.themeToggle;
  const tabSizeControl = controls.tabSize;
  const applyControl = controls.apply;
  const settingsToggleControl = controls.settingsToggle;
  const settingsPanelControl = controls.settingsPanel;

  const setSettingsMenuOpen = (open: boolean) => {
    settingsToggleControl.setAttribute("aria-expanded", open ? "true" : "false");
    settingsPanelControl.hidden = !open;
  };

  const isSettingsMenuOpen = () =>
    settingsToggleControl.getAttribute("aria-expanded") === "true";

  const syncTabSizeControl = (nextValue: string) => {
    if (tabSizeControl.value !== nextValue) {
      tabSizeControl.value = nextValue;
    }
  };

  const getExtensionOptions = (): ExtensionOptions => {
    const nextOptions = readExtensionOptionsFromControls({
      showLineNumbers: lineNumbersControl.checked,
      wrapLines: wrapControl.checked,
      livePreviewEnabled: livePreviewControl.checked,
      blockRevealEnabled: blockRevealControl.checked,
      tabSizeInput: tabSizeControl.value,
      diffBaselineText: initialText,
    });
    syncTabSizeControl(nextOptions.normalizedTabSizeInput);
    return nextOptions;
  };

  const setTheme = (nextTheme: "light" | "dark") => {
    document.documentElement.dataset.theme = nextTheme;
    themeToggleControl.setAttribute(
      "aria-pressed",
      nextTheme === "dark" ? "true" : "false"
    );
  };

  const prefersDark =
    window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  setTheme(prefersDark ? "dark" : "light");
  setSettingsMenuOpen(false);

  themeToggleControl.addEventListener("click", () => {
    const nextTheme =
      document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
  });

  settingsToggleControl.addEventListener("click", () => {
    const nextOpen = !isSettingsMenuOpen();
    setSettingsMenuOpen(nextOpen);
    if (nextOpen) {
      lineNumbersControl.focus();
    } else {
      settingsToggleControl.focus();
    }
  });

  settingsPanelControl.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }
    event.preventDefault();
    setSettingsMenuOpen(false);
    settingsToggleControl.focus();
  });

  document.addEventListener("pointerdown", (event) => {
    if (!isSettingsMenuOpen()) {
      return;
    }
    if (!(event.target instanceof Node)) {
      return;
    }
    if (
      settingsPanelControl.contains(event.target) ||
      settingsToggleControl.contains(event.target)
    ) {
      return;
    }
    event.preventDefault();
    setSettingsMenuOpen(false);
    settingsToggleControl.focus();
  });

  const editor = createEditor({
    parent: editorHost,
    initialText,
    extensions: buildExtensions(getExtensionOptions()),
    onChange: (text) => {
      if (status) {
        status.textContent = `Length: ${text.length}`;
      }
      if (changeInfo) {
        changeInfo.textContent = `Last change at ${new Date().toLocaleTimeString()}`;
      }
    },
  });

  const applyExtensions = () => {
    editor.setExtensions(buildExtensions(getExtensionOptions()));
    setSettingsMenuOpen(false);
    settingsToggleControl.focus();
  };

  applyControl.addEventListener("click", applyExtensions);

  return editor;
}
