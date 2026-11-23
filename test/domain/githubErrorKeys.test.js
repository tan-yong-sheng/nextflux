import test from "node:test";
import assert from "node:assert/strict";

import { githubErrorKey } from "../../src/domain/github/errorKeys.js";

test("maps HTTP statuses to translation keys", () => {
  assert.equal(githubErrorKey({ status: 401 }), "unauthorized");
  assert.equal(githubErrorKey({ status: 403 }), "forbidden");
  assert.equal(githubErrorKey({ status: 404 }), "notFound");
  assert.equal(githubErrorKey({ status: 409 }), "conflict");
});

test("maps error codes to translation keys", () => {
  assert.equal(githubErrorKey({ code: "missingRepo" }), "missingRepo");
  assert.equal(githubErrorKey({ code: "missingToken" }), "missingToken");
  assert.equal(githubErrorKey({ code: "invalidRepo" }), "invalidRepo");
  assert.equal(githubErrorKey({ code: "versionMissing" }), "notFound");
  assert.equal(githubErrorKey({ code: "offline" }), "offline");
});

test("falls back to a generic key", () => {
  assert.equal(githubErrorKey(null), "unknown");
  assert.equal(githubErrorKey({ status: 500 }), "unknown");
});
