import test from "node:test";
import assert from "node:assert/strict";

import { accountBackupKey } from "../../src/domain/github/accountKey.js";

test("derives a stable key from the account id", async () => {
  const first = await accountBackupKey('["https://miniflux.example.com","42"]');
  const second = await accountBackupKey('["https://miniflux.example.com","42"]');
  assert.equal(first, second);
  assert.equal(first.length, 12);
});

test("derives different keys for different accounts", async () => {
  const a = await accountBackupKey('["https://a.example.com","1"]');
  const b = await accountBackupKey('["https://b.example.com","1"]');
  const c = await accountBackupKey('["https://a.example.com","2"]');
  assert.notEqual(a, b);
  assert.notEqual(a, c);
});

test("does not leak the server url in the key", async () => {
  const key = await accountBackupKey('["https://miniflux.example.com","42"]');
  assert.equal(key.includes("miniflux"), false);
  assert.match(key, /^[A-Za-z0-9_-]{12}$/);
});

test("the built-in digest matches Web Crypto without crypto.subtle", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  const inputs = [
    '["https://miniflux.example.com","42"]',
    // Longer than one SHA-256 block, so padding and scheduling are exercised.
    `["https://miniflux.example.com","${"42".repeat(40)}"]`,
  ];
  const expected = [];
  for (const input of inputs) expected.push(await accountBackupKey(input));

  Object.defineProperty(globalThis, "crypto", {
    value: {},
    configurable: true,
  });
  try {
    for (const [index, input] of inputs.entries()) {
      assert.equal(await accountBackupKey(input), expected[index]);
    }
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "crypto", descriptor);
  }
});
