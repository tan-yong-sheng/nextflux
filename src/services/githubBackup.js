/**
 * GitHub subscription backup service.
 *
 * Backup always derives the OPML from the Miniflux server (`GET /v1/export`)
 * so every device produces the same file. Restore is additive: it imports an
 * older OPML version and Miniflux skips feeds that already exist.
 *
 * The Miniflux calls are injected so this module stays free of the HTTP layer
 * and can be tested without a server.
 */

import { GitHubClient, GitHubError } from "../api/github/client.js";
import { accountBackupKey } from "../domain/github/accountKey.js";
import {
  buildBackupMeta,
  diffFeeds,
  parseOPML,
} from "../domain/github/opml.js";
import { buildBackupPaths, getBackupConfig } from "./githubBackupConfig.js";

export { GitHubError };

export const missingFeedApi = () => {
  throw new GitHubError(0, "missingFeedApi");
};

function commitMessage(meta) {
  const date = new Date(meta.exportedAt).toISOString().slice(0, 10);
  return `backup: ${meta.host} ${meta.username} ${date} (${meta.feedCount} feeds)`;
}

function requireConfig(config) {
  if (!config?.repo) throw new GitHubError(0, "missingRepo");
  if (!config?.token) throw new GitHubError(0, "missingToken");
  return config;
}

async function resolvePaths(account, config) {
  const accountKey = await accountBackupKey(account?.id);
  return buildBackupPaths(account, config, accountKey);
}

/**
 * Push the current subscriptions of one account to its GitHub repository.
 *
 * @param {object} account the authenticated Miniflux account
 * @param {object} options `{ config, client, feeds }`
 */
export async function backupAccount(account, { config, client, feeds } = {}) {
  const settings = requireConfig(config || getBackupConfig(account));
  const github = client || new GitHubClient({ token: settings.token });
  const { exportOPML = missingFeedApi } = feeds || {};
  const { opmlPath, metaPath } = await resolvePaths(account, settings);

  const opml = await exportOPML();
  const parsed = parseOPML(opml);
  const meta = buildBackupMeta({
    account,
    exportedAt: new Date().toISOString(),
    feedCount: parsed.feeds.length,
  });

  const existing = await github.readFile(settings.repo, opmlPath, {
    branch: settings.branch,
  });
  if (existing.found && existing.content === opml) {
    return { skipped: true, reason: "unchanged", path: opmlPath, meta };
  }

  const message = commitMessage(meta);
  // One commit holds the subscription file and its metadata, so the history
  // stays readable and the metadata never drifts from the subscriptions.
  const files = [
    { path: opmlPath, content: opml },
    { path: metaPath, content: `${JSON.stringify(meta, null, 2)}\n` },
  ];

  let result;
  try {
    result = await github.commitFiles(settings.repo, {
      branch: settings.branch,
      message,
      files,
    });
  } catch (error) {
    if (error.status !== 422) throw error;
    // Someone else committed in the meantime: build the commit again on top
    // of the current branch head.
    result = await github.commitFiles(settings.repo, {
      branch: settings.branch,
      message,
      files,
    });
  }

  return {
    skipped: false,
    path: opmlPath,
    metaPath,
    feedCount: meta.feedCount,
    commitUrl: result.commitUrl,
    commitSha: result.commitSha,
  };
}

/**
 * List the backup versions stored in the repository.
 */
export async function listBackupVersions(account, { config, client } = {}) {
  const settings = requireConfig(config || getBackupConfig(account));
  const github = client || new GitHubClient({ token: settings.token });
  const { opmlPath } = await resolvePaths(account, settings);
  return github.listCommits(settings.repo, opmlPath, { branch: settings.branch });
}

/**
 * Read one backup version and compare it with the server subscriptions.
 */
export async function previewRestore(
  account,
  commitSha,
  { config, client, feeds } = {},
) {
  const settings = requireConfig(config || getBackupConfig(account));
  const github = client || new GitHubClient({ token: settings.token });
  const { getFeeds = missingFeedApi } = feeds || {};
  const { opmlPath } = await resolvePaths(account, settings);

  const file = await github.readFile(settings.repo, opmlPath, { ref: commitSha });
  if (!file.found) throw new GitHubError(404, "versionMissing");

  const opml = parseOPML(file.content);
  const existingFeeds = await getFeeds();
  const diff = diffFeeds(
    opml,
    existingFeeds.map((feed) => feed.feed_url),
  );

  return { opml: file.content, diff, commitSha };
}

/**
 * Import a backup version into the active Miniflux account.
 */
export async function restoreAccount(
  account,
  commitSha,
  { config, client, feeds } = {},
) {
  const { importOPMLText = missingFeedApi, refreshAllFeeds = missingFeedApi } =
    feeds || {};
  const { opml, diff } = await previewRestore(account, commitSha, {
    config,
    client,
    feeds,
  });
  if (diff.added.length === 0) {
    return { imported: false, diff };
  }
  await importOPMLText(opml);
  await refreshAllFeeds();
  return { imported: true, diff };
}
