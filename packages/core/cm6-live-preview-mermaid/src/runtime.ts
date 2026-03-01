export type MermaidThemeMode = "auto" | "light" | "dark";
export type MermaidRuntimeTheme = "default" | "dark";

export type MermaidApi = {
  initialize: (options: {
    startOnLoad: boolean;
    securityLevel: "strict" | "loose";
    theme: MermaidRuntimeTheme;
  }) => void;
  render: (
    id: string,
    source: string
  ) => Promise<{ svg: string; bindFunctions?: (element: Element) => void }>;
};

let initializedTheme: MermaidRuntimeTheme | null = null;
let mermaidApiCache: MermaidApi | null | undefined;

export function resolveRuntimeTheme(
  theme: MermaidThemeMode,
  doc: Pick<Document, "documentElement"> = document
): MermaidRuntimeTheme {
  if (theme === "light") {
    return "default";
  }
  if (theme === "dark") {
    return "dark";
  }
  return doc.documentElement.dataset.theme === "dark" ? "dark" : "default";
}

export function ensureMermaidInitialized(api: MermaidApi, theme: MermaidRuntimeTheme) {
  if (initializedTheme === theme) {
    return;
  }
  api.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme,
  });
  initializedTheme = theme;
}

export function resetMermaidInitializationState() {
  initializedTheme = null;
}

export function isMermaidApi(candidate: unknown): candidate is MermaidApi {
  if (!candidate || typeof candidate !== "object") {
    return false;
  }
  const api = candidate as Partial<MermaidApi>;
  return typeof api.initialize === "function" && typeof api.render === "function";
}

export function resolveMermaidApi(candidate: unknown): MermaidApi | null {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const direct = candidate as Partial<MermaidApi>;
  if (isMermaidApi(direct)) {
    return direct;
  }

  const nestedDefault = (candidate as { default?: unknown }).default;
  const nestedApi = resolveMermaidApi(nestedDefault);
  if (nestedApi) {
    return nestedApi;
  }

  return null;
}

export async function loadMermaidApi(options: {
  skipGlobal?: boolean;
  importer?: () => Promise<unknown>;
  globalScope?: typeof globalThis & { mermaid?: unknown };
} = {}): Promise<MermaidApi | null> {
  const globalScope =
    options.globalScope ??
    (globalThis as typeof globalThis & {
      mermaid?: unknown;
    });
  const importer = options.importer ?? (() => import("mermaid"));

  if (!options.skipGlobal) {
    const windowApi = resolveMermaidApi(globalScope.mermaid);
    if (windowApi) {
      mermaidApiCache = windowApi;
      return mermaidApiCache;
    }
  }

  if (mermaidApiCache !== undefined) {
    return mermaidApiCache;
  }

  try {
    const importedApi = resolveMermaidApi(await importer());
    mermaidApiCache = importedApi;
    return mermaidApiCache;
  } catch {
    mermaidApiCache = null;
    return mermaidApiCache;
  }
}

export function clearCachedMermaidApi() {
  mermaidApiCache = undefined;
}
