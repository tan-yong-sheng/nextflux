import assert from "node:assert/strict";
import { test } from "node:test";
import { Buffer } from "node:buffer";
import {
  decodeBase64Url,
  normalizeSubscription,
  readSubscriptions,
  removeSubscription,
  upsertSubscription,
  writeSubscriptions,
} from "../../functions/lib/subscriptions.js";

const p256dh = Buffer.concat([Buffer.from([0x04]), Buffer.alloc(64, 7)]).toString("base64url");
const auth = Buffer.alloc(16, 9).toString("base64url");
const endpoint = "https://fcm.googleapis.com/fcm/send/abc123";

const createEnv = (store = new Map()) => ({
  NEXTFLUX_PUSH: {
    get: async (key) => store.get(key) ?? null,
    put: async (key, value) => store.set(key, value),
  },
});

test("decodeBase64Url decodes url-safe values and rejects junk", () => {
  assert.equal(Buffer.from(decodeBase64Url(auth)).length, 16);
  assert.equal(decodeBase64Url("not+base64/"), null);
  assert.equal(decodeBase64Url(undefined), null);
});

test("normalizeSubscription accepts a browser subscription", () => {
  const subscription = normalizeSubscription({ endpoint, expirationTime: null, keys: { p256dh, auth } });
  assert.deepEqual(subscription, { endpoint, expirationTime: null, keys: { p256dh, auth } });
});

test("normalizeSubscription rejects endpoints and keys that push cannot use", () => {
  assert.equal(normalizeSubscription(null), null);
  assert.equal(normalizeSubscription({ endpoint: "http://example.com", keys: { p256dh, auth } }), null);
  assert.equal(normalizeSubscription({ endpoint: "nope", keys: { p256dh, auth } }), null);
  assert.equal(normalizeSubscription({ endpoint, keys: null }), null);
  assert.equal(normalizeSubscription({ endpoint, keys: { p256dh: auth, auth } }), null);
  assert.equal(normalizeSubscription({ endpoint, keys: { p256dh, auth: p256dh } }), null);
});

test("upsertSubscription keeps one record per endpoint", () => {
  const first = normalizeSubscription({ endpoint, keys: { p256dh, auth } });
  const second = normalizeSubscription({ endpoint: `${endpoint}-2`, keys: { p256dh, auth } });
  const list = upsertSubscription(upsertSubscription([], first), second);
  assert.equal(list.length, 2);
  assert.deepEqual(upsertSubscription(list, first).map((item) => item.endpoint).sort(), [
    endpoint,
    `${endpoint}-2`,
  ].sort());
});

test("removeSubscription drops a single endpoint", () => {
  const list = [{ endpoint }, { endpoint: `${endpoint}-2` }];
  assert.deepEqual(removeSubscription(list, endpoint), [{ endpoint: `${endpoint}-2` }]);
  assert.deepEqual(removeSubscription(list, "https://example.com/unknown"), list);
});

test("subscriptions round-trip through KV and survive corrupt values", async () => {
  const env = createEnv();
  assert.deepEqual(await readSubscriptions(env), []);

  const list = [{ endpoint, expirationTime: null, keys: { p256dh, auth } }];
  await writeSubscriptions(env, list);
  assert.deepEqual(await readSubscriptions(env), list);

  await env.NEXTFLUX_PUSH.put("subscriptions:v1", "not json");
  assert.deepEqual(await readSubscriptions(env), []);
});
