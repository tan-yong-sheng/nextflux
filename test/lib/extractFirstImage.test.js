import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://localhost/",
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.DOMParser = dom.window.DOMParser;

const { extractFirstImage } = await import("../../src/lib/utils.js");

test("returns the first image src from the article content", () => {
  const image = extractFirstImage({
    content: '<p>text</p><img src="https://x.test/a.png" alt="a">',
  });
  assert.equal(image, "https://x.test/a.png");
});

test("drops script payloads from the article content", () => {
  const image = extractFirstImage({
    content:
      '<img src="https://x.test/a.png"><script>alert(1)</script><p onclick="alert(2)">x</p>',
  });
  assert.equal(image, "https://x.test/a.png");
});

test("drops error handlers and javascript urls from the article content", () => {
  const image = extractFirstImage({
    content:
      '<img src="https://x.test/a.png" onerror="alert(1)"><a href="javascript:alert(2)">x</a>',
  });
  assert.equal(image, "https://x.test/a.png");
});

test("prefers an image enclosure over the content", () => {
  const image = extractFirstImage({
    content: '<img src="https://x.test/inline.png">',
    enclosures: [{ mime_type: "image/png", url: "https://x.test/enclosure.png" }],
  });
  assert.equal(image, "https://x.test/enclosure.png");
});

test("returns null when there is no image", () => {
  assert.equal(extractFirstImage({ content: "<p>no image</p>" }), null);
  assert.equal(extractFirstImage({}), null);
});
