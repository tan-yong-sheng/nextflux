// PROTOTYPE — throwaway. Ranks unread articles by affinity to what the user
// actually reads (starred article titles + feeds read most). Deterministic,
// no model, no network.
import { toMs, tokenize } from "./signals.js";

/**
 * @param {Array} articles  all local articles
 * @param {Object} insights output of collectInsights()
 * @returns {Array} unread articles, best first, each with `reasons`
 */
export function rankForYou(articles, insights) {
  // `topics` is the capped display list; rank against the uncapped counts so
  // every starred title term weighs in.
  const topics = new Map(
    (insights.topicTerms || insights.topics || []).map(({ term, count }) => [
      term,
      count,
    ]),
  );
  // "Reads a lot of it" is a read-count signal, not a star rate: a feed you
  // read every day but rarely star should still rank up.
  const reads = new Map(
    (insights.coreFeeds || []).map((feed) => [feed.id, feed.read || 0]),
  );
  const maxReads = Math.max(1, ...reads.values());

  return articles
    // Starred items are already saved; For You should surface what's new.
    .filter((article) => article.status === "unread" && article.starred !== 1)
    .map((article) => {
      const terms = [...new Set(tokenize(article.title))];
      const hits = terms.filter((term) => topics.has(term));
      const topicScore =
        hits.reduce((sum, term) => sum + topics.get(term), 0) * 1.5;
      const feedReads = reads.get(article.feedId);
      const feedScore =
        feedReads === undefined ? 0 : (feedReads / maxReads) * 3 + 0.5;

      return {
        ...article,
        score: topicScore + feedScore,
        reasons: [
          ...hits.slice(0, 3).map((term) => `#${term}`),
          ...(feedScore > 0 ? ["often read"] : []),
        ],
        sortedAt: toMs(article.published_at) || toMs(article.created_at),
      };
    })
    .filter((article) => article.score > 0)
    .sort((a, b) => b.score - a.score || b.sortedAt - a.sortedAt);
}