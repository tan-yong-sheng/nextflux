// PROTOTYPE — throwaway. Loads Dexie feeds + articles once and derives the
// "personalized" signals. Only mounted by the B/C panels, so the article
// scan never runs on the normal article list.
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

  if (!data) {
    return { loading: true, insights: null, articles: [], feeds: [] };
  }

  // Match the rest of the app: hidden feeds stay out unless the setting is on.
  const feeds = showHiddenFeeds
    ? data.feeds
    : data.feeds.filter((feed) => !feed.hide_globally);
  const visibleIds = new Set(feeds.map((feed) => feed.id));
  const articles = data.articles.filter((article) =>
    visibleIds.has(article.feedId),
  );

  const insights = collectInsights({ feeds, articles });
  return { loading: false, insights, articles, feeds };
}
