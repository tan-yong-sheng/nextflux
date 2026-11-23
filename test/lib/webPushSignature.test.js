import assert from "node:assert/strict";
import { test } from "node:test";
import { createHmac } from "node:crypto";
import { signBody, timingSafeEqual, verifyMinifluxSignature } from "../../functions/lib/signature.js";

const SECRET = "c4fdaf87900b72777cbe8e97d17b97a87d28ae078a462ef4ac5f2541fcf00ce6";
const BODY = JSON.stringify({ event_type: "new_entries", entries: [] });

test("signBody matches an HMAC-SHA256 hex digest", async () => {
  const expected = createHmac("sha256", SECRET).update(BODY).digest("hex");
  assert.equal(await signBody(SECRET, BODY), expected);
});

test("verifyMinifluxSignature accepts the Miniflux header", async () => {
  const signature = createHmac("sha256", SECRET).update(BODY).digest("hex");
  assert.equal(await verifyMinifluxSignature(SECRET, BODY, signature), true);
});

test("verifyMinifluxSignature accepts an uppercase digest", async () => {
  const signature = createHmac("sha256", SECRET).update(BODY).digest("hex").toUpperCase();
  assert.equal(await verifyMinifluxSignature(SECRET, BODY, signature), true);
});

test("verifyMinifluxSignature rejects tampered bodies, secrets and headers", async () => {
  const signature = createHmac("sha256", SECRET).update(BODY).digest("hex");
  assert.equal(await verifyMinifluxSignature(SECRET, `${BODY} `, signature), false);
  assert.equal(await verifyMinifluxSignature("other-secret", BODY, signature), false);
  assert.equal(await verifyMinifluxSignature(SECRET, BODY, signature.slice(0, -2)), false);
  assert.equal(await verifyMinifluxSignature(SECRET, BODY, null), false);
  assert.equal(await verifyMinifluxSignature("", BODY, signature), false);
});

test("timingSafeEqual compares digests without leaking through length", () => {
  assert.equal(timingSafeEqual("abc", "abc"), true);
  assert.equal(timingSafeEqual("abc", "abd"), false);
  assert.equal(timingSafeEqual("abc", "ab"), false);
});
