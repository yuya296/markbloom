import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { openMermaidPreview } from "../src/previewWindow";

test("warns and returns false when popup is blocked", () => {
  const warnings: unknown[] = [];

  const opened = openMermaidPreview("<svg></svg>", {
    openWindow: () => null,
    warn(message) {
      warnings.push(message);
    },
  });

  assert.equal(opened, false);
  assert.equal(warnings.length, 1);
});

test("opens a sanitized preview document when popup is available", () => {
  const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>");
  const domParser = (dom.window as unknown as { DOMParser: typeof globalThis.DOMParser }).DOMParser;
  const originalParser = globalThis.DOMParser;
  globalThis.DOMParser = domParser;

  try {
    const opened = openMermaidPreview(
      "<svg><script>evil()</script><g></g></svg>",
      {
        openWindow: () => dom.window,
      }
    );

    assert.equal(opened, true);
    assert.equal(dom.window.document.title, "Mermaid Preview");
    assert.equal(dom.window.document.querySelectorAll("script").length, 0);
    assert.ok(dom.window.document.querySelector(".mermaid-preview svg"));
    assert.ok(dom.window.document.querySelector("style"));
  } finally {
    globalThis.DOMParser = originalParser;
  }
});
