import assert from "node:assert/strict";
import test from "node:test";
import { EditorState } from "@codemirror/state";
import { Decoration } from "@codemirror/view";
import { resolveLivePreviewOptions } from "../src/options";
import { applyLivePreviewPlugins } from "../src/plugins/applyPlugins";
import type { LivePreviewPlugin, LivePreviewPluginContext } from "../src/plugins/types";

function createContext(doc = "hello"): LivePreviewPluginContext {
  return {
    state: EditorState.create({ doc }),
    selectionRanges: [],
    blockRevealRange: null,
    isSelectionOverlap: () => false,
    isBlockRevealOverlap: () => false,
  };
}

test("deduplicates repeated plugin errors within one apply pass", () => {
  const errorEvents: string[] = [];
  const plugin: LivePreviewPlugin = {
    name: "broken",
    decorate() {
      throw new Error("boom");
    },
  };

  applyLivePreviewPlugins(
    () => {
      throw new Error("push should not be called");
    },
    createContext(),
    resolveLivePreviewOptions({
      plugins: [plugin, plugin],
      onPluginError(event) {
        errorEvents.push(`${event.pluginName}:${String(event.error)}`);
      },
    })
  );

  assert.equal(errorEvents.length, 1);
});

test("skips invalid plugin decorations and keeps valid ones", () => {
  const pushed: Array<{ from: number; to: number }> = [];
  const plugin: LivePreviewPlugin = {
    name: "mixed",
    decorate() {
      return [
        null as never,
        {
          from: -1,
          to: 2,
          decoration: Decoration.mark({ class: "invalid" }),
        },
        {
          from: 1,
          to: 3,
          decoration: Decoration.mark({ class: "valid" }),
        },
      ];
    },
  };

  applyLivePreviewPlugins(
    (from, to) => {
      pushed.push({ from, to });
    },
    createContext(),
    resolveLivePreviewOptions({ plugins: [plugin] })
  );

  assert.deepEqual(pushed, [{ from: 1, to: 3 }]);
});

test("continues applying later plugins after one plugin throws", () => {
  let errorCount = 0;
  const pushed: Array<{ from: number; to: number }> = [];
  const broken: LivePreviewPlugin = {
    name: "broken",
    decorate() {
      throw new Error("boom");
    },
  };
  const working: LivePreviewPlugin = {
    name: "working",
    decorate() {
      return [
        {
          from: 0,
          to: 5,
          decoration: Decoration.mark({ class: "ok" }),
        },
      ];
    },
  };

  applyLivePreviewPlugins(
    (from, to) => {
      pushed.push({ from, to });
    },
    createContext(),
    resolveLivePreviewOptions({
      plugins: [broken, working],
      onPluginError() {
        errorCount += 1;
      },
    })
  );

  assert.equal(errorCount, 1);
  assert.deepEqual(pushed, [{ from: 0, to: 5 }]);
});
