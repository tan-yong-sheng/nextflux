// PROTOTYPE — throwaway. Loads Dexie feeds + articles once and derives the
// "personalized" signals. Only mounted by the B/C panels, so the article
// scan never runs on the normal article list.
import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useStore } from "@nanostores/react";
import { db } from "@/db/database.js";
import { settingsState } from "@/stores/settingsStore.js";
import { collectInsights } from "./insights/collectInsights.js";

export function usePersonalizationData() {
  const { showHiddenFeeds } = useStore(settingsState);
  const data = useLiveQuery(async () => {
    const [feeds, articles] = await Promise.all([
      db.feeds.toArray(),
      db.articles.toArray(),
    ]);
    return { feeds, articles };
  }, []);

  // Derive once per data snapshot — a re-render must not rescan every article.
  const derived = useMemo(() => {
    if (!data) return null;
    // Match the rest of the app: hidden feeds stay out unless the setting is on.
    const feeds = showHiddenFeeds
      ? data.feeds
      : data.feeds.filter((feed) => !feed.hide_globally);
    const visibleIds = new Set(feeds.map((feed) => feed.id));
    const articles = data.articles.filter((article) =>
      visibleIds.has(article.feedId),
    );
    return { feeds, articles, insights: collectInsights({ feeds, articles }) };
  }, [data, showHiddenFeeds]);

  if (!derived) {
    return { loading: true, insights: null, articles: [], feeds: [] };
  }
  return { loading: false, ...derived };
}
