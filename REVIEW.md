# Reviewing Nextflux

What failure looks like in this repo, and what a reviewer should check. This file is
for the fresh-context reviewer; it is not a style guide.

Facts a reviewer needs up front: the user's fork is `tan-yong-sheng/nextflux` (push target);
the original upstream is `electh/nextflux` (read-only). Remote names differ between
checkouts - check the URL, not the alias.

## What this repo is

Nextflux is a React + Vite Progressive Web App that reads a Miniflux RSS server. JavaScript
with JSX (no TypeScript), Tailwind CSS, nanostores for state, Dexie for IndexedDB. It has a
service worker (`src/sw.js` source, built to `dist/sw.js` via `injectManifest`), i18n in four
locales, and OPML import/export.

The Miniflux API client and resource calls live under `src/api/` (`miniflux.js`, `client.js`);
`src/services/*` consumes them. A separate Cloudflare Pages Functions backend lives in
`functions/` - but only on the web-push branches, not on `main`.

## The gate

CI (`.github/workflows/quality.yml`) installs dependencies and then runs three checks on
Node 22:

```
npm ci
npm test        # node --test
npm run lint    # eslint .
npm run build   # vite build
```

A change that does not pass all three checks is not reviewable. Run them and show the output before
pushing; do not claim they pass.

There is a push-time size gate: more than 1000 changed lines or 20 changed files against the
PR base blocks the push unless `PI_PR_SIZE_EXCEPTION` explains why. Stacked PRs trip it because
the count is measured against `main` and includes every lower layer. A justified exception is
not a defect - check the justification, not the number.

## Failure modes seen in this repo

These are real bugs that reached review. Treat each as a pattern to look for.

1. **Base UI parts outside their Root.** A `FieldLabel` / `FieldDescription` rendered outside a
   `Field.Root` ancestor crashes the whole route at runtime with
   `Base UI: FieldRootContext is missing. Field parts must be placed within <Field.Root>.`
   Lint and build both pass. Found in `src/components/Settings/GitHubBackup.jsx` on the
   `feat/github-backup` branch, which is not at `main`. Check any new
   settings row: the label must sit inside the field wrapper, and horizontal checkbox rows use
   `Field orientation="horizontal"` + `FieldContent`.

2. **Awaiting `serviceWorker.ready` unconditionally.** `navigator.serviceWorker.ready` never
   settles when no worker is registered, so every call stalls for the full timeout on builds
   without a worker. The correct shape is: `getRegistration()` first, return `null` if there is
   none, and only race `ready` against a timeout when a registration exists.

3. **Per-device filtering must use the entry's own feed id.** In the push backend,
   `buildNewEntriesNotice` filters on `entry.feed_id`. The webhook payload's `feed.id` is not
   guaranteed to match it, so a feed-level early return silently suppresses visible articles.
   Filter per entry, and keep the webhook feed id out of the decision.

4. **Unvalidated id lists.** `hiddenFeedIds` must accept only integers and digit strings.
   `Number()` coerces `null`, `""` and `false` to `0` and `true` to `1`, which would hide feed 1.
   Do not reintroduce a silent cap that drops ids past a limit.

5. **Push delivery must report its own failure.** When `sent === 0 && failed > 0` the webhook
   returns 502 with `push_delivery_failed` and logs the per-device reason histogram. A silent
   zero-send is a defect.

6. **Secrets and credentials.** Never hardcode a Miniflux URL or API token. Authenticated flows
   read credentials from the environment or the user at run time and stop to ask when they are
   absent. Check that no token, VAPID private key, or GitHub token is committed, logged, or
   embedded in a client bundle.

7. **Locales must stay in sync.** Every new `t("...")` key needs an entry in all four locale
   files (`en-US`, `zh-CN`, `fr-FR`, `tr-TR`) under `src/i18n/locales/`. A missing key renders
   the raw key string to the user.

## Reviewer checklist

- Does `npm test`, `npm run lint`, and `npm run build` actually run, with output shown?
- Does the diff touch auth, token storage, the service worker, IndexedDB, or the `functions/`
  backend? Those are high risk: require tests plus an integration check, not just unit tests.
- Does any new UI have a screenshot or a scripted browser check? A UI change with no visual
  evidence is not verified.
- Does the change weaken a check it is subject to (tests, lint config, CI workflow)? That is a
  blocker, not a nit.
- Are remotes respected? Push only to the user's fork `tan-yong-sheng/nextflux`; never push to
  `electh/nextflux`. Match by remote URL, not local alias - this checkout may call the fork
  `upstream` while another calls it `origin`.
