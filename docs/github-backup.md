# GitHub backup

Versioned backup of a Miniflux account's subscriptions to a GitHub repository. The repo is
dumb storage: no GitHub Action, no live sync, no server.

## Why not miniflux-sync

`revett/miniflux-sync` is a deprecated Go CLI that reconciles the *remote* Miniflux state
against a YAML file and **deletes every feed not present in that file**
(`diff/diff.go`, `DeleteFeed`). It is one-way, destructive, and needs a Miniflux API key in
GitHub. This feature is the opposite: one-way from Miniflux to the repo, and restore is
additive.

## Semantics

- **Backup** always reads `GET /v1/export` from Miniflux and writes the returned OPML. It
  never uses the local Dexie cache, so every device produces the same backup.
- **Restore** posts that OPML to `POST /v1/import`. Miniflux skips feed URLs that already
  exist, creates missing categories, and never deletes anything
  (`internal/reader/opml/handler.go`). Restore is a merge, not a rollback.
- **Versions** are git commits. Restore any commit, not only the latest.

## Repository layout

One repo may hold every account:

```
nextflux/
  <account-key>/
    meta.json
    subscriptions.opml
```

- `account-key`: first 12 chars of `base64url(sha256(account.id))`, where `account.id` is
  `serverUrl + userId` (`src/domain/auth/accounts.js`). Stable, filesystem-safe, and does
  not leak the server URL.
- `meta.json`: `{ version: 1, host, username, userId, exportedAt, feedCount, app }`.
  No tokens, no Miniflux credentials.

## Backup flow

1. `GET /v1/export` (existing `exportOPML()` in `src/api/resources/feeds.js`).
2. `GET /repos/{owner}/{repo}/contents/{path}?ref={branch}` → current blob `sha`, or 404.
3. Skip the commit when the content is byte-identical.
4. `PUT /repos/{owner}/{repo}/contents/{path}` with base64 content, the blob `sha` when
   updating, and a message such as `backup: example.com user 2026-11-23 (142 feeds)`.
5. On `409`, re-read the blob and retry once; on a second failure, report and stop.

## Restore flow

1. `GET /repos/{owner}/{repo}/commits?path={path}&per_page=20`.
2. `GET /repos/{owner}/{repo}/contents/{path}?ref={commitSha}` → base64 → OPML text.
3. Parse with `DOMParser`; collect `outline[xmlUrl]` and its category.
4. `GET /v1/feeds` → compare URLs.
5. Preview: `N added`, `M already present`. There are no removals by design.
6. `POST /v1/import` with the OPML body, then trigger a feed sync.

## Configuration and multi-account

Stored per account (keyed by `account.id`), not globally:

| Field | Default |
|---|---|
| `repo` (`owner/name`) | — |
| `branch` | `main` |
| `pathPrefix` | `nextflux` |
| `token` | — |

One PAT per account is allowed, so accounts can use different repos. Restore only ever
touches the active account's Miniflux server.

## Security

- Use a **fine-grained PAT**: `Contents: Read and write`, `Metadata: Read`, selected repo
  only. Validate on save with `GET /repos/{owner}/{repo}` and reject tokens without
  `permissions.push`.
- The token is kept in memory for the session by default. Persisting it to
  `localStorage` is an explicit "remember token" checkbox; the UI names the XSS risk.
- Never write the token, Miniflux URL, or credentials to the repo. Extend
  `settingsBackup.js`'s exclusion (it already drops `aiApiKey`) to the new token keys.
- Recommend a private repo: an OPML file reveals reading interests.

## When backups run

- **Manual** always available.
- **Automatic, opt-in, default off**: debounced 30 s after a feed is added, removed, or
  OPML is imported; and on app start when the last backup is older than 24 h. Automatic
  backup only runs while the app is open; nothing runs when Nextflux is closed.

## UI

Settings → Backup, new "GitHub backup" section: repo, branch, path, token, *Test*,
*Back up now*, *Restore…*, and a "remember token" checkbox. Restore opens a commit list
(date, message, feed count) → preview → confirm. Show the resulting commit link on success.

## Failure handling

| Status | Meaning | Action |
|---|---|---|
| 401 | bad or expired token | ask to re-enter |
| 403 | missing scope or rate limit | name the missing permission / retry later |
| 404 | repo, branch, or path missing | verify repo/branch; create the path on first backup |
| 409 | blob changed since read | refetch and retry once |
| offline | network error | toast, retry on next trigger |

A failed backup never blocks feed operations.

## Out of scope

- Deleting feeds on restore. Deleting a feed destroys its article history.
- GitHub OAuth or a GitHub App. The OAuth web flow needs a client secret, which cannot
  live in a static SPA; a fine-grained PAT is the only viable client-side credential.
- A server-side cron or GitHub Action.
- YAML / feeds-as-code. OPML is richer and already supported by Miniflux.
- Article archiving (see below).

## Article archiving: why not in GitHub

Miniflux permanently deletes entries on a schedule: `CLEANUP_ARCHIVE_READ_DAYS` defaults
to 60, `CLEANUP_ARCHIVE_UNREAD_DAYS` to 180, `CLEANUP_FREQUENCY_HOURS` to 24, and `-1`
disables each. Bookmarked or shared entries are never archived — starring is the built-in
keep-forever mechanism. Archiving deletes both the row and its content and leaves a
tombstone, so the API cannot return a purged entry later.

Storing article links in GitHub does not solve that:

1. **It does not preserve the article.** The content is what was deleted; a URL is only a
   bookmark, and links rot or change.
2. **Volume.** A few hundred feeds produce roughly 10³ entries per day. Daily commits grow
   git history forever; GitHub repos are soft-limited to about 1 GB and files to 100 MB.
   Git is not an append-only data store.
3. **Rate limits and noise.** Thousands of per-article commits would exhaust the 5000
   requests/hour token budget and make the repo unreadable.
4. **Copyright.** Storing full text redistributes publisher content.
5. **Redundant.** Nextflux already keeps cached entries after the server purges them
   (`docs/synchronization.md`), and Miniflux keeps starred entries indefinitely.

Better answers, in order: set the cleanup days to `-1`; star what matters; run a scheduled
`pg_dump` (or restic/Borg) to R2/S3 for full disaster recovery. If a portable article
export is ever wanted, write compressed JSONL to object storage from the server, not to
git.

## Testing

- Unit: account key derivation, OPML parsing, added/present diff, GitHub client against a
  mocked `fetch` (404 → create, 409 → retry, base64 round-trip, identical content → no
  commit).
- Manual: one private repo, backup, verify the commit, restore an older commit into a
  disposable Miniflux account.

## Open decisions

1. Token persistence: session-only unless "remember" is checked (proposed).
2. Automatic backup: opt-in, default off (proposed).
3. Settings backup must exclude the token fields (required).