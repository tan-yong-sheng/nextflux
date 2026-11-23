// PROTOTYPE — throwaway. In-memory demo data so the variants can be seen
// before a Miniflux account is connected. Never persisted.
const NOW = Date.now();
const DAY = 86400000;

const FEEDS = [
  { id: 1, title: "Hacker News", parsing_error_count: 0, site_url: "https://news.ycombinator.com" },
  { id: 2, title: "Simon Willison's Weblog", parsing_error_count: 0, site_url: "https://simonwillison.net" },
  { id: 3, title: "The Pragmatic Engineer", parsing_error_count: 0, site_url: "https://blog.pragmaticengineer.com" },
  { id: 4, title: "Deno Blog", parsing_error_count: 0, site_url: "https://deno.com/blog" },
  { id: 5, title: "Rust Blog", parsing_error_count: 0, site_url: "https://blog.rust-lang.org" },
  { id: 6, title: "Zombie Product News", parsing_error_count: 3, site_url: "https://example.com" },
  { id: 7, title: "Conference Talks 2019", parsing_error_count: 0, site_url: "https://example.org" },
  { id: 8, title: "AI Weekly Digest", parsing_error_count: 0, site_url: "https://example.net" },
  { id: 9, title: "Cloud Native Weekly", parsing_error_count: 0, site_url: "https://example.io" },
];

// [title, feedId, status, daysAgo, starred]
const TITLES = [
  ["Building a local-first SQLite sync engine", 2, "read", 40, 1],
  ["DuckDB vs SQLite for analytics workloads", 3, "read", 38, 0],
  ["Understanding the Rust borrow checker", 5, "read", 35, 1],
  ["LLM evaluation in production: what works", 8, "read", 30, 0],
  ["SQLite as a sync engine for web apps", 2, "unread", 2, 1],
  ["The state of WebAssembly runtimes in 2026", 4, "unread", 1, 0],
  ["Prompt caching explained", 8, "unread", 1, 0],
  ["Rust 1.90 release notes", 5, "unread", 3, 0],
  ["Cloudflare Durable Objects explained", 9, "unread", 2, 0],
  ["Postgres full-text search vs BM25", 3, "unread", 4, 0],
  ["Why every app needs an offline mode", 2, "unread", 2, 0],
  ["A boring guide to Postgres indexing", 3, "unread", 6, 0],
  ["Design systems that survive", 4, "read", 20, 0],
  ["Ten years of React", 4, "read", 18, 0],
  ["Data viz for people who hate data viz", 4, "read", 15, 0],
  ["The hidden cost of serverless functions", 9, "unread", 5, 0],
  ["SQLite WAL mode explained", 2, "unread", 1, 0],
  ["Scaling the read-only web", 3, "read", 12, 0],
  ["Old launch announcement", 7, "read", 200, 0],
  ["Another abandoned announcement", 6, "read", 240, 0],
  ["Conference recap from the 2019 summit", 7, "read", 190, 0],
  ["Abandoned product update #1", 6, "unread", 200, 0],
  ["Abandoned product update #2", 6, "unread", 205, 0],
  ["Old conference talk #1", 7, "unread", 195, 0],
  ["Old conference talk #2", 7, "unread", 198, 0],
];

function buildArticles() {
  const articles = [];
  let id = 1;
  for (const [title, feedId, status, daysAgo, starred] of TITLES) {
    const created = NOW - daysAgo * DAY;
    articles.push({
      id: id++,
      feedId,
      title,
      author: "someone",
      url: `https://example.com/${id}`,
      content: `<p>${title}. Some body text so the card renders like the real thing.</p>`,
      status,
      starred,
      published_at: created,
      created_at: created,
      reading_time: 4,
    });
  }
  // Backlog for one feed.
  for (let i = 0; i < 40; i++) {
    const created = NOW - (i % 20) * DAY;
    articles.push({
      id: id++,
      feedId: 1,
      title: `HN discussion #${i}`,
      author: "someone",
      url: `https://example.com/hn/${i}`,
      content: "<p>Discussion thread.</p>",
      status: "unread",
      starred: 0,
      published_at: created,
      created_at: created,
      reading_time: 2,
    });
  }
  // A feed the user actually reads a lot, so "core feed" has a signal.
  for (let i = 0; i < 8; i++) {
    const created = NOW - (i + 1) * 2 * DAY;
    articles.push({
      id: id++,
      feedId: 2,
      title: `Notes on local-first software #${i}`,
      author: "someone",
      url: `https://example.com/localfirst/${i}`,
      content: "<p>Notes.</p>",
      status: "read",
      starred: i % 3 === 0 ? 1 : 0,
      published_at: created,
      created_at: created,
      reading_time: 3,
    });
  }
  return articles;
}

export const DEMO_FEEDS = FEEDS;
export const DEMO_ARTICLES = buildArticles();
