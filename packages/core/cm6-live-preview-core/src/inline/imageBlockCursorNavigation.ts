import { Annotation, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { collectStandaloneImageBlocksFromState } from "./imageBlocks";
import {
  shouldMoveCursorPastImageBottom,
  shouldMoveCursorToImageTop,
} from "./imageBlockNavigationLogic";

const imageCursorAdjusted = Annotation.define<boolean>();

export function imageBlockCursorNavigation(): Extension {
  return EditorView.updateListener.of((update) => {
    if (!update.selectionSet) {
      return;
    }
    if (update.transactions.some((tr) => tr.annotation(imageCursorAdjusted))) {
      return;
    }

    const prevSelection = update.startState.selection.main;
    const currentSelection = update.state.selection.main;
    if (
      prevSelection.from !== prevSelection.to ||
      currentSelection.from !== currentSelection.to
    ) {
      return;
    }

    const prevHead = prevSelection.head;
    const currentHead = currentSelection.head;
    if (prevHead === currentHead) {
      return;
    }

    const blocks = collectStandaloneImageBlocksFromState(update.state);
    for (const block of blocks) {
      if (shouldMoveCursorToImageTop(prevHead, currentHead, block)) {
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
        update.view.dispatch({
          selection: { anchor: nextHead },
          annotations: imageCursorAdjusted.of(true),
          scrollIntoView: true,
        });
        return;
      }
    }
  });
}
