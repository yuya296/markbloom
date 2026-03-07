import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { parseAndSanitizeSvg } from "../src/sanitizeSvg";

test("removes blocked svg elements and unsafe attributes", () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const domParser = (dom.window as unknown as { DOMParser: typeof globalThis.DOMParser }).DOMParser;
  const originalParser = globalThis.DOMParser;
  globalThis.DOMParser = domParser;
  try {
    const svg = parseAndSanitizeSvg(
      "<svg onload='evil()'><script>evil()</script><g onclick='evil()'></g><a id='js' href='javascript:evil()'></a><a id='data' href='data:image/svg+xml,%3Csvg%3E%3C/svg%3E'></a><a id='ok-http' href='https://example.com'></a><a id='ok-frag' href='#node'></a></svg>",
      dom.window.document
    );

    assert.ok(svg);
    assert.equal(svg.querySelector("script"), null);
    assert.equal(svg.getAttribute("onload"), null);
    assert.equal(svg.querySelector("g")?.getAttribute("onclick"), null);
    assert.equal(svg.querySelector("#js")?.getAttribute("href"), null);
    assert.equal(svg.querySelector("#data")?.getAttribute("href"), null);
    assert.equal(svg.querySelector("#ok-http")?.getAttribute("href"), "https://example.com");
    assert.equal(svg.querySelector("#ok-frag")?.getAttribute("href"), "#node");
  } finally {
    globalThis.DOMParser = originalParser;
  }
});

test("returns null for invalid svg markup", () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const domParser = (dom.window as unknown as { DOMParser: typeof globalThis.DOMParser }).DOMParser;
  const originalParser = globalThis.DOMParser;
  globalThis.DOMParser = domParser;
  try {
    assert.equal(parseAndSanitizeSvg("<div></div>", dom.window.document), null);
  } finally {
    globalThis.DOMParser = originalParser;
  }
});
