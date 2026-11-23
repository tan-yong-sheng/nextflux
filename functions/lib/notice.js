// A Miniflux `new_entries` webhook carries every entry found in one refresh.
// The notification only needs a count and a few titles; the service worker
// turns this into localized text.

export const NOTICE_TITLE_LIMIT = 3;
const TITLE_MAX_CHARS = 120;

function cleanTitle(value) {
  if (typeof value !== "string") return "";
  const title = value.replace(/\s+/g, " ").trim();
  // Count and slice by code points so a cut never splits a surrogate pair.
  const chars = Array.from(title);
  return chars.length > TITLE_MAX_CHARS
    ? `${chars.slice(0, TITLE_MAX_CHARS - 1).join("")}…`
    : title;
}

export function buildNewEntriesNotice(
  payload,
  { maxTitles = NOTICE_TITLE_LIMIT, hiddenFeedIds = [] } = {},
) {
  if (!payload || payload.event_type !== "new_entries") return null;
  // Feeds the reader hid globally must stay silent, exactly like the in-app
  // notice does. The client sends the hidden feed ids with the subscription
  // because the webhook payload does not carry them.
  const hidden = new Set(hiddenFeedIds.map((id) => Number(id)));
  if (hidden.has(Number(payload?.feed?.id))) return null;
  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  const unread = entries.filter(
    (entry) =>
      (!entry?.status || entry.status === "unread") &&
      !hidden.has(Number(entry?.feed_id)),
  );
  if (unread.length === 0) return null;

  return {
    count: unread.length,
    titles: unread.map((entry) => cleanTitle(entry.title)).filter(Boolean).slice(0, maxTitles),
    url: "/",
  };
}
