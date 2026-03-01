import assert from "node:assert/strict";
import test from "node:test";
import {
  clearCachedMermaidApi,
  ensureMermaidInitialized,
  isMermaidApi,
  loadMermaidApi,
  resetMermaidInitializationState,
  resolveMermaidApi,
  resolveRuntimeTheme,
  type MermaidApi,
} from "../src/runtime";

function createMermaidApi(): MermaidApi {
  return {
    initialize() {},
    render: async () => ({ svg: "<svg></svg>" }),
  };
}

test("resolves runtime theme for explicit and auto modes", () => {
  const lightDoc = { documentElement: { dataset: { theme: "light" } } } as const;
  const darkDoc = { documentElement: { dataset: { theme: "dark" } } } as const;

  assert.equal(resolveRuntimeTheme("light", lightDoc as never), "default");
  assert.equal(resolveRuntimeTheme("dark", lightDoc as never), "dark");
  assert.equal(resolveRuntimeTheme("auto", lightDoc as never), "default");
  assert.equal(resolveRuntimeTheme("auto", darkDoc as never), "dark");
});

test("detects and resolves direct or default-exported mermaid apis", () => {
  const api = createMermaidApi();
  assert.equal(isMermaidApi(api), true);
  assert.equal(resolveMermaidApi(api), api);
  assert.equal(resolveMermaidApi({ default: api }), api);
  assert.equal(resolveMermaidApi({ default: { default: api } }), api);
  assert.equal(resolveMermaidApi({}), null);
});

test("loads mermaid from global scope before importer and caches result", async () => {
  const api = createMermaidApi();
  let importerCalls = 0;
  clearCachedMermaidApi();

  const resolved = await loadMermaidApi({
    globalScope: { mermaid: api } as typeof globalThis & { mermaid?: unknown },
    importer: async () => {
      importerCalls += 1;
      return {};
    },
  });

  const cached = await loadMermaidApi({
    globalScope: {} as typeof globalThis & { mermaid?: unknown },
    importer: async () => {
      importerCalls += 1;
      return {};
    },
  });

  assert.equal(resolved, api);
  assert.equal(cached, api);
  assert.equal(importerCalls, 0);
});

test("initializes mermaid only when the theme changes", () => {
  let initializeCalls = 0;
  const api: MermaidApi = {
    initialize() {
      initializeCalls += 1;
    },
    render: async () => ({ svg: "<svg></svg>" }),
  };

  resetMermaidInitializationState();
  ensureMermaidInitialized(api, "default");
  ensureMermaidInitialized(api, "default");
  ensureMermaidInitialized(api, "dark");

  assert.equal(initializeCalls, 2);
  resetMermaidInitializationState();
});
