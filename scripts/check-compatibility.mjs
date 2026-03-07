import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

function parseSemver(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) {
    throw new Error(`Invalid semver: ${version}`);
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    pre: match[4] ?? null,
  };
}

function compareSemver(left, right) {
  const a = parseSemver(left);
  const b = parseSemver(right);

  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  if (a.pre === b.pre) return 0;
  if (a.pre === null) return 1;
  if (b.pre === null) return -1;
  return a.pre.localeCompare(b.pre);
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

const packagesDir = join(process.cwd(), "packages", "core");
const corePackageDirs = readdirSync(packagesDir, { withFileTypes: true })
  .filter((dirent) => dirent.isDirectory() && dirent.name.startsWith("cm6-"))
  .map((dirent) => join(packagesDir, dirent.name))
  .filter((dir) => existsSync(join(dir, "package.json")));

if (corePackageDirs.length === 0) {
  throw new Error("No core package directories were found (expected packages/core/cm6-*).");
}

const corePackages = corePackageDirs.map((dir) => loadJson(join(dir, "package.json")));
const coreVersions = [...new Set(corePackages.map((pkg) => pkg.version))];
if (coreVersions.length !== 1) {
  const rendered = corePackages.map((pkg) => `- ${pkg.name}@${pkg.version}`).join("\n");
  throw new Error(`Core packages must stay in lockstep:\n${rendered}`);
}

const coreVersion = coreVersions[0];
const matrix = loadJson(join(process.cwd(), "releases", "compatibility-matrix.json"));

function validateCoreRangeForApp({ appName, required = false }) {
  const appConfig = matrix?.apps?.[appName];
  if (!appConfig) {
    if (required) {
      throw new Error(`Invalid compatibility matrix: apps.${appName} is required.`);
    }
    return null;
  }

  const status = typeof appConfig.status === "string" ? appConfig.status : "active";
  if (status === "reserved") {
    return {
      appName,
      status,
      min: null,
      max: null,
    };
  }

  const range = appConfig?.supports?.core;
  if (!range || typeof range.min !== "string" || typeof range.max !== "string") {
    throw new Error(
      `Invalid compatibility matrix: apps.${appName}.supports.core min/max are required when status=${status}.`,
    );
  }

  if (compareSemver(range.min, range.max) > 0) {
    throw new Error(
      `Invalid ${appName} compatibility range: min (${range.min}) is greater than max (${range.max}).`,
    );
  }

  if (compareSemver(coreVersion, range.min) < 0 || compareSemver(coreVersion, range.max) > 0) {
    throw new Error(
      `Core version ${coreVersion} is outside ${appName} compatibility range [${range.min}, ${range.max}].`,
    );
  }

  return {
    appName,
    status,
    min: range.min,
    max: range.max,
  };
}

const results = [
  validateCoreRangeForApp({ appName: "vscode", required: true }),
  validateCoreRangeForApp({ appName: "mac", required: true }),
].filter(Boolean);

const rendered = results
  .map((result) => {
    if (result.min === null || result.max === null) {
      return `${result.appName}=reserved`;
    }
    return `${result.appName}=[${result.min}, ${result.max}]`;
  })
  .join(", ");

console.log(`Compatibility check passed: core=${coreVersion}, ${rendered}`);
