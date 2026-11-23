import assert from "node:assert/strict";
import { test } from "node:test";
import { requireMinifluxUser } from "../../functions/lib/auth.js";

const env = { MINIFLUX_URL: "https://reader.example.com/" };

const request = (headers = {}) => ({
  headers: { get: (name) => headers[name.toLowerCase()] ?? null },
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

const respond = (status, body) => async () => new Response(JSON.stringify(body), { status });

test("an admin user passes the owner gate", async () => {
  let seen;
  const result = await withFetch(async (url, init) => {
    seen = { url, init };
    return new Response(JSON.stringify({ id: 1, is_admin: true }), { status: 200 });
  }, () => requireMinifluxUser(request({ "x-auth-token": "secret" }), env));

  assert.deepEqual(result, { ok: true, user: { id: 1, is_admin: true } });
  assert.equal(seen.url, "https://reader.example.com/v1/me");
  assert.equal(seen.init.headers["X-Auth-Token"], "secret");
});

test("a non-admin user is rejected as not_instance_owner", async () => {
  const result = await withFetch(respond(200, { id: 2, is_admin: false }), () =>
    requireMinifluxUser(request({ authorization: "Basic abc" }), env),
  );
  assert.deepEqual(result, { ok: false, status: 403, error: "not_instance_owner" });
});

test("upstream 401 and 403 map to invalid_credentials", async () => {
  for (const status of [401, 403]) {
    const result = await withFetch(respond(status, {}), () =>
      requireMinifluxUser(request({ "x-auth-token": "stale" }), env),
    );
    assert.deepEqual(result, { ok: false, status: 401, error: "invalid_credentials" });
  }
});

test("upstream failures and network errors map to 502", async () => {
  const serverError = await withFetch(respond(500, {}), () =>
    requireMinifluxUser(request({ "x-auth-token": "secret" }), env),
  );
  assert.deepEqual(serverError, { ok: false, status: 502, error: "miniflux_unreachable" });

  const network = await withFetch(async () => {
    throw new TypeError("fetch failed");
  }, () => requireMinifluxUser(request({ "x-auth-token": "secret" }), env));
  assert.deepEqual(network, { ok: false, status: 502, error: "miniflux_unreachable" });
});

test("missing credentials and missing configuration fail fast", async () => {
  assert.deepEqual(await requireMinifluxUser(request(), env), {
    ok: false,
    status: 401,
    error: "missing_credentials",
  });
  assert.deepEqual(await requireMinifluxUser(request({ "x-auth-token": "secret" }), {}), {
    ok: false,
    status: 500,
    error: "miniflux_url_not_configured",
  });
});