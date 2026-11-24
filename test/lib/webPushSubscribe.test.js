import assert from "node:assert/strict";
import { test } from "node:test";
import { Buffer } from "node:buffer";
import { onRequestPost } from "../../functions/api/push/subscribe.js";
import { listSubscriptions } from "../../functions/lib/subscriptions.js";

const p256dh = Buffer.concat([Buffer.from([0x04]), Buffer.alloc(64, 7)]).toString("base64url");
const auth = Buffer.alloc(16, 9).toString("base64url");
const endpoint = "https://fcm.googleapis.com/fcm/send/abc123";

const createEnv = (store = new Map()) => ({
  MINIFLUX_URL: "https://reader.example.com",
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

const withFetch = async (impl, run) => {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
};

const asAdmin = async () => new Response(JSON.stringify({ id: 1, is_admin: true }), { status: 200 });

const post = (body) =>
  new Request("https://pages.example.com/api/push/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json", "x-auth-token": "secret" },
    body: JSON.stringify(body),
  });

test("subscribe rejects a malformed subscription without storing it", async () => {
  const env = createEnv();
  const response = await withFetch(asAdmin, () =>
    onRequestPost({ request: post({ endpoint: "not-a-url" }), env }),
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "invalid_subscription" });
  assert.equal((await listSubscriptions(env, 1)).length, 0);
});

test("subscribe stores the device with its hidden feeds", async () => {
  const env = createEnv();
  const response = await withFetch(asAdmin, () =>
    onRequestPost({
      request: post({
        endpoint,
        expirationTime: null,
        keys: { p256dh, auth },
        hiddenFeedIds: [7, "9", "x", -1],
      }),
      env,
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  const listed = await listSubscriptions(env, 1);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].endpoint, endpoint);
  assert.deepEqual(listed[0].hiddenFeedIds, [7, 9]);
});
