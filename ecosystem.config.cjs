const { execSync } = require("node:child_process");
const path = require("node:path");

const APP_BASE_NAME = "webview-demo";
const DEFAULT_PORT_BASE = 5300;
const DEFAULT_PORT_SPAN = 400;
const FALLBACK_BRANCH = "unknown";

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
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function resolvePort(branchSlug) {
  const explicitPort = parsePositiveInt(process.env.MB_PORT);
  if (explicitPort != null) {
    return explicitPort;
  }

  const base = parsePositiveInt(process.env.MB_PORT_BASE) ?? DEFAULT_PORT_BASE;
  const span = parsePositiveInt(process.env.MB_PORT_SPAN) ?? DEFAULT_PORT_SPAN;
  return base + (hashText(branchSlug) % span);
}

const repoRoot = __dirname;
const branchName = process.env.MB_BRANCH ?? readGitBranch(repoRoot);
const branchSlug = toSlug(branchName);
const appName = `${APP_BASE_NAME}-${branchSlug}`;
const namespace = `dev-${branchSlug}`;
const port = resolvePort(branchSlug);

const pm2Home = process.env.PM2_HOME || path.join(process.env.HOME || repoRoot, ".pm2");
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
        MB_APP_NAME: appName,
        MB_PORT: String(port),
      },
    },
  ],
};
