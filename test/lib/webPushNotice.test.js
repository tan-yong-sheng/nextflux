import assert from "node:assert/strict";
import { test } from "node:test";
import { buildNewEntriesNotice } from "../../functions/lib/notice.js";

const entry = (id, extra = {}) => ({ id, status: "unread", title: `Entry ${id}`, ...extra });

test("buildNewEntriesNotice summarises a new_entries payload", () => {
  const notice = buildNewEntriesNotice({
    event_type: "new_entries",
    entries: [entry(1), entry(2), entry(3), entry(4)],
  });
  assert.deepEqual(notice, { count: 4, titles: ["Entry 1", "Entry 2", "Entry 3"], url: "/" });
});

test("buildNewEntriesNotice ignores other event types and empty batches", () => {
  assert.equal(buildNewEntriesNotice({ event_type: "save_entry", entries: [entry(1)] }), null);
  assert.equal(buildNewEntriesNotice({ event_type: "new_entries", entries: [] }), null);
  assert.equal(buildNewEntriesNotice({ event_type: "new_entries" }), null);
  assert.equal(buildNewEntriesNotice(null), null);
});

test("buildNewEntriesNotice only counts unread entries", () => {
  const notice = buildNewEntriesNotice({
    event_type: "new_entries",
    entries: [entry(1), entry(2, { status: "read" }), entry(3)],
  });
  assert.equal(notice.count, 2);
  assert.deepEqual(notice.titles, ["Entry 1", "Entry 3"]);
});

test("buildNewEntriesNotice cleans and truncates titles", () => {
  const longTitle = "x".repeat(200);
  const notice = buildNewEntriesNotice({
    event_type: "new_entries",
    entries: [entry(1, { title: "  spaced \n out  " }), entry(2, { title: longTitle }), entry(3)],
  });
  assert.equal(notice.titles[0], "spaced out");
  assert.equal(notice.titles[1].length, 120);
  assert.ok(notice.titles[1].endsWith("…"));
});

test("buildNewEntriesNotice truncates by code points, never splitting emoji", () => {
  const notice = buildNewEntriesNotice({
    event_type: "new_entries",
    entries: [entry(1, { title: "🚀".repeat(200) })],
  });
  const chars = Array.from(notice.titles[0]);
  assert.equal(chars.length, 120);
  assert.equal(chars.at(-1), "…");
  // Every kept character is a whole code point — no lone surrogates.
  assert.equal(notice.titles[0].isWellFormed(), true);
});

test("buildNewEntriesNotice drops entries without a usable title", () => {
  const notice = buildNewEntriesNotice({
    event_type: "new_entries",
    entries: [entry(1, { title: "" }), entry(2, { title: undefined }), entry(3)],
  });
  assert.equal(notice.count, 3);
  assert.deepEqual(notice.titles, ["Entry 3"]);
});

test("buildNewEntriesNotice leaves out the feeds the device hides", () => {
  const notice = buildNewEntriesNotice(
    {
      event_type: "new_entries",
      feed: { id: 9 },
      entries: [entry(1, { feed_id: 7 }), entry(2, { feed_id: 9 })],
    },
    { hiddenFeedIds: [7] },
  );
  assert.deepEqual(notice, { count: 1, titles: ["Entry 2"], url: "/" });
});

test("buildNewEntriesNotice returns nothing when the feed itself is hidden", () => {
  const notice = buildNewEntriesNotice(
    {
      event_type: "new_entries",
      feed: { id: 7 },
      entries: [entry(1, { feed_id: 7 })],
    },
    { hiddenFeedIds: [7] },
  );
  assert.equal(notice, null);
});
