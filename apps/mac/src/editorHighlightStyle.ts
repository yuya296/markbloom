import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import type { Extension } from "@codemirror/state";

const highlightStyle = HighlightStyle.define([
  { tag: tags.comment, color: "var(--syntax-comment)", fontStyle: "italic" },
  { tag: tags.keyword, color: "var(--syntax-keyword)" },
  { tag: tags.operator, color: "var(--syntax-operator)" },
  { tag: [tags.string, tags.regexp], color: "var(--syntax-string)" },
  { tag: [tags.number, tags.integer, tags.float], color: "var(--syntax-number)" },
  { tag: [tags.bool, tags.null, tags.atom], color: "var(--syntax-atom)" },
  {
    tag: [tags.function(tags.variableName), tags.function(tags.propertyName)],
    color: "var(--syntax-function)",
  },
  {
    tag: [tags.variableName, tags.definition(tags.variableName)],
    color: "var(--syntax-variable)",
  },
  { tag: [tags.typeName, tags.className], color: "var(--syntax-type)" },
  { tag: [tags.propertyName, tags.attributeName], color: "var(--syntax-property)" },
  { tag: [tags.tagName, tags.angleBracket], color: "var(--syntax-tag)" },
  {
    tag: [tags.link, tags.url],
    color: "var(--syntax-link)",
    textDecoration: "underline",
  },
  { tag: tags.heading, color: "var(--syntax-heading)", fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.meta, color: "var(--syntax-meta)" },
  { tag: tags.monospace, fontFamily: "var(--mb-font-mono)" },
]);

export function editorHighlightStyle(): Extension {
  return syntaxHighlighting(highlightStyle);
}
