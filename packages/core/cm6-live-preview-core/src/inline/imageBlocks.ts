import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { Range } from "../core/types";
import { NodeName } from "../core/syntaxNodeNames";
import { parseMarkdownImageLiteral } from "./imageLiteral";

export type ImageBlockInfo = {
  replaceRange: Range;
};

function isStandaloneImageLine(
  state: EditorState,
  imageRange: Range
): boolean {
  const startLine = state.doc.lineAt(imageRange.from);
  const endLine = state.doc.lineAt(imageRange.to);
  if (startLine.number !== endLine.number) {
    return false;
  }

  const fromOffset = imageRange.from - startLine.from;
  const toOffset = imageRange.to - startLine.from;
  const before = startLine.text.slice(0, fromOffset);
  const after = startLine.text.slice(toOffset);
  return before.trim().length === 0 && after.trim().length === 0;
}

export function collectStandaloneImageBlocksFromState(
  state: EditorState
): ImageBlockInfo[] {
  const blocks: ImageBlockInfo[] = [];

  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name !== NodeName.Image) {
        return;
      }
      const replaceRange = { from: node.from, to: node.to };
      const literal = state.doc.sliceString(node.from, node.to);
      if (!parseMarkdownImageLiteral(literal)) {
        return;
      }
      if (!isStandaloneImageLine(state, replaceRange)) {
        return;
      }
      blocks.push({ replaceRange });
    },
  });

  return blocks;
}
