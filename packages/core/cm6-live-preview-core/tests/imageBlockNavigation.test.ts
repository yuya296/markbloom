import assert from "node:assert/strict";
import test from "node:test";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { collectStandaloneImageBlocksFromState } from "../src/inline/imageBlocks";
import {
  shouldMoveCursorPastImageBottom,
  shouldMoveCursorToImageTop,
} from "../src/inline/imageBlockNavigationLogic";

function createState(doc: string): EditorState {
  return EditorState.create({
    doc,
    extensions: [markdown()],
  });
}

test("collects only standalone image lines for block navigation", () => {
  const state = createState(
    ["before", "![standalone](a.png)", "text ![inline](b.png) tail", "   ![spaced](c.png)   "].join(
      "\n"
    )
  );

  const blocks = collectStandaloneImageBlocksFromState(state);
  assert.equal(blocks.length, 2);
  assert.deepEqual(
    blocks.map((block) => state.doc.lineAt(block.replaceRange.from).number),
    [2, 4]
  );
});

test("moves cursor to image top when entering block from above", () => {
  const block = { replaceRange: { from: 10, to: 30 } };
  assert.equal(shouldMoveCursorToImageTop(5, 30, block), true);
});

test("does not force top move during normal in-image movement", () => {
  const block = { replaceRange: { from: 10, to: 30 } };
  assert.equal(shouldMoveCursorToImageTop(15, 16, block), false);
});

test("moves cursor past image bottom when down-navigation lands on boundary", () => {
  const block = { replaceRange: { from: 10, to: 30 } };
  assert.equal(shouldMoveCursorPastImageBottom(10, 30, block), true);
  assert.equal(shouldMoveCursorPastImageBottom(31, 30, block), false);
});
