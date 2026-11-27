# AGENTS.md

## Remotes

- `upstream` → https://github.com/tan-yong-sheng/nextflux (the user's own fork). Pushing there is fine.
- Never push to the original repo `electh/nextflux`.
- Verify the remote before pushing: `git remote -v` must show `upstream` at the fork URL above. In a fresh clone it may be missing or point elsewhere — fix with `git remote set-url upstream https://github.com/tan-yong-sheng/nextflux.git` (or `git remote add upstream <url>` if absent). Check the push URL too: `git remote set-url --push upstream https://github.com/tan-yong-sheng/nextflux.git`, since a separate push URL keeps sending to the old repository.
- Fetch its issues/PRs for reference with `gh ... -R electh/nextflux`.

## Project

Nextflux: an RSS reader frontend for Miniflux, built with Vite + React + JavaScript (jsx/js), Tailwind, nanostores, Dexie. See `README.md` and `docs/` for architecture.
