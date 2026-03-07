import { parseAndSanitizeSvg } from "./sanitizeSvg";

type WindowLike = Pick<Window, "document">;
type WindowOpener = () => WindowLike | null;
type WarnFn = (message?: unknown, ...optionalParams: unknown[]) => void;

export function openMermaidPreview(
  svgMarkup: string,
  options: {
    openWindow?: WindowOpener;
    warn?: WarnFn;
  } = {}
): boolean {
  const openWindow =
    options.openWindow ??
    (() => window.open("", "_blank", "noopener,noreferrer") as WindowLike | null);
  const warn = options.warn ?? console.warn;

  const previewWindow = openWindow();
  if (!previewWindow) {
    warn("Mermaid preview popup was blocked by the browser");
    return false;
  }

  previewWindow.document.title = "Mermaid Preview";
  const previewRoot = previewWindow.document.createElement("main");
  previewRoot.className = "mermaid-preview";
  const sanitizedSvg = parseAndSanitizeSvg(svgMarkup, previewWindow.document);
  if (sanitizedSvg) {
    previewRoot.appendChild(sanitizedSvg);
  } else {
    previewRoot.textContent = "Failed to open Mermaid preview";
  }
  previewWindow.document.body.replaceChildren(previewRoot);

  const style = previewWindow.document.createElement("style");
  style.textContent = `
    :root { color-scheme: light dark; }
    html, body {
      margin: 0;
      width: 100%;
      height: 100%;
      background: #f6f8fa;
    }
    .mermaid-preview {
      min-height: 100%;
      display: grid;
      place-items: center;
      padding: 24px;
    }
    .mermaid-preview svg {
      width: min(96vw, 1400px);
      height: auto;
    }
  `;
  previewWindow.document.head.appendChild(style);
  return true;
}
