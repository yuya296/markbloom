import type { Extension } from "@codemirror/state";
import { livePreview, type LivePreviewOptions } from "@yuya296/cm6-live-preview-core";
import {
  mermaidLivePreview,
  type MermaidLivePreviewPluginOptions,
} from "@yuya296/cm6-live-preview-mermaid";
import { markdownSemantics, type MarkdownSemanticsOptions } from "@yuya296/cm6-markdown-semantics";
import { tableEditor, type TableEditorOptions } from "@yuya296/cm6-table";
import { typographyTheme, type TypographyThemeOptions } from "@yuya296/cm6-typography-theme";
export { resolveImageBasePath } from "./imageBasePath";
import type { LivePreviewPlugin } from "@yuya296/cm6-live-preview-core";

type MermaidPresetOption = boolean | MermaidLivePreviewPluginOptions;
type TablePresetOption = boolean | TableEditorOptions;

export type LivePreviewPresetOptions = {
  livePreview?: false | LivePreviewOptions;
  semantics?: MarkdownSemanticsOptions;
  typography?: TypographyThemeOptions;
  mermaid?: MermaidPresetOption;
  table?: TablePresetOption;
};

export function resolveMermaidPresetOptions(
  mermaid?: MermaidPresetOption
): MermaidLivePreviewPluginOptions | null {
  return mermaid === true ? {} : mermaid && typeof mermaid === "object" ? mermaid : null;
}

export function resolveTablePresetOptions(table?: TablePresetOption): TableEditorOptions | null {
  return table === true ? {} : table && typeof table === "object" ? table : null;
}

export function resolvePresetLivePreviewOptions(
  livePreviewOptions: false,
  extraPlugins?: readonly LivePreviewPlugin[]
): null;
export function resolvePresetLivePreviewOptions(
  livePreviewOptions: LivePreviewOptions | undefined,
  extraPlugins?: readonly LivePreviewPlugin[]
): LivePreviewOptions;
export function resolvePresetLivePreviewOptions(
  livePreviewOptions: false | LivePreviewOptions | undefined,
  extraPlugins: readonly LivePreviewPlugin[] = []
): LivePreviewOptions | null {
  if (livePreviewOptions === false) {
    return null;
  }
  const resolved = livePreviewOptions ?? {};
  if (extraPlugins.length === 0) {
    return resolved;
  }
  return {
    ...resolved,
    plugins: [...(resolved.plugins ?? []), ...extraPlugins],
  };
}

export function livePreviewPreset(options: LivePreviewPresetOptions = {}): Extension {
  const {
    livePreview: livePreviewOptions,
    semantics,
    typography,
    mermaid,
    table,
  } = options;

  const resolvedLivePreview =
    livePreviewOptions === false
      ? null
      : resolvePresetLivePreviewOptions(livePreviewOptions);

  const result: Extension[] = [markdownSemantics(semantics), typographyTheme(typography)];
  const mermaidOptions = resolveMermaidPresetOptions(mermaid);

  if (resolvedLivePreview) {
    if (mermaidOptions) {
      const mermaidBundle = mermaidLivePreview(mermaidOptions);
      result.push(...mermaidBundle.extensions);
      result.push(
        livePreview(resolvePresetLivePreviewOptions(resolvedLivePreview, [mermaidBundle.plugin]))
      );
    } else {
      result.push(livePreview(resolvedLivePreview));
    }
  } else if (mermaidOptions) {
    throw new Error(
      "livePreviewPreset: mermaid option requires livePreview to be enabled"
    );
  }

  const tableOptions = resolveTablePresetOptions(table);
  if (tableOptions) {
    result.push(tableEditor(tableOptions));
  }

  return result;
}
