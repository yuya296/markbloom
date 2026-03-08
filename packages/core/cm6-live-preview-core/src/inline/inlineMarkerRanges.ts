import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { ExcludeRanges, Range } from "../core/types";
import type { LivePreviewOptions } from "../options";
import { inRangeSegment } from "../core/utils";
import {
  INLINE_CONTAINER_NAMES,
  NodeName,
  hasNodeName,
} from "../core/syntaxNodeNames";
import { inlineElementConfigs, type InlineElementConfig } from "../config";
import { isInlineRawByTriggers } from "./rawMode";
import { parseMarkdownImageLiteral } from "./imageLiteral";

const inlineConfigByNode = new Map(
  inlineElementConfigs.map((config) => [config.node, config])
);
const inlineHideTargets = new Map<NodeName, NodeName[]>([
  [NodeName.Emphasis, [NodeName.EmphasisMark]],
  [NodeName.StrongEmphasis, [NodeName.EmphasisMark]],
  [NodeName.Strikethrough, [NodeName.StrikethroughMark]],
  [NodeName.InlineCode, [NodeName.CodeMark]],
  [NodeName.Link, [NodeName.LinkMark, NodeName.URL]],
  [NodeName.Image, [NodeName.LinkMark, NodeName.URL]],
]);

const taskTokenPattern = /^\[(?: |x|X)\]$/;
const taskPrefixPattern = /^\s{0,3}(?:>\s?)*\s*(?:[*+-]|\d+\.)\s+$/;

function isTaskTokenLink(state: EditorState, from: number, to: number): boolean {
  const token = state.doc.sliceString(from, to);
  if (!taskTokenPattern.test(token)) {
    return false;
  }
  const line = state.doc.lineAt(from);
  const prefix = line.text.slice(0, from - line.from);
  return taskPrefixPattern.test(prefix);
}

function isInlineRaw(
  state: EditorState,
  node: { from: number; to: number },
  rawModeTrigger: InlineElementConfig["rawModeTrigger"]
): boolean {
  return isInlineRawByTriggers(state, node, rawModeTrigger);
}

function collectChildRanges(
  state: EditorState,
  from: number,
  to: number,
  targets: ReadonlySet<NodeName>
): Range[] {
  const ranges: Range[] = [];
  syntaxTree(state).iterate({
    from,
    to,
    enter: (node) => {
      if (targets.has(node.name as NodeName)) {
        ranges.push({ from: node.from, to: node.to });
      }
    },
  });
  return ranges;
}

type HtmlTagKind = "opening" | "closing" | "self-closing" | "other";

type HtmlTagInfo = {
  from: number;
  to: number;
  kind: HtmlTagKind;
  tagName: string | null;
  attrs: ReadonlyMap<string, string | true>;
};

type HtmlTagGroup = {
  from: number;
  to: number;
  tags: Range[];
  contentFrom?: number;
  contentTo?: number;
  openTag?: HtmlTagInfo;
};

const allowedInlineStyleProps = new Set([
  "color",
  "background-color",
  "text-decoration",
  "font-weight",
  "font-style",
]);

function parseHtmlAttrs(source: string): ReadonlyMap<string, string | true> {
  const attrs = new Map<string, string | true>();
  const attrPattern =
    /([A-Za-z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match = attrPattern.exec(source);
  while (match) {
    const name = (match[1] ?? "").toLowerCase();
    if (name) {
      const value = match[2] ?? match[3] ?? match[4];
      attrs.set(name, typeof value === "string" ? value : true);
    }
    match = attrPattern.exec(source);
  }
  return attrs;
}

function isDangerousStyleValue(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    normalized.includes("url(") ||
    normalized.includes("expression(") ||
    normalized.includes("@import") ||
    normalized.includes("javascript:")
  );
}

function sanitizeInlineStyle(styleSource: string): ReadonlyMap<string, string> {
  const declarations = new Map<string, string>();
  for (const segment of styleSource.split(";")) {
    const index = segment.indexOf(":");
    if (index <= 0) {
      continue;
    }
    const property = segment.slice(0, index).trim().toLowerCase();
    const value = segment.slice(index + 1).trim();
    if (!allowedInlineStyleProps.has(property) || value.length === 0) {
      continue;
    }
    if (isDangerousStyleValue(value)) {
      continue;
    }
    declarations.set(property, value);
  }
  return declarations;
}

function isTruthyAttr(value: string | true | undefined): boolean {
  if (value === true) {
    return true;
  }
  if (typeof value !== "string") {
    return false;
  }
  return /^(?:1|true|yes|on)$/iu.test(value.trim());
}

function buildInlineHtmlStyle(tag: HtmlTagInfo): string {
  if (!tag.tagName) {
    return "";
  }

  const declarations = new Map<string, string>();
  const setDeclaration = (property: string, value: string) => {
    declarations.set(property, value);
  };

  if (tag.tagName === "u") {
    setDeclaration("text-decoration", "underline");
  }

  if (isTruthyAttr(tag.attrs.get("underline"))) {
    setDeclaration("text-decoration", "underline");
  }

  const styleAttr = tag.attrs.get("style");
  if (typeof styleAttr === "string") {
    for (const [property, value] of sanitizeInlineStyle(styleAttr)) {
      setDeclaration(property, value);
    }
  }

  return Array.from(declarations.entries())
    .map(([property, value]) => `${property}: ${value}`)
    .join("; ");
}

function parseHtmlTagInfo(literal: string, from: number, to: number): HtmlTagInfo {
  const closingMatch = literal.match(/^<\/([A-Za-z][\w:-]*)\s*>$/);
  if (closingMatch) {
    return {
      from,
      to,
      kind: "closing",
      tagName: closingMatch[1].toLowerCase(),
      attrs: new Map(),
    };
  }

  const selfClosingMatch = literal.match(/^<([A-Za-z][\w:-]*)([\s\S]*?)\/>$/);
  if (selfClosingMatch) {
    return {
      from,
      to,
      kind: "self-closing",
      tagName: selfClosingMatch[1].toLowerCase(),
      attrs: parseHtmlAttrs(selfClosingMatch[2] ?? ""),
    };
  }

  const openingMatch = literal.match(/^<([A-Za-z][\w:-]*)([\s\S]*?)>$/);
  if (openingMatch) {
    return {
      from,
      to,
      kind: "opening",
      tagName: openingMatch[1].toLowerCase(),
      attrs: parseHtmlAttrs(openingMatch[2] ?? ""),
    };
  }

  return { from, to, kind: "other", tagName: null, attrs: new Map() };
}

function groupInlineHtmlTags(tags: HtmlTagInfo[]): HtmlTagGroup[] {
  const groups: HtmlTagGroup[] = [];
  const openIndices = new Map<string, number[]>();

  for (let i = 0; i < tags.length; i += 1) {
    const tag = tags[i];
    if (!tag.tagName) {
      continue;
    }

    if (tag.kind === "self-closing") {
      groups.push({
        from: tag.from,
        to: tag.to,
        tags: [{ from: tag.from, to: tag.to }],
      });
      continue;
    }

    if (tag.kind === "opening") {
      const stack = openIndices.get(tag.tagName) ?? [];
      stack.push(i);
      openIndices.set(tag.tagName, stack);
      continue;
    }

    if (tag.kind === "closing") {
      const stack = openIndices.get(tag.tagName);
      const openIndex = stack?.pop();
      if (typeof openIndex === "number") {
        const openTag = tags[openIndex];
        groups.push({
          from: openTag.from,
          to: tag.to,
          tags: [
            { from: openTag.from, to: openTag.to },
            { from: tag.from, to: tag.to },
          ],
          contentFrom: openTag.to,
          contentTo: tag.from,
          openTag,
        });
      }
    }
  }

  groups.sort((a, b) => (a.from === b.from ? a.to - b.to : a.from - b.from));
  return groups;
}

export function collectInlineMarkerRanges(
  state: EditorState,
  options: LivePreviewOptions,
  excluded: ExcludeRanges
): {
  hidden: Range[];
  images: Array<{ from: number; to: number; src: string; alt: string; raw: boolean }>;
  htmlStyles: Array<{ from: number; to: number; style: string }>;
} {
  const hidden: Range[] = [];
  const images: Array<{ from: number; to: number; src: string; alt: string; raw: boolean }> = [];
  const htmlStyles: Array<{ from: number; to: number; style: string }> = [];
  const htmlTags: HtmlTagInfo[] = [];
  const tree = syntaxTree(state);
  const basePath = options.imageBasePath?.replace(/\/+$/, "") ?? "";
  const resolvedBase = (() => {
    if (!basePath) {
      return "";
    }
    const normalizedBase = basePath.endsWith("/") ? basePath : `${basePath}/`;
    if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(normalizedBase)) {
      return new URL(normalizedBase).toString();
    }
    const baseURI = typeof document !== "undefined" ? document.baseURI : "";
    if (!baseURI) {
      return "";
    }
    return new URL(normalizedBase, baseURI).toString();
  })();

  tree.iterate({
    enter: (node) => {
      if (!hasNodeName(INLINE_CONTAINER_NAMES, node.name)) {
        return;
      }

      const config = inlineConfigByNode.get(node.name);
      if (!config) {
        return;
      }

      if (node.name === NodeName.Link && isTaskTokenLink(state, node.from, node.to)) {
        return;
      }

      if (
        inRangeSegment(node.from, node.to, excluded.block) ||
        inRangeSegment(node.from, node.to, excluded.inline)
      ) {
        return;
      }

      if (node.name === NodeName.HTMLTag) {
        const literal = state.doc.sliceString(node.from, node.to);
        htmlTags.push(parseHtmlTagInfo(literal, node.from, node.to));
        return;
      }

      const raw = isInlineRaw(state, node, config.rawModeTrigger);
      if (!raw && config.richDisplayStyle === "hide") {
        const targets = inlineHideTargets.get(config.node);
        if (targets) {
          hidden.push(...collectChildRanges(state, node.from, node.to, new Set(targets)));
        }
      }

      if ((!raw || options.imageRawShowsPreview) && node.name === NodeName.Image) {
        const literal = state.doc.sliceString(node.from, node.to);
        const parsed = parseMarkdownImageLiteral(literal);
        if (!parsed) {
          return;
        }
        const { alt, rawSrc } = parsed;
        const shouldResolve =
          resolvedBase &&
          !/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(rawSrc) &&
          !rawSrc.startsWith("/");
        const src = shouldResolve ? new URL(rawSrc, resolvedBase).toString() : rawSrc;
        if (!src) {
          return;
        }
        images.push({ from: node.from, to: node.to, src, alt, raw });
      }
    },
  });

  const htmlTagConfig = inlineConfigByNode.get(NodeName.HTMLTag);
  if (htmlTagConfig && htmlTagConfig.richDisplayStyle === "hide") {
    const groups = groupInlineHtmlTags(htmlTags);
    for (const group of groups) {
      const raw = isInlineRaw(state, group, htmlTagConfig.rawModeTrigger);
      if (raw) {
        continue;
      }
      hidden.push(...group.tags);

      const style = group.openTag ? buildInlineHtmlStyle(group.openTag) : "";
      if (
        style &&
        typeof group.contentFrom === "number" &&
        typeof group.contentTo === "number" &&
        group.contentFrom < group.contentTo
      ) {
        htmlStyles.push({
          from: group.contentFrom,
          to: group.contentTo,
          style,
        });
      }
    }
  }

  return { hidden, images, htmlStyles };
}
