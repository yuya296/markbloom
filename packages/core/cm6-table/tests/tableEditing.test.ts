import assert from "node:assert/strict";
import test from "node:test";
import { EditorState } from "@codemirror/state";
import {
  buildTableCommitChange,
  clampCellSelection,
  getTableCellText,
  setTableCellText,
} from "../src/tableEditing";
import type { TableData } from "../src/types";

function createTableData(): TableData {
  return {
    header: {
      cells: [
        { text: "A", from: 0, to: 1 },
        { text: "B", from: 2, to: 3 },
      ],
    },
    rows: [
      {
        cells: [
          { text: "1", from: 4, to: 5 },
          { text: "2", from: 6, to: 7 },
        ],
      },
    ],
    alignments: [null, "right"],
  };
}

test("clamps cell selection into table bounds", () => {
  assert.deepEqual(clampCellSelection(-1, 9, 2, 2), { row: 0, col: 1 });
  assert.deepEqual(clampCellSelection(3, -2, 2, 2), { row: 1, col: 0 });
});

test("reads and writes header and body cell text", () => {
  const data = createTableData();

  assert.equal(getTableCellText(data, { row: 0, col: 1 }), "B");
  assert.equal(getTableCellText(data, { row: 1, col: 0 }), "1");

  setTableCellText(data, { row: 0, col: 1 }, "B2");
  setTableCellText(data, { row: 1, col: 0 }, "10");

  assert.equal(getTableCellText(data, { row: 0, col: 1 }), "B2");
  assert.equal(getTableCellText(data, { row: 1, col: 0 }), "10");
});

test("builds a commit change that preserves trailing newlines", () => {
  const data = createTableData();
  const state = EditorState.create({
    doc: ["before", "| A | B |", "| --- | ---: |", "| 1 | 2 |", "", "after"].join("\n"),
  });

  setTableCellText(data, { row: 1, col: 1 }, "22");
  const change = buildTableCommitChange(state, data, 2, 4);

  assert.equal(change.from, state.doc.line(2).from);
  assert.equal(state.doc.sliceString(change.to, change.to + 5), "after");
  assert.ok(change.to > state.doc.line(4).to);
  assert.ok(change.insert.includes("| 1 | 22 |"));
  assert.ok(change.insert.endsWith("\n\n"));
});
