import test from "node:test";
import assert from "node:assert/strict";
import {
  collectNewArticleNotice,
  notificationRunEnabled,
} from "../src/domain/notifications/newArticleNotice.js";

const article = (id, overrides = {}) => ({
  id,
  feedId: 1,
  status: "unread",
  title: `Article ${id}`,
  ...overrides,
});

test("collects unread articles from visible feeds", () => {
  const notice = collectNewArticleNotice(
    [article(1), article(2, { status: "read" }), article(3)],
    [{ id: 1, hide_globally: false }],
  );
  assert.deepEqual(notice, {
    count: 2,
    titles: ["Article 1", "Article 3"],
  });
});

test("skips hidden feeds unless the user shows them", () => {
  const feeds = [{ id: 1, hide_globally: true }];
  assert.equal(collectNewArticleNotice([article(1)], feeds), null);
  assert.deepEqual(collectNewArticleNotice([article(1)], feeds, true), {
    count: 1,
    titles: ["Article 1"],
  });
});

test("ignores articles whose feed is not in the feed list", () => {
  const notice = collectNewArticleNotice(
    [article(1), article(2, { feedId: 99 })],
    [{ id: 1, hide_globally: false }],
  );
  assert.deepEqual(notice, { count: 1, titles: ["Article 1"] });
  assert.equal(collectNewArticleNotice([article(2, { feedId: 99 })], []), null);
});

test("returns null when nothing qualifies", () => {
  assert.equal(collectNewArticleNotice([], []), null);
  assert.equal(
    collectNewArticleNotice([article(1, { status: "read" })], []),
    null,
  );
});

test("limits titles but counts every new article", () => {
  const articles = [1, 2, 3, 4, 5].map((id) => article(id));
  const notice = collectNewArticleNotice(articles, [
    { id: 1, hide_globally: false },
  ]);
  assert.equal(notice.count, 5);
  assert.deepEqual(notice.titles, [
    "Article 1",
    "Article 2",
    "Article 3",
  ]);
});

test("announces only after opted-in incremental sync with permission", () => {
  const base = {
    enabled: true,
    permission: "granted",
    hadPreviousSync: true,
    historyComplete: true,
  };
  assert.equal(notificationRunEnabled(base), true);
  assert.equal(
    notificationRunEnabled({ ...base, enabled: false }),
    false,
  );
  assert.equal(
    notificationRunEnabled({ ...base, permission: "denied" }),
    false,
  );
  assert.equal(
    notificationRunEnabled({ ...base, hadPreviousSync: false }),
    false,
  );
  assert.equal(
    notificationRunEnabled({ ...base, historyComplete: false }),
    false,
  );
});