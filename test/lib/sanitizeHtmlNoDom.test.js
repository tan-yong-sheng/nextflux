import test from "node:test";
import assert from "node:assert/strict";

// No window is installed in this process: the sanitizer must not throw and
// must not hand the raw markup back.
const { sanitizeArticleHtml } = await import("../../src/lib/sanitizeHtml.js");

test("strips all markup when there is no DOM to sanitize with", () => {
  const out = sanitizeArticleHtml('<p onclick="alert(1)">hi<script>alert(2)</script>');
  assert.equal(out.includes("<"), false);
  assert.equal(out.includes("onclick"), false);
  assert.equal(out.includes("alert(2)"), false);
});

test("returns empty string for empty input without a DOM", () => {
  assert.equal(sanitizeArticleHtml(""), "");
});
