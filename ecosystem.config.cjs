const { execSync } = require("node:child_process");
const os = require("node:os");
const path = require("node:path");

const APP_BASE_NAME = "webview-demo";
const DEFAULT_PORT_BASE = 5300;
const DEFAULT_PORT_SPAN = 400;
const FALLBACK_BRANCH = "unknown";
const MAX_PORT = 65535;

function readGitBranch(repoRoot) {
  try {
    const branch = execSync("git branch --show-current", {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    if (branch) {
      return branch;
    }
  } catch {}

  try {
    const shortSha = execSync("git rev-parse --short HEAD", {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    if (shortSha) {
      return `detached-${shortSha}`;
    }
  } catch {}

  return FALLBACK_BRANCH;
}

function toSlug(value) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return slug || FALLBACK_BRANCH;
}

function hashText(text) {
  let hash = 2166136261;
  for (const char of text) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

function parsePositiveInt(value) {
  if (value == null || value === "") {
    return null;
  }
  if (!/^\d+$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function hasEnvKey(name) {
  return Object.prototype.hasOwnProperty.call(process.env, name);
}

function isValidPort(value) {
  return Number.isInteger(value) && value >= 1 && value <= MAX_PORT;
}

function resolvePort(branchName) {
  const hasExplicitPort = hasEnvKey("MB_PORT");
  const explicitPort = parsePositiveInt(process.env.MB_PORT);
  if (hasExplicitPort && (!isValidPort(explicitPort))) {
    throw new Error(`Invalid MB_PORT: ${process.env.MB_PORT}. Expected 1..${MAX_PORT}.`);
  }
  if (explicitPort != null) {
    return explicitPort;
  }

  const hasBase = hasEnvKey("MB_PORT_BASE");
  const hasSpan = hasEnvKey("MB_PORT_SPAN");
  const baseCandidate = parsePositiveInt(process.env.MB_PORT_BASE);
  const spanCandidate = parsePositiveInt(process.env.MB_PORT_SPAN);

  if (hasBase && !isValidPort(baseCandidate)) {
    throw new Error(
      `Invalid MB_PORT_BASE: ${process.env.MB_PORT_BASE}. Expected 1..${MAX_PORT}.`,
    );
  }
  if (hasSpan && spanCandidate == null) {
    throw new Error(
      `Invalid MB_PORT_SPAN: ${process.env.MB_PORT_SPAN}. Expected positive integer.`,
    );
  }

  const base = baseCandidate ?? DEFAULT_PORT_BASE;
  const span = spanCandidate ?? DEFAULT_PORT_SPAN;
  if (!isValidPort(base)) {
    throw new Error(`Invalid MB_PORT_BASE: ${base}. Expected 1..${MAX_PORT}.`);
  }
  if (!Number.isInteger(span) || span <= 0) {
    throw new Error(`Invalid MB_PORT_SPAN: ${span}. Expected positive integer.`);
  }
  if (base + span - 1 > MAX_PORT) {
    throw new Error(`Invalid port range: ${base}..${base + span - 1}. Max is ${MAX_PORT}.`);
  }
  return base + (hashText(branchName) % span);
}

function resolveHomeDir(fallbackPath) {
  try {
    return os.homedir();
  } catch {}
  return process.env.HOME || process.env.USERPROFILE || fallbackPath;
}

const repoRoot = __dirname;
const branchName = process.env.MB_BRANCH ?? readGitBranch(repoRoot);
const branchSlug = toSlug(branchName);
const branchHash = hashText(branchName).toString(16).padStart(8, "0").slice(0, 6);
const appName = `${APP_BASE_NAME}-${branchSlug}-${branchHash}`;
const namespace = `dev-${branchSlug}-${branchHash}`;
const port = resolvePort(branchName);

const pm2Home = process.env.PM2_HOME || path.join(resolveHomeDir(repoRoot), ".pm2");
const pm2LogsDir = path.join(pm2Home, "logs");
const pm2PidsDir = path.join(pm2Home, "pids");

module.exports = {
  apps: [
    {
      name: appName,
      namespace,
      cwd: path.join(repoRoot, "apps/webview-demo"),
      script: "pnpm",
      args: `dev -- --port ${port} --strictPort`,
      out_file: path.join(pm2LogsDir, `${appName}-out.log`),
      error_file: path.join(pm2LogsDir, `${appName}-error.log`),
      pid_file: path.join(pm2PidsDir, `${appName}.pid`),
      env: {
        NODE_ENV: "development",
        MB_BRANCH: branchName,
        MB_BRANCH_SLUG: branchSlug,
        MB_BRANCH_HASH: branchHash,
        MB_APP_NAME: appName,
        MB_PORT: String(port),
      },
    },
  ],
};
