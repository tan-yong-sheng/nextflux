// PROTOTYPE — throwaway. Per-feed activity signals from Dexie. Only mounted
// while variant A is active, so the article scan never runs otherwise.
import { useLiveQuery } from "dexie-react-hooks";
import { useStore } from "@nanostores/react";
import { db } from "@/db/database.js";
import { settingsState } from "@/stores/settingsStore.js";
import { BACKLOG_UNREAD, DAY, QUIET_DAYS, toMs } from "./insights/signals.js";

export function useFeedInsights() {
  const { showHiddenFeeds } = useStore(settingsState);
  const result = useLiveQuery(async () => {
    const [feeds, articles] = await Promise.all([
      db.feeds.toArray(),
      db.articles.toArray(),
    ]);
    const visible = showHiddenFeeds
      ? feeds
      : feeds.filter((feed) => !feed.hide_globally);
    const visibleIds = new Set(visible.map((feed) => feed.id));

    // One pass over every article: unread/starred counts plus the latest
    // published_at of ANY status — a feed whose new items are already read
    // is not "quiet".
    const stats = new Map();
    for (const article of articles) {
      if (!visibleIds.has(article.feedId)) continue;
      let entry = stats.get(article.feedId);
      if (!entry) {
        entry = { unread: 0, starred: 0, lastActivity: 0 };
        stats.set(article.feedId, entry);
      }
      if (article.status === "unread") entry.unread += 1;
      if (article.starred === 1) entry.starred += 1;
      const ts = toMs(article.published_at) || toMs(article.created_at);
      if (ts > entry.lastActivity) entry.lastActivity = ts;
    }

    const now = Date.now();
    const signals = visible.map((feed) => {
      const entry = stats.get(feed.id);
      const last = entry?.lastActivity || 0;
      return {
        id: feed.id,
        title: feed.title,
        unread: entry?.unread || 0,
        starred: entry?.starred || 0,
        daysIdle: last ? Math.floor((now - last) / DAY) : null,
        parsingErrorCount: feed.parsing_error_count || 0,
      };
    });

    // Quiet is quiet whether or not unread piled up — the whole point is to
    // spot feeds the user can drop.
    const lowActivity = signals
      .filter((s) => s.daysIdle === null || s.daysIdle >= QUIET_DAYS)
      .sort(
        (a, b) => (b.daysIdle ?? Infinity) - (a.daysIdle ?? Infinity),
      );
    const backlog = signals
      .filter((s) => s.unread >= BACKLOG_UNREAD)
      .sort((a, b) => b.unread - a.unread);
    const broken = signals
      .filter((s) => s.parsingErrorCount > 0)
      .sort((a, b) => b.parsingErrorCount - a.parsingErrorCount);

    return { signals, lowActivity, backlog, broken };
  }, [showHiddenFeeds]);

  return { loading: result === undefined, insights: result ?? null };
}
