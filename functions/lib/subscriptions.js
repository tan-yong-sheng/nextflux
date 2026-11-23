// Web Push subscriptions from the browser's PushManager. Each device gets its
// own KV entry keyed by Miniflux user and a hash of the endpoint, so
// concurrent subscribe/unsubscribe calls cannot overwrite each other and a
// webhook fans out to exactly the devices of the user whose feed refreshed.

import { toHex } from "./signature.js";

const STORAGE_PREFIX = "subscriptions:v1";
const MAX_SUBSCRIPTIONS = 20;
const P256DH_BYTES = 65;
const AUTH_BYTES = 16;

// Browsers register endpoints with their own push service; anything else is
// rejected so a subscribed device can never turn the Worker into an open
// relay that POSTs to arbitrary hosts with the VAPID Authorization header.
const PUSH_SERVICE_HOSTS = [
  "fcm.googleapis.com",
  "push.services.mozilla.com",
  "push.apple.com",
  "notify.windows.com",
];

function isPushServiceEndpoint(url) {
  const host = url.hostname.toLowerCase();
  return PUSH_SERVICE_HOSTS.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  );
}

export function decodeBase64Url(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  let binary;
  try {
    binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  } catch {
    return null;
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function normalizeSubscription(value) {
  if (!value || typeof value !== "object") return null;
  const keys = value.keys;
  if (!keys || typeof keys !== "object") return null;

  let endpoint;
  try {
    endpoint = new URL(value.endpoint);
  } catch {
    return null;
  }
  if (endpoint.protocol !== "https:" || !isPushServiceEndpoint(endpoint)) return null;

  const p256dh = decodeBase64Url(keys.p256dh);
  const auth = decodeBase64Url(keys.auth);
  if (!p256dh || p256dh.length !== P256DH_BYTES || p256dh[0] !== 0x04) return null;
  if (!auth || auth.length !== AUTH_BYTES) return null;

  return {
    endpoint: endpoint.toString(),
    expirationTime: typeof value.expirationTime === "number" ? value.expirationTime : null,
    keys: { p256dh: keys.p256dh, auth: keys.auth },
  };
}

// The reader hides some feeds globally. The webhook payload does not say
// which feeds are hidden, so every device reports its own hidden feed ids and
// the notice skips the entries of those feeds.
export function normalizeHiddenFeedIds(value) {
  if (!Array.isArray(value)) return [];
  const ids = new Set();
  for (const id of value) {
    // Number() would turn null, "" and false into 0 and true into 1, so only
    // integers and digit strings count.
    const parsed = typeof id === "string" && /^\d+$/.test(id) ? Number(id) : id;
    if (Number.isInteger(parsed) && parsed >= 0) ids.add(parsed);
  }
  return [...ids];
}

export function subscriptionsPrefix(userId) {
  return `${STORAGE_PREFIX}:${userId}:`;
}

export async function subscriptionKey(userId, endpoint) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(endpoint),
  );
  return `${subscriptionsPrefix(userId)}${toHex(new Uint8Array(digest))}`;
}

export async function listSubscriptions(env, userId) {
  const names = [];
  let cursor;
  do {
    const page = await env.NEXTFLUX_PUSH.list({
      prefix: subscriptionsPrefix(userId),
      cursor,
    });
    names.push(...page.keys.map((key) => key.name));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  const records = await Promise.all(
    names.map(async (name) => {
      const raw = await env.NEXTFLUX_PUSH.get(name);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed.endpoint === "string" ? parsed : null;
      } catch {
        return null;
      }
    }),
  );
  return records.filter(Boolean).slice(-MAX_SUBSCRIPTIONS);
}

export async function saveSubscription(env, userId, subscription, hiddenFeedIds = []) {
  const key = await subscriptionKey(userId, subscription.endpoint);
  const existing = await listSubscriptions(env, userId);
  const replaces = existing.some((item) => item.endpoint === subscription.endpoint);

  if (!replaces && existing.length >= MAX_SUBSCRIPTIONS) {
    const byAge = [...existing].sort(
      (a, b) => (a.savedAt ?? 0) - (b.savedAt ?? 0),
    );
    const evictCount = existing.length - MAX_SUBSCRIPTIONS + 1;
    await Promise.all(
      byAge.slice(0, evictCount).map(async (item) =>
        env.NEXTFLUX_PUSH.delete(await subscriptionKey(userId, item.endpoint)),
      ),
    );
  }

  await env.NEXTFLUX_PUSH.put(
    key,
    JSON.stringify({
      ...subscription,
      hiddenFeedIds: normalizeHiddenFeedIds(hiddenFeedIds),
      savedAt: Date.now(),
    }),
  );
}

export async function deleteSubscription(env, userId, endpoint) {
  if (typeof endpoint !== "string" || !endpoint) return;
  await env.NEXTFLUX_PUSH.delete(await subscriptionKey(userId, endpoint));
}

export async function pruneSubscriptions(env, userId, endpoints) {
  await Promise.all(
    endpoints.map((endpoint) => deleteSubscription(env, userId, endpoint)),
  );
}
