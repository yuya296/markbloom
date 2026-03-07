export type PreviewFeatureFlags = {
  mermaid: boolean;
};

const DEFAULT_PREVIEW_FEATURE_FLAGS: PreviewFeatureFlags = {
  mermaid: false,
};

export function resolvePreviewFeatureFlags(
  overrides: Partial<PreviewFeatureFlags> = {},
): PreviewFeatureFlags {
  return {
    ...DEFAULT_PREVIEW_FEATURE_FLAGS,
    ...overrides,
  };
}

export function resolveMermaidPreviewEnabled(options: {
  livePreviewEnabled: boolean;
  featureFlags?: Partial<PreviewFeatureFlags>;
}): boolean {
  const flags = resolvePreviewFeatureFlags(options.featureFlags);
  return options.livePreviewEnabled && flags.mermaid;
}
