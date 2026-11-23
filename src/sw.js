// Asset revisions make this worker change with each application release.
// This is version metadata only: no requests or responses are cached.
self.__NEXTFLUX_BUILD = self.__WB_MANIFEST;

// Keep the existing update prompt; activate early only after user acceptance.
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

// A push keeps working while the tab is hidden or closed and always becomes
// a system notification.
self.addEventListener("push", (event) => {
  const notice = readPushNotice(event.data);
  if (notice) event.waitUntil(showPushNotice(notice));
});

// Tapping a notification focuses an existing tab or opens the app.
self.addEventListener("notificationclick", (event) => {
  event.notification?.close?.();
  const url = event.notification?.data?.url || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const existing = clients.find((client) =>
          client.url.startsWith(self.registration.scope),
        );
        return existing ? existing.focus() : self.clients.openWindow(url);
      }),
  );
});

self.addEventListener("activate", (event) => {
  // Remove the offline shell created by earlier Nextflux releases. Limit the
  // cleanup to Workbox precaches belonging to this worker's exact scope.
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter(
              (name) =>
                name.startsWith("workbox-precache-") &&
                name.endsWith(self.registration.scope),
            )
            .map((name) => caches.delete(name)),
        ),
      ),
  );
});

// Titles are duplicated from the app's translations because a service worker
// cannot reuse them while the page is closed.
const NOTICE_TITLES = {
  en: (count) => (count === 1 ? "1 new article" : `${count} new articles`),
  zh: (count) => `${count} 篇新文章`,
  fr: (count) => (count === 1 ? "1 nouvel article" : `${count} nouveaux articles`),
  tr: (count) => `${count} yeni makale`,
};

function noticeTitle(count) {
  const language = (self.navigator?.language || "en").toLowerCase();
  const format =
    NOTICE_TITLES[language.split("-")[0]] || NOTICE_TITLES.en;
  return format(count);
}

function readPushNotice(data) {
  try {
    const notice = JSON.parse(data?.text?.() || "");
    const count = Number(notice?.count);
    if (!Number.isFinite(count) || count <= 0) return null;
    return {
      count,
      titles: Array.isArray(notice.titles)
        ? notice.titles.filter((title) => typeof title === "string")
        : [],
      url: typeof notice.url === "string" ? notice.url : "/",
    };
  } catch {
    return null;
  }
}

function showPushNotice(notice) {
  return self.registration.showNotification(noticeTitle(notice.count), {
    body: notice.titles.join(" · "),
    icon: "/icon-192x192.png",
    badge: "/icon-192x192.png",
    tag: "nextflux:new-articles",
    data: { url: notice.url },
  });
}

// No fetch handler: navigation, assets and API calls use the network normally.
