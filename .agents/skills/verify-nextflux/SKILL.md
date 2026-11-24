---
name: verify-nextflux
description: Verify a Nextflux change by running the app the way a user does. Use before claiming a UI, service-worker, settings, or backup change works, and whenever a diff touches src/components, src/services, src/stores, src/pages, or src/sw.js.
---

# Verify Nextflux

Nextflux is a React + Vite PWA that reads a Miniflux server. Verify a change by driving the
real app, not by reading the diff. There are two tiers: a credential-free gate that always
runs, and an authenticated browser pass that needs a Miniflux account.

## Tier 1 — credential-free gate (always run, show the output)

```bash
npm ci
npm test          # node --test
npm run lint      # eslint .
npm run build     # vite build, emits dist/sw.js
```

Node 22 is required (`.node-version`); CI uses 22. All four must pass. A change that only
passes `npm test` is not verified.

Also confirm the service worker was emitted: `ls dist/sw.js`. The PWA uses `injectManifest`
with `src/sw.js` as the source, so a broken `src/sw.js` fails the build rather than shipping
silently.

## Tier 2 — authenticated browser pass (needs a Miniflux account)

The app has no environment-variable config. `import.meta.env` is not used anywhere in `src/`;
the server URL and credentials are typed into the login form and kept in `localStorage` under
`accounts:v1` (`src/stores/authStore.js:31`). So the credentials must come from the user at
run time.

**Never hardcode, log, or commit a Miniflux URL, API token, VAPID key, or GitHub token.** If
the user has not supplied them, stop and ask. Do not invent a token and do not reuse one from
shell history, dotfiles, or another project.

When credentials are available:

```bash
npm run dev -- --port 5173 --strictPort
```

Then drive the app with Playwright. System `python3` has no `playwright` module; use `uv`:

```bash
uv run --with playwright python3 your_script.py
```

Use the Chromium binary at `${CHROME_PATH:-$HOME/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome}`.
The machine's `google-chrome` shim is broken, so pass `executable_path` explicitly rather than
letting Playwright pick a default; set `CHROME_PATH` when the cached build differs. Launch with
`--no-sandbox` and a 1440x900 viewport.

Login flow (`src/pages/LoginPage.jsx`):

1. Go to `/login`.
2. Fill `#serverUrl` with the Miniflux server URL.
3. Click the "Token Auth" button — it is a full-width secondary button below the form
   (`t("auth.tokenAuth")`), not a tab. The form then swaps to the token field.
4. Fill `#token`, then submit with "Login" (`t("common.login")`).
5. Wait for the feed list, then open the account menu by clicking the element whose text is
   the server URL (the exact host depends on the account).
6. Click the "Settings" menu item.

## What to check per change

Settings tabs are defined in `src/components/Settings/Settings.jsx` — `general`, `appearance`,
`readability`, `ai`, `backup` (labelled "Data", `settings.backup.title`), `shortcuts`, `about`.
Open Settings, select the tab, screenshot the panel, and state what you saw.

- **Data tab** (`src/components/Settings/Backup.jsx`): subscription backup and settings backup.
  At `main` there is no GitHub backup card — that lives on the `feat/github-backup` branch. Do
  not report its absence as a failure when verifying a branch that does not carry it.
- **Service worker / push**: confirm `dist/sw.js` exists after build. If the diff adds push or
  notification code, check that nothing awaits `navigator.serviceWorker.ready` unconditionally —
  it never settles when no worker is registered, so the call must check `getRegistration()`
  first and return early.
- **Backend `functions/`**: only exists on the web-push branches, not at `main`. When verifying
  those branches, `functions/` is Cloudflare Pages Functions; there is no local dev server for
  it, so exercise it through the deployed endpoint or with `node --test` in that directory.
- **Any new `t("...")` key**: confirm it exists in all four locales (`en-US`, `zh-CN`, `fr-FR`,
  `tr-TR`). A missing key renders the raw key string.

## Known failure to watch for

Base UI parts must live inside their Root. A `FieldLabel` or `FieldDescription` rendered
outside `Field.Root` crashes the entire route with
`Base UI: FieldRootContext is missing. Field parts must be placed within <Field.Root>.`
Lint and build both pass. If a settings page shows that error, look for a label that escaped
its field wrapper; horizontal checkbox rows use `Field orientation="horizontal"` plus
`FieldContent`.

## Evidence

Save screenshots to a temp directory (for example `/tmp/verify-<change>/`) and report the
paths. Report what you observed, including what you could not check. If the authenticated
pass was skipped for lack of credentials, say so explicitly — do not imply it ran.
