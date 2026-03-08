import assert from "node:assert/strict";
import test from "node:test";
import { parseMarkdownImageLiteral } from "../src/inline/imageLiteral";

test("parses markdown image literal with optional double-quoted title", () => {
  assert.deepEqual(parseMarkdownImageLiteral("![alt](img/sample.png)"), {
    alt: "alt",
    rawSrc: "img/sample.png",
  });
  assert.deepEqual(
    parseMarkdownImageLiteral('![alt](img/sample.png "caption")'),
    {
      alt: "alt",
      rawSrc: "img/sample.png",
    }
  );
});

test("returns null for literals that are not eligible for preview parser", () => {
  assert.equal(parseMarkdownImageLiteral("![alt](img/sample.png 'caption')"), null);
  assert.equal(parseMarkdownImageLiteral("![alt](img sample.png)"), null);
  assert.equal(parseMarkdownImageLiteral("![alt]()"), null);
});
