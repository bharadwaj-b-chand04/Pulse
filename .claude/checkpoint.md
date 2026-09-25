<!-- Written by /checkpoint. Read by session-start.sh on every session open. -->
<!-- Run /checkpoint before ending a session mid-task or when context is low. -->

## Checkpoint [2026-09-23 12:43]
Status: done
In progress: nothing. Completed: shadcn UI rebuild merged to main via PR #59 (rebase), `run.py` added (uv script: `docker compose up --wait` backend+mailpit, then frontend+caddy), CI fixed (`astral-sh/setup-uv@v10.2.0`; bare `@v10` tag does not exist). main green, local branches pruned, compose stack down (Postgres volume kept).
Next step: pick up P4.5 packaging (#56: locale review, Playwright in CI, demo rehearsal); check #22 for what is available.
Blockers: none
Context notes: shell exports `NODE_ENV=development`, which makes `next build` crash on `/_global-error` (useContext null); use `NODE_ENV=production npm run build` locally. A failed build can leave stale `.next` that makes the next Playwright run flake with "Unexpected end of JSON input". Repo remote moved to `git@github.com:moneytosms/Pulse.git` (origin updated).
