import test from "node:test";
import assert from "node:assert/strict";

import {
  buildBackupMeta,
  diffFeeds,
  isOPMLDocument,
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
  assert.equal(meta.host, "miniflux.example.com");
  assert.equal(meta.username, "alice");
  assert.equal(meta.feedCount, 12);
  assert.equal(JSON.stringify(meta).includes("secret-token"), false);
  assert.equal(JSON.stringify(meta).includes("secret-password"), false);
});

test("the metadata stores only the host of the Miniflux URL", () => {
  const meta = buildBackupMeta({
    account: {
      serverUrl: "https://alice:secret@miniflux.example.com:8080/feed",
      username: "alice",
      userId: 42,
    },
    exportedAt: "2026-11-23T00:00:00.000Z",
    feedCount: 3,
  });
  assert.equal(meta.host, "miniflux.example.com");
  assert.equal(JSON.stringify(meta).includes("secret"), false);
  assert.equal(JSON.stringify(meta).includes(":8080"), false);
});

test("decodes named, decimal and hexadecimal character references", () => {
  const { feeds } = parseOPML(
    '<opml><body><outline title="It&#39;s" text="caf&#xE9;" xmlUrl="https://a.com/?a=&#48;&amp;b=1" /></body></opml>',
  );
  assert.equal(feeds[0].title, "It's");
  assert.equal(feeds[0].url, "https://a.com/?a=0&b=1");
  assert.equal(
    parseOPML('<opml><body><outline title="&quot;q&quot; &apos;a&apos;" xmlUrl="https://a.com/f" /></body></opml>')
      .feeds[0].title,
    '"q" \'a\'',
  );
});

test("decodes character references in one pass", () => {
  const { feeds } = parseOPML(
    '<opml><body><outline title="&#38;amp;" xmlUrl="https://a.com/f" /></body></opml>',
  );
  // The escaped ampersand stays escaped instead of becoming a bare "&".
  assert.equal(feeds[0].title, "&amp;");
});

test("drops out-of-range and surrogate character references", () => {
  const { feeds } = parseOPML(
    '<opml><body><outline title="a&#x110000;b&#xD800;c" xmlUrl="https://a.com/f" /></body></opml>',
  );
  assert.equal(feeds[0].title, "abc");
});

test("accepts an OPML root and an empty self-closing export", () => {
  assert.equal(isOPMLDocument(OPML), true);
  assert.equal(isOPMLDocument('<?xml version="1.0"?>\n<opml version="2.0" />'), true);
  assert.equal(isOPMLDocument('<opml><body><outline text="x"/></body></opml>\n\n'), true);
});

test("rejects a document whose root is not opml", () => {
  assert.equal(isOPMLDocument("<html>error</html>"), false);
  assert.equal(
    isOPMLDocument('<div><opml version="2.0"><body></body></opml></div>'),
    false,
  );
  assert.equal(isOPMLDocument(""), false);
  assert.equal(isOPMLDocument(undefined), false);
});
