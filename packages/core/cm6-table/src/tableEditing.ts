import type { EditorState } from "@codemirror/state";
import { buildTableMarkdown } from "./tableMarkdown";
import { normalizeTableData } from "./tableModel";
import type { TableData } from "./types";

export type TableCellCoord = {
  row: number;
  col: number;
};

export function clampCellSelection(
  nextRow: number,
  nextCol: number,
  totalRows: number,
  columnCount: number
): TableCellCoord {
  const row = Math.min(Math.max(nextRow, 0), Math.max(0, totalRows - 1));
  const col = Math.min(Math.max(nextCol, 0), Math.max(0, columnCount - 1));
  return { row, col };
}

export function getTableCellText(data: TableData, cell: TableCellCoord): string {
  if (cell.row === 0) {
    return data.header?.cells[cell.col]?.text ?? "";
  }
  return data.rows[cell.row - 1]?.cells[cell.col]?.text ?? "";
}

export function setTableCellText(
  data: TableData,
  cell: TableCellCoord,
  value: string
): void {
  if (cell.row === 0) {
    if (data.header) {
      data.header.cells[cell.col] = {
        ...(data.header.cells[cell.col] ?? { from: -1, to: -1 }),
        text: value,
      };
    }
    return;
  }
  const targetRow = data.rows[cell.row - 1];
  if (!targetRow) {
    return;
  }
  targetRow.cells[cell.col] = {
    ...(targetRow.cells[cell.col] ?? { from: -1, to: -1 }),
    text: value,
  };
}

export function buildTableCommitChange(
  state: EditorState,
  data: TableData,
  startLineNumber: number,
  endLineNumber: number
): { from: number; to: number; insert: string } {
  normalizeTableData(data);
  const doc = state.doc;
  const startLine = doc.line(startLineNumber);
  const endLine = doc.line(endLineNumber);
  const startLineFrom = startLine.from;
  const endLineTo = endLine.to;
  let suffix = "";
  for (let pos = endLineTo; pos < doc.length; pos += 1) {
    const char = doc.sliceString(pos, pos + 1);
    if (char !== "\n") {
      break;
    }
    suffix += "\n";
  }
  return {
    from: startLineFrom,
    to: endLineTo + suffix.length,
    insert: `${buildTableMarkdown(data)}${suffix}`,
  };
}
