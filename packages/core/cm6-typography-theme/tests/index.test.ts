import assert from "node:assert/strict";
import test from "node:test";
import { buildTypographyThemeSpec } from "../src/index";

test("builds default list marker variables", () => {
  const spec = buildTypographyThemeSpec();
  assert.deepEqual(spec[".cm-content"], {
    "--mb-list-marker-width-ch": "1.5ch",
    "--mb-list-indent-step-ch": "2ch",
    "--mb-list-marker-bullet-color": "var(--editor-primary-color, currentColor)",
    "--mb-list-marker-ordered-color": "var(--editor-secondary-color, currentColor)",
  });
});

test("uses custom prefix in generated selectors", () => {
  const spec = buildTypographyThemeSpec({ classPrefix: "demo-" });
  assert.ok(spec[".cm-content .demo-heading-1"]);
  assert.ok(spec[".cm-content .demo-link"]);
  assert.ok(spec[".cm-content .demo-code"]);
});

test("uses custom list marker sizing and colors", () => {
  const spec = buildTypographyThemeSpec({
    listMarkerWidthCh: 3,
    listIndentStepCh: 4,
    listBulletColor: "#123456",
    listOrderedColor: "#abcdef",
  });

  assert.deepEqual(spec[".cm-content"], {
    "--mb-list-marker-width-ch": "3ch",
    "--mb-list-indent-step-ch": "4ch",
    "--mb-list-marker-bullet-color": "#123456",
    "--mb-list-marker-ordered-color": "#abcdef",
  });
});

test("keeps key selectors for headings, links, code, and list markers", () => {
  const spec = buildTypographyThemeSpec();
  assert.ok(spec[".cm-content .mb-heading-1"]);
  assert.ok(spec[".cm-content .mb-link"]);
  assert.ok(spec[".cm-content .mb-code"]);
  assert.ok(spec[".cm-content .cm-lp-list-marker"]);
  assert.ok(spec[".cm-content .cm-lp-list-marker-bullet"]);
  assert.ok(spec[".cm-content .cm-lp-list-marker-ordered"]);
});
