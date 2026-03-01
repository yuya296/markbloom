import type { Decoration } from "@codemirror/view";
import type { ResolvedLivePreviewOptions } from "../options";
import type { LivePreviewPluginContext } from "./types";

type PushDecoration = (from: number, to: number, decoration: Decoration) => void;

function fingerprintPluginError(pluginName: string, error: unknown): string {
  if (error instanceof Error) {
    return `${pluginName}:${error.name}:${error.message}`;
  }
  return `${pluginName}:${String(error)}`;
}

export function applyLivePreviewPlugins(
  push: PushDecoration,
  ctx: LivePreviewPluginContext,
  options: ResolvedLivePreviewOptions
) {
  const docLength = ctx.state.doc.length;
  const reportedPluginErrors = new Set<string>();

  for (const plugin of options.plugins) {
    const pluginName = plugin.name || "unnamed-plugin";
    try {
      const decorations = plugin.decorate(ctx);
      for (const item of decorations) {
        if (
          !item ||
          typeof item.from !== "number" ||
          typeof item.to !== "number" ||
          !item.decoration
        ) {
          continue;
        }
        if (
          item.from > item.to ||
          item.from < 0 ||
          item.to < 0 ||
          item.from > docLength ||
          item.to > docLength
        ) {
          continue;
        }
        push(item.from, item.to, item.decoration);
      }
    } catch (error) {
      const fingerprint = fingerprintPluginError(pluginName, error);
      if (reportedPluginErrors.has(fingerprint)) {
        continue;
      }
      reportedPluginErrors.add(fingerprint);
      options.onPluginError({ pluginName, error });
    }
  }
}
