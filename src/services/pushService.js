import { sessionAccount } from "@/stores/authStore";
import { reportError } from "@/lib/errors.js";
import { decodeBase64Url } from "@/domain/push/vapidKey.js";

const VAPID_PATH = "/api/push/vapid-public-key";
const SUBSCRIBE_PATH = "/api/push/subscribe";
const UNSUBSCRIBE_PATH = "/api/push/unsubscribe";

// The last subscription handed to this device. The sync fallback uses it to
// stay quiet while the push endpoint is the one delivering notices.
let activeSubscription = null;

export function supportsPush() {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function hasActivePushSubscription() {
  return Boolean(activeSubscription);
}

function authHeaders(account = sessionAccount) {
  if (account?.authType === "token" && account.token) {
    return { "X-Auth-Token": account.token };
  }
  if (account?.username && account?.password) {
    return {
      Authorization: `Basic ${btoa(`${account.username}:${account.password}`)}`,
    };
  }
  return {};
}

async function postJson(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`push_endpoint_${response.status}`);
  }
  return response.json().catch(() => ({}));
}

export function decodeVapidKey(value) {
  return decodeBase64Url(value);
}

async function fetchVapidKey() {
  const response = await fetch(VAPID_PATH, { headers: { accept: "application/json" } });
  if (!response.ok) return null;
  const body = await response.json().catch(() => null);
  return body?.key || null;
}

async function currentRegistration() {
  if (!("serviceWorker" in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) || null;
}

export async function refreshPushSubscription() {
  const registration = await currentRegistration();
  activeSubscription = (await registration?.pushManager?.getSubscription?.()) || null;
  return activeSubscription;
}

// The startup registration runs in parallel with the first sync; the notice
// gate waits for it so a push-enabled device never also raises a local notice.
let pendingRegistration = null;

export function awaitPushRegistration() {
  return pendingRegistration ?? Promise.resolve();
}

/**
 * Subscribe this device and register the endpoint with the app's own server so
 * Miniflux webhooks can reach it. Safe to call on every start: an existing
 * subscription is reused and only re-sent to the server.
 */
export async function subscribeToPush() {
  if (!supportsPush()) return "unsupported";
  if (Notification.permission !== "granted") return "denied";

  const registration = await currentRegistration();
  if (!registration) return "unsupported";

  const key = await fetchVapidKey();
  let subscription = await registration.pushManager.getSubscription();
  // A subscription made with an older VAPID key would be rejected by the
  // server, so replace it instead of re-sending it forever.
  if (subscription && key && !sameKey(subscription.options?.applicationServerKey, decodeVapidKey(key))) {
    await subscription.unsubscribe();
    subscription = null;
  }
  if (!subscription) {
    if (!key) return "unconfigured";
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeVapidKey(key),
    });
  }

  await postJson(SUBSCRIBE_PATH, subscription.toJSON());
  activeSubscription = subscription;
  return "subscribed";
}

export async function unsubscribeFromPush() {
  const registration = await currentRegistration();
  const subscription = await registration?.pushManager?.getSubscription?.();
  if (!subscription) {
    activeSubscription = null;
    return "unsubscribed";
  }

  // Keep the browser subscription until the server forgets it, so a failed
  // unregister leaves both sides consistent.
  await postJson(UNSUBSCRIBE_PATH, { endpoint: subscription.endpoint });
  await subscription.unsubscribe();
  activeSubscription = null;
  return "unsubscribed";
}

/** Compare a PushSubscription key (ArrayBuffer) with the decoded VAPID key. */
function sameKey(applicationServerKey, expected) {
  if (!applicationServerKey || !expected) return false;
  const actual = new Uint8Array(applicationServerKey);
  return (
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

/** Turn push on when the setting is enabled, ignoring failures on self-hosted builds.
 * Re-registering on every start also restores an endpoint the server pruned
 * after a 410 response.
 */
export async function syncPushState(enabled) {
  const run = (async () => {
    try {
      return enabled ? await subscribeToPush() : await unsubscribeFromPush();
    } catch (error) {
      reportError(error, "notifications.push");
      return "failed";
    }
  })();
  pendingRegistration = run;
  try {
    return await run;
  } finally {
    if (pendingRegistration === run) pendingRegistration = null;
  }
}
