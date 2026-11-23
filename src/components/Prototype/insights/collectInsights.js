// PROTOTYPE — throwaway. Computes "personalized" signals from data the app
// already has locally (Dexie). No network, no model, no persistence.

const STOP_WORDS = new Set([
  "the", "and", "for", "that", "with", "this", "from", "you", "your", "are",
  "was", "how", "why", "what", "when", "who", "not", "but", "can", "will",
  "its", "it", "a", "an", "of", "to", "in", "on", "is", "as", "at", "by",
  "be", "we", "our", "new", "more", "has", "have", "had", "or", "if", "so",
]);

const DAY = 24 * 60 * 60 * 1000;

const tokenize = (text) =>
  (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !STOP_WORDS.has(word));

/**
 * @param {{feeds: Array, articles: Array, now?: number}} input
 */
export function collectInsights({ feeds = [], articles = [], now = Date.now() }) {
  const byFeed = new Map();
  for (const feed of feeds) {
    byFeed.set(feed.id, {
      id: feed.id,
      title: feed.title || "Untitled feed",
      url: feed.site_url || feed.url || "",
      parsingErrorCount: feed.parsing_error_count || 0,
      unread: 0,
      read: 0,
      starred: 0,
      total: 0,
      lastPublished: 0,
      lastRead: 0,
    });
  }

  const topicCounts = new Map();
  let totalUnread = 0;
  let totalStarred = 0;
  let totalRead = 0;

  for (const article of articles) {
    const stats = byFeed.get(article.feedId);
    if (!stats) continue;
    stats.total += 1;
    if (article.status === "unread") {
      stats.unread += 1;
      totalUnread += 1;
    } else {
      stats.read += 1;
      totalRead += 1;
      stats.lastRead = Math.max(stats.lastRead, article.published_at || 0);
    }
    if (article.starred === 1) {
      stats.starred += 1;
      totalStarred += 1;
      for (const word of tokenize(article.title)) {
        topicCounts.set(word, (topicCounts.get(word) || 0) + 1);
      }
    }
    stats.lastPublished = Math.max(
      stats.lastPublished,
      article.published_at || article.created_at || 0,
    );
  }

  const feedStats = [...byFeed.values()].map((stats) => {
    const daysIdle = stats.lastPublished
      ? Math.floor((now - stats.lastPublished) / DAY)
      : null;
    return { ...stats, daysIdle };
  });

  // "Low activity" = nothing new for 3+ weeks. "Backlog" = unread piling up.
  const lowActivity = feedStats
    .filter((s) => s.total > 0 && (s.daysIdle === null || s.daysIdle >= 21))
    .sort((a, b) => b.unread - a.unread || (b.daysIdle || 0) - (a.daysIdle || 0));

  const backlog = feedStats
    .filter((s) => s.unread >= 25)
    .sort((a, b) => b.unread - a.unread);

  const broken = feedStats
    .filter((s) => s.parsingErrorCount > 0)
    .sort((a, b) => b.parsingErrorCount - a.parsingErrorCount);

  const topStarredFeeds = [...feedStats]
    .filter((s) => s.starred > 0)
    .sort((a, b) => b.starred - a.starred)
    .slice(0, 8);

  const topics = [...topicCounts.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([term, count]) => ({ term, count }));

  // The "maybe you want more of this" signal: feeds the user already reads a
  // lot of. We have no feed catalog, so this can only re-rank what exists.
  const coreFeeds = [...feedStats]
    .filter((s) => s.read >= 5)
    .sort((a, b) => b.starred / (b.total || 1) - a.starred / (a.total || 1))
    .slice(0, 8);

  return {
    generatedAt: now,
    totals: {
      feeds: feedStats.length,
      articles: articles.length,
      unread: totalUnread,
      read: totalRead,
      starred: totalStarred,
    },
    lowActivity,
    backlog,
    broken,
    topStarredFeeds,
    coreFeeds,
    topics,
  };
}

export function insightsSummary(insights) {
  const candidates =
    insights.lowActivity.length +
    insights.backlog.length +
    insights.broken.length;
  return `${candidates} feed${candidates === 1 ? "" : "s"} worth a look · ${insights.topics.length} topics from ${insights.totals.starred} starred`;
}
