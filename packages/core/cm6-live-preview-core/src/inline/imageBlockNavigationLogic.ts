import type { ImageBlockInfo } from "./imageBlocks";

type ImageBoundaryBlock = Pick<ImageBlockInfo, "replaceRange">;
type PendingDirection = "up" | "down";

export function shouldMoveCursorToImageTop(
  prevHead: number,
  currentHead: number,
  block: ImageBoundaryBlock
): boolean {
  return prevHead < block.replaceRange.from && currentHead === block.replaceRange.to;
}

export function shouldMoveCursorPastImageBottom(
  prevHead: number,
  currentHead: number,
  block: ImageBoundaryBlock
): boolean {
  return (
    prevHead >= block.replaceRange.from &&
    prevHead < block.replaceRange.to &&
    currentHead === block.replaceRange.to
  );
}

export function resolveImageBlockAdjustedHead(
  prevHead: number,
  currentHead: number,
  block: ImageBoundaryBlock,
  pendingDirection: PendingDirection | null,
  wasRawModeAtStart: boolean
): number | null {
  if (pendingDirection !== "down") {
    return null;
  }
  // If navigation starts in raw mode, keep plain markdown cursor movement.
  if (wasRawModeAtStart) {
    return null;
  }
  if (shouldMoveCursorToImageTop(prevHead, currentHead, block)) {
    return block.replaceRange.from;
  }
  if (shouldMoveCursorPastImageBottom(prevHead, currentHead, block)) {
    return block.replaceRange.to + 1;
  }
  return null;
}
