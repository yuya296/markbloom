import assert from "node:assert/strict";
import test from "node:test";
import { markdown } from "@codemirror/lang-markdown";
import { EditorSelection, EditorState } from "@codemirror/state";
import { isInlineRawByTriggers } from "../src/inline/rawMode";

function createState(
  doc: string,
  selection?:
    | { anchor: number; head?: number }
    | { ranges: Array<{ anchor: number; head?: number }> }
): EditorState {
  const resolvedSelection = selection
    ? "ranges" in selection
      ? EditorSelection.create(
          selection.ranges.map((range) =>
            EditorSelection.range(range.anchor, range.head ?? range.anchor)
          )
        )
      : selection.head !== undefined
      ? EditorSelection.range(selection.anchor, selection.head)
      : EditorSelection.cursor(selection.anchor)
    : undefined;

  return EditorState.create({
    doc,
    selection: resolvedSelection,
    extensions: [markdown()],
  });
}

test("treats image node as raw when cursor is inside image markup", () => {
  const doc = "![img](a.png)";
  const state = createState(doc, { anchor: 4 });
  assert.equal(
    isInlineRawByTriggers(state, { from: 0, to: doc.length }, "nearby"),
    true
  );
});

test("treats image node as raw when selection overlaps image markup", () => {
  const doc = "![img](a.png)";
  const state = createState(doc, {
    ranges: [{ anchor: 2, head: 6 }],
  });
  assert.equal(
    isInlineRawByTriggers(state, { from: 0, to: doc.length }, "nearby"),
    true
  );
});

test("treats image node as raw when single range selection overlaps image markup", () => {
  const doc = "![img](a.png)";
  const state = createState(doc, { anchor: 2, head: 6 });
  assert.equal(
    isInlineRawByTriggers(state, { from: 0, to: doc.length }, "nearby"),
    true
  );
});

test("keeps image node rich when cursor is far from image line", () => {
  const doc = ["before", "![img](a.png)", "after"].join("\n");
  const state = createState(doc, { anchor: 0 });
  const from = doc.indexOf("![img](a.png)");
  const to = from + "![img](a.png)".length;

  assert.equal(isInlineRawByTriggers(state, { from, to }, "nearby"), false);
});
