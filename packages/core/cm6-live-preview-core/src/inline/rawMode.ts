import type { EditorState, Line } from "@codemirror/state";
import type { RawModeTrigger } from "../config";
import { selectionOverlapsRange } from "../core/utils";

function isCursorAdjacent(
  line: Line,
  head: number,
  from: number,
  to: number,
  radiusBefore: number,
  radiusAfter: number
): boolean {
  if (head < from) {
    if (from - head > radiusAfter) {
      return false;
    }
    const between = line.text.slice(head - line.from, from - line.from);
    return !/\s/u.test(between);
  }

  if (head > to) {
    if (head - to > radiusBefore) {
      return false;
    }
    const between = line.text.slice(to - line.from, head - line.from);
    return !/\s/u.test(between);
  }

  return false;
}

function normalizeTriggers(rawModeTrigger: RawModeTrigger | RawModeTrigger[]): RawModeTrigger[] {
  return Array.isArray(rawModeTrigger) ? rawModeTrigger : [rawModeTrigger];
}

export function isInlineRawByTriggers(
  state: EditorState,
  node: { from: number; to: number },
  rawModeTrigger: RawModeTrigger | RawModeTrigger[]
): boolean {
  // This helper is for inline elements. Ignore block-specific triggers.
  const triggers = normalizeTriggers(rawModeTrigger).filter(
    (trigger) => trigger === "always" || trigger === "nearby"
  );

  if (triggers.includes("always")) {
    return true;
  }

  if (triggers.includes("nearby")) {
    if (selectionOverlapsRange(state.selection.ranges, node.from, node.to)) {
      return true;
    }
    const head = state.selection.main.head;
    const line = state.doc.lineAt(head);
    if (line.number === state.doc.lineAt(node.from).number) {
      const radiusBefore = 1;
      const radiusAfter = 1;
      if (head >= node.from && head <= node.to) {
        return true;
      }
      if (isCursorAdjacent(line, head, node.from, node.to, radiusBefore, radiusAfter)) {
        return true;
      }
    }
  }

  return false;
}
