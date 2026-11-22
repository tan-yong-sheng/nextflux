import { atom } from "nanostores";
import {
  getLastSyncTime,
  isHistorySyncComplete,
} from "@/db/storage.js";
import { reportError } from "@/lib/errors.js";
import { syncService } from "@/services/syncService.js";
import { settingsState } from "@/stores/settingsStore.js";
import { feeds } from "@/stores/feedsStore.js";
import {
  collectNewArticleNotice,
  notificationRunEnabled,
} from "@/domain/notifications/newArticleNotice.js";
import {
  notificationPermission,
  showNewArticles,
} from "@/services/notificationService.js";

import { sessionAccount } from "@/stores/authStore.js";

export const isOnline = atom(navigator.onLine);
export const isSyncing = atom(false);
export const lastSync = atom(getLastSyncTime());
export const error = atom(null);
export const syncProgress = atom({ phase: "idle", received: 0 });

let syncInterval = null;
let controller = null;
let inFlight = null;
let running = false;
let failures = 0;
let retryAfter = 0;

export function sync() {
  if (inFlight) return inFlight;
  if (!isOnline.get()) return Promise.resolve();
  controller = new AbortController();
  const signal = controller.signal;
  isSyncing.set(true);
  error.set(null);
  syncProgress.set({ phase: "loading", received: 0 });
  const settings = settingsState.get();
  const runAllowsNotice = notificationRunEnabled({
    enabled: settings.notifyNewArticles,
    permission: notificationPermission(),
    hadPreviousSync: Boolean(getLastSyncTime()),
    historyComplete: isHistorySyncComplete(),
  });
  const newArticles = [];
  const synchronize = async () => {
    signal.throwIfAborted();
    const result = await syncService.synchronize({
      signal,
      onBatch: ({ articles, added }) => {
        const progress = syncProgress.get();
        syncProgress.set({
          phase: "background",
          received: progress.received + articles.length,
        });
        if (runAllowsNotice && added?.length) newArticles.push(...added);
      },
    });
    lastSync.set(result);
    failures = 0;
    retryAfter = 0;
    if (runAllowsNotice && newArticles.length) {
      const notice = collectNewArticleNotice(
        newArticles,
        feeds.get(),
        settingsState.get().showHiddenFeeds,
      );
      if (notice) {
        await showNewArticles(notice).catch((noticeError) =>
          reportError(noticeError, "notification.show"),
        );
      }
    }
    return result;
  };
  // Serialize browser tabs sharing the same IndexedDB and synchronization watermark.
  inFlight = (
    navigator.locks
      ? navigator.locks.request(
          `nextflux:sync:${sessionAccount.databaseName}`,
          { signal },
          synchronize,
        )
      : synchronize()
  )
    .catch((syncError) => {
      if (signal.aborted) return;
      failures += 1;
      retryAfter =
        Date.now() + Math.min(30 * 60_000, 30_000 * 2 ** (failures - 1));
      error.set(reportError(syncError, "sync.run"));
    })
    .finally(() => {
      isSyncing.set(false);
      syncProgress.set({ ...syncProgress.get(), phase: "idle" });
      inFlight = null;
      controller = null;
    });
  return inFlight;
}

async function performSync() {
  if (
    !running ||
    document.visibilityState === "hidden" ||
    !isOnline.get() ||
    inFlight ||
    Date.now() < retryAfter
  )
    return;
  const lastSyncTime = getLastSyncTime();
  const interval = Number.parseInt(settingsState.get().syncInterval, 10);
  // Disabling periodic sync must not prevent a new account from loading its first page.
  if (
    !lastSyncTime ||
    !isHistorySyncComplete() ||
    (interval > 0 && Date.now() - lastSyncTime >= interval * 60_000)
  ) {
    await sync();
  }
}

function onOnline() {
  isOnline.set(true);
  performSync();
}
function onOffline() {
  isOnline.set(false);
}

export function startAutoSync() {
  stopAutoSync();
  running = true;
  isOnline.set(navigator.onLine);
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  document.addEventListener("visibilitychange", performSync);
  window.addEventListener("nextflux:logout", cancelSync);
  syncInterval = setInterval(performSync, 30_000);
  performSync();
}

export function stopAutoSync() {
  running = false;
  if (syncInterval) clearInterval(syncInterval);
  syncInterval = null;
  window.removeEventListener("online", onOnline);
  window.removeEventListener("offline", onOffline);
  document.removeEventListener("visibilitychange", performSync);
  // Keep logout cancellation registered even if App unmounts during a request.
}

function cancelSync() {
  stopAutoSync();
  controller?.abort();
  window.removeEventListener("nextflux:logout", cancelSync);
}

export function forceSync() {
  return sync();
}
