// Ranking for the "For You" list. Pure functions over locally stored
// articles and feeds — no network, no model, no persistence.
//
// Signals come from what the reader already did: articles they starred (their
// titles tell us what topics they care about) and articles they read (which
// feeds they keep up with).

const STOP_WORDS = new Set([
  "the", "and", "for", "that", "with", "this", "from", "you", "your", "are",
  "was", "how", "why", "what", "when", "who", "not", "but", "can", "will",
  "its", "it", "a", "an", "of", "to", "in", "on", "is", "as", "at", "by",
  "be", "we", "our", "new", "more", "has", "have", "had", "or", "if", "so",
]);

// CJK words are short (two or three characters), so the "longer than three
// letters" rule for Latin words would throw every Chinese title away.
const isCjk = (word) => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(word);

// Chinese and Japanese titles are written without spaces, so splitting on
// whitespace alone leaves the whole title as one token. Segment it into
// words instead, so topics can repeat across titles.
const CJK_SEGMENTER =
  typeof Intl !== "undefined" && Intl.Segmenter
    ? new Intl.Segmenter(undefined, { granularity: "word" })
    : null;

const segmentChunk = (chunk) => {
  if (!chunk || !isCjk(chunk)) return [chunk];
  if (!CJK_SEGMENTER) return [chunk];
  return [...CJK_SEGMENTER.segment(chunk)]
    .filter(({ isWordLike }) => isWordLike)
    .map(({ segment }) => segment);
};

// Scoring weights. A topic hit is worth more than a feed hit because it
// comes from what the reader explicitly starred, not from passive reading.
const TOPIC_WEIGHT = 1.5;
const FEED_WEIGHT = 3;
const FEED_BONUS = 0.5;
const MAX_REASONS = 3;

// Dexie stores published_at/created_at as Miniflux's RFC3339 strings; demo and
// migrated data may hold epoch ms. Normalize both to ms — Math.max on a
// string yields NaN.
export const toMs = (value) => {
  if (typeof value === "number") return value;
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

// Unicode-aware: an ASCII-only strip erases CJK and other non-Latin titles.
export const tokenize = (text) =>
  (text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .flatMap((chunk) => segmentChunk(chunk))
    .filter((word) => word.length > 0 && !STOP_WORDS.has(word))
    .filter((word) => (isCjk(word) ? word.length > 1 : word.length > 3));

const publishedAt = (article) =>
  toMs(article.published_at) || toMs(article.created_at);

/**
 * Summarize what the reader is into.
 *
 * @param {{articles?: Array, now?: number}} input
 */
export function buildSignals({ articles = [] } = {}) {
  const topicCounts = new Map();
  const feedReadCounts = new Map();
  let starredCount = 0;

  for (const article of articles) {
    if (article.status === "removed") continue;
    // A starred article is usually also read, so it counts for both signals.
    if (article.status === "read") {
      feedReadCounts.set(
        article.feedId,
        (feedReadCounts.get(article.feedId) || 0) + 1,
      );
    }
    if (article.starred === 1) {
      starredCount += 1;
      for (const word of tokenize(article.title)) {
        topicCounts.set(word, (topicCounts.get(word) || 0) + 1);
      }
    }
  }

  // A word seen in a single starred title ("mode", "explained") is noise, not
  // a topic. Require it to repeat across starred titles — unless the reader
  // starred so little that repetition is impossible.
  if (starredCount > 1) {
    for (const [word, count] of topicCounts) {
      if (count < 2) topicCounts.delete(word);
    }
  }

  const maxFeedReads = feedReadCounts.size
    ? Math.max(...feedReadCounts.values())
    : 0;

  return {
    topicCounts,
    feedReadCounts,
    maxFeedReads,
    starredCount,
    // With nothing starred and nothing read there is no signal at all, so the
    // ranking falls back to recency instead of showing an empty list.
    hasSignal: starredCount > 0 || maxFeedReads > 0,
  };
}

/**
 * Rank unread articles for the "For You" list.
 *
 * @param {{articles?: Array, signals: object, limit?: number}} input
 * @returns {Array<{article: object, score: number, reasons: Array}>}
 */
export function rankForYou({ articles = [], signals, limit = 50 } = {}) {
  if (!signals) return [];
  const { topicCounts, feedReadCounts, maxFeedReads, hasSignal } = signals;

  const scored = [];
  for (const article of articles) {
    if (article.status !== "unread" || article.starred === 1) continue;

    const hits = tokenize(article.title).filter((word) =>
      topicCounts.has(word),
    );
    const topicScore =
      hits.reduce((sum, word) => sum + topicCounts.get(word), 0) * TOPIC_WEIGHT;

    const feedReads = feedReadCounts.get(article.feedId);
    const feedScore =
      feedReads && maxFeedReads
        ? (feedReads / maxFeedReads) * FEED_WEIGHT + FEED_BONUS
        : 0;

    const score = topicScore + feedScore;

    const reasons = [];
    if (hits.length) {
      const top = [...new Set(hits)]
        .sort((a, b) => topicCounts.get(b) - topicCounts.get(a))
        .slice(0, MAX_REASONS);
      for (const term of top) reasons.push({ type: "topic", term });
    }
    if (feedScore > 0) reasons.push({ type: "feed", feedId: article.feedId });

    scored.push({ article, score, reasons, publishedAt: publishedAt(article) });
  }

  // Fall back to recency only when nothing matched at all, so an active
  // reader does not get an empty list just because their history lives in
  // feeds that currently have no unread items.
  const matchedAny = scored.some((item) => item.score > 0);
  const kept = hasSignal && matchedAny
    ? scored.filter((item) => item.score > 0)
    : scored;

  kept.sort(
    (a, b) =>
      b.score - a.score ||
      b.publishedAt - a.publishedAt ||
      b.article.id - a.article.id,
  );

  return kept.slice(0, limit);
}
