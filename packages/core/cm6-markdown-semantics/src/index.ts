import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder, type Extension } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";

export type MarkdownSemanticsOptions = {
  classPrefix?: string;
};

type SemanticRule = {
  nodeNames: readonly string[];
  className: string;
  applyToLine?: boolean;
};

function buildRules(prefix: string): SemanticRule[] {
  return [
    {
      nodeNames: ["ATXHeading1", "SetextHeading1"],
      className: `${prefix}heading-1`,
      applyToLine: true,
    },
    {
      nodeNames: ["ATXHeading2", "SetextHeading2"],
      className: `${prefix}heading-2`,
      applyToLine: true,
    },
    { nodeNames: ["ATXHeading3"], className: `${prefix}heading-3`, applyToLine: true },
    { nodeNames: ["ATXHeading4"], className: `${prefix}heading-4`, applyToLine: true },
    { nodeNames: ["ATXHeading5"], className: `${prefix}heading-5`, applyToLine: true },
    { nodeNames: ["ATXHeading6"], className: `${prefix}heading-6`, applyToLine: true },
    { nodeNames: ["StrongEmphasis"], className: `${prefix}strong` },
    { nodeNames: ["Emphasis"], className: `${prefix}em` },
    { nodeNames: ["Link", "Autolink"], className: `${prefix}link` },
    { nodeNames: ["InlineCode"], className: `${prefix}code` },
    { nodeNames: ["ListItem"], className: `${prefix}list-item`, applyToLine: true },
    { nodeNames: ["Blockquote"], className: `${prefix}blockquote`, applyToLine: true },
    { nodeNames: ["FencedCode", "CodeBlock"], className: `${prefix}code-block`, applyToLine: true },
    { nodeNames: ["FencedCode"], className: `${prefix}code-block-fenced`, applyToLine: true },
    { nodeNames: ["CodeBlock"], className: `${prefix}code-block-indented`, applyToLine: true },
    { nodeNames: ["HorizontalRule"], className: `${prefix}thematic-break`, applyToLine: true },
    { nodeNames: ["Table"], className: `${prefix}table`, applyToLine: true },
    { nodeNames: ["HTMLBlock"], className: `${prefix}html-block`, applyToLine: true },
    { nodeNames: ["FootnoteDefinition"], className: `${prefix}footnote-definition`, applyToLine: true },
    { nodeNames: ["FootnoteReference"], className: `${prefix}footnote-ref` },
  ];
}

function addLineClassesForNode(
  view: EditorView,
  from: number,
  to: number,
  classNames: readonly string[],
  lineClasses: Map<number, Set<string>>
) {
  if (from >= to) {
    return;
  }
  const startLine = view.state.doc.lineAt(from);
  const endLine = view.state.doc.lineAt(to);
  for (let lineNumber = startLine.number; lineNumber <= endLine.number; lineNumber += 1) {
    const line = view.state.doc.line(lineNumber);
    let set = lineClasses.get(line.from);
    if (!set) {
      set = new Set<string>();
      lineClasses.set(line.from, set);
    }
    for (const className of classNames) {
      set.add(className);
    }
  }
}

function addLineClass(lineFrom: number, className: string, lineClasses: Map<number, Set<string>>) {
  let set = lineClasses.get(lineFrom);
  if (!set) {
    set = new Set<string>();
    lineClasses.set(lineFrom, set);
  }
  set.add(className);
}

export function slugifyHeading(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function stripHeadingMarkers(raw: string): string {
  return raw.replace(/^\s{0,3}#{1,6}\s+/, "").replace(/\s+#*\s*$/, "");
}

function extractHeadingText(view: EditorView, from: number, to: number): string {
  const raw = view.state.doc.sliceString(from, to);
  return stripHeadingMarkers(raw);
}

function findLinkTargetNode(node: SyntaxNode): SyntaxNode | null {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (
      child.name.includes("URL") ||
      child.name.includes("LinkDestination") ||
      child.name === "Autolink"
    ) {
      return child;
    }
    const nested = findLinkTargetNode(child);
    if (nested) {
      return nested;
    }
  }
  return null;
}

export function extractLinkHrefFromText(raw: string): string | null {
  const autolinkMatch = raw.match(/<([^>]+)>/);
  if (autolinkMatch) {
    return autolinkMatch[1].trim() || null;
  }
  const linkMatch = raw.match(/\(([^)]+)\)/);
  if (linkMatch) {
    return linkMatch[1].trim() || null;
  }
  return null;
}

function extractLinkHref(view: EditorView, node: SyntaxNode): string | null {
  const targetNode = findLinkTargetNode(node);
  if (targetNode) {
    let href = view.state.doc.sliceString(targetNode.from, targetNode.to).trim();
    if (href.startsWith("<") && href.endsWith(">")) {
      href = href.slice(1, -1).trim();
    }
    return href || null;
  }

  const raw = view.state.doc.sliceString(node.from, node.to);
  return extractLinkHrefFromText(raw);
}

function addCodeBlockClasses(
  view: EditorView,
  from: number,
  to: number,
  prefix: string,
  lineClasses: Map<number, Set<string>>
) {
  if (from >= to) {
    return;
  }
  const startLine = view.state.doc.lineAt(from);
  const endLine = view.state.doc.lineAt(to);
  addLineClass(startLine.from, `${prefix}code-block-first`, lineClasses);
  addLineClass(endLine.from, `${prefix}code-block-last`, lineClasses);
  if (startLine.number === endLine.number) {
    return;
  }
  for (let lineNumber = startLine.number + 1; lineNumber <= endLine.number - 1; lineNumber += 1) {
    const line = view.state.doc.line(lineNumber);
    addLineClass(line.from, `${prefix}code-block-middle`, lineClasses);
  }
}

function addLineLevelForNode(
  view: EditorView,
  from: number,
  to: number,
  level: number,
  lineLevels: Map<number, number>
) {
  if (from >= to) {
    return;
  }
  const startLine = view.state.doc.lineAt(from);
  const endLine = view.state.doc.lineAt(to);
  for (let lineNumber = startLine.number; lineNumber <= endLine.number; lineNumber += 1) {
    const line = view.state.doc.line(lineNumber);
    const current = lineLevels.get(line.from) ?? 0;
    if (level > current) {
      lineLevels.set(line.from, level);
    }
  }
}

export function getListLevel(node: SyntaxNode | null | undefined): number {
  let level = 0;
  for (let current = node?.parent; current; current = current.parent) {
    if (current.name === "BulletList" || current.name === "OrderedList") {
      level += 1;
    }
  }
  return level;
}

export function getBlockquoteLevel(node: SyntaxNode | null | undefined): number {
  let level = 0;
  for (let current: SyntaxNode | null | undefined = node; current; current = current.parent) {
    if (current.name === "Blockquote") {
      level += 1;
    }
  }
  return level;
}

export function getTaskStateClassFromText(sample: string, prefix: string): string | null {
  const match = sample.match(/^\[( |x|X)\]/);
  if (!match) {
    return null;
  }
  return match[1].toLowerCase() === "x" ? `${prefix}task-checked` : `${prefix}task-unchecked`;
}

function getTaskStateClass(view: EditorView, from: number, to: number, prefix: string): string | null {
  const sample = view.state.doc.sliceString(from, Math.min(to, from + 6));
  return getTaskStateClassFromText(sample, prefix);
}

function buildDecorations(view: EditorView, prefix: string): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const pending: Array<{ from: number; to: number; decoration: Decoration }> = [];
  const lineClasses = new Map<number, Set<string>>();
  const lineIds = new Map<number, string>();
  const lineBlockquoteLevels = new Map<number, number>();
  const rules = buildRules(prefix);
  const rulesByName = new Map<string, SemanticRule>();
  const headingSlugCounts = new Map<string, number>();
  for (const rule of rules) {
    for (const name of rule.nodeNames) {
      rulesByName.set(name, rule);
    }
  }

  syntaxTree(view.state).iterate({
    enter: (node) => {
      if (node.from >= node.to) {
        return;
      }

      const lineClassNames: string[] = [];
      const rule = rulesByName.get(node.name);
      if (rule) {
        if (rule.applyToLine) {
          lineClassNames.push(rule.className);
          if (rule.className.includes("heading-")) {
            const headingText = extractHeadingText(view, node.from, node.to);
            const base = slugifyHeading(headingText);
            if (base) {
              const count = headingSlugCounts.get(base) ?? 0;
              headingSlugCounts.set(base, count + 1);
              const id = count === 0 ? base : `${base}-${count}`;
              const line = view.state.doc.lineAt(node.from);
              lineIds.set(line.from, id);
            }
          }
        } else {
          if (node.name === "Link" || node.name === "Autolink") {
            const href = extractLinkHref(view, node.node);
            pending.push({
              from: node.from,
              to: node.to,
              decoration: Decoration.mark({
                class: rule.className,
                tagName: "span",
                attributes: href ? { "data-href": href } : undefined,
              }),
            });
          } else {
            pending.push({
              from: node.from,
              to: node.to,
              decoration: Decoration.mark({ class: rule.className }),
            });
          }
        }
      }

      if (node.name === "ListItem") {
        const level = getListLevel(node.node);
        if (level > 0) {
          lineClassNames.push(`${prefix}list-item-level-${level}`);
        }
      }

      if (node.name === "Blockquote") {
        const level = getBlockquoteLevel(node.node);
        if (level > 0) {
          addLineLevelForNode(view, node.from, node.to, level, lineBlockquoteLevels);
        }
      }

      if (node.name === "Task") {
        const stateClass = getTaskStateClass(view, node.from, node.to, prefix);
        if (stateClass) {
          lineClassNames.push(stateClass);
        }
      }

      if (node.name === "FencedCode" || node.name === "CodeBlock") {
        addCodeBlockClasses(view, node.from, node.to, prefix, lineClasses);
      }

      if (lineClassNames.length > 0) {
        addLineClassesForNode(view, node.from, node.to, lineClassNames, lineClasses);
      }
    },
  });

  for (const [lineFrom, level] of lineBlockquoteLevels) {
    let classSet = lineClasses.get(lineFrom);
    if (!classSet) {
      classSet = new Set<string>();
      lineClasses.set(lineFrom, classSet);
    }
    classSet.add(`${prefix}blockquote-level-${level}`);
  }

  for (const [lineFrom, classSet] of lineClasses) {
    pending.push({
      from: lineFrom,
      to: lineFrom,
      decoration: Decoration.line({ class: Array.from(classSet).join(" ") }),
    });
  }
  for (const [lineFrom, id] of lineIds) {
    pending.push({
      from: lineFrom,
      to: lineFrom,
      decoration: Decoration.line({ attributes: { id } }),
    });
  }

  pending.sort((a, b) => (a.from === b.from ? a.to - b.to : a.from - b.from));
  for (const item of pending) {
    builder.add(item.from, item.to, item.decoration);
  }

  return builder.finish();
}

export function markdownSemantics(options: MarkdownSemanticsOptions = {}): Extension {
  const prefix = options.classPrefix ?? "mb-";

  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, prefix);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildDecorations(update.view, prefix);
        }
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
    }
  );
}
