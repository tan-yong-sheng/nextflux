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
  if (stored.rememberToken && stored.token) {
    sessionTokens.set(account?.id, stored.token);
  }
  return {
    ...stored,
    token: sessionTokens.get(account?.id) || "",
  };
}

export function saveBackupConfig(account, changes) {
  const current = readStored(account);
  const next = { ...current, ...changes };

  if (next.token) sessionTokens.set(account?.id, next.token);
  else sessionTokens.delete(account?.id);

  const persisted = { ...next };
  if (persisted.rememberToken) persisted.token = next.token;
  else delete persisted.token;

  try {
    localStorage.setItem(storageKey(account), JSON.stringify(persisted));
  } catch {
    // Storage may be unavailable (private mode); the in-memory config still works.
  }

  return { ...next, token: sessionTokens.get(account?.id) || "" };
}

export function clearBackupConfig(account) {
  sessionTokens.delete(account?.id);
  try {
    localStorage.removeItem(storageKey(account));
  } catch {
    // Ignore storage failures; the in-memory token is already cleared.
  }
}

export function buildBackupPaths(account, config, accountKey) {
  const prefix = (config.pathPrefix || "").replace(/^\/+|\/+$/g, "");
  const segments = [prefix, accountKey, "subscriptions.opml"].filter(Boolean);
  return {
    opmlPath: segments.join("/"),
    metaPath: segments.slice(0, -1).concat("meta.json").join("/"),
  };
}
