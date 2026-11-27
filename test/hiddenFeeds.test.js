import test from "node:test";
import assert from "node:assert/strict";
import { hiddenFeedIds } from "../src/domain/notifications/hiddenFeeds.js";

test("hidden feeds are reported by id", () => {
  const feeds = [
    { id: 1, hide_globally: false },
    { id: 2, hide_globally: true },
    { id: 3, hide_globally: true },
  ];
  assert.deepEqual(hiddenFeedIds(feeds), [2, 3]);
});

test("no hidden feeds are reported when hidden feeds are shown", () => {
  const feeds = [{ id: 2, hide_globally: true }];
  assert.deepEqual(hiddenFeedIds(feeds, true), []);
});

test("only usable ids are reported", () => {
  const feeds = [
    { id: "abc", hide_globally: true },
    { id: null, hide_globally: true },
    { hide_globally: true },
    { id: 5, hide_globally: true },
  ];
  assert.deepEqual(hiddenFeedIds(feeds), [5]);
});

test("only real feed ids are reported", () => {
  const feeds = [
    // Number(true) is 1 and Number("1.5") is 1.5; neither is a feed id.
    { id: true, hide_globally: true },
    { id: "1.5", hide_globally: true },
    { id: -1, hide_globally: true },
    { id: 2.5, hide_globally: true },
    { id: "7", hide_globally: true },
    { id: 8, hide_globally: true },
  ];
  assert.deepEqual(hiddenFeedIds(feeds), [7, 8]);
});

test("an empty feed list reports nothing", () => {
  assert.deepEqual(hiddenFeedIds([]), []);
});
