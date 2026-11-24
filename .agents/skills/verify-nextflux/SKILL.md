---
name: verify-nextflux
description: Verify a Nextflux change by running the app the way a user does. Use before claiming a UI, service-worker, settings, notification, or backup change works, and whenever a diff touches src/components, src/services, src/sw.js, or functions/.
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
npm run build    # vite build, emits dist/sw.js
```

Node 22 is required (`.node-version`); CI uses 22. All four must pass. A change that only
passes `npm test` is not verified.

Also confirm the service worker was emitted: `ls dist/sw.js`. The PWA uses `injectManifest`
with `src/sw.js` as the source, so a broken `src/sw.js` fails the build rather than shipping
silently.

## Tier 2 — authenticated browser pass (needs a Miniflux account)

The app has no environment-variable config. `import.meta.env` is not used anywhere in `src/`;
the server URL and API token are typed into the login form and stored in IndexedDB. So the
credentials must come from the user at run time.

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

Use the Chromium binary at
`~/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome` — the `google-chrome` shim is
broken on this machine. Launch with `--no-sandbox` and a 1440x900 viewport.

Login flow:

1. Go to `/login`.
2. Fill `#serverUrl` with the Miniflux server URL.
3. Click the "Token" tab, fill `#token`, submit.
4. Wait for the feed list, then open the account menu by clicking the element whose text is
   the server URL (`text=rss.example.com` style — the exact host depends on the account).
5. Click the "Settings" menu item.

## What to check per change

- **Settings UI** (General, Appearance, Reading, AI, Data, Shortcuts, About): open Settings,
  select the tab, screenshot the panel. The backup UI is the "Data" tab
  (`settings.backup.title` = "Data" in `src/i18n/locales/en-US.js`).
- **Notifications**: the toggle is Settings → General → "New article notifications". Turning it
  on requests browser notification permission. With the app open, new articles raise a system
  notification; the in-app toast path was removed, so do not look for a toast.
- **Service worker / push**: confirm `dist/sw.js` exists after build, and that the client does
  not stall when no worker is registered. `currentRegistration()` must return `null` quickly
  in that case rather than waiting on `serviceWorker.ready`.
- **Backup**: Settings → Data. Look for the GitHub backup card and the subscription/settings
  backup sections. A crash here is the known Base UI failure below.
- **Any new `t("...")` key**: confirm it exists in all four locales
  (`en-US`, `zh-CN`, `fr-FR`, `tr-TR`). A missing key renders the raw key string.

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
