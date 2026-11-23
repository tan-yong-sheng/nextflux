import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSignals,
  rankForYou,
  toMs,
  tokenize,
} from "../../src/domain/personalization/personalization.js";

const article = (props) => ({
  id: 1,
  feedId: 1,
  title: "Some title",
  status: "unread",
  starred: 0,
  published_at: "2024-01-01T00:00:00Z",
  created_at: "2024-01-01T00:00:00Z",
  ...props,
});

test("toMs accepts RFC3339 strings and epoch numbers", () => {
  assert.equal(toMs("2024-01-01T00:00:00Z"), Date.parse("2024-01-01T00:00:00Z"));
  assert.equal(toMs(1704067200000), 1704067200000);
  assert.equal(toMs("not a date"), 0);
  assert.equal(toMs(undefined), 0);
});

test("tokenize drops short words, stop words and punctuation", () => {
  assert.deepEqual(tokenize("How to use SQLite WAL mode!"), [
    "sqlite",
    "mode",
  ]);
  assert.deepEqual(tokenize(""), []);
});

test("tokenize keeps non-latin words", () => {
  assert.deepEqual(tokenize("数据库 迁移"), ["数据", "迁移"]);
});

test("tokenize segments CJK titles written without spaces", () => {
  const tokens = tokenize("苹果发布新款手机数据库迁移方案");

  assert.equal(tokens.includes("苹果"), true);
  assert.equal(tokens.includes("数据"), true);
  assert.equal(tokens.includes("迁移"), true);
  assert.equal(tokens.includes("苹果发布新款手机数据库迁移方案"), false);
});

test("buildSignals collects topics from starred titles and reads per feed", () => {
  const signals = buildSignals({
    articles: [
      article({ id: 1, starred: 1, title: "SQLite WAL mode explained" }),
      article({ id: 2, starred: 1, title: "SQLite performance" }),
      article({ id: 3, status: "read", feedId: 2 }),
      article({ id: 4, status: "read", feedId: 2 }),
      article({ id: 5, status: "removed", starred: 1, title: "Removed junk" }),
    ],
  });

  assert.equal(signals.starredCount, 2);
  assert.equal(signals.topicCounts.get("sqlite"), 2);
  assert.equal(signals.feedReadCounts.get(2), 2);
  assert.equal(signals.maxFeedReads, 2);
  assert.equal(signals.hasSignal, true);
});

test("buildSignals counts a starred and read article for both signals", () => {
  const signals = buildSignals({
    articles: [
      article({ id: 1, starred: 1, status: "read", feedId: 1, title: "SQLite WAL mode" }),
      article({ id: 2, starred: 1, status: "read", feedId: 1, title: "SQLite tuning" }),
    ],
  });

  assert.equal(signals.starredCount, 2);
  assert.equal(signals.feedReadCounts.get(1), 2);
  assert.equal(signals.topicCounts.get("sqlite"), 2);
});

test("buildSignals drops topics seen in only one starred title", () => {
  const signals = buildSignals({
    articles: [
      article({ id: 1, starred: 1, title: "SQLite WAL mode explained" }),
      article({ id: 2, starred: 1, title: "SQLite performance" }),
    ],
  });

  assert.equal(signals.topicCounts.has("sqlite"), true);
  assert.equal(signals.topicCounts.has("mode"), false);
  assert.equal(signals.topicCounts.has("explained"), false);
});

test("buildSignals keeps single-star topics when there is only one star", () => {
  const signals = buildSignals({
    articles: [article({ id: 1, starred: 1, title: "SQLite WAL mode" })],
  });

  assert.equal(signals.topicCounts.has("sqlite"), true);
});

test("buildSignals reports no signal for a fresh install", () => {
  const signals = buildSignals({ articles: [article({})] });
  assert.equal(signals.starredCount, 0);
  assert.equal(signals.maxFeedReads, 0);
  assert.equal(signals.hasSignal, false);
});

test("rankForYou skips read, starred and removed articles", () => {
  const signals = buildSignals({
    articles: [article({ id: 1, starred: 1, title: "SQLite WAL mode" })],
  });
  const ranked = rankForYou({
    signals,
    articles: [
      article({ id: 10, title: "SQLite WAL mode" }),
      article({ id: 11, title: "SQLite WAL mode", status: "read" }),
      article({ id: 12, title: "SQLite WAL mode", starred: 1 }),
      article({ id: 13, title: "SQLite WAL mode", status: "removed" }),
    ],
  });

  assert.deepEqual(
    ranked.map((item) => item.article.id),
    [10],
  );
});

test("rankForYou keeps only articles that match a signal", () => {
  const signals = buildSignals({
    articles: [article({ id: 1, starred: 1, title: "SQLite WAL mode" })],
  });
  const ranked = rankForYou({
    signals,
    articles: [
      article({ id: 20, title: "Cooking pasta at home" }),
      article({ id: 21, title: "Advanced SQLite tuning" }),
    ],
  });

  assert.deepEqual(
    ranked.map((item) => item.article.id),
    [21],
  );
  assert.deepEqual(ranked[0].reasons, [{ type: "topic", term: "sqlite" }]);
});

test("rankForYou ranks topic matches above feed matches", () => {
  const signals = buildSignals({
    articles: [
      article({ id: 1, starred: 1, title: "SQLite WAL mode" }),
      article({ id: 2, status: "read", feedId: 7 }),
      article({ id: 3, status: "read", feedId: 7 }),
    ],
  });
  const ranked = rankForYou({
    signals,
    articles: [
      article({ id: 21, feedId: 7, title: "Advanced SQLite tuning" }),
      article({ id: 22, feedId: 7, title: "Unrelated headline" }),
    ],
  });

  assert.deepEqual(
    ranked.map((item) => item.article.id),
    [21, 22],
  );
  assert.deepEqual(ranked[0].reasons, [
    { type: "topic", term: "sqlite" },
    { type: "feed" },
  ]);
});

test("rankForYou adds a feed reason for feeds the reader reads often", () => {
  const signals = buildSignals({
    articles: [
      article({ id: 1, status: "read", feedId: 7 }),
      article({ id: 2, status: "read", feedId: 7 }),
    ],
  });
  const ranked = rankForYou({
    signals,
    articles: [article({ id: 30, feedId: 7, title: "Unrelated headline" })],
  });

  assert.equal(ranked.length, 1);
  assert.deepEqual(ranked[0].reasons, [{ type: "feed" }]);
});

test("rankForYou falls back to recency when there is no signal", () => {
  const signals = buildSignals({ articles: [] });
  const ranked = rankForYou({
    signals,
    articles: [
      article({ id: 40, title: "Older", published_at: "2024-01-01T00:00:00Z" }),
      article({ id: 41, title: "Newer", published_at: "2024-06-01T00:00:00Z" }),
    ],
  });

  assert.deepEqual(
    ranked.map((item) => item.article.id),
    [41, 40],
  );
});

test("rankForYou respects the limit and requires signals", () => {
  const signals = buildSignals({
    articles: [article({ id: 1, starred: 1, title: "SQLite WAL mode" })],
  });
  const ranked = rankForYou({
    signals,
    limit: 1,
    articles: [
      article({ id: 50, title: "SQLite WAL mode" }),
      article({ id: 51, title: "SQLite WAL mode" }),
      article({ id: 52, title: "Unrelated" }),
    ],
  });

  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].article.id, 51);
});
