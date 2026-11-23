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
    .filter((feed) => feed?.hide_globally && feed?.id !== null && feed?.id !== undefined)
    .map((feed) => Number(feed?.id))
    .filter((id) => Number.isInteger(id));
}
