import test from "node:test";
import assert from "node:assert/strict";

import {
  backupAccount,
  listBackupVersions,
  previewRestore,
  restoreAccount,
} from "../../src/services/githubBackup.js";

const ACCOUNT = { id: '["https://miniflux.example.com","42"]', username: "alice" };
const CONFIG = {
  repo: "octocat/hello",
  branch: "main",
  pathPrefix: "nextflux",
  token: "t",
};

const OPML = `<opml><body>
  <outline text="Tech">
    <outline title="A" xmlUrl="https://a.com/f" />
    <outline title="B" xmlUrl="https://b.com/f" />
  </outline>
</body></opml>`;

function makeClient(overrides = {}) {
  const calls = [];
  return {
    calls,
    readFile: async (repo, path, options) => {
      calls.push({ method: "readFile", repo, path, options });
      if (options?.ref) {
        return { found: true, sha: "blob", content: OPML };
      }
      return overrides.existing ?? { found: false };
    },
    commitFiles: async (repo, options) => {
      calls.push({ method: "commitFiles", repo, options });
      if (overrides.commitError) throw overrides.commitError;
      return {
        commitSha: "commit-sha",
        commitUrl: "https://github.com/o/r/commit",
      };
    },
    listCommits: async (repo, path, options) => {
      calls.push({ method: "listCommits", repo, path, options });
      return overrides.commits ?? [];
    },
  };
}

test("backup commits the OPML and the metadata in one commit", async () => {
  const client = makeClient();
  const result = await backupAccount(ACCOUNT, {
    config: CONFIG,
    client,
    feeds: { exportOPML: async () => OPML },
  });
  assert.equal(result.skipped, false);
  assert.equal(result.feedCount, 2);

  const commits = client.calls.filter((call) => call.method === "commitFiles");
  assert.equal(commits.length, 1);
  const { files, branch, message } = commits[0].options;
  assert.equal(branch, "main");
  assert.match(message, /^backup: /);
  const opmlFile = files.find((file) => file.path.endsWith("subscriptions.opml"));
  const metaFile = files.find((file) => file.path.endsWith("meta.json"));
  assert.equal(opmlFile.content, OPML);
  assert.match(opmlFile.path, /^nextflux\/[A-Za-z0-9_-]{12}\/subscriptions\.opml$/);
  assert.equal(metaFile.path, opmlFile.path.replace("subscriptions.opml", "meta.json"));
  const meta = JSON.parse(metaFile.content);
  assert.equal(meta.username, "alice");
  assert.equal(meta.feedCount, 2);
});

test("backup skips the commit when the content is unchanged", async () => {
  const client = makeClient({ existing: { found: true, sha: "s", content: OPML } });
  const result = await backupAccount(ACCOUNT, {
    config: CONFIG,
    client,
    feeds: { exportOPML: async () => OPML },
  });
  assert.equal(result.skipped, true);
  assert.equal(result.reason, "unchanged");
  assert.equal(
    client.calls.filter((call) => call.method === "commitFiles").length,
    0,
  );
});

test("backup retries once when the branch head moved", async () => {
  for (const status of [409, 422]) {
    let commits = 0;
    const client = {
      readFile: async () => ({ found: true, sha: "old" }),
      commitFiles: async () => {
        commits += 1;
        if (commits === 1) {
          const error = new Error("conflict");
          error.status = status;
          throw error;
        }
        return { commitSha: "c" };
      },
      listCommits: async () => [],
    };
    await backupAccount(ACCOUNT, {
      config: CONFIG,
      client,
      feeds: { exportOPML: async () => OPML },
    });
    assert.equal(commits, 2);
  }
});

test("backup fails without a repository or token", async () => {
  await assert.rejects(
    () => backupAccount(ACCOUNT, { config: { ...CONFIG, repo: "" } }),
    /repository|repo/i,
  );
  await assert.rejects(
    () => backupAccount(ACCOUNT, { config: { ...CONFIG, token: "" } }),
    /token/i,
  );
});

test("lists the backup versions stored in the repository", async () => {
  const client = makeClient({
    commits: [{ sha: "abc", message: "backup", date: "2026-11-23" }],
  });
  const commits = await listBackupVersions(ACCOUNT, {
    config: CONFIG,
    client,
    page: 2,
    perPage: 50,
  });
  assert.equal(commits.length, 1);
  assert.equal(client.calls[0].method, "listCommits");
  assert.equal(client.calls[0].repo, "octocat/hello");
  assert.match(client.calls[0].path, /subscriptions\.opml$/);
  assert.equal(client.calls[0].options.branch, "main");
  assert.equal(client.calls[0].options.page, 2);
  assert.equal(client.calls[0].options.perPage, 50);
});

test("preview compares the stored version with the server subscriptions", async () => {
  const client = makeClient();
  const preview = await previewRestore(ACCOUNT, "sha1", {
    config: CONFIG,
    client,
    feeds: { getFeeds: async () => [{ feed_url: "https://a.com/f" }] },
  });
  assert.equal(preview.diff.added.length, 1);
  assert.equal(preview.diff.added[0].url, "https://b.com/f");
  assert.equal(preview.diff.present.length, 1);
});

test("restore imports the version and refreshes the feeds", async () => {
  const imported = [];
  const client = makeClient();
  const result = await restoreAccount(ACCOUNT, "sha1", {
    config: CONFIG,
    client,
    feeds: {
      getFeeds: async () => [],
      importOPMLText: async (opml) => imported.push(opml),
      refreshAllFeeds: async () => imported.push("refresh"),
    },
  });
  assert.equal(result.imported, true);
  assert.equal(result.diff.added.length, 2);
  assert.equal(imported[0], OPML);
  assert.equal(imported[1], "refresh");
  const readCalls = client.calls.filter((call) => call.method === "readFile");
  assert.equal(
    readCalls.some((call) => call.options?.ref === "sha1"),
    true,
  );
});

test("restore does not import when every feed is already present", async () => {
  let called = false;
  const client = makeClient();
  const result = await restoreAccount(ACCOUNT, "sha1", {
    config: CONFIG,
    client,
    feeds: {
      getFeeds: async () => [
        { feed_url: "https://a.com/f" },
        { feed_url: "https://b.com/f" },
      ],
      importOPMLText: async () => {
        called = true;
      },
      refreshAllFeeds: async () => {
        called = true;
      },
    },
  });
  assert.equal(result.imported, false);
  assert.equal(called, false);
});

test("backup refuses an export that is not an OPML document", async () => {
  const client = makeClient();
  await assert.rejects(
    () =>
      backupAccount(ACCOUNT, {
        config: CONFIG,
        client,
        feeds: { exportOPML: async () => "<html>error</html>" },
      }),
    (error) => error?.code === "invalidExport",
  );
  assert.equal(
    client.calls.filter((call) => call.method === "commitFiles").length,
    0,
  );
});

test("the stored path is derived from the account key", async () => {
  const client = makeClient();
  await backupAccount(ACCOUNT, {
    config: CONFIG,
    client,
    feeds: { exportOPML: async () => OPML },
  });
  const path = client.calls[0].path;
  assert.equal(path.startsWith("nextflux/"), true);
  assert.equal(path.includes("miniflux.example.com"), false);
});
