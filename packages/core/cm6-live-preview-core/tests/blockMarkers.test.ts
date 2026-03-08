import assert from "node:assert/strict";
import test from "node:test";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { buildDecorations } from "../src/decorations";
import { resolveLivePreviewOptions } from "../src/options";

type DecoratedRange = {
  from: number;
  to: number;
  className: string;
};

function createState(doc: string, anchor: number): EditorState {
  return EditorState.create({
    doc,
    selection: { anchor },
    extensions: [markdown()],
  });
}

function collectDecoratedRanges(state: EditorState): DecoratedRange[] {
  const decorations = buildDecorations(state, resolveLivePreviewOptions({}));
  const ranges: DecoratedRange[] = [];
  decorations.between(0, state.doc.length, (from, to, value) => {
    const className = (value.spec.class as string | undefined) ?? "";
    if (!className) {
      return;
    }
    ranges.push({ from, to, className });
  });
  return ranges;
}

function hasClassAtRange(
  ranges: DecoratedRange[],
  from: number,
  to: number,
  className: string
): boolean {
  return ranges.some(
    (range) =>
      range.from === from &&
      range.to === to &&
      range.className.split(/\s+/u).includes(className)
  );
}

test("uses mark-based classes for heading/list/quote markers in rich mode", () => {
  const doc = "## Heading\n- item\n> quote";
  const state = createState(doc, doc.length);
  const ranges = collectDecoratedRanges(state);

  const headingLine = state.doc.line(1);
  const listLine = state.doc.line(2);
  const quoteLine = state.doc.line(3);

  assert.equal(
    hasClassAtRange(ranges, headingLine.from, headingLine.from + 3, "cm-lp-marker-hidden"),
    true
  );
  assert.equal(
    hasClassAtRange(
      ranges,
      listLine.from,
      listLine.from + 1,
      "cm-lp-list-marker-bullet"
    ),
    true
  );
  assert.equal(
    hasClassAtRange(ranges, quoteLine.from, quoteLine.from + 2, "cm-lp-marker-hidden"),
    true
  );
});

test("reveals heading/list/quote markers when cursor is on marker text", () => {
  const doc = "## Heading\n- item\n> quote";

  const headingState = createState(doc, 1);
  const headingRanges = collectDecoratedRanges(headingState);
  const headingLine = headingState.doc.line(1);
  assert.equal(
    hasClassAtRange(
      headingRanges,
      headingLine.from,
      headingLine.from + 3,
      "cm-lp-marker-hidden"
    ),
    false
  );

  const listState = createState(doc, doc.indexOf("- item"));
  const listRanges = collectDecoratedRanges(listState);
  const listLine = listState.doc.line(2);
  assert.equal(
    hasClassAtRange(
      listRanges,
      listLine.from,
      listLine.from + 1,
      "cm-lp-list-marker-bullet"
    ),
    false
  );

  const quoteState = createState(doc, doc.indexOf("> quote"));
  const quoteRanges = collectDecoratedRanges(quoteState);
  const quoteLine = quoteState.doc.line(3);
  assert.equal(
    hasClassAtRange(
      quoteRanges,
      quoteLine.from,
      quoteLine.from + 2,
      "cm-lp-marker-hidden"
    ),
    false
  );
});
