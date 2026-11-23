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

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    const key = await fetchVapidKey();
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
  activeSubscription = null;
  if (!subscription) return "unsubscribed";

  await postJson(UNSUBSCRIBE_PATH, { endpoint: subscription.endpoint });
  await subscription.unsubscribe();
  return "unsubscribed";
}

/** Turn push on when the setting is enabled, ignoring failures on self-hosted builds. */
export async function syncPushState(enabled) {
  try {
    return enabled ? await subscribeToPush() : await unsubscribeFromPush();
  } catch (error) {
    reportError(error, "notifications.push");
    return "failed";
  }
}
