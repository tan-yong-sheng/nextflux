// Shared fakes for the Pages Functions push tests: an in-memory NEXTFLUX_PUSH
// KV binding whose list() paginates like the real one, a fetch stub helper,
// and the admin/subscription fixtures the handler tests share.

import { Buffer } from "node:buffer";

export const TEST_P256DH = Buffer.concat([Buffer.from([0x04]), Buffer.alloc(64, 7)]).toString("base64url");
export const TEST_AUTH = Buffer.alloc(16, 9).toString("base64url");
export const TEST_ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc123";

export const createPushEnv = (store = new Map()) => ({
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

export const withFetch = async (impl, run) => {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
};

export const asAdminResponse = async () =>
  new Response(JSON.stringify({ id: 1, is_admin: true }), { status: 200 });

export const postSubscribe = (body) =>
  new Request("https://pages.example.com/api/push/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json", "x-auth-token": "secret" },
    body: JSON.stringify(body),
  });
