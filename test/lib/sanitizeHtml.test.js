import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://localhost/",
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;

const { sanitizeArticleHtml } = await import("../../src/lib/sanitizeHtml.js");

test("removes script tags and their contents", () => {
  const out = sanitizeArticleHtml(
    "<p>ok</p><script>alert(1)</script>",
  );
  assert.equal(out.includes("<script"), false);
  assert.equal(out.includes("alert(1)"), false);
  assert.ok(out.includes("<p>ok</p>"));
});

test("removes inline event handlers", () => {
  const out = sanitizeArticleHtml('<img src="https://x.test/a.png" onerror="alert(1)">');
  assert.equal(out.includes("onerror"), false);
  assert.ok(out.includes("https://x.test/a.png"));
});

test("removes javascript: urls on links", () => {
  const out = sanitizeArticleHtml('<a href="javascript:alert(1)">x</a>');
  assert.equal(/href\s*=\s*["']?javascript:/i.test(out), false);
});

test("forbids style tags and style attributes", () => {
  const out = sanitizeArticleHtml(
    '<style>body{display:none}</style><p style="position:fixed;z-index:9999">x</p>',
  );
  assert.equal(out.includes("<style"), false);
  assert.equal(/style\s*=/i.test(out), false);
});

test("keeps iframe with allowlisted allow features only", () => {
  const out = sanitizeArticleHtml(
    '<iframe src="https://player.test/v" allow="autoplay; camera \'none\'; microphone \'none\'"></iframe>',
  );
  assert.ok(out.includes("<iframe"));
  assert.ok(out.includes("autoplay"));
  assert.equal(out.includes("camera"), false);
  assert.equal(out.includes("microphone"), false);
});

test("keeps iframe-only attributes off other elements", () => {
  const out = sanitizeArticleHtml(
    '<div allow="camera \'none\'" frameborder="0">x</div>',
  );
  assert.equal(out.includes("allow="), false);
  assert.equal(out.includes("frameborder"), false);
});

test("keeps media markup and attributes intact", () => {
  const out = sanitizeArticleHtml(
    '<img src="https://x.test/a.png" alt="a" width="10"><video src="https://x.test/v.mp4" controls></video><audio src="https://x.test/a.mp3" controls></audio>',
  );
  assert.ok(out.includes('alt="a"'));
  assert.ok(out.includes("width=\"10\"") || out.includes('width="10"'));
  assert.ok(out.includes("<video"));
  assert.ok(out.includes("<audio"));
});

test("returns empty string for empty input", () => {
  assert.equal(sanitizeArticleHtml(""), "");
  assert.equal(sanitizeArticleHtml(null), "");
});
