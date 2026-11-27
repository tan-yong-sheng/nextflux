import test from "node:test";
import assert from "node:assert/strict";

import {
  buildBackupPaths,
  clearBackupConfig,
  DEFAULT_CONFIG,
  getBackupConfig,
  saveBackupConfig,
} from "../../src/services/githubBackupConfig.js";

function withStorage(run) {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key),
  };
  try {
    run(store);
  } finally {
    delete globalThis.localStorage;
    // Session tokens live outside localStorage; clear them so a token set by
    // one test cannot leak into the next one.
    clearBackupConfig(ACCOUNT);
  }
}

const ACCOUNT = { id: "acc-1", databaseName: "minifluxReader:acc-1" };

test("returns the defaults when nothing is stored", () => {
  withStorage(() => {
    const config = getBackupConfig(ACCOUNT);
    assert.equal(config.repo, "");
    assert.equal(config.branch, DEFAULT_CONFIG.branch);
    assert.equal(config.pathPrefix, DEFAULT_CONFIG.pathPrefix);
    assert.equal(config.token, "");
  });
});

test("keeps the token out of storage unless the user opts in", () => {
  withStorage((store) => {
    saveBackupConfig(ACCOUNT, { repo: "o/r", token: "secret" });
    const raw = [...store.values()].join("");
    assert.equal(raw.includes("secret"), false);
    assert.equal(getBackupConfig(ACCOUNT).token, "secret");
  });
});

test("stores the token when the user remembers it", () => {
  withStorage((store) => {
    saveBackupConfig(ACCOUNT, { repo: "o/r", token: "secret", rememberToken: true });
    const raw = [...store.values()].join("");
    assert.equal(raw.includes("secret"), true);
    assert.equal(getBackupConfig(ACCOUNT).token, "secret");
  });
});

test("drops the stored token when the opt-in is turned off", () => {
  withStorage((store) => {
    saveBackupConfig(ACCOUNT, { repo: "o/r", token: "secret", rememberToken: true });
    saveBackupConfig(ACCOUNT, { rememberToken: false });
    const raw = [...store.values()].join("");
    assert.equal(raw.includes("secret"), false);
    // The token stays usable in this session; it is just no longer persisted.
    assert.equal(getBackupConfig(ACCOUNT).token, "secret");
  });
});

test("keeps a session-only token when saving other fields", () => {
  withStorage((store) => {
    saveBackupConfig(ACCOUNT, { repo: "o/r", token: "secret" });
    saveBackupConfig(ACCOUNT, { repo: "o/other" });
    assert.equal(getBackupConfig(ACCOUNT).repo, "o/other");
    assert.equal(getBackupConfig(ACCOUNT).token, "secret");
    assert.equal([...store.values()].join("").includes("secret"), false);
  });
});

test("keeps the configuration per account", () => {
  withStorage(() => {
    saveBackupConfig(ACCOUNT, { repo: "o/one" });
    const other = { id: "acc-2", databaseName: "minifluxReader:acc-2" };
    assert.equal(getBackupConfig(other).repo, "");
    assert.equal(getBackupConfig(ACCOUNT).repo, "o/one");
  });
});

test("builds the backup paths from the prefix and the account key", () => {
  const paths = buildBackupPaths(ACCOUNT, { pathPrefix: "nextflux" }, "KEY123");
  assert.equal(paths.opmlPath, "nextflux/KEY123/subscriptions.opml");
  assert.equal(paths.metaPath, "nextflux/KEY123/meta.json");
});

test("builds the backup paths without a prefix", () => {
  const paths = buildBackupPaths(ACCOUNT, { pathPrefix: "" }, "KEY123");
  assert.equal(paths.opmlPath, "KEY123/subscriptions.opml");
});
