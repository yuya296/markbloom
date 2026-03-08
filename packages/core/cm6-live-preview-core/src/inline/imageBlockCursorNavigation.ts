import { Annotation, StateField, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { inlineElementConfigs } from "../config";
import { NodeName } from "../core/syntaxNodeNames";
import { collectStandaloneImageBlocksFromState } from "./imageBlocks";
import {
  shouldMoveCursorPastImageBottom,
  shouldMoveCursorToImageTop,
} from "./imageBlockNavigationLogic";
import { isInlineRawByTriggers } from "./rawMode";

const imageCursorAdjusted = Annotation.define<boolean>();
const imageRawModeTrigger =
  inlineElementConfigs.find((config) => config.node === NodeName.Image)?.rawModeTrigger ??
  "nearby";

const imageBlockRangesField = StateField.define<
  readonly { replaceRange: { from: number; to: number } }[]
>({
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
  let pendingDirection: "up" | "down" | null = null;

  return [
    imageBlockRangesField,
    EditorView.domEventHandlers({
      keydown(event) {
        if (event.key === "ArrowUp") {
          pendingDirection = "up";
          return false;
        }
        if (event.key === "ArrowDown") {
          pendingDirection = "down";
          return false;
        }
        pendingDirection = null;
        return false;
      },
      keyup() {
        pendingDirection = null;
        return false;
      },
      blur() {
        pendingDirection = null;
        return false;
      },
    }),
    EditorView.updateListener.of((update) => {
      if (!update.selectionSet) {
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
      if (prevHead === currentHead) {
        pendingDirection = null;
        return;
      }

      const blocks = update.state.field(imageBlockRangesField);
      for (const block of blocks) {
        // Raw mode keeps markdown editable, so cursor should move naturally.
        if (isInlineRawByTriggers(update.state, block.replaceRange, imageRawModeTrigger)) {
          continue;
        }
        if (pendingDirection !== "down") {
          continue;
        }
        if (shouldMoveCursorToImageTop(prevHead, currentHead, block)) {
          pendingDirection = null;
          update.view.dispatch({
            selection: { anchor: block.replaceRange.from },
            annotations: imageCursorAdjusted.of(true),
            scrollIntoView: true,
          });
          return;
        }
        if (shouldMoveCursorPastImageBottom(prevHead, currentHead, block)) {
          const nextHead = Math.min(block.replaceRange.to + 1, update.state.doc.length);
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
      }

      pendingDirection = null;
    }),
  ];
}
