import { syntaxTree } from "@codemirror/language";
import {
  Annotation,
  Prec,
  RangeSetBuilder,
  StateField,
  type EditorState,
  type Extension,
  type TransactionSpec,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  WidgetType,
  keymap,
} from "@codemirror/view";
import type { TableAlignment, TableData } from "./types";
import {
  cloneTableData,
  deleteColumnAt,
  deleteRowAt,
  ensureHeader,
  getColumnCount,
  insertColumnAt,
  insertRowAt,
  reorderColumns,
  reorderRows,
  normalizeTableData,
} from "./tableModel";
import {
  buildTableCommitChange,
  clampCellSelection,
  getTableCellText,
  setTableCellText,
} from "./tableEditing";
import {
  computeColumnHandlePosition,
  computeOutlineBox,
  computeRowHandlePosition,
} from "./tableLayout";
import {
  toDisplayText,
  toMarkdownText,
} from "./tableMarkdown";
import {
  collectTableBoundaries,
  collectTableData,
  collectTableLines,
  createTableKey,
  isLikelyTableBoundaryCandidateLine,
  type TableBoundaryInfo,
} from "./tableDetection";

export type { TableAlignment, TableData };

export type TableEditorOptions = {
  enabled?: boolean;
  renderMode?: "widget" | "none";
};

type TableInfo = {
  key: string;
  from: number;
  to: number;
  startLineFrom: number;
  endLineTo: number;
  startLineNumber: number;
  endLineNumber: number;
};

type CellSelection = {
  kind: "cell";
  row: number;
  col: number;
};

type RowSelection = {
  kind: "row";
  row: number;
};

type ColumnSelection = {
  kind: "column";
  col: number;
};

type SelectionState = CellSelection | RowSelection | ColumnSelection;

type MenuState =
  | {
      kind: "row" | "column";
      index: number;
    }
  | null;

type RowDropMarker =
  | {
      rowIndex: number;
      side: "before" | "after";
    }
  | null;

type ColumnDropMarker =
  | {
      colIndex: number;
      side: "before" | "after";
    }
  | null;

type FocusCellRequest = {
  row: number;
  col: number;
};

const tableEditAnnotation = Annotation.define<boolean>();
const focusCellRequestEvent = "cm6-table-focus-cell-request";
const defaultOptions: Required<TableEditorOptions> = {
  enabled: true,
  renderMode: "widget",
};

function tableDataSignature(data: TableData): string {
  const cols = getColumnCount(data);
  const header = data.header?.cells.map((cell) => cell.text).join("\u001f") ?? "";
  const rows = data.rows
    .map((row) => row.cells.map((cell) => cell.text).join("\u001f"))
    .join("\u001e");
  const alignments = data.alignments.map((value) => value ?? "").join("\u001f");
  return `${header}\u001d${rows}\u001d${alignments}\u001d${cols}`;
}

const toCssTextAlign = (alignment: TableAlignment | null) => {
  switch (alignment) {
    case "center":
      return "center";
    case "right":
      return "right";
    default:
      return "left";
  }
};

// cm-widget-measure: static
class TableWidget extends WidgetType {
  private readonly abortController = new AbortController();
  private readonly signature: string;
  private static readonly selectionByView = new WeakMap<
    EditorView,
    Map<string, SelectionState>
  >();
  private static readonly focusRestoreGenerationByView = new WeakMap<EditorView, number>();
  private static readonly rowHandleOutsideOffset = 10;
  private static readonly colHandleOutsideOffset = 9;
  private static readonly rowHandleVisualOffsetY = -1;

  private static selectionMapForView(view: EditorView): Map<string, SelectionState> {
    let selectionMap = TableWidget.selectionByView.get(view);
    if (!selectionMap) {
      selectionMap = new Map<string, SelectionState>();
      TableWidget.selectionByView.set(view, selectionMap);
    }
    return selectionMap;
  }

  private static getFocusRestoreGeneration(view: EditorView): number {
    return TableWidget.focusRestoreGenerationByView.get(view) ?? 0;
  }

  private static bumpFocusRestoreGeneration(view: EditorView): number {
    const next = TableWidget.getFocusRestoreGeneration(view) + 1;
    TableWidget.focusRestoreGenerationByView.set(view, next);
    return next;
  }

  private static createDragIndicatorIcon(): SVGElement {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.classList.add("cm-table-handle-icon");

    const path = document.createElementNS(ns, "path");
    path.setAttribute(
      "d",
      "M11 18c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm8 16c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"
    );

    svg.appendChild(path);
    return svg;
  }

  constructor(private readonly data: TableData, private readonly tableInfo: TableInfo) {
    super();
    this.signature = tableDataSignature(data);
  }

  eq(other: TableWidget): boolean {
    return (
      this.tableInfo.key === other.tableInfo.key &&
      this.signature === other.signature
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-table-editor cm6-table-editor";
    wrapper.dataset.tableId = this.tableInfo.key;
    wrapper.dataset.mode = "nav";
    wrapper.tabIndex = 0;

    const scrollArea = document.createElement("div");
    scrollArea.className = "cm-table-scroll";

    const table = document.createElement("table");
    table.className = "cm-table";
    scrollArea.appendChild(table);

    const menu = document.createElement("div");
    menu.className = "cm-table-context-menu";

    const editor = document.createElement("textarea");
    editor.className = "cm-table-overlay-input";
    editor.dataset.open = "false";
    editor.rows = 1;

    const selectionOutline = document.createElement("div");
    selectionOutline.className = "cm-table-selection-outline";
    selectionOutline.dataset.open = "false";

    const handleLayer = document.createElement("div");
    handleLayer.className = "cm-table-handle-layer";

    wrapper.appendChild(scrollArea);
    wrapper.appendChild(selectionOutline);
    wrapper.appendChild(handleLayer);
    wrapper.appendChild(menu);
    wrapper.appendChild(editor);

    const data = cloneTableData(this.data);
    normalizeTableData(data);
    const columnCount = Math.max(1, getColumnCount(data));
    ensureHeader(data, columnCount);

    const signal = this.abortController.signal;
    const baseHandleTransform = "translate(-50%, -50%)";
    const activeHandleTransform = `${baseHandleTransform} scale(1.35)`;
    const colHandleBaseColor =
      "color-mix(in srgb, var(--editor-secondary-color, #5f6368) 76%, var(--editor-surface, var(--editor-bg, #fff)))";
    const colHandleHoverColor =
      "color-mix(in srgb, var(--editor-primary-color, #1a73e8) 88%, var(--editor-secondary-color, #5f6368))";
    const rowHandleBaseColor =
      "color-mix(in srgb, var(--editor-secondary-color, #5f6368) 76%, var(--editor-surface, var(--editor-bg, #fff)))";
    const rowHandleHoverColor =
      "color-mix(in srgb, var(--editor-primary-color, #1a73e8) 88%, var(--editor-secondary-color, #5f6368))";
    const cellElements: HTMLTableCellElement[][] = [];
    const contentElements: HTMLDivElement[][] = [];
    const bodyRowElements: HTMLTableRowElement[] = [];
    const rowHandleButtons: HTMLButtonElement[] = [];
    const columnHandleButtons: HTMLButtonElement[] = [];

    let selection: SelectionState | null = null;
    let menuState: MenuState = null;
    let isEditing = false;
    let isComposing = false;
    let hoveredRow: number | null = null;
    let hoveredCol: number | null = null;
    let draggingRowIndex: number | null = null;
    let rowDropMarker: RowDropMarker = null;
    let draggingRowPointerId: number | null = null;
    let draggingRowHandle: HTMLButtonElement | null = null;
    let draggingColIndex: number | null = null;
    let colDropMarker: ColumnDropMarker = null;
    let draggingColPointerId: number | null = null;
    let draggingColHandle: HTMLButtonElement | null = null;

    const getTotalRows = () => data.rows.length + 1;
    const cancelPendingFocusRestore = () => {
      TableWidget.bumpFocusRestoreGeneration(view);
    };

    const clampCell = (nextRow: number, nextCol: number): CellSelection => {
      return {
        kind: "cell",
        ...clampCellSelection(nextRow, nextCol, getTotalRows(), columnCount),
      };
    };

    const getCellText = (cell: CellSelection): string => getTableCellText(data, cell);

    const setCellText = (cell: CellSelection, value: string) => {
      setTableCellText(data, cell, value);
    };

    const updateCellDisplay = (cell: CellSelection) => {
      const content = contentElements[cell.row]?.[cell.col];
      const cellElement = cellElements[cell.row]?.[cell.col];
      if (!content || !cellElement) {
        return;
      }
      const raw = getCellText(cell);
      content.textContent = toDisplayText(raw);
      const alignment = data.alignments[cell.col] ?? null;
      cellElement.style.textAlign = toCssTextAlign(alignment);
    };

    const dispatchCommit = () => {
      const changes = buildTableCommitChange(
        view.state,
        data,
        this.tableInfo.startLineNumber,
        this.tableInfo.endLineNumber
      );
      dispatchOutsideUpdate(view, {
        changes,
        annotations: tableEditAnnotation.of(true),
      });
    };

    const closeMenu = () => {
      menu.innerHTML = "";
      menu.dataset.open = "false";
      menuState = null;
    };

    const setHoveredRow = (next: number | null) => {
      if (hoveredRow === next) {
        return;
      }
      hoveredRow = next;
      rowHandleButtons.forEach((button, rowIndex) => {
        if (hoveredRow === rowIndex) {
          button.dataset.visible = "true";
        } else {
          button.removeAttribute("data-visible");
        }
      });
    };

    const setHoveredCol = (next: number | null) => {
      if (hoveredCol === next) {
        return;
      }
      hoveredCol = next;
      columnHandleButtons.forEach((button, colIndex) => {
        if (hoveredCol === colIndex) {
          button.dataset.visible = "true";
        } else {
          button.removeAttribute("data-visible");
        }
      });
    };

    const clearHoveredHandles = () => {
      setHoveredRow(null);
      setHoveredCol(null);
      rowHandleButtons.forEach((button) => {
        button.removeAttribute("data-hovered");
        button.style.transform = baseHandleTransform;
        button.style.color = rowHandleBaseColor;
      });
      columnHandleButtons.forEach((button) => {
        button.removeAttribute("data-hovered");
        button.style.transform = baseHandleTransform;
        button.style.color = colHandleBaseColor;
      });
    };

    const applyHoveredCell = (cell: HTMLTableCellElement | null) => {
      if (!cell) {
        clearHoveredHandles();
        return;
      }
      const row = Number(cell.dataset.row);
      const col = Number(cell.dataset.col);
      if (!Number.isFinite(row) || !Number.isFinite(col)) {
        clearHoveredHandles();
        return;
      }
      setHoveredCol(col);
      setHoveredRow(row > 0 ? row - 1 : null);
    };

    const bindCellHover = (cell: HTMLTableCellElement) => {
      cell.addEventListener(
        "pointerenter",
        () => {
          applyHoveredCell(cell);
        },
        { signal, passive: true }
      );
      cell.addEventListener(
        "mouseenter",
        () => {
          applyHoveredCell(cell);
        },
        { signal, passive: true }
      );
    };

    const isHandleElement = (node: unknown) =>
      node instanceof Element &&
      !!node.closest(".cm-table-col-handle, .cm-table-row-handle");

    const findHoveredCellInEvent = (
      event: PointerEvent | MouseEvent
    ): HTMLTableCellElement | null => {
      const path = event.composedPath();
      for (const node of path) {
        if (isHandleElement(node)) {
          return null;
        }
        if (!(node instanceof Element)) {
          continue;
        }
        const cell = node.closest<HTMLTableCellElement>(".cm-table-cell");
        if (cell) {
          return cell;
        }
      }
      return null;
    };

    const updateRangeOutline = () => {
      selectionOutline.dataset.open = "false";
      if (!selection || selection.kind === "cell") {
        return;
      }

      const startCell =
        selection.kind === "row"
          ? cellElements[selection.row + 1]?.[0]
          : cellElements[0]?.[selection.col];
      const endCell =
        selection.kind === "row"
          ? cellElements[selection.row + 1]?.[columnCount - 1]
          : cellElements[getTotalRows() - 1]?.[selection.col];

      if (!startCell || !endCell) {
        return;
      }

      const wrapperRect = wrapper.getBoundingClientRect();
      const startRect = startCell.getBoundingClientRect();
      const endRect = endCell.getBoundingClientRect();
      const box = computeOutlineBox(wrapperRect, startRect, endRect);

      selectionOutline.style.left = `${box.left}px`;
      selectionOutline.style.top = `${box.top}px`;
      selectionOutline.style.width = `${box.width}px`;
      selectionOutline.style.height = `${box.height}px`;
      selectionOutline.dataset.open = "true";
    };

    const updateHandlePositions = () => {
      const wrapperRect = wrapper.getBoundingClientRect();
      columnHandleButtons.forEach((button, col) => {
        const cell = cellElements[0]?.[col];
        if (!cell) {
          button.style.left = "-9999px";
          button.style.top = "-9999px";
          return;
        }
        const rect = cell.getBoundingClientRect();
        const position = computeColumnHandlePosition(
          wrapperRect,
          rect,
          TableWidget.colHandleOutsideOffset
        );
        button.style.left = `${position.left}px`;
        button.style.top = `${position.top}px`;
      });

      rowHandleButtons.forEach((button, row) => {
        const cell = cellElements[row + 1]?.[0];
        if (!cell) {
          button.style.left = "-9999px";
          button.style.top = "-9999px";
          return;
        }
        const rect = cell.getBoundingClientRect();
        const position = computeRowHandlePosition(
          wrapperRect,
          rect,
          TableWidget.rowHandleOutsideOffset,
          TableWidget.rowHandleVisualOffsetY
        );
        button.style.left = `${position.left}px`;
        button.style.top = `${position.top}px`;
      });
    };

    const clearRowDropMarker = () => {
      rowDropMarker = null;
      bodyRowElements.forEach((rowElement) => {
        rowElement.classList.remove("cm-table-row-drop-before", "cm-table-row-drop-after");
      });
    };

    const clearColDropMarker = () => {
      colDropMarker = null;
      for (let row = 0; row < getTotalRows(); row += 1) {
        for (let col = 0; col < columnCount; col += 1) {
          const cell = cellElements[row]?.[col];
          if (!cell) {
            continue;
          }
          cell.classList.remove("cm-table-column-drop-before", "cm-table-column-drop-after");
        }
      }
    };

    const setRowDropMarker = (rowIndex: number, side: "before" | "after") => {
      if (
        rowDropMarker &&
        rowDropMarker.rowIndex === rowIndex &&
        rowDropMarker.side === side
      ) {
        return;
      }
      clearRowDropMarker();
      const rowElement = bodyRowElements[rowIndex];
      if (!rowElement) {
        return;
      }
      rowElement.classList.add(
        side === "before" ? "cm-table-row-drop-before" : "cm-table-row-drop-after"
      );
      rowDropMarker = { rowIndex, side };
    };

    const setColDropMarker = (colIndex: number, side: "before" | "after") => {
      if (colDropMarker && colDropMarker.colIndex === colIndex && colDropMarker.side === side) {
        return;
      }
      clearColDropMarker();
      for (let row = 0; row < getTotalRows(); row += 1) {
        const cell = cellElements[row]?.[colIndex];
        if (!cell) {
          continue;
        }
        cell.classList.add(
          side === "before" ? "cm-table-column-drop-before" : "cm-table-column-drop-after"
        );
      }
      colDropMarker = { colIndex, side };
    };

    const remapRowIndex = (
      sourceIndex: number,
      targetInsertIndex: number,
      index: number
    ): number => {
      const clampedSource = Math.max(0, Math.min(sourceIndex, data.rows.length - 1));
      const clampedIndex = Math.max(0, Math.min(index, data.rows.length - 1));
      let finalInsert = Math.max(0, Math.min(targetInsertIndex, data.rows.length));
      if (clampedSource < finalInsert) {
        finalInsert -= 1;
      }
      if (clampedIndex === clampedSource) {
        return finalInsert;
      }
      if (clampedSource < finalInsert) {
        return clampedIndex > clampedSource && clampedIndex <= finalInsert
          ? clampedIndex - 1
          : clampedIndex;
      }
      return clampedIndex >= finalInsert && clampedIndex < clampedSource
        ? clampedIndex + 1
        : clampedIndex;
    };

    const remapSelectionForRowReorder = (
      current: SelectionState | null,
      sourceIndex: number,
      targetInsertIndex: number
    ): SelectionState | null => {
      if (!current) {
        return null;
      }
      if (current.kind === "row") {
        return {
          kind: "row",
          row: remapRowIndex(sourceIndex, targetInsertIndex, current.row),
        };
      }
      if (current.kind === "cell") {
        if (current.row === 0) {
          return current;
        }
        const bodyRowIndex = current.row - 1;
        return {
          kind: "cell",
          row: remapRowIndex(sourceIndex, targetInsertIndex, bodyRowIndex) + 1,
          col: current.col,
        };
      }
      return current;
    };

    const remapColIndex = (
      sourceIndex: number,
      targetInsertIndex: number,
      index: number
    ): number => {
      const clampedSource = Math.max(0, Math.min(sourceIndex, columnCount - 1));
      const clampedIndex = Math.max(0, Math.min(index, columnCount - 1));
      let finalInsert = Math.max(0, Math.min(targetInsertIndex, columnCount));
      if (clampedSource < finalInsert) {
        finalInsert -= 1;
      }
      if (clampedIndex === clampedSource) {
        return finalInsert;
      }
      if (clampedSource < finalInsert) {
        return clampedIndex > clampedSource && clampedIndex <= finalInsert
          ? clampedIndex - 1
          : clampedIndex;
      }
      return clampedIndex >= finalInsert && clampedIndex < clampedSource
        ? clampedIndex + 1
        : clampedIndex;
    };

    const remapSelectionForColReorder = (
      current: SelectionState | null,
      sourceIndex: number,
      targetInsertIndex: number
    ): SelectionState | null => {
      if (!current) {
        return null;
      }
      if (current.kind === "column") {
        return {
          kind: "column",
          col: remapColIndex(sourceIndex, targetInsertIndex, current.col),
        };
      }
      if (current.kind === "cell") {
        return {
          kind: "cell",
          row: current.row,
          col: remapColIndex(sourceIndex, targetInsertIndex, current.col),
        };
      }
      return current;
    };

    const commitRowDrop = (sourceIndex: number, marker: RowDropMarker) => {
      if (!marker) {
        return;
      }
      const targetInsertIndex =
        marker.side === "before" ? marker.rowIndex : marker.rowIndex + 1;
      if (targetInsertIndex === sourceIndex || targetInsertIndex === sourceIndex + 1) {
        return;
      }
      reorderRows(data, sourceIndex, targetInsertIndex);
      const remappedSelection = remapSelectionForRowReorder(
        selection,
        sourceIndex,
        targetInsertIndex
      );
      selection = remappedSelection;
      if (remappedSelection) {
        TableWidget.selectionMapForView(view).set(this.tableInfo.key, remappedSelection);
      } else {
        TableWidget.selectionMapForView(view).delete(this.tableInfo.key);
      }
      dispatchCommit();
    };

    const commitColDrop = (sourceIndex: number, marker: ColumnDropMarker) => {
      if (!marker) {
        return;
      }
      const targetInsertIndex =
        marker.side === "before" ? marker.colIndex : marker.colIndex + 1;
      if (targetInsertIndex === sourceIndex || targetInsertIndex === sourceIndex + 1) {
        return;
      }
      reorderColumns(data, sourceIndex, targetInsertIndex);
      const remappedSelection = remapSelectionForColReorder(
        selection,
        sourceIndex,
        targetInsertIndex
      );
      selection = remappedSelection;
      if (remappedSelection) {
        TableWidget.selectionMapForView(view).set(this.tableInfo.key, remappedSelection);
      } else {
        TableWidget.selectionMapForView(view).delete(this.tableInfo.key);
      }
      dispatchCommit();
    };

    const finishRowDrag = () => {
      const activePointerId = draggingRowPointerId;
      draggingRowIndex = null;
      if (
        draggingRowHandle &&
        activePointerId !== null &&
        typeof draggingRowHandle.hasPointerCapture === "function" &&
        draggingRowHandle.hasPointerCapture(activePointerId)
      ) {
        try {
          draggingRowHandle.releasePointerCapture(activePointerId);
        } catch {
          // no-op
        }
      }
      draggingRowPointerId = null;
      draggingRowHandle = null;
      wrapper.removeAttribute("data-row-dragging");
      rowHandleButtons.forEach((button) => {
        button.removeAttribute("data-dragging");
        button.removeAttribute("data-hovered");
        button.style.transform = baseHandleTransform;
        button.style.color = rowHandleBaseColor;
      });
      clearRowDropMarker();
    };

    const finishColDrag = () => {
      const activePointerId = draggingColPointerId;
      draggingColIndex = null;
      if (
        draggingColHandle &&
        activePointerId !== null &&
        typeof draggingColHandle.hasPointerCapture === "function" &&
        draggingColHandle.hasPointerCapture(activePointerId)
      ) {
        try {
          draggingColHandle.releasePointerCapture(activePointerId);
        } catch {
          // no-op
        }
      }
      draggingColPointerId = null;
      draggingColHandle = null;
      wrapper.removeAttribute("data-col-dragging");
      columnHandleButtons.forEach((button) => {
        button.removeAttribute("data-dragging");
        button.removeAttribute("data-hovered");
        button.style.transform = baseHandleTransform;
        button.style.color = colHandleBaseColor;
      });
      clearColDropMarker();
    };

    const findBodyRowFromPoint = (clientX: number, clientY: number): number | null => {
      const target = document.elementFromPoint(clientX, clientY);
      if (!(target instanceof Element)) {
        return null;
      }
      const cell = target.closest<HTMLTableCellElement>(".cm-table-cell");
      if (cell) {
        const row = Number(cell.dataset.row);
        if (Number.isFinite(row) && row > 0) {
          return row - 1;
        }
        return null;
      }
      const rowElement = target.closest<HTMLTableRowElement>(".cm-table-body-row");
      if (rowElement) {
        const rowIndex = Number(rowElement.dataset.bodyRowIndex);
        return Number.isFinite(rowIndex) ? rowIndex : null;
      }
      return null;
    };

    const findColFromPoint = (clientX: number, clientY: number): number | null => {
      const target = document.elementFromPoint(clientX, clientY);
      if (!(target instanceof Element)) {
        return null;
      }
      const handle = target.closest<HTMLButtonElement>(".cm-table-col-handle");
      if (handle) {
        const handleCol = Number(handle.dataset.colIndex);
        if (Number.isFinite(handleCol)) {
          return handleCol;
        }
      }
      const cell = target.closest<HTMLTableCellElement>(".cm-table-cell");
      if (cell) {
        const col = Number(cell.dataset.col);
        return Number.isFinite(col) ? col : null;
      }
      return null;
    };

    const handleRowDragMove = (event: PointerEvent) => {
      if (draggingRowIndex == null || draggingRowPointerId !== event.pointerId) {
        return;
      }
      event.preventDefault();
      const rowIndex = findBodyRowFromPoint(event.clientX, event.clientY);
      if (rowIndex == null) {
        clearRowDropMarker();
        return;
      }
      const rowElement = bodyRowElements[rowIndex];
      if (!rowElement) {
        clearRowDropMarker();
        return;
      }
      const rect = rowElement.getBoundingClientRect();
      const side = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
      setRowDropMarker(rowIndex, side);
    };

    const handleRowDragEnd = (event: PointerEvent) => {
      if (draggingRowIndex == null || draggingRowPointerId !== event.pointerId) {
        return;
      }
      event.preventDefault();
      if (rowDropMarker) {
        commitRowDrop(draggingRowIndex, rowDropMarker);
      }
      finishRowDrag();
    };

    const handleColDragMove = (event: PointerEvent) => {
      if (draggingColIndex == null || draggingColPointerId !== event.pointerId) {
        return;
      }
      event.preventDefault();
      const colIndex = findColFromPoint(event.clientX, event.clientY);
      if (colIndex == null) {
        clearColDropMarker();
        return;
      }
      const cell = cellElements[0]?.[colIndex];
      if (!cell) {
        clearColDropMarker();
        return;
      }
      const rect = cell.getBoundingClientRect();
      const side = event.clientX < rect.left + rect.width / 2 ? "before" : "after";
      setColDropMarker(colIndex, side);
    };

    const handleColDragEnd = (event: PointerEvent) => {
      if (draggingColIndex == null || draggingColPointerId !== event.pointerId) {
        return;
      }
      event.preventDefault();
      if (colDropMarker) {
        commitColDrop(draggingColIndex, colDropMarker);
      }
      finishColDrag();
    };

    const applySelectionClasses = () => {
      cellElements.forEach((rowCells) => {
        rowCells.forEach((cell) => {
          cell.classList.remove(
            "cm-table-cell-selected",
            "cm-table-row-selected",
            "cm-table-column-selected"
          );
        });
      });
      rowHandleButtons.forEach((button) => button.removeAttribute("data-selected"));
      columnHandleButtons.forEach((button) => button.removeAttribute("data-selected"));

      if (!selection) {
        wrapper.removeAttribute("data-selection");
        updateRangeOutline();
        return;
      }

      wrapper.dataset.selection = selection.kind;
      if (selection.kind === "cell") {
        cellElements[selection.row]?.[selection.col]?.classList.add("cm-table-cell-selected");
        updateRangeOutline();
        return;
      }
      if (selection.kind === "row") {
        const tableRowIndex = selection.row + 1;
        cellElements[tableRowIndex]?.forEach((cell) =>
          cell.classList.add("cm-table-row-selected")
        );
        rowHandleButtons[selection.row]?.setAttribute("data-selected", "true");
        updateRangeOutline();
        return;
      }
      for (let row = 0; row < getTotalRows(); row += 1) {
        cellElements[row]?.[selection.col]?.classList.add("cm-table-column-selected");
      }
      columnHandleButtons[selection.col]?.setAttribute("data-selected", "true");
      updateRangeOutline();
    };

    const setSelection = (next: SelectionState, focusWrapper = true) => {
      selection = next;
      TableWidget.selectionMapForView(view).set(this.tableInfo.key, next);
      applySelectionClasses();
      if (focusWrapper && !isEditing) {
        wrapper.focus({ preventScroll: true });
      }
    };

    const ensureCellSelection = (): CellSelection => {
      if (!selection) {
        const fallbackRow = data.rows.length > 0 ? 1 : 0;
        const next = clampCell(fallbackRow, 0);
        setSelection(next, false);
        return next;
      }
      if (selection.kind === "cell") {
        return clampCell(selection.row, selection.col);
      }
      if (selection.kind === "row") {
        return clampCell(selection.row + 1, 0);
      }
      return clampCell(data.rows.length > 0 ? 1 : 0, selection.col);
    };

    const positionEditor = (cell: CellSelection) => {
      const anchor = cellElements[cell.row]?.[cell.col];
      if (!anchor) {
        return;
      }
      const anchorRect = anchor.getBoundingClientRect();
      const wrapperRect = wrapper.getBoundingClientRect();
      const padding = 1;
      editor.style.left = `${anchorRect.left - wrapperRect.left + padding}px`;
      editor.style.top = `${anchorRect.top - wrapperRect.top + padding}px`;
      editor.style.width = `${Math.max(48, anchorRect.width - padding * 2)}px`;
      editor.style.height = `${Math.max(26, anchorRect.height - padding * 2)}px`;
      editor.style.textAlign = toCssTextAlign(data.alignments[cell.col] ?? null);
    };

    const restoreTableFocusAfterCommit = (targetCell: CellSelection) => {
      const generation = TableWidget.bumpFocusRestoreGeneration(view);
      const tryRestore = (attempt: number) => {
        if (generation !== TableWidget.getFocusRestoreGeneration(view)) {
          return;
        }
        const boundaries = collectTableBoundaries(view.state);
        const preferredLine = Math.min(
          Math.max(this.tableInfo.startLineNumber, 1),
          view.state.doc.lines
        );
        const boundary =
          boundaries.find((table) => table.startLineNumber === preferredLine) ??
          boundaries.find(
            (table) =>
              preferredLine >= table.startLineNumber &&
              preferredLine <= table.endLineNumber
          );
        if (!boundary) {
          if (attempt < 4) {
            requestAnimationFrame(() => tryRestore(attempt + 1));
            return;
          }
          view.focus();
          return;
        }
        const wrapperEl = view.dom.querySelector<HTMLElement>(
          `.cm6-table-editor[data-table-id="${boundary.key}"]`
        );
        if (!wrapperEl) {
          if (attempt < 4) {
            requestAnimationFrame(() => tryRestore(attempt + 1));
            return;
          }
          view.focus();
          return;
        }
        const row = Math.min(Math.max(targetCell.row, 0), boundary.totalRows - 1);
        wrapperEl.dispatchEvent(
          new CustomEvent<FocusCellRequest>(focusCellRequestEvent, {
            detail: { row, col: targetCell.col },
          })
        );
      };
      requestAnimationFrame(() => tryRestore(0));
    };

    const stopEditing = (commit: boolean, nextSelection: CellSelection | null = null) => {
      if (!isEditing) {
        return;
      }
      const current = selection && selection.kind === "cell" ? selection : null;
      let restoreFocusOnCurrentWrapper = true;
      if (commit && current) {
        setCellText(current, toMarkdownText(editor.value));
        updateCellDisplay(current);
        dispatchCommit();
        restoreTableFocusAfterCommit(nextSelection ?? current);
        restoreFocusOnCurrentWrapper = false;
      }
      isEditing = false;
      wrapper.dataset.mode = "nav";
      editor.dataset.open = "false";
      editor.style.left = "-9999px";
      editor.style.top = "-9999px";
      if (nextSelection) {
        setSelection(nextSelection, false);
      }
      if (restoreFocusOnCurrentWrapper) {
        wrapper.focus({ preventScroll: true });
      }
    };

    const startEditing = (cell: CellSelection) => {
      cancelPendingFocusRestore();
      closeMenu();
      setSelection(cell, false);
      isEditing = true;
      wrapper.dataset.mode = "edit";
      editor.dataset.open = "true";
      const modelValue = toDisplayText(getCellText(cell));
      const displayedValue = contentElements[cell.row]?.[cell.col]?.textContent ?? "";
      editor.value = modelValue.length > 0 ? modelValue : displayedValue;
      positionEditor(cell);
      requestAnimationFrame(() => {
        editor.focus({ preventScroll: true });
        const len = editor.value.length;
        editor.setSelectionRange(len, len);
      });
    };

    const openContextMenu = (
      kind: "row" | "column",
      index: number,
      clientX: number,
      clientY: number
    ) => {
      closeMenu();
      const items =
        kind === "row"
          ? [
              { label: "Insert row above", action: () => insertRowAt(data, index) },
              { label: "Insert row below", action: () => insertRowAt(data, index + 1) },
              { label: "Delete row", action: () => deleteRowAt(data, index) },
            ]
          : [
              { label: "Insert column left", action: () => insertColumnAt(data, index) },
              { label: "Insert column right", action: () => insertColumnAt(data, index + 1) },
              { label: "Delete column", action: () => deleteColumnAt(data, index) },
            ];

      items.forEach((item) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "cm-table-context-menu-item";
        button.textContent = item.label;
        button.addEventListener(
          "click",
          (event) => {
            event.preventDefault();
            event.stopPropagation();
            item.action();
            closeMenu();
            dispatchCommit();
          },
          { signal }
        );
        menu.appendChild(button);
      });

      const rect = wrapper.getBoundingClientRect();
      menu.style.left = `${clientX - rect.left}px`;
      menu.style.top = `${clientY - rect.top}px`;
      menu.dataset.open = "true";
      menuState = { kind, index };
    };

    const isSelectedContextTarget = (cell: CellSelection) => {
      if (!selection) {
        return null;
      }
      if (selection.kind === "row" && cell.row > 0 && cell.row - 1 === selection.row) {
        return { kind: "row" as const, index: selection.row };
      }
      if (selection.kind === "column" && cell.col === selection.col) {
        return { kind: "column" as const, index: selection.col };
      }
      return null;
    };

    const thead = document.createElement("thead");
    const headerTr = document.createElement("tr");
    headerTr.className = "cm-table-row cm-table-row-header";
    const headerRowCells: HTMLTableCellElement[] = [];
    const headerRowContents: HTMLDivElement[] = [];

    for (let col = 0; col < columnCount; col += 1) {
      const th = document.createElement("th");
      th.className = "cm-table-cell cm-table-header-cell";
      th.dataset.row = "0";
      th.dataset.col = String(col);
      th.style.textAlign = toCssTextAlign(data.alignments[col] ?? null);

      const content = document.createElement("div");
      content.className = "cm-table-cell-content";
      content.textContent = toDisplayText(data.header?.cells[col]?.text ?? `Col ${col + 1}`);

      th.appendChild(content);
      headerTr.appendChild(th);
      bindCellHover(th);

      headerRowCells.push(th);
      headerRowContents.push(content);
    }

    cellElements.push(headerRowCells);
    contentElements.push(headerRowContents);
    thead.appendChild(headerTr);

    const tbody = document.createElement("tbody");
    data.rows.forEach((row, rowIndex) => {
      const tr = document.createElement("tr");
      tr.className = "cm-table-row cm-table-body-row";
      tr.dataset.bodyRowIndex = String(rowIndex);
      const rowCells: HTMLTableCellElement[] = [];
      const rowContents: HTMLDivElement[] = [];

      for (let col = 0; col < columnCount; col += 1) {
        const td = document.createElement("td");
        td.className = `cm-table-cell${col === 0 ? " cm-table-cell--first" : ""}`;
        td.dataset.row = String(rowIndex + 1);
        td.dataset.col = String(col);
        td.style.textAlign = toCssTextAlign(data.alignments[col] ?? null);

        const content = document.createElement("div");
        content.className = "cm-table-cell-content";
        content.textContent = toDisplayText(row.cells[col]?.text ?? "");
        td.appendChild(content);
        bindCellHover(td);

        tr.appendChild(td);
        rowCells.push(td);
        rowContents.push(content);
      }

      tbody.appendChild(tr);
      bodyRowElements.push(tr);
      cellElements.push(rowCells);
      contentElements.push(rowContents);
    });

    table.appendChild(thead);
    table.appendChild(tbody);

    for (let col = 0; col < columnCount; col += 1) {
      const handle = document.createElement("button");
      handle.type = "button";
      handle.className = "cm-table-col-handle";
      handle.style.left = "-9999px";
      handle.style.top = "-9999px";
      handle.style.transform = baseHandleTransform;
      handle.style.color = colHandleBaseColor;
      handle.dataset.colIndex = String(col);
      handle.tabIndex = -1;
      handle.setAttribute("aria-label", `Select column ${col + 1}`);
      const icon = TableWidget.createDragIndicatorIcon();
      icon.classList.add("cm-table-col-handle-icon");
      handle.appendChild(icon);
      handle.addEventListener(
        "pointerdown",
        (event) => {
          if (event.button !== 0) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          closeMenu();
          stopEditing(true);
          setSelection({ kind: "column", col }, false);
          draggingColIndex = col;
          draggingColPointerId = event.pointerId;
          draggingColHandle = handle;
          wrapper.dataset.colDragging = "true";
          handle.dataset.dragging = "true";
          if (typeof handle.setPointerCapture === "function") {
            try {
              handle.setPointerCapture(event.pointerId);
            } catch {
              // no-op
            }
          }
        },
        { signal }
      );
      handle.addEventListener(
        "pointerenter",
        () => {
          handle.dataset.hovered = "true";
          handle.style.transform = activeHandleTransform;
          handle.style.color = colHandleHoverColor;
          setHoveredCol(col);
        },
        { signal }
      );
      handle.addEventListener(
        "mouseenter",
        () => {
          handle.dataset.hovered = "true";
          handle.style.transform = activeHandleTransform;
          handle.style.color = colHandleHoverColor;
          setHoveredCol(col);
        },
        { signal }
      );
      handle.addEventListener(
        "pointerleave",
        () => {
          handle.removeAttribute("data-hovered");
          handle.style.transform = baseHandleTransform;
          handle.style.color = colHandleBaseColor;
          setHoveredCol(null);
        },
        { signal }
      );
      handle.addEventListener(
        "mouseleave",
        () => {
          handle.removeAttribute("data-hovered");
          handle.style.transform = baseHandleTransform;
          handle.style.color = colHandleBaseColor;
          setHoveredCol(null);
        },
        { signal }
      );
      handle.addEventListener(
        "click",
        (event) => {
          event.preventDefault();
          event.stopPropagation();
          stopEditing(true);
          setSelection({ kind: "column", col });
        },
        { signal }
      );
      handle.addEventListener(
        "contextmenu",
        (event) => {
          event.preventDefault();
          event.stopPropagation();
          stopEditing(true);
          setSelection({ kind: "column", col });
          openContextMenu("column", col, event.clientX, event.clientY);
        },
        { signal }
      );
      handleLayer.appendChild(handle);
      columnHandleButtons.push(handle);
    }

    data.rows.forEach((_row, rowIndex) => {
      const handle = document.createElement("button");
      handle.type = "button";
      handle.className = "cm-table-row-handle";
      handle.style.left = "-9999px";
      handle.style.top = "-9999px";
      handle.style.transform = baseHandleTransform;
      handle.style.color = rowHandleBaseColor;
      handle.tabIndex = -1;
      handle.setAttribute("aria-label", `Select row ${rowIndex + 1}`);
      const icon = TableWidget.createDragIndicatorIcon();
      icon.classList.add("cm-table-row-handle-icon");
      handle.appendChild(icon);
      handle.addEventListener(
        "pointerdown",
        (event) => {
          if (event.button !== 0) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          closeMenu();
          stopEditing(true);
          setSelection({ kind: "row", row: rowIndex }, false);
          draggingRowIndex = rowIndex;
          draggingRowPointerId = event.pointerId;
          draggingRowHandle = handle;
          wrapper.dataset.rowDragging = "true";
          handle.dataset.dragging = "true";
          if (typeof handle.setPointerCapture === "function") {
            try {
              handle.setPointerCapture(event.pointerId);
            } catch {
              // no-op
            }
          }
        },
        { signal }
      );
      handle.addEventListener(
        "pointerenter",
        () => {
          handle.dataset.hovered = "true";
          handle.style.transform = activeHandleTransform;
          handle.style.color = rowHandleHoverColor;
          setHoveredRow(rowIndex);
        },
        { signal }
      );
      handle.addEventListener(
        "mouseenter",
        () => {
          handle.dataset.hovered = "true";
          handle.style.transform = activeHandleTransform;
          handle.style.color = rowHandleHoverColor;
          setHoveredRow(rowIndex);
        },
        { signal }
      );
      handle.addEventListener(
        "pointerleave",
        () => {
          handle.removeAttribute("data-hovered");
          handle.style.transform = baseHandleTransform;
          handle.style.color = rowHandleBaseColor;
          setHoveredRow(null);
        },
        { signal }
      );
      handle.addEventListener(
        "mouseleave",
        () => {
          handle.removeAttribute("data-hovered");
          handle.style.transform = baseHandleTransform;
          handle.style.color = rowHandleBaseColor;
          setHoveredRow(null);
        },
        { signal }
      );
      handle.addEventListener(
        "contextmenu",
        (event) => {
          event.preventDefault();
          event.stopPropagation();
          stopEditing(true);
          setSelection({ kind: "row", row: rowIndex });
          openContextMenu("row", rowIndex, event.clientX, event.clientY);
        },
        { signal }
      );
      handleLayer.appendChild(handle);
      rowHandleButtons[rowIndex] = handle;
    });

    const moveCellByOffset = (current: CellSelection, delta: number): CellSelection => {
      const totalCells = getTotalRows() * columnCount;
      const flat = current.row * columnCount + current.col;
      const nextFlat = (flat + delta + totalCells) % totalCells;
      const nextRow = Math.floor(nextFlat / columnCount);
      const nextCol = nextFlat % columnCount;
      return { kind: "cell", row: nextRow, col: nextCol };
    };

    const moveSelectionOutsideTable = (lineNumber: number): boolean => {
      if (lineNumber < 1 || lineNumber > view.state.doc.lines) {
        return false;
      }
      const target = view.state.doc.line(lineNumber);
      selection = null;
      applySelectionClasses();
      clearHoveredHandles();
      closeMenu();
      dispatchOutsideSelection(view, target.from, true);
      return true;
    };

    const getCurrentBoundary = (): TableBoundaryInfo => {
      const live = collectTableBoundaries(view.state).find(
        (table) => table.key === this.tableInfo.key
      );
      if (live) {
        return live;
      }
      return {
        key: this.tableInfo.key,
        startLineNumber: this.tableInfo.startLineNumber,
        endLineNumber: this.tableInfo.endLineNumber,
        totalRows: getTotalRows(),
      };
    };

    const updateHoveredHandlesFromPointerEvent = (event: PointerEvent | MouseEvent) => {
      if (isHandleElement(event.target)) {
        return;
      }
      const cell = findHoveredCellInEvent(event);
      if (!cell) {
        clearHoveredHandles();
        return;
      }
      applyHoveredCell(cell);
    };

    wrapper.addEventListener(
      "pointermove",
      (event) => {
        updateHoveredHandlesFromPointerEvent(event);
      },
      { signal, passive: true }
    );
    wrapper.addEventListener(
      "mousemove",
      (event) => {
        updateHoveredHandlesFromPointerEvent(event);
      },
      { signal, passive: true }
    );

    document.addEventListener(
      "pointermove",
      (event) => {
        const target = event.target;
        if (!(target instanceof Node)) {
          clearHoveredHandles();
          return;
        }
        if (!wrapper.contains(target)) {
          clearHoveredHandles();
        }
      },
      { signal, capture: true, passive: true }
    );
    document.addEventListener(
      "mousemove",
      (event) => {
        const target = event.target;
        if (!(target instanceof Node)) {
          clearHoveredHandles();
          return;
        }
        if (!wrapper.contains(target)) {
          clearHoveredHandles();
        }
      },
      { signal, capture: true, passive: true }
    );

    wrapper.addEventListener(
      "pointerleave",
      (event) => {
        if (isHandleElement(event.relatedTarget)) {
          return;
        }
        clearHoveredHandles();
      },
      { signal }
    );

    window.addEventListener("pointermove", handleRowDragMove, { signal, capture: true });
    window.addEventListener("pointerup", handleRowDragEnd, { signal, capture: true });
    window.addEventListener("pointercancel", handleRowDragEnd, { signal, capture: true });
    window.addEventListener("pointermove", handleColDragMove, { signal, capture: true });
    window.addEventListener("pointerup", handleColDragEnd, { signal, capture: true });
    window.addEventListener("pointercancel", handleColDragEnd, { signal, capture: true });

    wrapper.addEventListener(
      "pointerdown",
      (event) => {
        cancelPendingFocusRestore();
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }
        if (target.closest(".cm-table-context-menu")) {
          return;
        }
        if (isEditing) {
          stopEditing(true);
        }
        const cell = target.closest<HTMLTableCellElement>(".cm-table-cell");
        if (!cell) {
          closeMenu();
          return;
        }
        applyHoveredCell(cell);
        const row = Number(cell.dataset.row);
        const col = Number(cell.dataset.col);
        if (!Number.isFinite(row) || !Number.isFinite(col)) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        closeMenu();
        setSelection({ kind: "cell", row, col });
      },
      { signal }
    );

    wrapper.addEventListener(
      "dblclick",
      (event) => {
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }
        const cell = target.closest<HTMLTableCellElement>(".cm-table-cell");
        if (!cell) {
          return;
        }
        const row = Number(cell.dataset.row);
        const col = Number(cell.dataset.col);
        if (!Number.isFinite(row) || !Number.isFinite(col)) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        startEditing({ kind: "cell", row, col });
      },
      { signal }
    );

    wrapper.addEventListener(
      "contextmenu",
      (event) => {
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }
        if (target.closest(".cm-table-context-menu")) {
          return;
        }
        const cellEl = target.closest<HTMLTableCellElement>(".cm-table-cell");
        if (!cellEl) {
          closeMenu();
          return;
        }
        const row = Number(cellEl.dataset.row);
        const col = Number(cellEl.dataset.col);
        if (!Number.isFinite(row) || !Number.isFinite(col)) {
          return;
        }
        const hit = isSelectedContextTarget({ kind: "cell", row, col });
        if (!hit) {
          closeMenu();
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        stopEditing(true);
        openContextMenu(hit.kind, hit.index, event.clientX, event.clientY);
      },
      { signal }
    );

    wrapper.addEventListener(
      "keydown",
      (event) => {
        cancelPendingFocusRestore();
        if (isEditing) {
          return;
        }
        if (event.isComposing) {
          return;
        }
        const active = ensureCellSelection();
        let next: CellSelection | null = null;

        switch (event.key) {
          case "ArrowUp": {
            const boundary = getCurrentBoundary();
            if (
              active.row === 0 &&
              boundary.startLineNumber > 1 &&
              moveSelectionOutsideTable(boundary.startLineNumber - 1)
            ) {
              event.preventDefault();
              event.stopPropagation();
              return;
            }
            next = clampCell(active.row - 1, active.col);
            break;
          }
          case "ArrowDown": {
            const boundary = getCurrentBoundary();
            if (
              active.row === getTotalRows() - 1 &&
              boundary.endLineNumber < view.state.doc.lines &&
              moveSelectionOutsideTable(boundary.endLineNumber + 1)
            ) {
              event.preventDefault();
              event.stopPropagation();
              return;
            }
            next = clampCell(active.row + 1, active.col);
            break;
          }
          case "ArrowLeft":
            next = clampCell(active.row, active.col - 1);
            break;
          case "ArrowRight":
            next = clampCell(active.row, active.col + 1);
            break;
          case "Tab":
            next = moveCellByOffset(active, event.shiftKey ? -1 : 1);
            break;
          case "Enter":
          case "F2":
            event.preventDefault();
            event.stopPropagation();
            startEditing(active);
            return;
          default:
            return;
        }

        if (next) {
          event.preventDefault();
          event.stopPropagation();
          closeMenu();
          setSelection(next, false);
        }
      },
      { signal }
    );

    wrapper.addEventListener(
      focusCellRequestEvent,
      (event) => {
        const custom = event as CustomEvent<FocusCellRequest>;
        const detail = custom.detail;
        if (
          !detail ||
          !Number.isFinite(detail.row) ||
          !Number.isFinite(detail.col)
        ) {
          return;
        }
        closeMenu();
        stopEditing(true);
        setSelection(clampCell(detail.row, detail.col));
      },
      { signal }
    );

    editor.addEventListener(
      "compositionstart",
      () => {
        isComposing = true;
      },
      { signal }
    );
    editor.addEventListener(
      "compositionend",
      () => {
        isComposing = false;
      },
      { signal }
    );

    editor.addEventListener(
      "keydown",
      (event) => {
        cancelPendingFocusRestore();
        if (!isEditing || !selection || selection.kind !== "cell") {
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          stopEditing(false);
          return;
        }
        if (event.key === "Tab") {
          event.preventDefault();
          event.stopPropagation();
          const next = moveCellByOffset(selection, event.shiftKey ? -1 : 1);
          stopEditing(true, next);
          return;
        }
        if (event.key === "Enter" && !event.shiftKey) {
          if (isComposing || event.isComposing) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          stopEditing(true);
        }
      },
      { signal }
    );

    editor.addEventListener(
      "blur",
      (event) => {
        if (!isEditing) {
          return;
        }
        const related = event.relatedTarget;
        if (related instanceof Node && wrapper.contains(related)) {
          return;
        }
        stopEditing(true);
      },
      { signal }
    );

    scrollArea.addEventListener(
      "scroll",
      () => {
        if (isEditing && selection && selection.kind === "cell") {
          positionEditor(selection);
        }
        updateHandlePositions();
        if (selection && selection.kind !== "cell") {
          updateRangeOutline();
        }
        if (menuState) {
          closeMenu();
        }
      },
      { signal, passive: true }
    );

    window.addEventListener(
      "resize",
      () => {
        if (isEditing && selection && selection.kind === "cell") {
          positionEditor(selection);
        }
        updateHandlePositions();
        if (selection && selection.kind !== "cell") {
          updateRangeOutline();
        }
      },
      { signal }
    );

    document.addEventListener(
      "pointerdown",
      (event) => {
        cancelPendingFocusRestore();
        const target = event.target;
        if (!(target instanceof Node) || !wrapper.contains(target)) {
          closeMenu();
        }
      },
      { signal, capture: true }
    );

    document.addEventListener(
      "keydown",
      () => {
        cancelPendingFocusRestore();
      },
      { signal, capture: true }
    );

    wrapper.addEventListener(
      "focusout",
      (event) => {
        const related = event.relatedTarget;
        if (related instanceof Node && wrapper.contains(related)) {
          return;
        }
        if (!isEditing) {
          selection = null;
          applySelectionClasses();
          clearHoveredHandles();
        }
      },
      { signal }
    );

    const cached = TableWidget.selectionMapForView(view).get(this.tableInfo.key);
    if (cached) {
      setSelection(cached, false);
    } else {
      setSelection({ kind: "cell", row: data.rows.length > 0 ? 1 : 0, col: 0 }, false);
    }
    requestAnimationFrame(() => {
      updateHandlePositions();
    });

    return wrapper;
  }

  ignoreEvent(): boolean {
    return true;
  }

  destroy(): void {
    this.abortController.abort();
  }
}

function dispatchOutsideUpdate(
  view: EditorView,
  transaction: {
    changes: { from: number; to: number; insert: string };
    annotations: Annotation<unknown>;
  }
) {
  dispatchOutsideTransaction(view, transaction);
}

function dispatchOutsideSelection(view: EditorView, anchor: number, focusEditor = false) {
  if (focusEditor) {
    view.focus();
  }
  view.dispatch({
    selection: { anchor },
    scrollIntoView: true,
  });
}

function dispatchOutsideTransaction(
  view: EditorView,
  transaction: TransactionSpec,
  focusEditor = false
) {
  const scrollTop = view.scrollDOM.scrollTop;
  const scrollLeft = view.scrollDOM.scrollLeft;
  view.dispatch({ ...transaction, scrollIntoView: false });
  if (focusEditor) {
    view.focus();
  }
  requestAnimationFrame(() => {
    view.scrollDOM.scrollTop = scrollTop;
    view.scrollDOM.scrollLeft = scrollLeft;
  });
}

function buildDecorations(
  state: EditorState,
  options: Required<TableEditorOptions>
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();

  if (!options.enabled || options.renderMode !== "widget") {
    return builder.finish();
  }

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
      const firstLine = lines[0];
      const lastLine = lines[lines.length - 1];

      const info: TableInfo = {
        key: createTableKey(lines),
        from: node.from,
        to: node.to,
        startLineFrom: firstLine.from,
        endLineTo: lastLine.to,
        startLineNumber: firstLine.number,
        endLineNumber: lastLine.number,
      };

      builder.add(
        firstLine.from,
        lastLine.to,
        Decoration.replace({
          widget: new TableWidget(data, info),
          block: true,
        })
      );
    },
  });

  return builder.finish();
}

export function tableEditor(options: TableEditorOptions = {}): Extension {
  const resolved = { ...defaultOptions, ...options };

  const theme = EditorView.baseTheme({
    ".cm-content .cm6-table-editor": {
      position: "relative",
      overflow: "visible",
      padding: "0.5rem 0",
      boxSizing: "border-box",
    },
    ".cm-content .cm6-table-editor:focus, .cm-content .cm6-table-editor:focus-visible":
      {
        outline: "none",
      },
    ".cm-content .cm6-table-editor .cm-table-scroll": {
      margin: "0",
      overflowX: "auto",
      border: "1px solid color-mix(in srgb, var(--editor-border, #dadce0) 80%, transparent)",
      borderRadius: "0",
      background: "var(--editor-surface, var(--editor-bg, #fff))",
    },
    ".cm-content .cm6-table-editor table.cm-table": {
      width: "100%",
      minWidth: "360px",
      borderCollapse: "collapse",
      tableLayout: "fixed",
      background: "var(--editor-surface, var(--editor-bg, #fff))",
    },
    ".cm-content .cm6-table-editor .cm-table-row": {
      background: "var(--editor-surface, var(--editor-bg, #fff))",
    },
    ".cm-content .cm6-table-editor .cm-table-header-cell": {
      background:
        "color-mix(in srgb, var(--editor-surface, var(--editor-bg, #fff)) 92%, var(--editor-border, #dadce0))",
      color: "var(--editor-secondary-color, #5f6368)",
      fontWeight: "600",
      position: "relative",
    },
    ".cm-content .cm6-table-editor .cm-table-cell": {
      borderBottom: "1px solid color-mix(in srgb, var(--editor-border, #dadce0) 70%, transparent)",
      borderRight: "1px solid color-mix(in srgb, var(--editor-border, #dadce0) 70%, transparent)",
      padding: "9px 10px",
      minHeight: "36px",
      verticalAlign: "middle",
      position: "relative",
      color: "var(--editor-text-color, var(--editor-foreground, #202124))",
      overflow: "visible",
    },
    ".cm-content .cm6-table-editor .cm-table-cell-content": {
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      lineHeight: "1.35",
    },
    ".cm-content .cm6-table-editor .cm-table-cell--first": {
      paddingLeft: "10px",
    },
    ".cm-content .cm6-table-editor .cm-table-cell-selected": {
      boxShadow: "inset 0 0 0 2px var(--editor-primary-color, #1a73e8)",
    },
    ".cm-content .cm6-table-editor .cm-table-row-selected": {
      background: "transparent",
    },
    ".cm-content .cm6-table-editor .cm-table-column-selected": {
      background: "transparent",
    },
    ".cm-content .cm6-table-editor .cm-table-selection-outline": {
      position: "absolute",
      border: "2px solid var(--editor-primary-color, #1a73e8)",
      boxSizing: "border-box",
      pointerEvents: "none",
      zIndex: "12",
      display: "none",
    },
    ".cm-content .cm6-table-editor .cm-table-selection-outline[data-open='true']": {
      display: "block",
    },
    ".cm-content .cm6-table-editor .cm-table-handle-layer": {
      position: "absolute",
      inset: "0",
      overflow: "visible",
      pointerEvents: "none",
      zIndex: "18",
    },
    ".cm-content .cm6-table-editor .cm-table-col-handle": {
      position: "absolute",
      transform: "translate(-50%, -50%)",
      display: "grid",
      placeItems: "center",
      width: "30px",
      height: "20px",
      padding: "0",
      border: "none",
      background: "transparent",
      opacity: "0",
      cursor: "grab",
      pointerEvents: "none",
      transition: "opacity 120ms ease, transform 120ms ease",
      outline: "none",
      color:
        "color-mix(in srgb, var(--editor-secondary-color, #5f6368) 76%, var(--editor-surface, var(--editor-bg, #fff)))",
    },
    ".cm-content .cm6-table-editor .cm-table-col-handle[data-visible='true'], .cm-content .cm6-table-editor .cm-table-col-handle[data-dragging='true']": {
      opacity: "0.95 !important",
      pointerEvents: "auto !important",
    },
    ".cm-content .cm6-table-editor .cm-table-col-handle[data-hovered='true'], .cm-content .cm6-table-editor .cm-table-col-handle:focus-visible": {
      transform: "translate(-50%, -50%) scale(1.35) !important",
      opacity: "1 !important",
      color:
        "color-mix(in srgb, var(--editor-primary-color, #1a73e8) 88%, var(--editor-secondary-color, #5f6368)) !important",
    },
    ".cm-content .cm6-table-editor .cm-table-col-handle:active": {
      cursor: "grabbing",
    },
    ".cm-content .cm6-table-editor .cm-table-row-handle": {
      position: "absolute",
      transform: "translate(-50%, -50%)",
      display: "grid",
      placeItems: "center",
      width: "20px",
      height: "30px",
      padding: "0",
      border: "none",
      background: "transparent",
      opacity: "0",
      cursor: "grab",
      pointerEvents: "none",
      transition: "opacity 120ms ease, transform 120ms ease",
      outline: "none",
      color:
        "color-mix(in srgb, var(--editor-secondary-color, #5f6368) 76%, var(--editor-surface, var(--editor-bg, #fff)))",
    },
    ".cm-content .cm6-table-editor .cm-table-handle-icon": {
      width: "14px",
      height: "14px",
      display: "block",
    },
    ".cm-content .cm6-table-editor .cm-table-col-handle-icon": {
      transform: "rotate(90deg)",
      transformOrigin: "center",
    },
    ".cm-content .cm6-table-editor .cm-table-handle-icon path": {
      fill: "currentColor",
    },
    ".cm-content .cm6-table-editor .cm-table-row-handle[data-visible='true'], .cm-content .cm6-table-editor .cm-table-row-handle[data-dragging='true']": {
      opacity: "1 !important",
      pointerEvents: "auto !important",
    },
    ".cm-content .cm6-table-editor .cm-table-row-handle[data-hovered='true'], .cm-content .cm6-table-editor .cm-table-row-handle:focus-visible": {
      transform: "translate(-50%, -50%) scale(1.35) !important",
      opacity: "1 !important",
      color:
        "color-mix(in srgb, var(--editor-primary-color, #1a73e8) 88%, var(--editor-secondary-color, #5f6368)) !important",
    },
    ".cm-content .cm6-table-editor .cm-table-row-handle:active": {
      cursor: "grabbing",
    },
    ".cm-content .cm6-table-editor .cm-table-body-row.cm-table-row-drop-before .cm-table-cell": {
      boxShadow: "inset 0 2px 0 var(--editor-primary-color, #1a73e8)",
    },
    ".cm-content .cm6-table-editor .cm-table-body-row.cm-table-row-drop-after .cm-table-cell": {
      boxShadow: "inset 0 -2px 0 var(--editor-primary-color, #1a73e8)",
    },
    ".cm-content .cm6-table-editor .cm-table-cell.cm-table-column-drop-before": {
      boxShadow: "inset 2px 0 0 var(--editor-primary-color, #1a73e8)",
    },
    ".cm-content .cm6-table-editor .cm-table-cell.cm-table-column-drop-after": {
      boxShadow: "inset -2px 0 0 var(--editor-primary-color, #1a73e8)",
    },
    ".cm-content .cm6-table-editor .cm-table-context-menu": {
      position: "absolute",
      minWidth: "164px",
      background: "var(--editor-surface, var(--editor-bg, #fff))",
      border: "1px solid color-mix(in srgb, var(--editor-border, #dadce0) 88%, transparent)",
      borderRadius: "8px",
      boxShadow: "0 12px 24px rgba(0, 0, 0, 0.14)",
      padding: "6px",
      zIndex: "30",
      display: "none",
    },
    ".cm-content .cm6-table-editor .cm-table-context-menu[data-open='true']": {
      display: "grid",
      gap: "4px",
    },
    ".cm-content .cm6-table-editor .cm-table-context-menu-item": {
      border: "none",
      background: "transparent",
      color: "var(--editor-text-color, var(--editor-foreground, #202124))",
      borderRadius: "6px",
      textAlign: "left",
      padding: "6px 8px",
      cursor: "pointer",
      font: "inherit",
      fontSize: "12px",
    },
    ".cm-content .cm6-table-editor .cm-table-context-menu-item:hover": {
      background:
        "color-mix(in srgb, var(--editor-surface, var(--editor-bg, #fff)) 86%, var(--editor-border, #dadce0))",
    },
    ".cm-content .cm6-table-editor .cm-table-overlay-input": {
      position: "absolute",
      zIndex: "20",
      resize: "none",
      border: "1px solid var(--editor-primary-color, #1a73e8)",
      borderRadius: "4px",
      outline: "none",
      margin: "0",
      padding: "7px 9px",
      background: "var(--editor-surface, var(--editor-bg, #fff))",
      color: "var(--editor-text-color, var(--editor-foreground, #202124))",
      font: "inherit",
      lineHeight: "1.35",
      boxSizing: "border-box",
      display: "none",
    },
    ".cm-content .cm6-table-editor .cm-table-overlay-input[data-open='true']": {
      display: "block",
    },
  });

  const decorations = StateField.define<DecorationSet>({
    create(state) {
      return buildDecorations(state, resolved);
    },
    update(decorations, tr) {
      const selectionChanged = !tr.startState.selection.eq(tr.state.selection);
      if (!tr.docChanged && !selectionChanged && !tr.reconfigured) {
        return decorations;
      }
      return buildDecorations(tr.state, resolved);
    },
    provide: (field) => EditorView.decorations.from(field),
  });

  const focusTableFromOutside = (view: EditorView, direction: "up" | "down"): boolean => {
    const main = view.state.selection.main;
    if (!main.empty) {
      return false;
    }
    const currentLine = view.state.doc.lineAt(main.head).number;
    const adjacentLine = direction === "down" ? currentLine + 1 : currentLine - 1;
    if (adjacentLine < 1 || adjacentLine > view.state.doc.lines) {
      return false;
    }
    if (!isLikelyTableBoundaryCandidateLine(view.state.doc.line(adjacentLine).text)) {
      return false;
    }
    const boundaries = collectTableBoundaries(view.state);
    const target =
      direction === "down"
        ? boundaries.find((table) => currentLine === table.startLineNumber - 1)
        : boundaries.find((table) => currentLine === table.endLineNumber + 1);
    if (!target) {
      return false;
    }
    const wrapper = view.dom.querySelector<HTMLElement>(
      `.cm6-table-editor[data-table-id="${target.key}"]`
    );
    if (!wrapper) {
      return false;
    }

    wrapper.dispatchEvent(
      new CustomEvent<FocusCellRequest>(focusCellRequestEvent, {
        detail: {
          row: direction === "down" ? 0 : target.totalRows - 1,
          col: 0,
        },
      })
    );
    return true;
  };

  const tableBoundaryNavigation = keymap.of([
    {
      key: "ArrowDown",
      run(view) {
        return focusTableFromOutside(view, "down");
      },
    },
    {
      key: "ArrowUp",
      run(view) {
        return focusTableFromOutside(view, "up");
      },
    },
  ]);

  return [theme, decorations, Prec.highest(tableBoundaryNavigation)];
}

export * from "./types";
export * from "./tableModel";
export * from "./tableMarkdown";
