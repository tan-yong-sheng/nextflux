// PROTOTYPE — throwaway. Shared signal vocabulary, so the sidebar list and the
// panels agree on what "quiet" and "backlog" mean and tokenize titles alike.

export const DAY = 24 * 60 * 60 * 1000;
export const QUIET_DAYS = 21;
export const BACKLOG_UNREAD = 25;

const STOP_WORDS = new Set([
  "the", "and", "for", "that", "with", "this", "from", "you", "your", "are",
  "was", "how", "why", "what", "when", "who", "not", "but", "can", "will",
  "its", "it", "a", "an", "of", "to", "in", "on", "is", "as", "at", "by",
  "be", "we", "our", "new", "more", "has", "have", "had", "or", "if", "so",
]);

// Dexie stores published_at/created_at as Miniflux's RFC3339 strings; demo
// data uses epoch ms. Normalize both to ms — Math.max on a string yields NaN.
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
    .filter((word) => word.length > 3 && !STOP_WORDS.has(word));