// Web Push subscriptions from the browser's PushManager. All devices of this
// Miniflux user share one KV entry: a personal reader has a handful of them,
// and one read per webhook keeps the fan-out cheap and simple.

const STORAGE_KEY = "subscriptions:v1";
const MAX_SUBSCRIPTIONS = 20;
const P256DH_BYTES = 65;
const AUTH_BYTES = 16;

export function decodeBase64Url(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
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
  if (endpoint.protocol !== "https:") return null;

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

export function upsertSubscription(list, subscription) {
  const kept = (Array.isArray(list) ? list : []).filter(
    (item) => item?.endpoint !== subscription.endpoint,
  );
  return [...kept, subscription].slice(-MAX_SUBSCRIPTIONS);
}

export function removeSubscription(list, endpoint) {
  return (Array.isArray(list) ? list : []).filter((item) => item?.endpoint !== endpoint);
}

export async function readSubscriptions(env) {
  const raw = await env.NEXTFLUX_PUSH.get(STORAGE_KEY);
  if (!raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  return (Array.isArray(parsed) ? parsed : []).filter(
    (item) => item && typeof item.endpoint === "string" && item.keys,
  );
}

export function writeSubscriptions(env, list) {
  return env.NEXTFLUX_PUSH.put(STORAGE_KEY, JSON.stringify(list));
}

export { STORAGE_KEY };
