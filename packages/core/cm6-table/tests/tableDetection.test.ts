import assert from "node:assert/strict";
import test from "node:test";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { GFM } from "@lezer/markdown";
import {
  collectTableLines,
  createTableKey,
  isLikelyTableBoundaryCandidateLine,
} from "../src/tableDetection";

function createState(doc: string): EditorState {
  return EditorState.create({
    doc,
    extensions: [markdown({ extensions: [GFM] })],
  });
}

test("detects markdown table boundary candidate lines", () => {
  assert.equal(isLikelyTableBoundaryCandidateLine("| A | B |"), true);
  assert.equal(isLikelyTableBoundaryCandidateLine("| --- | --- |"), true);
  assert.equal(isLikelyTableBoundaryCandidateLine("plain text"), false);
  assert.equal(isLikelyTableBoundaryCandidateLine(""), false);
});

test("collects trimmed table lines and stable table keys", () => {
  const state = createState(["| A | B |", "| --- | --- |", "| 1 | 2 |", ""].join("\n"));
  const lines = collectTableLines(state, 0, state.doc.length);

  assert.equal(lines.length, 3);
  assert.equal(lines[2]?.text, "| 1 | 2 |");
  assert.equal(createTableKey(lines), createTableKey(lines));
  assert.notEqual(
    createTableKey(lines),
    createTableKey([
      { from: 0, to: 1, number: 1, text: "| A | C |" },
      { from: 2, to: 3, number: 2, text: "| --- | --- |" },
      { from: 4, to: 5, number: 3, text: "| 1 | 2 |" },
    ])
  );
});
