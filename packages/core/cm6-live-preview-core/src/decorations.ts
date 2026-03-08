import { RangeSetBuilder, type EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { Decoration, type DecorationSet } from "@codemirror/view";
import type { ResolvedLivePreviewOptions } from "./options";
import {
  addBlockMarkerDecorations,
  addTaskCheckboxDecorations,
  collectBlockRevealRange,
  collectFenceMarkersByLine,
} from "./block/blockMarkers";
import {
  addImageDecorations,
  addInlineHtmlStyleDecorations,
  addInlineMarkerDecorations,
} from "./inline/inlineDecorations";
import { applyLivePreviewPlugins } from "./plugins/applyPlugins";
import { collectInlineMarkerRanges } from "./inline/inlineMarkerRanges";
import { collectExcludedRanges } from "./core/excludedRanges";
import { overlapsRange } from "./core/utils";

function addThematicBreakDecorations(
  state: EditorState,
  push: (from: number, to: number, decoration: Decoration) => void,
  hiddenDecoration: Decoration,
  blockRevealRange: { from: number; to: number } | null,
  rawLineDecoration: Decoration
) {
  const revealRanges = blockRevealRange ? [blockRevealRange] : [];

  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name !== "HorizontalRule") {
        return;
      }
      if (blockRevealRange && overlapsRange(node.from, node.to, revealRanges)) {
        const line = state.doc.lineAt(node.from);
        push(line.from, line.from, rawLineDecoration);
        return;
      }
      push(node.from, node.to, hiddenDecoration);
    },
  });
}

export function buildDecorations(
  state: EditorState,
  options: ResolvedLivePreviewOptions
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const excluded = collectExcludedRanges(state, options);
  const inlineMarkerRanges = collectInlineMarkerRanges(state, options, excluded);
  const blockRevealRange = collectBlockRevealRange(state, options);
  const selectionRanges = state.selection.ranges
    .filter((range) => range.from !== range.to)
    .map((range) => ({ from: range.from, to: range.to }));
  const cursorHeads = state.selection.ranges
    .filter((range) => range.from === range.to)
    .map((range) => range.head);

  const blockHiddenDecoration = Decoration.replace({
    inclusive: false,
  });
  const blockHiddenMarkerDecoration = Decoration.mark({
    class: "cm-lp-marker-hidden",
  });
  const inlineHiddenDecoration = Decoration.replace({
    inclusive: false,
  });
  const rawLineDecoration = Decoration.line({ class: "cm-lp-raw" });

  const pending: Array<{ from: number; to: number; decoration: Decoration }> = [];
  const pushDecoration = (from: number, to: number, decoration: Decoration) => {
    pending.push({ from, to, decoration });
  };

  const fenceMarkersByLine = collectFenceMarkersByLine(
    state,
    selectionRanges,
    blockRevealRange
  );

  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    const isExcluded = overlapsRange(line.from, line.to, excluded.block);
    const hasFenceMarkers = fenceMarkersByLine.has(line.from);
    const isSelectionOverlap = overlapsRange(line.from, line.to, selectionRanges);
    const isBlockReveal = blockRevealRange
      ? overlapsRange(line.from, line.to, [blockRevealRange])
      : false;

    if (!isExcluded || hasFenceMarkers) {
      addBlockMarkerDecorations(
        pushDecoration,
        line.from,
        line.text,
        { isSelectionOverlap, cursorHeads, isBlockReveal },
        blockHiddenDecoration,
        blockHiddenMarkerDecoration,
        fenceMarkersByLine
      );
    }

    if (!isExcluded) {
      addTaskCheckboxDecorations(
        state,
        pushDecoration,
        line.from,
        line.text,
        selectionRanges
      );
    }
  }

  addThematicBreakDecorations(
    state,
    pushDecoration,
    blockHiddenDecoration,
    blockRevealRange,
    rawLineDecoration
  );

  addInlineMarkerDecorations(pushDecoration, inlineMarkerRanges.hidden, inlineHiddenDecoration);
  addInlineHtmlStyleDecorations(pushDecoration, inlineMarkerRanges.htmlStyles);
  addImageDecorations(
    pushDecoration,
    inlineMarkerRanges.images,
    options.imageRawShowsPreview ?? false
  );

  applyLivePreviewPlugins(
    pushDecoration,
    {
      state,
      selectionRanges,
      blockRevealRange,
      isSelectionOverlap: (range) =>
        overlapsRange(range.from, range.to, selectionRanges),
      isBlockRevealOverlap: (range) =>
        blockRevealRange
          ? overlapsRange(range.from, range.to, [blockRevealRange])
          : false,
    },
    options
  );

  pending.sort((a, b) => (a.from === b.from ? a.to - b.to : a.from - b.from));
  for (const item of pending) {
    builder.add(item.from, item.to, item.decoration);
  }

  return builder.finish();
}
