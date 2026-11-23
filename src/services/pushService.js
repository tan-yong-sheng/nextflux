import { sessionAccount } from "@/stores/authStore";
import { reportError } from "@/lib/errors.js";
import { decodeBase64Url } from "@/domain/push/vapidKey.js";
import { hiddenFeedIds as hiddenFeedIdList } from "@/domain/notifications/hiddenFeeds.js";
import { feeds } from "@/stores/feedsStore.js";
import { settingsState } from "@/stores/settingsStore.js";

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

// The feeds this device hides. The server builds the pushed notice and does
// not know the visibility of the device, so the ids travel with the
// subscription.
function hiddenFeedIds() {
  return hiddenFeedIdList(
    feeds.get(),
    settingsState.get().showHiddenFeeds,
  );
}

async function postJson(path, body, { keepalive = false } = {}) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
    // A logout ends the session while the request is still running, so the
    // unregister has to survive the page unload.
    keepalive,
  });
  if (!response.ok) {
    throw new Error(`push_endpoint_${response.status}`);
  }
  const result = await response.json().catch(() => null);
  // A self-hosted build without the push backend answers with the app shell
  // instead of the backend result, so only an explicit success counts.
  if (!result || result.ok !== true) {
    throw new Error("push_endpoint_not_available");
  }
  return result;
}

export function decodeVapidKey(value) {
  return decodeBase64Url(value);
}

async function fetchVapidKey() {
  const response = await fetch(VAPID_PATH, {
    headers: { accept: "application/json" },
    // The sync run waits for this request, so it must not hang forever.
    signal: AbortSignal.timeout(10000),
  });
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

  await postJson(SUBSCRIBE_PATH, {
    ...subscription.toJSON(),
    // The webhook payload does not say which feeds the reader hides, so the
    // device reports them and the server leaves those entries out.
    hiddenFeedIds: hiddenFeedIds(),
  });
  activeSubscription = subscription;
  return "subscribed";
}

/**
 * Report the current hidden feeds to the server. The reader can hide or show
 * a feed at any time, so the device refreshes its record after each sync.
 */
export async function syncPushHiddenFeeds() {
  const registration = await currentRegistration();
  const subscription = await registration?.pushManager?.getSubscription?.();
  if (!subscription) return "unsubscribed";
  try {
    await postJson(SUBSCRIBE_PATH, {
      ...subscription.toJSON(),
      hiddenFeedIds: hiddenFeedIds(),
    });
    return "subscribed";
  } catch (error) {
    reportError(error, "notifications.push");
    return "failed";
  }
}

export async function unsubscribeFromPush() {
  const registration = await currentRegistration();
  const subscription = await registration?.pushManager?.getSubscription?.();
  if (!subscription) {
    activeSubscription = null;
    return "unsubscribed";
  }

  // Drop the browser subscription even when the server call fails: the switch
  // must stop pushes now, and a leftover server record is pruned once a push
  // reaches a dead endpoint. The caller reports the failure to the reader.
  try {
    await postJson(UNSUBSCRIBE_PATH, { endpoint: subscription.endpoint });
  } catch (error) {
    // A build without the push backend has nothing to unregister.
    if (error?.message !== "push_endpoint_not_available") throw error;
  } finally {
    await subscription.unsubscribe();
    activeSubscription = null;
  }
  return "unsubscribed";
}

/**
 * Drop this device's endpoint on the server. Used when the session ends, so
 * another account on the same device does not keep receiving the first
 * account's articles.
 */
export async function releasePushEndpoint() {
  const registration = await currentRegistration();
  const subscription = await registration?.pushManager?.getSubscription?.();
  if (!subscription) return;
  try {
    await postJson(
      UNSUBSCRIBE_PATH,
      { endpoint: subscription.endpoint },
      { keepalive: true },
    );
  } catch {
    /* The session ends anyway; the server prunes dead endpoints. */
  }
}

// Logging out or switching account ends the session: the endpoint of the old
// account must not stay registered for this device.
if (typeof window !== "undefined") {
  window.addEventListener("nextflux:logout", () => {
    void releasePushEndpoint();
  });
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
