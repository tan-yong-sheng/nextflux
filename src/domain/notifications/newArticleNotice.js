// Pure rules for the new-article notification, kept out of browser code.
export const NOTICE_TITLE_LIMIT = 3;

/**
 * A run may announce new articles only when the user opted in, permission is
 * granted, and incremental sync was already established. The initial history
 * bootstrap would otherwise announce every retained article at once.
 */
export function notificationRunEnabled({
  enabled,
  permission,
  hadPreviousSync,
  historyComplete,
}) {
  return Boolean(
    enabled &&
      permission === "granted" &&
      hadPreviousSync &&
      historyComplete,
  );
}

/**
 * Reduce synced articles to what the user should be told about: unread entries
 * from feeds that are visible in the sidebar. Returns null when nothing qualifies.
 */
export function collectNewArticleNotice(
  articles,
  feeds,
  showHiddenFeeds = false,
) {
  if (!articles?.length) return null;
  const feedIds = new Set(feeds.map((feed) => String(feed.id)));
  const hiddenFeedIds = showHiddenFeeds
    ? null
    : new Set(
        feeds
          .filter((feed) => feed.hide_globally)
          .map((feed) => String(feed.id)),
      );
  const relevant = articles.filter(
    (article) =>
      article.status === "unread" &&
      feedIds.has(String(article.feedId)) &&
      !hiddenFeedIds?.has(String(article.feedId)),
  );
  if (!relevant.length) return null;
  return {
    count: relevant.length,
    titles: relevant
      .filter((article) => article.title)
      .slice(0, NOTICE_TITLE_LIMIT)
      .map((article) => article.title),
  };
}