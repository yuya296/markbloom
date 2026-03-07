export type RectLike = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export type BoxPosition = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type PointPosition = {
  left: number;
  top: number;
};

export function computeOutlineBox(
  wrapperRect: Pick<RectLike, "left" | "top">,
  startRect: Pick<RectLike, "left" | "top" | "right" | "bottom">,
  endRect: Pick<RectLike, "left" | "top" | "right" | "bottom">
): BoxPosition {
  const left = Math.min(startRect.left, endRect.left) - wrapperRect.left;
  const top = Math.min(startRect.top, endRect.top) - wrapperRect.top;
  const right = Math.max(startRect.right, endRect.right) - wrapperRect.left;
  const bottom = Math.max(startRect.bottom, endRect.bottom) - wrapperRect.top;

  return {
    left,
    top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

export function computeColumnHandlePosition(
  wrapperRect: Pick<RectLike, "left" | "top">,
  cellRect: Pick<RectLike, "left" | "top" | "width">,
  outsideOffset: number
): PointPosition {
  return {
    left: cellRect.left - wrapperRect.left + cellRect.width / 2,
    top: cellRect.top - wrapperRect.top - outsideOffset,
  };
}

export function computeRowHandlePosition(
  wrapperRect: Pick<RectLike, "left" | "top">,
  cellRect: Pick<RectLike, "left" | "top" | "height">,
  outsideOffset: number,
  visualOffsetY: number
): PointPosition {
  return {
    left: cellRect.left - wrapperRect.left - outsideOffset,
    top: cellRect.top - wrapperRect.top + cellRect.height / 2 + visualOffsetY,
  };
}
