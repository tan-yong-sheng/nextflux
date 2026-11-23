// PROTOTYPE — throwaway data hook. Reads what the app already stores in Dexie.
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/database.js";
import { collectInsights } from "./insights/collectInsights.js";

export function usePersonalizationData() {
  const data = useLiveQuery(async () => {
    const [feeds, articles] = await Promise.all([
      db.feeds.toArray(),
      db.articles.toArray(),
    ]);
    return { feeds, articles };
  }, []);

  if (!data) return { loading: true, insights: null, articles: [] };
  return {
    loading: false,
    insights: collectInsights(data),
    articles: data.articles,
    feeds: data.feeds,
  };
}
