import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

async function loadWorker({ clients = {}, registration = {}, navigator = {} } = {}) {
  const events = new Map();
  const context = {
    self: {
      __WB_MANIFEST: [],
      registration: { scope: "https://nextflux.example/", ...registration },
      addEventListener: (type, handler) => events.set(type, handler),
      navigator,
      clients: {
        matchAll: async () => [],
        openWindow: async () => undefined,
        ...clients,
      },
    },
    caches: { keys: async () => [], delete: async () => true },
    JSON,
  };
  runInNewContext(
    await readFile(new URL("../src/sw.js", import.meta.url), "utf8"),
    context,
  );
  return events;
}

function pushEvent(payload) {
  const calls = [];
  return {
    data: { text: () => JSON.stringify(payload) },
    waitUntil: (promise) => calls.push(Promise.resolve(promise)),
    settle: () => Promise.all(calls),
  };
}

test("a push always raises a system notification, even with a visible tab", async () => {
  const shown = [];
  const posted = [];
  const events = await loadWorker({
    navigator: { language: "en-US" },
    clients: {
      matchAll: async () => [
        { visibilityState: "visible", postMessage: (message) => posted.push(message) },
      ],
    },
    registration: {
      showNotification: async (...args) => shown.push(args),
    },
  });

  const notice = { count: 2, titles: ["One", "Two"], url: "/" };
  const event = pushEvent(notice);
  events.get("push")(event);
  await event.settle();

  assert.equal(posted.length, 0);
  assert.equal(shown.length, 1);
  assert.equal(shown[0][0], "2 new articles");
  assert.deepEqual(JSON.parse(JSON.stringify(shown[0][1].data)), { url: "/" });
});

test("a push without a visible tab raises a system notification", async () => {
  const shown = [];
  const posted = [];
  const events = await loadWorker({
    navigator: { language: "en-US" },
    clients: {
      matchAll: async () => [
        { visibilityState: "hidden", postMessage: (message) => posted.push(message) },
      ],
    },
    registration: {
      showNotification: async (...args) => shown.push(args),
    },
  });

  const event = pushEvent({ count: 3, titles: ["One", "Two"], url: "/" });
  events.get("push")(event);
  await event.settle();

  assert.equal(posted.length, 0);
  assert.equal(shown.length, 1);
  assert.equal(shown[0][0], "3 new articles");
  assert.equal(shown[0][1].body, "One · Two");
  assert.deepEqual(JSON.parse(JSON.stringify(shown[0][1].data)), { url: "/" });
});

test("push titles follow the browser language with an English fallback", async () => {
  const cases = [
    ["zh-CN", 3, "3 篇新文章"],
    ["fr-FR", 3, "3 nouveaux articles"],
    ["fr-FR", 1, "1 nouvel article"],
    ["tr-TR", 3, "3 yeni makale"],
    // No navigator.language: one article in English.
    [undefined, 1, "1 new article"],
  ];
  const seen = {};
  for (const [language, count, expected] of cases) {
    const shown = [];
    const events = await loadWorker({
      navigator: language ? { language } : {},
      registration: { showNotification: async (...args) => shown.push(args) },
    });
    const event = pushEvent({ count, titles: [], url: "/" });
    events.get("push")(event);
    await event.settle();
    seen[`${language || "fallback"}:${count}`] = shown[0][0];
    assert.equal(shown[0][0], expected);
  }
  assert.equal(Object.keys(seen).length, cases.length);
});

test("malformed push payloads are ignored", async () => {
  const shown = [];
  const events = await loadWorker({
    registration: { showNotification: async (...args) => shown.push(args) },
  });
  for (const payload of [null, {}, { count: 0 }, { count: "many" }]) {
    const event = pushEvent(payload);
    events.get("push")(event);
    await event.settle();
  }
  assert.equal(shown.length, 0);
});
