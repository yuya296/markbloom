import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeTabSize,
  readExtensionOptionsFromControls,
} from "../src/editorSettings.ts";
import {
  resolveMermaidPreviewEnabled,
  resolvePreviewFeatureFlags,
} from "../src/featureFlags.ts";

test("normalizeTabSize keeps in-range integer values", () => {
  assert.deepEqual(normalizeTabSize("4"), { value: 4, isValid: true });
});

test("normalizeTabSize clamps low values to the minimum", () => {
  assert.deepEqual(normalizeTabSize("1"), { value: 2, isValid: false });
});

test("normalizeTabSize clamps negative values to the minimum", () => {
  assert.deepEqual(normalizeTabSize("-1"), { value: 2, isValid: false });
});

test("normalizeTabSize clamps high values to the maximum", () => {
  assert.deepEqual(normalizeTabSize("999"), { value: 8, isValid: false });
});

test("normalizeTabSize falls back for empty values", () => {
  assert.deepEqual(normalizeTabSize(""), { value: 4, isValid: false });
});

test("normalizeTabSize truncates decimals before clamping", () => {
  assert.deepEqual(normalizeTabSize("3.7"), { value: 3, isValid: false });
});

test("resolvePreviewFeatureFlags keeps mermaid disabled by default", () => {
  assert.deepEqual(resolvePreviewFeatureFlags(), { mermaid: false });
});

test("resolvePreviewFeatureFlags accepts explicit overrides", () => {
  assert.deepEqual(resolvePreviewFeatureFlags({ mermaid: true }), {
    mermaid: true,
  });
});

test("resolveMermaidPreviewEnabled requires live preview and feature flag", () => {
  assert.equal(resolveMermaidPreviewEnabled({ livePreviewEnabled: true }), false);
  assert.equal(
    resolveMermaidPreviewEnabled({
      livePreviewEnabled: true,
      featureFlags: { mermaid: true },
    }),
    true
  );
  assert.equal(
    resolveMermaidPreviewEnabled({
      livePreviewEnabled: false,
      featureFlags: { mermaid: true },
    }),
    false
  );
});

test("readExtensionOptionsFromControls normalizes tab size and preserves toggles", () => {
  const result = readExtensionOptionsFromControls({
    showLineNumbers: true,
    wrapLines: false,
    livePreviewEnabled: true,
    blockRevealEnabled: false,
    tabSizeInput: "1",
    diffBaselineText: "baseline",
  });

  assert.equal(result.showLineNumbers, true);
  assert.equal(result.wrapLines, false);
  assert.equal(result.livePreviewEnabled, true);
  assert.equal(result.blockRevealEnabled, false);
  assert.equal(result.tabSize, 2);
  assert.equal(result.normalizedTabSizeInput, "2");
  assert.equal(result.tabSizeWasNormalized, true);
  assert.equal(result.diffBaselineText, "baseline");
});
