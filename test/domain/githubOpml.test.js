import test from "node:test";
import assert from "node:assert/strict";

import {
  buildBackupMeta,
  diffFeeds,
  parseOPML,
} from "../../src/domain/github/opml.js";

const OPML = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Subscriptions</title></head>
  <body>
    <outline text="Tech">
      <outline type="rss" text="Example" title="Example" xmlUrl="https://example.com/feed.xml" />
      <outline type="rss" text="Other" title="Other" xmlUrl="https://other.com/rss" />
    </outline>
    <outline type="rss" text="Root" title="Root" xmlUrl="https://root.com/feed" />
  </body>
</opml>`;

test("parses feed urls, titles and categories from an OPML export", () => {
  const { feeds } = parseOPML(OPML);
  assert.equal(feeds.length, 3);
  assert.deepEqual(feeds[0], {
    url: "https://example.com/feed.xml",
    title: "Example",
    category: "Tech",
  });
  assert.equal(feeds[2].category, null);
});

test("keeps the category for a feed that is not self-closing", () => {
  const { feeds } = parseOPML(
    '<outline text="Tech"><outline text="Example" xmlUrl="https://example.com/feed.xml"></outline><outline text="Next" xmlUrl="https://next.com/feed" /></outline>',
  );
  assert.equal(feeds.length, 2);
  assert.equal(feeds[0].category, "Tech");
  assert.equal(feeds[1].category, "Tech");
});

test("returns no feeds for empty or malformed documents", () => {
  assert.deepEqual(parseOPML("").feeds, []);
  assert.deepEqual(parseOPML("<opml><body></body></opml>").feeds, []);
});

test("decodes XML entities in urls and titles", () => {
  const { feeds } = parseOPML(
    '<outline title="A &amp; B" xmlUrl="https://example.com/?a=1&amp;b=2" />',
  );
  assert.equal(feeds[0].title, "A & B");
  assert.equal(feeds[0].url, "https://example.com/?a=1&b=2");
});

test("diff reports added and already present feeds without removals", () => {
  const { feeds } = parseOPML(OPML);
  const diff = diffFeeds({ feeds }, ["https://example.com/feed.xml"]);
  assert.equal(diff.added.length, 2);
  assert.equal(diff.present.length, 1);
  assert.equal(diff.total, 3);
  assert.equal(
    diff.added.some((feed) => feed.url === "https://example.com/feed.xml"),
    false,
  );
});

test("diff ignores duplicate feed urls", () => {
  const diff = diffFeeds(
    { feeds: [{ url: "https://a.com/f" }, { url: "https://a.com/f" }] },
    [],
  );
  assert.equal(diff.added.length, 1);
});

test("backup meta carries the account identity but no credentials", () => {
  const meta = buildBackupMeta({
    account: {
      serverUrl: "https://miniflux.example.com",
      username: "alice",
      userId: "42",
      token: "secret-token",
      password: "secret-password",
    },
    exportedAt: "2026-11-23T10:00:00.000Z",
    feedCount: 12,
  });
  assert.equal(meta.version, 1);
  assert.equal(meta.app, "nextflux");
  assert.equal(meta.host, "https://miniflux.example.com");
  assert.equal(meta.username, "alice");
  assert.equal(meta.feedCount, 12);
  assert.equal(JSON.stringify(meta).includes("secret-token"), false);
  assert.equal(JSON.stringify(meta).includes("secret-password"), false);
});
