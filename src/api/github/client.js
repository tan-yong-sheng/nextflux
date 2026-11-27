/**
 * GitHub contents API client used by the subscription backup.
 *
 * The client is deliberately small: it only reads files and commits files in
 * a repository, which is all the backup needs. HTTP failures are thrown as
 * `GitHubError` with the status and the GitHub message attached, so the UI
 * can map them to actionable messages.
 */

const API_ROOT = "https://api.github.com";
const API_VERSION = "2022-11-28";

export class GitHubError extends Error {
  constructor(status, code, message) {
    super(
      message ||
        (code && code !== "requestFailed"
          ? `GitHub request failed: ${code}`
          : `GitHub request failed with status ${status}`),
    );
    this.name = "GitHubError";
    this.status = status;
    this.code = code;
  }
}

function encodePath(path) {
  return String(path)
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

// A branch typed with stray whitespace must resolve to the same ref the UI
// validates, otherwise every lookup misses.
function trimBranch(branch) {
  return typeof branch === "string" ? branch.trim() : "";
}

export function parseRepo(repo) {
  const value = String(repo ?? "").trim().replace(/\.git$/, "");
  const parts = value.split("/").filter(Boolean);
  if (parts.length !== 2) return null;
  const [owner, name] = parts;
  if (!owner || !name) return null;
  return { owner, name, fullName: `${owner}/${name}` };
}

export function fromBase64(encoded) {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder().decode(bytes);
}

export class GitHubClient {
  /**
   * @param {{ token: string, fetchImpl?: typeof fetch }} options
   */
  constructor({ token, fetchImpl } = {}) {
    this.token = token || "";
    this.fetch = fetchImpl || globalThis.fetch;
  }

  headers(extra = {}) {
    return {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": API_VERSION,
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      ...extra,
    };
  }

  async request(url, options = {}) {
    let response;
    try {
      response = await this.fetch(url, {
        ...options,
        headers: this.headers(options.headers),
      });
    } catch (error) {
      // A network failure carries no status, so the UI cannot tell it apart
      // from an HTTP error without this marker.
      throw new GitHubError(0, "offline", error?.message);
    }

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new GitHubError(
        response.status,
        body?.message || "requestFailed",
        body?.message,
      );
    }

    return response;
  }

  /**
   * Verify the token and report the repository permissions it grants.
   * @returns {Promise<{ ok: boolean, status?: number, permissions?: object }>}
   */
  async testAccess(repo) {
    const parsed = parseRepo(repo);
    if (!parsed) {
      return { ok: false, status: 0, error: new GitHubError(0, "invalidRepo") };
    }
    try {
      const response = await this.request(
        `${API_ROOT}/repos/${encodePath(parsed.fullName)}`,
      );
      const body = await response.json();
      return { ok: true, status: response.status, permissions: body.permissions };
    } catch (error) {
      return { ok: false, status: error.status ?? 0, error };
    }
  }

  /**
   * Read a file. Returns `{ found: false }` when the path does not exist yet.
   */
  async readFile(repo, path, { branch, ref } = {}) {
    const parsed = parseRepo(repo);
    if (!parsed) throw new GitHubError(0, "invalidRepo");
    const query = new URLSearchParams();
    const refName = ref || trimBranch(branch);
    if (refName) query.set("ref", refName);
    const suffix = query.toString() ? `?${query}` : "";
    const url = `${API_ROOT}/repos/${encodePath(parsed.fullName)}/contents/${encodePath(path)}${suffix}`;

    try {
      const response = await this.request(url);
      const body = await response.json();
      return {
        found: true,
        sha: body.sha,
        content: body.encoding === "base64" ? fromBase64(body.content) : body.content,
        htmlUrl: body.html_url,
      };
    } catch (error) {
      if (error.status === 404) return { found: false };
      // The Contents API refuses blobs above 1 MB. Reading the same URL with
      // the raw media type returns the text without the base64 envelope, so
      // a large OPML still backs up and restores.
      if (error.status === 403 && /too_large/i.test(error.message || "")) {
        const raw = await this.request(url, {
          headers: { Accept: "application/vnd.github.raw" },
        });
        return {
          found: true,
          sha: null,
          content: await raw.text(),
          htmlUrl: null,
        };
      }
      throw error;
    }
  }

  /**
   * Write several files in a single commit.
   *
   * The contents API creates one commit per file, which would double the
   * history of a backup. The git database API writes every file of the backup
   * in one commit instead.
   */
  async commitFiles(repo, { branch, message, files } = {}) {
    const parsed = parseRepo(repo);
    if (!parsed) throw new GitHubError(0, "invalidRepo");
    const repoUrl = `${API_ROOT}/repos/${encodePath(parsed.fullName)}`;
    const targetBranch = trimBranch(branch) || "main";

    // A brand-new repository has no branch to build the commit on. Its ref
    // lookup answers 404, and the first commit is created without a parent
    // before a new branch is pointed at it. A repository that already has
    // commits but not this branch is a configuration error: a parentless
    // commit there would start an unrelated history.
    let baseCommitSha = null;
    try {
      const base = await this.request(
        `${repoUrl}/git/ref/heads/${encodePath(targetBranch)}`,
      );
      baseCommitSha = (await base.json()).object?.sha || null;
    } catch (error) {
      if (error.status !== 404) throw error;
      const repoResponse = await this.request(repoUrl);
      const repoBody = await repoResponse.json();
      if ((repoBody?.size || 0) > 0) {
        throw new GitHubError(404, "branchMissing");
      }
    }

    let baseTreeSha;
    if (baseCommitSha) {
      const commit = await this.request(
        `${repoUrl}/git/commits/${encodePath(baseCommitSha)}`,
      );
      baseTreeSha = (await commit.json()).tree?.sha;
    }

    const tree = await this.request(
      `${repoUrl}/git/trees`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(baseTreeSha ? { base_tree: baseTreeSha } : {}),
          tree: files.map((file) => ({
            path: file.path,
            mode: "100644",
            type: "blob",
            content: file.content,
          })),
        }),
      },
    );
    const treeResult = await tree.json();

    const newCommit = await this.request(
      `${repoUrl}/git/commits`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          tree: treeResult.sha,
          parents: baseCommitSha ? [baseCommitSha] : [],
        }),
      },
    );
    const commitResult = await newCommit.json();

    const reference = await this.request(
      baseCommitSha
        ? `${repoUrl}/git/refs/heads/${encodePath(targetBranch)}`
        : `${repoUrl}/git/refs`,
      {
        method: baseCommitSha ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          baseCommitSha
            ? { sha: commitResult.sha, force: false }
            : { ref: `refs/heads/${targetBranch}`, sha: commitResult.sha },
        ),
      },
    );
    const referenceResult = await reference.json();

    return {
      sha: treeResult.sha,
      commitSha: commitResult.sha,
      // The reference API answers with an API URL, so the web URL is built
      // from the repository name to give the UI a link a human can open.
      commitUrl: `https://github.com/${parsed.fullName}/commit/${commitResult.sha}`,
      referenceUrl: referenceResult.object?.url || null,
    };
  }

  /**
   * List the commits that touched a path, newest first.
   */
  async listCommits(repo, path, { branch, perPage = 20, page = 1 } = {}) {
    const parsed = parseRepo(repo);
    if (!parsed) throw new GitHubError(0, "invalidRepo");
    const query = new URLSearchParams({
      path,
      per_page: String(perPage),
      page: String(page),
    });
    if (trimBranch(branch)) query.set("sha", trimBranch(branch));

    const response = await this.request(
      `${API_ROOT}/repos/${encodePath(parsed.fullName)}/commits?${query}`,
    );
    const body = await response.json();
    return body.map((commit) => ({
      sha: commit.sha,
      message: commit.commit?.message?.split("\n")[0] || "",
      date: commit.commit?.author?.date || "",
      author: commit.commit?.author?.name || "",
    }));
  }
}
