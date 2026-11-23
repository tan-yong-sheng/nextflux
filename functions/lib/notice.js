// A Miniflux `new_entries` webhook carries every entry found in one refresh.
// The notification only needs a count and a few titles; the service worker
// turns this into localized text.

export const NOTICE_TITLE_LIMIT = 3;
const TITLE_MAX_CHARS = 120;

function cleanTitle(value) {
  if (typeof value !== "string") return "";
  const title = value.replace(/\s+/g, " ").trim();
  return title.length > TITLE_MAX_CHARS ? `${title.slice(0, TITLE_MAX_CHARS - 1)}…` : title;
}

export function buildNewEntriesNotice(payload, { maxTitles = NOTICE_TITLE_LIMIT } = {}) {
  if (!payload || payload.event_type !== "new_entries") return null;
  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  const unread = entries.filter((entry) => !entry?.status || entry.status === "unread");
  if (unread.length === 0) return null;

  return {
    count: unread.length,
    titles: unread.map((entry) => cleanTitle(entry.title)).filter(Boolean).slice(0, maxTitles),
    url: "/",
  };
}
