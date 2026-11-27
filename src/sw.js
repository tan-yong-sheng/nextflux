// Asset revisions make this worker change with each application release.
// This is version metadata only: no requests or responses are cached.
self.__NEXTFLUX_BUILD = self.__WB_MANIFEST;

// Keep the existing update prompt; activate early only after user acceptance.
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
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

// No fetch handler: navigation, assets and API calls use the network normally.
