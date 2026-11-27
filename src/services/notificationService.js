import i18n from "@/i18n";

export function supportsNotifications() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notificationPermission() {
  return supportsNotifications() ? Notification.permission : "unsupported";
}

export async function requestNotificationPermission() {
  if (!supportsNotifications()) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

/**
 * Show the collected new-article notice as a system notification that reopens
 * the app on click.
 */
export async function showNewArticles(notice) {
  const title = i18n.t("notifications.newArticles", { count: notice.count });
  const body = notice.titles.join(" · ");
  const options = {
    body,
    icon: "/icon-192x192.png",
    badge: "/icon-192x192.png",
    tag: "nextflux:new-articles",
    data: { url: "/" },
  };
  const registration = await navigator.serviceWorker?.getRegistration?.();
  if (registration) {
    await registration.showNotification(title, options);
    return;
  }
  new Notification(title, options);
}
