import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";
import { parseAlignmentsFromLines } from "./tableMarkdown";
import type { TableCell, TableData } from "./types";

export type TableBoundaryInfo = {
  key: string;
  startLineNumber: number;
  endLineNumber: number;
  totalRows: number;
};

type TableDocLine = {
  from: number;
  to: number;
  number: number;
  text: string;
};

function hashString(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function createTableKey(lines: readonly TableDocLine[]): string {
  const first = lines[0];
  const last = lines[lines.length - 1];
  const signature = lines.map((line) => line.text).join("\n");
  return `${first?.from ?? 0}-${last?.to ?? 0}-${hashString(signature)}`;
}

export function collectTableBoundaries(state: EditorState): TableBoundaryInfo[] {
  const tables: TableBoundaryInfo[] = [];

  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name !== "Table") {
        return;
      }
      const lines = collectTableLines(state, node.from, node.to);
      if (lines.length === 0) {
        return;
      }
      const data = collectTableData(state, node.node, lines);
      tables.push({
        key: createTableKey(lines),
        startLineNumber: lines[0]?.number ?? 0,
        endLineNumber: lines[lines.length - 1]?.number ?? 0,
        totalRows: data.rows.length + 1,
      });
    },
  });

  return tables;
}

export function isLikelyTableBoundaryCandidateLine(lineText: string): boolean {
  const text = lineText.trim();
  if (text.length === 0 || !text.includes("|")) {
    return false;
  }
  if (/^\|?[-:\s]+(\|[-:\s]+)+\|?$/u.test(text)) {
    return true;
  }
  return /^\|.*\|$/u.test(text);
}

export function collectTableData(
  state: EditorState,
  node: SyntaxNode,
  lines: readonly TableDocLine[]
): TableData {
  const headerNode = node.getChild("TableHeader");
  const rowNodes = node.getChildren("TableRow");
  const header = headerNode ? { cells: collectCells(state, headerNode) } : null;
  const rows = rowNodes.map((row) => ({ cells: collectCells(state, row) }));
  const columnCount = Math.max(
    header?.cells.length ?? 0,
    ...rows.map((row) => row.cells.length),
    0
  );
  const alignments = parseAlignmentsFromLines(lines.map((line) => line.text), columnCount);
  return { header, rows, alignments };
}

export function collectTableLines(
  state: EditorState,
  from: number,
  to: number
): TableDocLine[] {
  const lines: TableDocLine[] = [];
  const startLine = state.doc.lineAt(from);
  const endLine = state.doc.lineAt(Math.max(from, to - 1));
  for (let lineNumber = startLine.number; lineNumber <= endLine.number; lineNumber += 1) {
    lines.push(state.doc.line(lineNumber));
  }
  while (lines.length > 0 && lines[lines.length - 1]?.text.trim() === "") {
    lines.pop();
  }
  return lines;
}

export function collectCells(state: EditorState, rowNode: SyntaxNode): TableCell[] {
  const cells: TableCell[] = [];
  for (let child = rowNode.firstChild; child; child = child.nextSibling) {
    if (child.name === "TableCell") {
      cells.push({
        text: state.doc.sliceString(child.from, child.to).trim(),
        from: child.from,
        to: child.to,
      });
    }
  }
  return cells;
}
