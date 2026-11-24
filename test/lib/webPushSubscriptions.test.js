import assert from "node:assert/strict";
import { test } from "node:test";
import { Buffer } from "node:buffer";
import {
  decodeBase64Url,
  deleteSubscription,
  listSubscriptions,
  normalizeSubscription,
  saveSubscription,
  subscriptionKey,
  subscriptionsPrefix,
} from "../../functions/lib/subscriptions.js";

const p256dh = Buffer.concat([Buffer.from([0x04]), Buffer.alloc(64, 7)]).toString("base64url");
const auth = Buffer.alloc(16, 9).toString("base64url");
const endpoint = "https://fcm.googleapis.com/fcm/send/abc123";

const createEnv = (store = new Map()) => ({
  NEXTFLUX_PUSH: {
    get: async (key) => store.get(key) ?? null,
    put: async (key, value) => store.set(key, value),
    delete: async (key) => store.delete(key),
    list: async ({ prefix = "", cursor } = {}) => {
      const names = [...store.keys()].filter((name) => name.startsWith(prefix)).sort();
      const start = cursor ? Number(cursor) : 0;
      const page = names.slice(start, start + 1000);
      const complete = start + 1000 >= names.length;
      return {
        keys: page.map((name) => ({ name })),
        list_complete: complete,
        cursor: complete ? undefined : String(start + 1000),
      };
    },
  },
});

const subscription = (overrides = {}) => ({
  endpoint,
  expirationTime: null,
  keys: { p256dh, auth },
  ...overrides,
});

test("decodeBase64Url decodes url-safe values and rejects junk", () => {
  assert.equal(Buffer.from(decodeBase64Url(auth)).length, 16);
  assert.equal(decodeBase64Url("not+base64/"), null);
  assert.equal(decodeBase64Url(undefined), null);
  assert.equal(decodeBase64Url("A"), null);
});

test("normalizeSubscription accepts a browser subscription", () => {
  assert.deepEqual(normalizeSubscription({ endpoint, expirationTime: null, keys: { p256dh, auth } }), {
    endpoint,
    expirationTime: null,
    keys: { p256dh, auth },
  });
});

test("normalizeSubscription rejects malformed input", () => {
  assert.equal(normalizeSubscription(null), null);
  assert.equal(normalizeSubscription({}), null);
  assert.equal(normalizeSubscription({ endpoint, keys: {} }), null);
  assert.equal(
    normalizeSubscription({ endpoint: "not a url", keys: { p256dh, auth } }),
    null,
  );
  assert.equal(
    normalizeSubscription({ endpoint: "http://fcm.googleapis.com/x", keys: { p256dh, auth } }),
    null,
  );
  assert.equal(
    normalizeSubscription({ endpoint, keys: { p256dh: "AAAA", auth } }),
    null,
  );
  assert.equal(
    normalizeSubscription({ endpoint, keys: { p256dh, auth: "AAAA" } }),
    null,
  );
});

test("normalizeSubscription only accepts known push service endpoints", () => {
  const withEndpoint = (value) =>
    normalizeSubscription({ endpoint: value, keys: { p256dh, auth } });

  assert.ok(withEndpoint("https://fcm.googleapis.com/fcm/send/abc123"));
  assert.ok(withEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc"));
  assert.ok(withEndpoint("https://web.push.apple.com/QAbc"));
  assert.ok(withEndpoint("https://db5.notify.windows.com/w/?token=x"));
  assert.equal(withEndpoint("https://evil.example.com/collect"), null);
  assert.equal(withEndpoint("https://fcm.googleapis.com.evil.com/x"), null);
  assert.equal(withEndpoint("https://notfcm.googleapis.com/x"), null);
});

test("saveSubscription and listSubscriptions round-trip per user", async () => {
  const env = createEnv();
  await saveSubscription(env, 1, subscription());
  await saveSubscription(env, 2, subscription({ endpoint: "https://web.push.apple.com/xyz" }));

  const userOne = await listSubscriptions(env, 1);
  assert.equal(userOne.length, 1);
  assert.equal(userOne[0].endpoint, endpoint);
  assert.equal(userOne[0].savedAt > 0, true);

  const userTwo = await listSubscriptions(env, 2);
  assert.equal(userTwo.length, 1);
  assert.equal(userTwo[0].endpoint, "https://web.push.apple.com/xyz");
});

test("re-subscribing the same endpoint replaces the stored keys", async () => {
  const env = createEnv();
  await saveSubscription(env, 1, subscription());
  const otherKeys = { p256dh: Buffer.concat([Buffer.from([0x04]), Buffer.alloc(64, 8)]).toString("base64url"), auth: Buffer.alloc(16, 3).toString("base64url") };
  await saveSubscription(env, 1, subscription({ keys: otherKeys }));

  const listed = await listSubscriptions(env, 1);
  assert.equal(listed.length, 1);
  assert.deepEqual(listed[0].keys, otherKeys);
});

test("deleteSubscription removes only that endpoint", async () => {
  const env = createEnv();
  await saveSubscription(env, 1, subscription());
  await saveSubscription(env, 1, subscription({ endpoint: "https://web.push.apple.com/xyz" }));

  await deleteSubscription(env, 1, endpoint);
  const listed = await listSubscriptions(env, 1);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].endpoint, "https://web.push.apple.com/xyz");
});

test("saveSubscription evicts the oldest device past the cap", async () => {
  const env = createEnv();
  // Distinct save times make the eviction order deterministic.
  const realNow = Date.now;
  let now = 1_000;
  Date.now = () => (now += 10);
  try {
    for (let index = 0; index < 20; index += 1) {
      await saveSubscription(env, 1, subscription({ endpoint: `https://fcm.googleapis.com/fcm/send/dev${index}` }));
    }
    await saveSubscription(env, 1, subscription({ endpoint: "https://fcm.googleapis.com/fcm/send/dev20" }));
  } finally {
    Date.now = realNow;
  }

  const listed = await listSubscriptions(env, 1);
  assert.equal(listed.length, 20);
  assert.ok(listed.some((item) => item.endpoint.endsWith("dev20")));
  // The first device saved is the one dropped, not just any of the 20 kept.
  assert.equal(listed.some((item) => item.endpoint.endsWith("dev0")), false);
});

test("subscriptionKey is stable per user and endpoint", async () => {
  const keyA = await subscriptionKey(1, endpoint);
  assert.equal(keyA, await subscriptionKey(1, endpoint));
  assert.notEqual(keyA, await subscriptionKey(2, endpoint));
  assert.notEqual(keyA, await subscriptionKey(1, "https://fcm.googleapis.com/fcm/send/other"));
  assert.ok(keyA.startsWith(subscriptionsPrefix(1)));
});

test("saveSubscription keeps the hidden feeds of the device", async () => {
  const env = createEnv();
  await saveSubscription(env, 1, subscription(), [7, 9, "x", -1]);
  const listed = await listSubscriptions(env, 1);
  assert.deepEqual(listed[0].hiddenFeedIds, [7, 9]);
});

test("normalizeHiddenFeedIds accepts only integers and digit strings", async () => {
  const { normalizeHiddenFeedIds } = await import("../../functions/lib/subscriptions.js");
  assert.deepEqual(normalizeHiddenFeedIds([7, "9", true, false, null, "", -1, 1.5, "x"]), [7, 9]);
  assert.deepEqual(normalizeHiddenFeedIds("7"), []);
});

test("normalizeHiddenFeedIds keeps every valid id", async () => {
  const { normalizeHiddenFeedIds } = await import("../../functions/lib/subscriptions.js");
  const ids = Array.from({ length: 700 }, (_, index) => index + 1);
  assert.equal(normalizeHiddenFeedIds(ids).length, 700);
});

test("listSubscriptions returns every record so the save path can evict overflow", async () => {
  const store = new Map();
  const env = createEnv(store);
  // Written directly to model records left behind by an older uncapped write.
  for (let index = 0; index < 25; index += 1) {
    const item = subscription({ endpoint: `https://fcm.googleapis.com/fcm/send/overflow${index}` });
    store.set(await subscriptionKey(1, item.endpoint), JSON.stringify({ ...item, savedAt: index }));
  }

  assert.equal((await listSubscriptions(env, 1)).length, 25);
});

test("deleteSubscription normalizes the endpoint before deleting", async () => {
  const env = createEnv();
  await saveSubscription(env, 1, subscription());

  // subscribe stored the URL-normalized endpoint, so a raw browser endpoint
  // with an uppercase host and an explicit default port must still match it.
  await deleteSubscription(env, 1, "https://FCM.GOOGLEAPIS.COM:443/fcm/send/abc123");

  assert.equal((await listSubscriptions(env, 1)).length, 0);
});
