import assert from "node:assert/strict";
import { test } from "node:test";
import { onRequestPost } from "../../functions/api/push/subscribe.js";
import { listSubscriptions } from "../../functions/lib/subscriptions.js";
import {
  asAdminResponse as asAdmin,
  createPushEnv as createEnv,
  postSubscribe as post,
  TEST_AUTH as auth,
  TEST_ENDPOINT as endpoint,
  TEST_P256DH as p256dh,
  withFetch,
} from "./pushTestHelpers.js";

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
