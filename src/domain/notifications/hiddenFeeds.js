/**
 * The feeds a reader hides globally.
 *
 * The sidebar filter keeps those feeds out of the list, and a new-article
 * notice must do the same. Pushed notices are built on the server, which does
 * not know the visibility of a device, so the device reports these ids with
 * its push subscription.
 */
export function hiddenFeedIds(feeds = [], showHiddenFeeds = false) {
  if (showHiddenFeeds) return [];
  return feeds
    .map((feed) => {
      if (!feed?.hide_globally) return null;
      const id = feed?.id;
      // Accept only real ids: Number() would turn true into 1 and "1.5" into 1.5.
      const parsed = typeof id === "string" && /^\d+$/.test(id) ? Number(id) : id;
      return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
    })
    .filter((id) => id !== null);
}
