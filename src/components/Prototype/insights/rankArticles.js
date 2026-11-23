// PROTOTYPE — throwaway. Ranks unread articles by affinity to what the user
// actually reads (starred articles + feeds read most). Deterministic, no model.

const STOP_WORDS = new Set([
  "the", "and", "for", "that", "with", "this", "from", "you", "your", "are",
  "was", "how", "why", "what", "when", "who", "not", "but", "can", "will",
  "its", "it", "a", "an", "of", "to", "in", "on", "is", "as", "at", "by",
  "be", "we", "our", "new", "more", "has", "have", "had", "or", "if", "so",
]);

const tokenize = (text) =>
  (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !STOP_WORDS.has(word));

/**
 * @param {Array} articles  all local articles
 * @param {Object} insights  output of collectInsights()
 * @returns {Array} unread articles with a `score` and `reasons`
 */
export function rankForYou(articles, insights) {
  // Affinity terms come from starred article titles.
  const affinity = new Map();
  for (const article of articles) {
    if (article.starred !== 1) continue;
    for (const word of tokenize(article.title)) {
      affinity.set(word, (affinity.get(word) || 0) + 2);
    }
  }
  // Feeds the user reads a lot are, on their own, a decent signal.
  const feedAffinity = new Map(
    insights.coreFeeds.map((feed) => [feed.id, feed.starred / (feed.total || 1)]),
  );

  return articles
    .filter((article) => article.status === "unread")
    .map((article) => {
      const words = tokenize(article.title);
      let score = 0;
      const reasons = [];
      for (const word of new Set(words)) {
        const hit = affinity.get(word);
        if (hit) {
          score += hit;
          reasons.push(word);
        }
      }
      const feedBoost = feedAffinity.get(article.feedId);
      if (feedBoost !== undefined) {
        // Feeds you read often surface even with no starred-title overlap.
        score += Math.max(feedBoost * 3, 0.5);
        reasons.push("from a feed you read often");
      }
      return {
        ...article,
        score,
        reasons: [...new Set(reasons)].slice(0, 3),
      };
    })
    .filter((article) => article.score > 0)
    .sort((a, b) => b.score - a.score);
}
