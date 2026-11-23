// PROTOTYPE — throwaway. Lightweight per-feed activity signals computed from
// Dexie without loading every article body.
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/database.js";

const IDLE_DAYS = 21;
const BACKLOG = 25;

export function useFeedInsights() {
  const result = useLiveQuery(async () => {
    const feeds = await db.feeds.toArray();
    const unread = await db.articles.where("status").equals("unread").toArray();
    const starred = await db.articles.where("starred").equals(1).toArray();

    const unreadByFeed = new Map();
    for (const a of unread) {
      unreadByFeed.set(a.feedId, (unreadByFeed.get(a.feedId) || 0) + 1);
    }
    const starredByFeed = new Map();
    for (const a of starred) {
      starredByFeed.set(a.feedId, (starredByFeed.get(a.feedId) || 0) + 1);
    }
    const lastActivity = new Map();
    for (const a of unread.concat(starred)) {
      const ts = a.published_at || a.created_at;
      if (!ts) continue;
      const prev = lastActivity.get(a.feedId);
      if (!prev || ts > prev) lastActivity.set(a.feedId, ts);
    }

    const now = Date.now();
    const byId = new Map(feeds.map((f) => [f.id, f]));
    const signals = [];
    for (const [feedId, count] of unreadByFeed) {
      const feed = byId.get(feedId);
      if (!feed) continue;
      const last = lastActivity.get(feedId);
      const daysIdle = last
        ? Math.floor((now - new Date(last).getTime()) / 86400000)
        : null;
      signals.push({
        id: feedId,
        title: feed.title,
        unread: count,
        starred: starredByFeed.get(feedId) || 0,
        daysIdle,
        parsingErrorCount: feed.parsing_error_count || 0,
      });
    }
    for (const feed of feeds) {
      if (unreadByFeed.has(feed.id)) continue;
      signals.push({
        id: feed.id,
        title: feed.title,
        unread: 0,
        starred: starredByFeed.get(feed.id) || 0,
        daysIdle: null,
        parsingErrorCount: feed.parsing_error_count || 0,
      });
    }

    const lowActivity = signals
      .filter((s) => s.daysIdle === null || s.daysIdle >= IDLE_DAYS)
      .sort((a, b) => b.unread - a.unread);
    const backlog = signals
      .filter((s) => s.unread >= BACKLOG)
      .sort((a, b) => b.unread - a.unread);
    const broken = signals
      .filter((s) => s.parsingErrorCount > 0)
      .sort((a, b) => b.parsingErrorCount - a.parsingErrorCount);

    return { signals, lowActivity, backlog, broken };
  }, []);

  return {
    loading: result === undefined,
    insights: result || { signals: [], lowActivity: [], backlog: [], broken: [] },
  };
}
