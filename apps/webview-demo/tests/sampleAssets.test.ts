import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

function isExternalOrAbsolute(src: string): boolean {
  return /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(src) || src.startsWith("/");
}

test("sample markdown relative images exist under public/assets", () => {
  const testDir = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(testDir, "..");
  const samplePath = path.join(projectRoot, "assets", "sample.md");
  const source = fs.readFileSync(samplePath, "utf8");
  const imagePattern = /!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

  const relativeSources: string[] = [];
  let match = imagePattern.exec(source);
  while (match) {
    const src = (match[1] ?? "").trim();
    if (src && !isExternalOrAbsolute(src)) {
      relativeSources.push(src);
    }
    match = imagePattern.exec(source);
  }

  assert.ok(relativeSources.length > 0, "sample.md should include at least one relative image");

  for (const src of relativeSources) {
    const clean = src.split(/[?#]/u, 1)[0] ?? "";
    const assetPath = path.resolve(projectRoot, "public", "assets", clean);
    assert.ok(
      fs.existsSync(assetPath),
      `Missing image asset for sample markdown: ${src} (expected: ${assetPath})`
    );
  }
});
