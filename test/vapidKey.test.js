import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeBase64Url,
  encodeBase64Url,
} from "../src/domain/push/vapidKey.js";

test("base64url round-trips arbitrary bytes", () => {
  const bytes = Uint8Array.from({ length: 65 }, (_, index) => (index * 7) % 256);
  assert.deepEqual(decodeBase64Url(encodeBase64Url(bytes)), bytes);
});

test("padding is inferred from the encoded length", () => {
  // Lengths 1, 2 and 3 need one or two missing "=" signs.
  for (const bytes of [
    Uint8Array.from([0xab]),
    Uint8Array.from([0xab, 0xcd]),
    Uint8Array.from([0xab, 0xcd, 0xef]),
  ]) {
    assert.deepEqual(decodeBase64Url(encodeBase64Url(bytes)), bytes);
  }
});

test("url-safe alphabet is accepted", () => {
  const bytes = Uint8Array.from([0xfb, 0xff, 0xfe]);
  const encoded = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  assert.equal(encoded.includes("-"), true);
  assert.deepEqual(decodeBase64Url(encoded), bytes);
});
