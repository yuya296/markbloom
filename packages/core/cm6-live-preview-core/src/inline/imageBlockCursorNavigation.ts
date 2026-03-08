import { Annotation, StateField, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { inlineElementConfigs } from "../config";
import { NodeName } from "../core/syntaxNodeNames";
import {
  collectStandaloneImageBlocksFromState,
  type ImageBlockInfo,
} from "./imageBlocks";
import {
  resolveImageBlockAdjustedHead,
} from "./imageBlockNavigationLogic";
import { isInlineRawByTriggers } from "./rawMode";

const imageCursorAdjusted = Annotation.define<boolean>();
const imageRawModeTrigger =
  inlineElementConfigs.find((config) => config.node === NodeName.Image)?.rawModeTrigger ??
  "nearby";

const imageBlockRangesField = StateField.define<readonly ImageBlockInfo[]>({
  create(state) {
    return collectStandaloneImageBlocksFromState(state);
  },
  update(value, tr) {
    if (!tr.docChanged && !tr.reconfigured) {
      return value;
    }
    return collectStandaloneImageBlocksFromState(tr.state);
  },
});

export function imageBlockCursorNavigation(): Extension {
  let pendingDirection: "down" | null = null;

  return [
    imageBlockRangesField,
    keymap.of([
      {
        key: "ArrowDown",
        run(view) {
          pendingDirection = "down";
          const selection = view.state.selection.main;
          if (
            view.state.selection.ranges.length !== 1 ||
            selection.from !== selection.to
          ) {
            return false;
          }
          const head = selection.head;
          const blocks = view.state.field(imageBlockRangesField);
          for (const block of blocks) {
            if (head !== block.replaceRange.to) {
              continue;
            }
            const wasRawModeAtStart = isInlineRawByTriggers(
              view.state,
              block.replaceRange,
              imageRawModeTrigger
            );
            const adjustedHead = resolveImageBlockAdjustedHead(
              head,
              head,
              block,
              "down",
              wasRawModeAtStart
            );
            if (adjustedHead === null || adjustedHead === head) {
              continue;
            }
            const nextHead = Math.min(adjustedHead, view.state.doc.length);
            pendingDirection = null;
            view.dispatch({
              selection: { anchor: nextHead },
              annotations: imageCursorAdjusted.of(true),
              scrollIntoView: true,
            });
            return true;
          }
          return false;
        },
      },
    ]),
    EditorView.updateListener.of((update) => {
      if (!update.selectionSet) {
        pendingDirection = null;
        return;
      }
      if (!pendingDirection) {
        return;
      }
      if (update.transactions.some((tr) => tr.annotation(imageCursorAdjusted))) {
        pendingDirection = null;
        return;
      }
      if (
        update.startState.selection.ranges.length !== 1 ||
        update.state.selection.ranges.length !== 1
      ) {
        pendingDirection = null;
        return;
      }

      const prevSelection = update.startState.selection.main;
      const currentSelection = update.state.selection.main;
      if (
        prevSelection.from !== prevSelection.to ||
        currentSelection.from !== currentSelection.to
      ) {
        pendingDirection = null;
        return;
      }

      const prevHead = prevSelection.head;
      const currentHead = currentSelection.head;
      const blocks = update.state.field(imageBlockRangesField);
      const isStuckAtImageBottomBoundary = blocks.some(
        (block) =>
          prevHead === block.replaceRange.to && currentHead === block.replaceRange.to
      );
      if (prevHead === currentHead && !isStuckAtImageBottomBoundary) {
        pendingDirection = null;
        return;
      }
      for (const block of blocks) {
        const wasRawModeAtStart = isInlineRawByTriggers(
          update.startState,
          block.replaceRange,
          imageRawModeTrigger
        );
        const adjustedHead = resolveImageBlockAdjustedHead(
          prevHead,
          currentHead,
          block,
          pendingDirection,
          wasRawModeAtStart
        );
        if (adjustedHead === null) {
          continue;
        }
        const nextHead = Math.min(adjustedHead, update.state.doc.length);
        if (nextHead === currentHead) {
          continue;
        }
        pendingDirection = null;
        update.view.dispatch({
          selection: { anchor: nextHead },
          annotations: imageCursorAdjusted.of(true),
          scrollIntoView: true,
        });
        return;
      }

      pendingDirection = null;
    }),
  ];
}
