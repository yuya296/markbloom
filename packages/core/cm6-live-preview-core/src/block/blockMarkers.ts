import { syntaxTree } from "@codemirror/language";
import { type EditorState } from "@codemirror/state";
import { Decoration } from "@codemirror/view";
import type { Range } from "../core/types";
import { hasNodeName } from "../core/syntaxNodeNames";
import { overlapsRange } from "../core/utils";
import {
  blockMarkerConfigs,
  blockTriggerNodeNames,
  type DisplayStyle,
  type RawModeTrigger,
} from "../config";
import type { LivePreviewOptions } from "../options";
import { listMarkerDecoration, taskCheckboxReplace } from "../theme/markerWidgets";

const blockMarkerPattern = {
  heading: /^\s{0,3}(#{1,6})(?=\s|$)/,
  list: /^(?:\s{0,3}(?:>\s?)*)?\s*([*+-]|\d+\.)(?=\s)/,
  quotePrefix: /^\s{0,3}(?:>\s?)*/,
  taskList:
    /^(?:\s{0,3}(?:>\s?)*)?\s*((?:[*+-]|\d+\.)\s+)(\[(?: |x|X)\])(?=\s|$)/,
};

type BlockMarker = {
  id: "heading" | "list" | "quote" | "fence";
  from: number;
  to: number;
  listKind?: "bullet" | "ordered";
  rawText?: string;
};

type PushDecoration = (from: number, to: number, decoration: Decoration) => void;

type BlockRawState = {
  isSelectionOverlap: boolean;
  cursorHeads: readonly number[];
  isBlockReveal: boolean;
};

type TaskCheckbox = {
  markerFrom: number;
  markerTo: number;
  tokenFrom: number;
  tokenTo: number;
  checked: boolean;
};

function normalizeTriggers(rawModeTrigger: RawModeTrigger | RawModeTrigger[]): RawModeTrigger[] {
  return Array.isArray(rawModeTrigger) ? rawModeTrigger : [rawModeTrigger];
}

function isCursorNearRange(
  cursorHeads: readonly number[],
  from: number,
  to: number
): boolean {
  return cursorHeads.some((head) => head >= from && head <= to);
}

function isRawByTriggers(state: BlockRawState, rawModeTrigger: RawModeTrigger | RawModeTrigger[]): boolean {
  const triggers = normalizeTriggers(rawModeTrigger);

  if (triggers.includes("always")) {
    return true;
  }

  if (triggers.includes("nearby") && state.isSelectionOverlap) {
    return true;
  }

  if (triggers.includes("block") && state.isBlockReveal) {
    return true;
  }

  return false;
}

export function collectBlockRevealRange(
  state: EditorState,
  options: LivePreviewOptions
): Range | null {
  if (!options.blockRevealEnabled) {
    return null;
  }

  const head = state.selection.main.head;
  const tree = syntaxTree(state);
  const candidates = [tree.resolve(head, 1), tree.resolve(head, -1)];

  for (const resolved of candidates) {
    let current: typeof resolved | null = resolved;
    let fallback: Range | null = null;
    while (current) {
      if (hasNodeName(blockTriggerNodeNames, current.name)) {
        if (current.name === "Blockquote") {
          return { from: current.from, to: current.to };
        }
        if (!fallback) {
          fallback = { from: current.from, to: current.to };
        }
      }
      current = current.parent;
    }
    if (fallback) {
      return fallback;
    }
  }

  return null;
}

function collectBlockMarkers(
  lineFrom: number,
  lineText: string,
  fenceMarkersByLine: Map<number, BlockMarker[]>
): BlockMarker[] {
  const markers: BlockMarker[] = [];

  const headingMatch = lineText.match(blockMarkerPattern.heading);
  if (headingMatch) {
    const markerIndex = lineText.indexOf(headingMatch[1]);
    const hasSpaceAfter = lineText[markerIndex + headingMatch[1].length] === " ";
    const markerLength = headingMatch[1].length + (hasSpaceAfter ? 1 : 0);
    const from = lineFrom + markerIndex;
    const to = from + markerLength;
    markers.push({ id: "heading", from, to });
  }

  const listMatch = lineText.match(blockMarkerPattern.list);
  if (listMatch) {
    const markerIndex = lineText.indexOf(listMatch[1]);
    const markerText = listMatch[1];
    const from = lineFrom + markerIndex;
    const to = from + markerText.length;
    const listKind = /^\d+\.$/u.test(markerText) ? "ordered" : "bullet";
    markers.push({
      id: "list",
      from,
      to,
      listKind,
      rawText: markerText,
    });
  }

  const quotePrefix = lineText.match(blockMarkerPattern.quotePrefix)?.[0] ?? "";
  if (quotePrefix.includes(">")) {
    for (let i = 0; i < quotePrefix.length; i += 1) {
      if (quotePrefix[i] === ">") {
        const from = lineFrom + i;
        const nextChar = quotePrefix[i + 1];
        const to = nextChar === " " ? from + 2 : from + 1;
        markers.push({ id: "quote", from, to });
      }
    }
  }

  const fenceMarkers = fenceMarkersByLine.get(lineFrom);
  if (fenceMarkers) {
    markers.push(...fenceMarkers);
  }

  return markers;
}

function pushBlockMarkerDecoration(
  push: PushDecoration,
  marker: BlockMarker,
  state: BlockRawState,
  hiddenDecoration: Decoration,
  hiddenMarkerDecoration: Decoration
) {
  const config = blockMarkerConfigs.find((entry) => entry.id === marker.id);
  if (!config) {
    return;
  }

  const isRaw =
    isRawByTriggers(state, config.rawModeTrigger) ||
    (normalizeTriggers(config.rawModeTrigger).includes("nearby") &&
      isCursorNearRange(state.cursorHeads, marker.from, marker.to));
  const style: DisplayStyle = isRaw ? "none" : config.richDisplayStyle;

  if (marker.id === "list") {
    if (style === "none") {
      return;
    }
    if (!marker.listKind || !marker.rawText) {
      push(marker.from, marker.to, hiddenMarkerDecoration);
      return;
    }
    push(
      marker.from,
      marker.to,
      listMarkerDecoration(marker.listKind, marker.rawText)
    );
    return;
  }

  if (style === "hide") {
    if (marker.id === "heading" || marker.id === "quote") {
      push(marker.from, marker.to, hiddenMarkerDecoration);
      return;
    }
    push(marker.from, marker.to, hiddenDecoration);
    return;
  }
}

export function addBlockMarkerDecorations(
  push: PushDecoration,
  lineFrom: number,
  lineText: string,
  state: BlockRawState,
  hiddenDecoration: Decoration,
  hiddenMarkerDecoration: Decoration,
  fenceMarkersByLine: Map<number, BlockMarker[]>
) {
  const isTaskListLine = blockMarkerPattern.taskList.test(lineText);
  const markers = collectBlockMarkers(lineFrom, lineText, fenceMarkersByLine);
  for (const marker of markers) {
    if (isTaskListLine && marker.id === "list") {
      continue;
    }
    pushBlockMarkerDecoration(
      push,
      marker,
      state,
      hiddenDecoration,
      hiddenMarkerDecoration
    );
  }
}

function collectTaskCheckbox(
  lineFrom: number,
  lineText: string
): TaskCheckbox | null {
  const match = lineText.match(blockMarkerPattern.taskList);
  const marker = match?.[1];
  const token = match?.[2];
  if (!marker || !token || typeof match.index !== "number") {
    return null;
  }

  const fullMatch = match[0] ?? "";
  const markerOffset = fullMatch.indexOf(marker);
  const tokenOffset = fullMatch.indexOf(token, markerOffset + marker.length);
  if (markerOffset < 0 || tokenOffset < 0) {
    return null;
  }

  const markerFrom = lineFrom + match.index + markerOffset;
  const markerTo = markerFrom + marker.length;
  const tokenFrom = lineFrom + match.index + tokenOffset;
  const tokenTo = tokenFrom + token.length;
  return {
    markerFrom,
    markerTo,
    tokenFrom,
    tokenTo,
    checked: token[1].toLowerCase() === "x",
  };
}

function hasCursorInLine(state: EditorState, lineFrom: number): boolean {
  return state.selection.ranges.some(
    (range) => state.doc.lineAt(range.head).from === lineFrom
  );
}

function isCursorNearTaskToken(
  state: EditorState,
  checkbox: TaskCheckbox,
  lineFrom: number
): boolean {
  for (const range of state.selection.ranges) {
    if (range.from !== range.to) {
      continue;
    }

    const head = range.head;
    const line = state.doc.lineAt(head);
    if (line.from !== lineFrom) {
      continue;
    }

    if (head >= checkbox.markerFrom && head <= checkbox.tokenTo) {
      return true;
    }

    if (head < checkbox.markerFrom) {
      if (checkbox.markerFrom - head > 1) {
        continue;
      }
      const between = line.text.slice(
        head - line.from,
        checkbox.markerFrom - line.from
      );
      if (!/\s/u.test(between)) {
        return true;
      }
      continue;
    }

    if (head > checkbox.tokenTo) {
      if (head - checkbox.tokenTo > 1) {
        continue;
      }
      const between = line.text.slice(checkbox.tokenTo - line.from, head - line.from);
      if (!/\s/u.test(between)) {
        return true;
      }
    }
  }

  return false;
}

function shouldShowTaskCheckboxRaw(
  state: EditorState,
  checkbox: TaskCheckbox,
  lineFrom: number,
  selectionRanges: Range[]
): boolean {
  if (overlapsRange(checkbox.markerFrom, checkbox.tokenTo, selectionRanges)) {
    return true;
  }
  if (!hasCursorInLine(state, lineFrom)) {
    return false;
  }
  return isCursorNearTaskToken(state, checkbox, lineFrom);
}

export function addTaskCheckboxDecorations(
  state: EditorState,
  push: PushDecoration,
  lineFrom: number,
  lineText: string,
  selectionRanges: Range[]
) {
  const checkbox = collectTaskCheckbox(lineFrom, lineText);
  if (!checkbox) {
    return;
  }
  if (shouldShowTaskCheckboxRaw(state, checkbox, lineFrom, selectionRanges)) {
    return;
  }
  push(checkbox.markerFrom, checkbox.markerTo, Decoration.replace({ inclusive: false }));
  push(
    checkbox.tokenFrom,
    checkbox.tokenTo,
    taskCheckboxReplace(checkbox.checked, checkbox.tokenFrom, checkbox.tokenTo)
  );
}

export function collectFenceMarkersByLine(
  state: EditorState,
  selectionRanges: Range[],
  blockRevealRange: Range | null
): Map<number, BlockMarker[]> {
  const markersByLine = new Map<number, BlockMarker[]>();
  const cursorHeads = state.selection.ranges
    .filter((range) => range.from === range.to)
    .map((range) => range.head);

  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name !== "FencedCode") {
        return;
      }

      const isSelectionOverlap = selectionRanges.some(
        (range) => node.from < range.to && node.to > range.from
      );
      const isBlockReveal = blockRevealRange
        ? node.from < blockRevealRange.to && node.to > blockRevealRange.from
        : false;
      const style = isRawByTriggers(
        { isSelectionOverlap, cursorHeads, isBlockReveal },
        ["nearby", "block"]
      )
        ? "none"
        : "hide";

      if (style !== "hide") {
        return;
      }

      const startLine = state.doc.lineAt(node.from);
      const endLine = state.doc.lineAt(node.to);

      const startMarkers = markersByLine.get(startLine.from) ?? [];
      startMarkers.push({ id: "fence", from: startLine.from, to: startLine.to });
      markersByLine.set(startLine.from, startMarkers);

      const endMarkers = markersByLine.get(endLine.from) ?? [];
      endMarkers.push({ id: "fence", from: endLine.from, to: endLine.to });
      markersByLine.set(endLine.from, endMarkers);
    },
  });

  return markersByLine;
}
