import assert from "node:assert/strict";
import test from "node:test";
import type { SyntaxNode } from "@lezer/common";
import {
  extractLinkHrefFromText,
  getBlockquoteLevel,
  getListLevel,
  getTaskStateClassFromText,
  slugifyHeading,
  stripHeadingMarkers,
} from "../src/index";

type MockNode = {
  name: string;
  parent: MockNode | null;
};

function createNode(name: string, parentNames: readonly string[] = []): SyntaxNode {
  let parent: MockNode | null = null;
  for (let index = parentNames.length - 1; index >= 0; index -= 1) {
    parent = {
      name: parentNames[index] ?? "",
      parent,
    };
  }
  return {
    name,
    parent,
  } as unknown as SyntaxNode;
}

test("slugifies headings consistently for punctuation and multilingual text", () => {
  assert.equal(slugifyHeading("  Hello, 世界!  "), "hello-世界");
  assert.equal(slugifyHeading("Repeat  --  Repeat"), "repeat-repeat");
  assert.equal(slugifyHeading(""), "");
});

test("strips ATX markers and trailing hashes from heading text", () => {
  assert.equal(stripHeadingMarkers("### Section Title ###"), "Section Title");
  assert.equal(stripHeadingMarkers("## spaced title   "), "spaced title");
});

test("extracts hrefs from autolinks and markdown links", () => {
  assert.equal(extractLinkHrefFromText("<https://example.com/docs>"), "https://example.com/docs");
  assert.equal(extractLinkHrefFromText("[docs]( /guide/start )"), "/guide/start");
  assert.equal(extractLinkHrefFromText("plain text"), null);
});

test("derives task classes from raw task prefixes", () => {
  assert.equal(getTaskStateClassFromText("[ ] open", "mb-"), "mb-task-unchecked");
  assert.equal(getTaskStateClassFromText("[x] done", "mb-"), "mb-task-checked");
  assert.equal(getTaskStateClassFromText("[X] done", "mb-"), "mb-task-checked");
  assert.equal(getTaskStateClassFromText("not a task", "mb-"), null);
});

test("counts list nesting from ancestor lists", () => {
  assert.equal(getListLevel(createNode("ListItem", ["BulletList"])), 1);
  assert.equal(getListLevel(createNode("ListItem", ["BulletList", "OrderedList"])), 2);
  assert.equal(getListLevel(null), 0);
});

test("counts blockquote nesting from current node and ancestors", () => {
  assert.equal(getBlockquoteLevel(createNode("Blockquote")), 1);
  assert.equal(getBlockquoteLevel(createNode("Blockquote", ["Blockquote", "Blockquote"])), 3);
  assert.equal(getBlockquoteLevel(null), 0);
});
