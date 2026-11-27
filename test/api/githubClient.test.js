import test from "node:test";
import assert from "node:assert/strict";

import {
  fromBase64,
  GitHubClient,
  GitHubError,
  parseRepo,
} from "../../src/api/github/client.js";

function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function jsonResponse(body, { status = 200, ok = status < 400 } = {}) {
  return {
    ok,
    status,
    json: async () => body,
  };
}

test("parses owner/name repositories and rejects invalid values", () => {
  assert.deepEqual(parseRepo("octocat/hello"), {
    owner: "octocat",
    name: "hello",
    fullName: "octocat/hello",
  });
  assert.equal(parseRepo("octocat/hello.git").fullName, "octocat/hello");
  assert.equal(parseRepo("hello"), null);
  assert.equal(parseRepo("a/b/c"), null);
  assert.equal(parseRepo(""), null);
});

test("base64 round-trips unicode content", () => {
  const content = "<opml>ü 中文</opml>";
  assert.equal(fromBase64(toBase64(content)), content);
});

test("readFile returns the decoded content and blob sha", async () => {
  const client = new GitHubClient({
    token: "t",
    fetchImpl: async () =>
      jsonResponse({
        sha: "blob-sha",
        encoding: "base64",
        content: toBase64("hello"),
      }),
  });
  const file = await client.readFile("o/r", "nextflux/a/subscriptions.opml", {
    branch: "main",
  });
  assert.equal(file.found, true);
  assert.equal(file.sha, "blob-sha");
  assert.equal(file.content, "hello");
});

test("readFile reports a missing path as not found", async () => {
  const client = new GitHubClient({
    token: "t",
    fetchImpl: async () => jsonResponse({ message: "Not Found" }, { status: 404 }),
  });
  const file = await client.readFile("o/r", "missing.opml");
  assert.equal(file.found, false);
});

test("listCommits maps the GitHub payload to the fields the UI needs", async () => {
  const client = new GitHubClient({
    token: "t",
    fetchImpl: async () =>
      jsonResponse([
        {
          sha: "abc",
          commit: {
            message: "backup: example.com 2026-11-23 (3 feeds)",
            author: { date: "2026-11-23T10:00:00Z", name: "alice" },
          },
        },
      ]),
  });
  const commits = await client.listCommits("o/r", "nextflux/a/subscriptions.opml", {
    branch: "main",
  });
  assert.equal(commits.length, 1);
  assert.equal(commits[0].sha, "abc");
  assert.equal(commits[0].message, "backup: example.com 2026-11-23 (3 feeds)");
  assert.equal(commits[0].date, "2026-11-23T10:00:00Z");
});

test("listCommits passes the page through to the query", async () => {
  let requestedUrl = "";
  const client = new GitHubClient({
    token: "t",
    fetchImpl: async (url) => {
      requestedUrl = url;
      return jsonResponse([]);
    },
  });
  await client.listCommits("o/r", "nextflux/a/subscriptions.opml", {
    branch: "main",
    page: 2,
    perPage: 20,
  });
  assert.match(requestedUrl, /[?&]page=2(?:&|$)/);
  assert.match(requestedUrl, /per_page=20/);
});

test("commitFiles writes every file of the backup in one commit", async () => {
  const requests = [];
  const client = new GitHubClient({
    token: "t",
    fetchImpl: async (url, options = {}) => {
      requests.push({
        url,
        method: options.method || "GET",
        body: options.body ? JSON.parse(options.body) : null,
      });
      if (url.includes("/git/ref/heads/")) {
        return jsonResponse({ object: { sha: "base-sha" } });
      }
      if (url.includes("/git/commits/base-sha")) {
        return jsonResponse({ tree: { sha: "tree-sha" } });
      }
      if (url.endsWith("/git/trees")) {
        return jsonResponse({ sha: "new-tree" });
      }
      if (url.endsWith("/git/commits")) {
        return jsonResponse({ sha: "new-commit" });
      }
      return jsonResponse({ object: { url: "https://api.github.com/commit" } });
    },
  });

  const result = await client.commitFiles("o/r", {
    branch: "main",
    message: "backup",
    files: [
      { path: "nextflux/a/subscriptions.opml", content: "<opml/>" },
      { path: "nextflux/a/meta.json", content: "{}" },
    ],
  });

  assert.equal(result.commitSha, "new-commit");
  assert.equal(result.commitUrl, "https://github.com/o/r/commit/new-commit");
  // The whole backup lands in a single commit: one tree, one commit, one ref update.
  const treeRequests = requests.filter((request) =>
    request.url.endsWith("/git/trees"),
  );
  const commitRequests = requests.filter((request) =>
    request.url.endsWith("/git/commits"),
  );
  assert.equal(treeRequests.length, 1);
  assert.equal(commitRequests.length, 1);
  const treeRequest = treeRequests[0];
  assert.equal(treeRequest.method, "POST");
  assert.equal(treeRequest.body.base_tree, "tree-sha");
  assert.deepEqual(treeRequest.body.tree, [
    {
      path: "nextflux/a/subscriptions.opml",
      mode: "100644",
      type: "blob",
      content: "<opml/>",
    },
    {
      path: "nextflux/a/meta.json",
      mode: "100644",
      type: "blob",
      content: "{}",
    },
  ]);
  const commitRequest = requests.find((request) =>
    request.url.endsWith("/git/commits") && request.method === "POST",
  );
  assert.deepEqual(commitRequest.body.parents, ["base-sha"]);
  const reference = requests.find((request) =>
    request.url.includes("/git/refs/heads/"),
  );
  assert.equal(reference.method, "PATCH");
  assert.deepEqual(reference.body, { sha: "new-commit", force: false });
});

test("commitFiles initializes a brand-new repository without a parent", async () => {
  const requests = [];
  const client = new GitHubClient({
    token: "t",
    fetchImpl: async (url, options = {}) => {
      requests.push({
        url,
        method: options.method || "GET",
        body: options.body ? JSON.parse(options.body) : null,
      });
      if (url.includes("/git/ref/heads/")) {
        return jsonResponse({ message: "Not Found" }, { status: 404 });
      }
      if (url.endsWith("/git/trees")) {
        return jsonResponse({ sha: "new-tree" });
      }
      if (url.endsWith("/git/commits")) {
        return jsonResponse({ sha: "new-commit" });
      }
      return jsonResponse({ ref: "refs/heads/main" });
    },
  });

  const result = await client.commitFiles("o/r", {
    branch: "main",
    message: "backup",
    files: [{ path: "nextflux/a/subscriptions.opml", content: "<opml/>" }],
  });

  assert.equal(result.commitSha, "new-commit");
  const treeRequest = requests.find((request) => request.url.endsWith("/git/trees"));
  assert.equal("base_tree" in treeRequest.body, false);
  const commitRequest = requests.find((request) =>
    request.url.endsWith("/git/commits") && request.method === "POST",
  );
  assert.deepEqual(commitRequest.body.parents, []);
  const reference = requests.find((request) => request.url.endsWith("/git/refs"));
  assert.equal(reference.method, "POST");
  assert.deepEqual(reference.body, {
    ref: "refs/heads/main",
    sha: "new-commit",
  });
});

test("testAccess rejects an invalid repository before any request", async () => {
  let called = false;
  const client = new GitHubClient({
    token: "t",
    fetchImpl: async () => {
      called = true;
      return jsonResponse({});
    },
  });
  const result = await client.testAccess("not-a-repo");
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "invalidRepo");
  assert.equal(called, false);
});

test("testAccess surfaces the repository permissions", async () => {
  const client = new GitHubClient({
    token: "t",
    fetchImpl: async () => jsonResponse({ permissions: { push: true } }),
  });
  const result = await client.testAccess("o/r");
  assert.equal(result.ok, true);
  assert.equal(result.permissions.push, true);
});

test("HTTP failures carry the status code and the GitHub message", async () => {
  const client = new GitHubClient({
    token: "bad",
    fetchImpl: async () =>
      jsonResponse({ message: "Bad credentials" }, { status: 401 }),
  });
  await assert.rejects(
    () => client.readFile("o/r", "a.opml"),
    (error) => {
      assert.equal(error instanceof GitHubError, true);
      assert.equal(error.status, 401);
      assert.equal(error.code, "Bad credentials");
      return true;
    },
  );
});

test("a network failure is reported as an offline error", async () => {
  const client = new GitHubClient({
    token: "t",
    fetchImpl: async () => {
      throw new TypeError("Failed to fetch");
    },
  });
  await assert.rejects(
    () => client.readFile("o/r", "a.opml"),
    (error) => {
      assert.equal(error instanceof GitHubError, true);
      assert.equal(error.status, 0);
      assert.equal(error.code, "offline");
      return true;
    },
  );
});
