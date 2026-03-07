export type ExtensionOptions = {
  showLineNumbers: boolean;
  wrapLines: boolean;
  tabSize: number;
  livePreviewEnabled: boolean;
  blockRevealEnabled: boolean;
  diffBaselineText: string;
};

export type ExtensionControlValues = {
  showLineNumbers: boolean;
  wrapLines: boolean;
  livePreviewEnabled: boolean;
  blockRevealEnabled: boolean;
  tabSizeInput: string;
  diffBaselineText: string;
};

export type NormalizedTabSize = {
  value: number;
  isValid: boolean;
};

export type ResolvedExtensionOptions = ExtensionOptions & {
  normalizedTabSizeInput: string;
  tabSizeWasNormalized: boolean;
};

const DEFAULT_TAB_SIZE = 4;
const MIN_TAB_SIZE = 2;
const MAX_TAB_SIZE = 8;

export function normalizeTabSize(raw: string): NormalizedTabSize {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { value: DEFAULT_TAB_SIZE, isValid: false };
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return { value: DEFAULT_TAB_SIZE, isValid: false };
  }

  const normalizedValue = Math.min(
    MAX_TAB_SIZE,
    Math.max(MIN_TAB_SIZE, Math.trunc(parsed))
  );

  return {
    value: normalizedValue,
    isValid:
      Number.isInteger(parsed) &&
      parsed >= MIN_TAB_SIZE &&
      parsed <= MAX_TAB_SIZE,
  };
}

export function readExtensionOptionsFromControls(
  values: ExtensionControlValues
): ResolvedExtensionOptions {
  const normalizedTabSize = normalizeTabSize(values.tabSizeInput);

  return {
    showLineNumbers: values.showLineNumbers,
    wrapLines: values.wrapLines,
    tabSize: normalizedTabSize.value,
    livePreviewEnabled: values.livePreviewEnabled,
    blockRevealEnabled: values.blockRevealEnabled,
    diffBaselineText: values.diffBaselineText,
    normalizedTabSizeInput: String(normalizedTabSize.value),
    tabSizeWasNormalized:
      !normalizedTabSize.isValid ||
      values.tabSizeInput.trim() !== String(normalizedTabSize.value),
  };
}
