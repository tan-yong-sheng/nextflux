import test from "node:test";
import assert from "node:assert/strict";
import { isSafeHref, getLinkLabel } from "../../src/lib/safeHref.js";

test("allows absolute http, https, mailto and tel links", () => {
  assert.equal(isSafeHref("https://example.com/a"), true);
  assert.equal(isSafeHref("http://example.com/a"), true);
  assert.equal(isSafeHref("mailto:a@example.com"), true);
  assert.equal(isSafeHref("tel:+6012345678"), true);
});

test("allows fragments and site-relative paths", () => {
  assert.equal(isSafeHref("#section"), true);
  assert.equal(isSafeHref("/articles/1"), true);
  assert.equal(isSafeHref("article/1"), true);
});

test("rejects scheme-relative and backslash urls", () => {
  assert.equal(isSafeHref("//evil.com"), false);
  assert.equal(isSafeHref("\\\\evil.com"), false);
});

test("rejects control characters used to smuggle a scheme-relative url", () => {
  assert.equal(isSafeHref("/\t/evil.com"), false);
  assert.equal(isSafeHref("/\n/evil.com"), false);
  assert.equal(isSafeHref("/\r/evil.com"), false);
});

test("rejects script and data urls", () => {
  assert.equal(isSafeHref("javascript:alert(1)"), false);
  assert.equal(isSafeHref("data:text/html,<script>alert(1)</script>"), false);
  assert.equal(isSafeHref("vbscript:msgbox"), false);
});

test("rejects empty and non-string input", () => {
  assert.equal(isSafeHref(""), false);
  assert.equal(isSafeHref(null), false);
  assert.equal(isSafeHref(undefined), false);
});

test("labels links with their hostname, or the raw value when there is none", () => {
  assert.equal(getLinkLabel("https://example.com/a"), "example.com");
  assert.equal(getLinkLabel("mailto:a@example.com"), "mailto:a@example.com");
  assert.equal(getLinkLabel("tel:+6012345678"), "tel:+6012345678");
  assert.equal(getLinkLabel("/articles/1"), "/articles/1");
});
