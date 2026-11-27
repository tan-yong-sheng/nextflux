/**
 * Per-account GitHub backup configuration.
 *
 * The token is a browser-stored secret, so it is kept in memory by default.
 * Persisting it to localStorage requires an explicit opt-in, because any
 * script running on the page can read it.
 */

import { accountStorageKey } from "../domain/auth/accounts.js";
import { reportError } from "../lib/errors.js";

const STORAGE_SUFFIX = "githubBackup:v1";
const sessionTokens = new Map();
// When localStorage refuses a write (quota, private mode), the effective
// config lives here for the session instead of being lost on the next read.
const memoryConfigs = new Map();

export const DEFAULT_CONFIG = {
  repo: "",
  branch: "main",
  pathPrefix: "nextflux",
  rememberToken: false,
};

function storageKey(account) {
  return accountStorageKey(account, STORAGE_SUFFIX);
}

function readStored(account) {
  try {
    const raw = localStorage.getItem(storageKey(account));
    if (!raw) return { ...DEFAULT_CONFIG };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      token: parsed.rememberToken ? parsed.token || "" : "",
      rememberToken: Boolean(parsed.rememberToken),
    };
  } catch (error) {
    // A corrupt entry must be visible in the logs, otherwise the backup
    // silently falls back to the defaults.
    reportError(error, "backup.github.config.read");
    return { ...DEFAULT_CONFIG };
  }
}

export function getBackupConfig(account) {
  const stored = readStored(account);
  const memory = memoryConfigs.get(account?.id);
  const effective = memory ? { ...stored, ...memory } : stored;
  if (effective.rememberToken && effective.token) {
    sessionTokens.set(account?.id, effective.token);
  }
  return {
    ...effective,
    token: sessionTokens.get(account?.id) || "",
  };
}

export function saveBackupConfig(account, changes) {
  // Merge over the effective config (stored + session token): a caller that
  // only edits repo/branch/path must not drop a session-only token.
  const current = getBackupConfig(account);
  const next = { ...current, ...changes };

  if (next.token) sessionTokens.set(account?.id, next.token);
  else sessionTokens.delete(account?.id);

  const persisted = { ...next };
  if (persisted.rememberToken) persisted.token = next.token;
  else delete persisted.token;

  try {
    localStorage.setItem(storageKey(account), JSON.stringify(persisted));
    memoryConfigs.delete(account?.id);
  } catch {
    // Storage may be unavailable (quota or private mode). Keep the effective
    // config in memory so this session still works and a later read does not
    // silently fall back to the defaults.
    memoryConfigs.set(account?.id, persisted);
  }

  return { ...next, token: sessionTokens.get(account?.id) || "" };
}

export function clearBackupConfig(account) {
  sessionTokens.delete(account?.id);
  memoryConfigs.delete(account?.id);
  try {
    localStorage.removeItem(storageKey(account));
  } catch {
    // Ignore storage failures; the in-memory token is already cleared.
  }
}

export function buildBackupPaths(account, config, accountKey) {
  // Drop empty, current and parent segments: a pathPrefix must stay inside the
  // repository, so it cannot climb out through ".." segments.
  const prefix = String(config.pathPrefix || "")
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .join("/");
  const segments = [prefix, accountKey, "subscriptions.opml"].filter(Boolean);
  return {
    opmlPath: segments.join("/"),
    metaPath: segments.slice(0, -1).concat("meta.json").join("/"),
  };
}
