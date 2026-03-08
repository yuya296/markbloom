import type { ImageBlockInfo } from "./imageBlocks";

type ImageBoundaryBlock = Pick<ImageBlockInfo, "replaceRange">;

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
