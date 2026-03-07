import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import { openMermaidPreview } from "./previewWindow";
import { ConnectedRenderQueue } from "./renderQueue";
import {
  clearCachedMermaidApi,
  ensureMermaidInitialized,
  isMermaidApi,
  loadMermaidApi,
  resolveRuntimeTheme,
  type MermaidThemeMode,
} from "./runtime";
import { parseAndSanitizeSvg } from "./sanitizeSvg";

export type MermaidWidgetMode = "replace" | "append";
export type { MermaidThemeMode } from "./runtime";

type MermaidWidgetOptions = {
  className: string;
  errorClassName: string;
  mode: MermaidWidgetMode;
  mermaidTheme: MermaidThemeMode;
};

// cm-widget-measure: dynamic
class MermaidWidget extends WidgetType {
  private static sequence = 0;
  private static readonly renderQueue = new ConnectedRenderQueue();
  private static resizeObservers = new WeakMap<HTMLElement, ResizeObserver>();
  private static pendingMeasureFrames = new WeakMap<EditorView, number>();

  constructor(
    private readonly source: string,
    private readonly options: MermaidWidgetOptions
  ) {
    super();
  }

  eq(other: MermaidWidget): boolean {
    return (
      this.source === other.source &&
      this.options.className === other.options.className &&
      this.options.errorClassName === other.options.errorClassName &&
      this.options.mode === other.options.mode &&
      this.options.mermaidTheme === other.options.mermaidTheme
    );
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = `${this.options.className} cm-lp-mermaid-${this.options.mode}`;

    const source = this.source.trim();
    if (!source) {
      wrapper.textContent = "(empty mermaid diagram)";
      return wrapper;
    }

    const container = document.createElement("div");
    container.className = "cm-lp-mermaid-content";
    container.textContent = "Rendering Mermaid...";
    wrapper.appendChild(container);
    MermaidWidget.attachMeasureObserver(wrapper, container);
    this.scheduleRender(source, container, wrapper);
    return wrapper;
  }

  updateDOM(dom: HTMLElement): boolean {
    const wrapper = dom;
    if (!wrapper.classList.contains(this.options.className)) {
      return false;
    }
    const container = wrapper.querySelector<HTMLElement>(".cm-lp-mermaid-content");
    const source = this.source.trim();
    if (!container) {
      return false;
    }
    if (!source) {
      wrapper.textContent = "(empty mermaid diagram)";
      return true;
    }

    const hasSvg = Boolean(container.querySelector("svg"));
    const hasError = wrapper.getAttribute("data-error") === "true";
    if (!hasSvg && !hasError) {
      this.scheduleRender(source, container, wrapper);
      return true;
    }

    if (hasSvg) {
      this.attachOpenInNewTabButton(wrapper, container);
    }
    return true;
  }

  destroy(dom: HTMLElement): void {
    MermaidWidget.detachMeasureObserver(dom);
  }

  private scheduleRender(source: string, container: HTMLElement, wrapper: HTMLElement) {
    MermaidWidget.renderQueue.schedule(container, wrapper, () => {
      void this.renderDiagram(source, container, wrapper);
    });
  }

  private async renderDiagram(
    source: string,
    container: HTMLElement,
    wrapper: HTMLElement
  ) {
    const generation = MermaidWidget.renderQueue.bumpGeneration(container);
    container.textContent = "Rendering Mermaid...";
    wrapper.classList.remove(this.options.errorClassName);
    wrapper.removeAttribute("data-error");

    try {
      let mermaid = await loadMermaidApi();
      if (!isMermaidApi(mermaid)) {
        // A polluted/stale global can pass through runtime environments unexpectedly.
        // Force a clean module import path before failing the widget.
        clearCachedMermaidApi();
        mermaid = await loadMermaidApi({ skipGlobal: true });
      }
      if (!mermaid) {
        throw new Error("Mermaid runtime is not available");
      }

      const runtimeTheme = resolveRuntimeTheme(this.options.mermaidTheme);
      ensureMermaidInitialized(mermaid, runtimeTheme);

      const id = `cm-lp-mermaid-${MermaidWidget.sequence++}`;
      const { svg, bindFunctions } = await mermaid.render(id, source);
      if (!MermaidWidget.renderQueue.isCurrentGeneration(container, generation)) {
        return;
      }
      const sanitizedSvg = parseAndSanitizeSvg(svg, container.ownerDocument);
      if (!sanitizedSvg) {
        throw new Error("Rendered Mermaid output is not valid SVG");
      }
      container.replaceChildren(sanitizedSvg);
      MermaidWidget.requestEditorMeasure(wrapper);
      bindFunctions?.(container);
      this.attachOpenInNewTabButton(wrapper, container);
    } catch (error) {
      if (!MermaidWidget.renderQueue.isCurrentGeneration(container, generation)) {
        return;
      }
      wrapper.classList.add(this.options.errorClassName);
      wrapper.setAttribute("data-error", "true");
      container.textContent =
        error instanceof Error
          ? `Mermaid render error: ${error.message}`
          : "Mermaid render error";
    }
  }

  private static attachMeasureObserver(wrapper: HTMLElement, container: HTMLElement): void {
    MermaidWidget.detachMeasureObserver(wrapper);
    const observer = new ResizeObserver(() => {
      MermaidWidget.requestEditorMeasure(wrapper);
    });
    observer.observe(wrapper);
    observer.observe(container);
    MermaidWidget.resizeObservers.set(wrapper, observer);
  }

  private static detachMeasureObserver(wrapper: HTMLElement): void {
    const observer = MermaidWidget.resizeObservers.get(wrapper);
    if (!observer) {
      return;
    }
    observer.disconnect();
    MermaidWidget.resizeObservers.delete(wrapper);
  }

  private static requestEditorMeasure(dom: HTMLElement): void {
    const view = EditorView.findFromDOM(dom);
    if (!view) {
      return;
    }
    const pending = MermaidWidget.pendingMeasureFrames.get(view);
    if (typeof pending === "number") {
      cancelAnimationFrame(pending);
    }
    const frame = requestAnimationFrame(() => {
      MermaidWidget.pendingMeasureFrames.delete(view);
      view.requestMeasure();
    });
    MermaidWidget.pendingMeasureFrames.set(view, frame);
  }

  private attachOpenInNewTabButton(wrapper: HTMLElement, container: HTMLElement) {
    wrapper.querySelector(".cm-lp-mermaid-open-button")?.remove();

    const svg = container.querySelector("svg");
    if (!(svg instanceof SVGElement)) {
      return;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "cm-lp-mermaid-open-button";
    button.setAttribute("aria-label", "Open Mermaid preview in new tab");
    button.title = "Open Mermaid preview in new tab";
    button.textContent = "Open";

    const openPreview = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      openMermaidPreview(svg.outerHTML);
    };

    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener("click", openPreview);
    button.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        openPreview(event);
      }
    });
    wrapper.appendChild(button);
  }
}

export function mermaidBlockReplace(
  source: string,
  options: Omit<MermaidWidgetOptions, "mode">
): Decoration {
  return Decoration.replace({
    block: true,
    inclusive: false,
    widget: new MermaidWidget(source, {
      ...options,
      mode: "replace",
    }),
  });
}

export function mermaidBlockWidget(
  source: string,
  options: Omit<MermaidWidgetOptions, "mode">
): Decoration {
  return Decoration.widget({
    block: true,
    side: 1,
    widget: new MermaidWidget(source, {
      ...options,
      mode: "append",
    }),
  });
}
