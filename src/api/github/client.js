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
    if (!parsed) return { ok: false, status: 0 };
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
    if (ref) query.set("ref", ref);
    else if (branch) query.set("ref", branch);
    const suffix = query.toString() ? `?${query}` : "";

    try {
      const response = await this.request(
        `${API_ROOT}/repos/${encodePath(parsed.fullName)}/contents/${encodePath(path)}${suffix}`,
      );
      const body = await response.json();
      return {
        found: true,
        sha: body.sha,
        content: body.encoding === "base64" ? fromBase64(body.content) : body.content,
        htmlUrl: body.html_url,
      };
    } catch (error) {
      if (error.status === 404) return { found: false };
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
    const base = await this.request(
      `${API_ROOT}/repos/${encodePath(parsed.fullName)}/git/ref/heads/${encodePath(branch)}`,
    );
    const baseRef = await base.json();
    const baseCommitSha = baseRef.object?.sha;

    const commit = await this.request(
      `${API_ROOT}/repos/${encodePath(parsed.fullName)}/git/commits/${encodePath(baseCommitSha)}`,
    );
    const baseCommit = await commit.json();

    const tree = await this.request(
      `${API_ROOT}/repos/${encodePath(parsed.fullName)}/git/trees`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base_tree: baseCommit.tree?.sha,
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
      `${API_ROOT}/repos/${encodePath(parsed.fullName)}/git/commits`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          tree: treeResult.sha,
          parents: [baseCommitSha],
        }),
      },
    );
    const commitResult = await newCommit.json();

    const reference = await this.request(
      `${API_ROOT}/repos/${encodePath(parsed.fullName)}/git/refs/heads/${encodePath(branch)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sha: commitResult.sha, force: false }),
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
  async listCommits(repo, path, { branch, perPage = 20 } = {}) {
    const parsed = parseRepo(repo);
    if (!parsed) throw new GitHubError(0, "invalidRepo");
    const query = new URLSearchParams({ path, per_page: String(perPage) });
    if (branch) query.set("sha", branch);

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
