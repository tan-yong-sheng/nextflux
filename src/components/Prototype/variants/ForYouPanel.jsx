// PROTOTYPE — throwaway. Variant B: a "For You" filter on the existing
// article list, ranked deterministically from local signals.
import { useMemo } from "react";
import { Sparkles } from "lucide-react";
import { rankForYou } from "../insights/rankArticles.js";
import ArticleCard from "@/components/ArticleList/components/ArticleCard.jsx";

export default function ForYouPanel({ insights, articles }) {
  const ranked = useMemo(
    () => rankForYou(articles, insights).slice(0, 30),
    [articles, insights],
  );

  if (!ranked.length) {
    return (
      <div className="px-6 py-16 text-center text-sm text-muted-foreground">
        Nothing to recommend yet — star a few articles and this fills up.
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[560px] px-2">
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
