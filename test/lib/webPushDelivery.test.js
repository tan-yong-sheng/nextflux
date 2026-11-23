import assert from "node:assert/strict";
import { test } from "node:test";
import { generateKeyPairSync } from "node:crypto";
import { Buffer } from "node:buffer";
import { buildPushRequest, deliverPush } from "../../functions/lib/push.js";

// WebCrypto verifies that client keys are real P-256 points, so the fixtures
// come from generated key pairs.
const jwkKey = () => {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = privateKey.export({ format: "jwk" });
  const publicKey = Buffer.concat([
    Buffer.from([0x04]),
    Buffer.from(jwk.x, "base64url"),
    Buffer.from(jwk.y, "base64url"),
  ]).toString("base64url");
  return { publicKey, privateKey: jwk.d };
};

const client = jwkKey();

const vapid = jwkKey();
const env = {
  VAPID_PUBLIC_KEY: vapid.publicKey,
  VAPID_PRIVATE_KEY: vapid.privateKey,
  VAPID_SUBJECT: "mailto:test@example.com",
};
const subscription = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
  expirationTime: null,
  keys: { p256dh: client.publicKey, auth: Buffer.alloc(16, 4).toString("base64url") },
};
const notice = { count: 2, titles: ["One", "Two"], url: "/" };

const withFetch = async (impl, run) => {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
};

test("buildPushRequest produces an RFC 8291 request with VAPID auth", async () => {
  const request = await buildPushRequest(subscription, notice, env);
  assert.equal(request.endpoint, subscription.endpoint);
  assert.equal(request.init.method.toUpperCase(), "POST");
  assert.match(request.init.headers.authorization, /^vapid t=/);
  assert.equal(request.init.headers["content-encoding"], "aes128gcm");
  assert.ok(request.init.body instanceof Uint8Array);
  assert.ok(request.init.body.length > 0);
});

test("deliverPush reports delivered, dead and retryable endpoints", async () => {
  const deliver = (status) =>
    withFetch(async () => new Response(null, { status }), () => deliverPush(env, subscription, notice));

  assert.equal(await deliver(201), "sent");
  assert.equal(await deliver(410), "gone");
  assert.equal(await deliver(404), "gone");
  assert.equal(await deliver(500), "failed:500");
  assert.equal(await deliver(429), "failed:429");
});

test("deliverPush survives network failures and broken subscriptions", async () => {
  assert.equal(
    await withFetch(
      async () => {
        throw new Error("offline");
      },
      () => deliverPush(env, subscription, notice),
    ),
    "failed:network",
  );

  const broken = { ...subscription, keys: { p256dh: "AAAA", auth: "AAAA" } };
  let fetchCalled = false;
  const outcome = await withFetch(
    async () => {
      fetchCalled = true;
      throw new Error("fetch must not be reached for an unencryptable subscription");
    },
    () => deliverPush(env, broken, notice),
  );
  assert.equal(outcome, "failed:encrypt");
  assert.equal(fetchCalled, false);
});
