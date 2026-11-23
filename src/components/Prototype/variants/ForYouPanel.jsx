// PROTOTYPE — throwaway. Variant B: a "For You" filter on the existing
// article list, ranked deterministically from local signals.
import { useMemo } from "react";
import { Sparkles } from "lucide-react";
import { rankForYou } from "../insights/rankArticles.js";
import ArticleCard from "@/components/ArticleList/components/ArticleCard.jsx";
import { usePersonalizationData } from "../usePersonalizationData.js";

// Container: owns the Dexie read, so it only mounts while variant B is on.
export default function ForYouPanel() {
  const { loading, insights, articles } = usePersonalizationData();
  if (loading || !insights) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-16 text-center text-sm text-muted-foreground">
        Loading your signals…
      </div>
    );
  }
  return <ForYouView insights={insights} articles={articles} />;
}

// Presentational half — reused by /prototype with demo data.
export function ForYouView({ insights, articles }) {
  const ranked = useMemo(
    () => rankForYou(articles, insights).slice(0, 30),
    [articles, insights],
  );

  if (!ranked.length) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-16 text-center text-sm text-muted-foreground">
        Nothing to recommend yet — star a few articles and this fills up.
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-0 w-full max-w-[560px] flex-1 overflow-y-auto px-2">
      <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
        <Sparkles className="size-3.5" />
        Ranked from {insights.totals.starred} starred articles and the feeds
        you read most — no model, no network.
      </div>
      {ranked.map((article) => (
        <div key={article.id}>
          <ArticleCard article={article} />
          {article.reasons?.length > 0 && (
            <div className="px-3 pb-2 text-[11px] text-muted-foreground">
              because: {article.reasons.join(", ")}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
