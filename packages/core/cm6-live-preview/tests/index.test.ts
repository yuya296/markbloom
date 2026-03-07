import assert from "node:assert/strict";
import test from "node:test";
import type { LivePreviewPlugin } from "@yuya296/cm6-live-preview-core";
import {
  livePreviewPreset,
  resolveMermaidPresetOptions,
  resolvePresetLivePreviewOptions,
  resolveTablePresetOptions,
} from "../src/index";

function topLevelExtensionCount(extension: unknown): number {
  return Array.isArray(extension) ? extension.length : 1;
}

test("returns semantics, typography, and live preview by default", () => {
  const preset = livePreviewPreset();
  assert.equal(topLevelExtensionCount(preset), 3);
});

test("omits live preview extension when disabled", () => {
  const preset = livePreviewPreset({ livePreview: false });
  assert.equal(topLevelExtensionCount(preset), 2);
});

test("adds table editor only when enabled", () => {
  assert.equal(topLevelExtensionCount(livePreviewPreset({ table: true })), 4);
  assert.equal(topLevelExtensionCount(livePreviewPreset({ table: false })), 3);
  assert.equal(topLevelExtensionCount(livePreviewPreset({})), 3);
});

test("rejects mermaid when live preview is disabled", () => {
  assert.throws(
    () => livePreviewPreset({ livePreview: false, mermaid: true }),
    /mermaid option requires livePreview to be enabled/
  );
});

test("adds mermaid bundle extensions when enabled", () => {
  const preset = livePreviewPreset({ mermaid: true });
  assert.equal(topLevelExtensionCount(preset), 5);
});

test("normalizes mermaid and table preset options", () => {
  const mermaidOptions = { theme: "dark" as const };
  const tableOptions = { contextMenu: false };

  assert.deepEqual(resolveMermaidPresetOptions(true), {});
  assert.equal(resolveMermaidPresetOptions(false), null);
  assert.equal(resolveMermaidPresetOptions(mermaidOptions), mermaidOptions);

  assert.deepEqual(resolveTablePresetOptions(true), {});
  assert.equal(resolveTablePresetOptions(false), null);
  assert.equal(resolveTablePresetOptions(tableOptions), tableOptions);
});

test("merges extra plugins into resolved live preview options", () => {
  const pluginA: LivePreviewPlugin = {
    name: "plugin-a",
    decorate: () => [],
  };
  const pluginB: LivePreviewPlugin = {
    name: "plugin-b",
    decorate: () => [],
  };

  const resolved = resolvePresetLivePreviewOptions(
    {
      imageBasePath: "/images",
      plugins: [pluginA],
    },
    [pluginB]
  );

  assert.deepEqual(resolved, {
    imageBasePath: "/images",
    plugins: [pluginA, pluginB],
  });
  assert.equal(resolvePresetLivePreviewOptions(false, [pluginB]), null);
});
