import { EditorState } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";

type ListMarkerKind = "bullet" | "ordered";

export function listMarkerDecoration(
  kind: ListMarkerKind,
  rawText: string
): Decoration {
  return Decoration.mark({
    class: `cm-lp-list-marker cm-lp-list-marker-${kind}`,
    attributes: {
      "data-lp-raw-marker": rawText,
    },
  });
}

// cm-widget-measure: static
class TaskCheckboxWidget extends WidgetType {
  constructor(
    private readonly checked: boolean,
    private readonly from: number,
    private readonly to: number
  ) {
    super();
  }

  eq(other: TaskCheckboxWidget): boolean {
    return (
      this.checked === other.checked &&
      this.from === other.from &&
      this.to === other.to
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement("span");
    wrapper.className = "cm-lp-task-checkbox";

    const input = document.createElement("input");
    input.className = "cm-lp-task-checkbox-input";
    input.type = "checkbox";
    input.checked = this.checked;
    input.tabIndex = -1;
    input.disabled = view.state.facet(EditorState.readOnly);
    input.setAttribute("aria-label", this.checked ? "Uncheck task" : "Check task");

    input.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });

    input.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    input.addEventListener("change", (event) => {
      event.stopPropagation();

      if (view.state.facet(EditorState.readOnly)) {
        input.checked = this.checked;
        view.focus();
        return;
      }

      const anchor = view.state.selection.main.head;
      view.dispatch({
        changes: {
          from: this.from,
          to: this.to,
          insert: this.checked ? "[ ]" : "[x]",
        },
        selection: { anchor },
      });
      view.focus();
    });

    wrapper.appendChild(input);
    return wrapper;
  }
}

export function taskCheckboxReplace(
  checked: boolean,
  from: number,
  to: number
): Decoration {
  return Decoration.replace({
    widget: new TaskCheckboxWidget(checked, from, to),
    inclusive: false,
  });
}
