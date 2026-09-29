# Plan 006: One Playwright test runs the demo against the real backend in CI

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 079e7df..HEAD -- .github/workflows/ci.yml frontend/playwright.config.ts frontend/package.json compose.yaml`
> On a mismatch with the excerpts below, STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW (adds a job and a spec; changes no app code)
- **Depends on**: none. If plans 002, 004 or 005 land first, the steps
  below say where the spec changes.
- **Category**: tests
- **Planned at**: commit `079e7df` + working-tree fix, 2026-09-28

## Why this matters

Every Playwright spec mocks the API (`page.route("**/api/v1/**", ...)`), so
CI never checks that the frontend and the real backend agree. That gap hid
a demo-breaking bug: the backend required a password re-entry ("step-up")
to grant consent, the frontend never sent one, and CI was green because
the mock accepted the grant. One spec that drives the real Compose stack
through the demo's graded flow catches that whole class of bug. It is the
check that makes "the demo works" a CI fact instead of a rehearsal hope.

## Current state

- `frontend/playwright.config.ts`: `testDir: "./e2e"`,
  `baseURL: "http://localhost:3000"`, and a `webServer` running `npm run
  dev`. Comment: "every `/api/v1/*` call is mocked inside the specs". Leave
  this config and `e2e/` untouched; they stay the fast mocked suite.
- `compose.yaml` runs six containers (caddy, frontend, backend, postgres,
  redis, mailpit). Caddy publishes port 80 and routes `/api/*` to the
  backend and everything else to the frontend (same origin). Backend first
  boot runs migrations and loads deterministic seed data.
  `docker compose up --build --wait` returns once all healthchecks pass
  (the frontend healthcheck allows up to ~3 minutes).
- The frontend container runs `next dev` (`frontend/Dockerfile`), so the
  first visit to each route compiles it on demand; allow long timeouts.
- `.github/workflows/ci.yml` has jobs `backend`, `frontend`, `frontend-e2e`.
  Action versions in use: `actions/checkout@v7`, `actions/setup-node@v7`
  (node 24). `ubuntu-latest` has Docker and Compose.
- Seeded accounts (password `Pulse@demo1`, from `seed/data/identity/users.csv`):
  - Patient `demo.patient.en@example.com`, Patient ID `0c96112a-1653-5403-999c-30ec1ef6dda8`
  - Provider Staff `staff000@example.com`
  - Clinician `clinician0@example.com`
- UI strings (English catalogs under `frontend/src/i18n/messages/en/`):
  login form labels "Email address", "Password", button "Sign in"; entry
  form "Entry type", "Occurred at" (a `datetime-local` input), "Code
  system", "Code", "Display name", button "File entry", success link "View
  entry"; consent form "Clinician email", "Purpose" (combobox, option
  "Treatment"), expiry `datetime-local`, "Confirm with your password",
  button "Grant access", success "Access granted"; clinician screen field
  "Patient ID", button "Open record"; record heading "Patient record";
  denied state "Record not found"; consent list button "Revoke". Read
  `frontend/e2e/demo-spine.spec.ts` for the exact selectors that already
  work; reuse them.
- Filling inputs before React hydrates gets them reset; call
  `await page.waitForLoadState("networkidle")` after each `goto` before
  filling (the existing specs do this).

## Commands you will need

| Purpose | Command (dir) | Expected |
|---|---|---|
| Stack up | `docker compose up --build -d --wait` (repo root) | all six healthy |
| Live spec | `npx playwright test -c playwright.live.config.ts` (frontend/) | 1 passed |
| Mocked suite | `CI=1 NODE_ENV= npx playwright test` (frontend/) | all pass (unchanged) |
| Types | `npx tsc --noEmit` (frontend/) | exit 0 |
| Stack logs | `docker compose logs backend --tail 200` | for debugging |

## Scope

**In scope:**
- `frontend/playwright.live.config.ts` (create)
- `frontend/e2e-live/demo-spine.live.spec.ts` (create)
- `frontend/package.json` (add one script)
- `.github/workflows/ci.yml` (add one job)
- `frontend/tsconfig.json` / `eslint.config.*` only if the new folder must be included or excluded for tsc/lint to pass

**Out of scope:**
- `frontend/playwright.config.ts` and `frontend/e2e/`: the mocked suite.
- Application code. If the live test finds a real bug, STOP and report it;
  don't fix it here.
- Making the frontend container run a production build (separate concern).

## Git workflow

- Branch: `test/live-demo-spine`
- Commit: `test(e2e): run demo spine against real compose stack in CI`

## Steps

### Step 1: Live config

`frontend/playwright.live.config.ts`: `testDir: "./e2e-live"`,
`use.baseURL: "http://localhost"`, no `webServer`, `workers: 1`,
`fullyParallel: false`, `timeout: 180_000`, `expect: { timeout: 30_000 }`,
`retries: process.env.CI ? 1 : 0`, reporter as in the existing config,
one chromium project. Top comment: this suite needs the Compose stack
already up and hits the real API; nothing is mocked.

Add `"test:e2e:live": "playwright test -c playwright.live.config.ts"` to
`package.json` scripts.

### Step 2: The spec

`frontend/e2e-live/demo-spine.live.spec.ts`, one `test` with
`test.slow()`. Use three browser contexts (`browser.newContext()`), one per
role, so cookies don't collide. A helper `login(page, email)` goes to
`/en/login`, waits for `networkidle`, fills the fields, clicks "Sign in"
and waits until the URL no longer ends with `/login`.

Flow:
1. **Staff files an entry**: open `/en/patients/<PID>/records`, click
   "File new entry", assert the "Patient ID" input has value `<PID>`, and
   file a Diagnosis. Use a unique display name,
   `` `Live check ${Date.now()}` ``, so reruns don't match old entries.
   Click "View entry" and assert the display name is visible. (If plan 002
   has landed, this works unchanged; staff pass the gate.)
2. **Patient grants**: open `/en/consent/new`, fill clinician email
   `clinician0@example.com`, purpose Treatment, expiry 7 days ahead
   (format `YYYY-MM-DDTHH:mm`), password `Pulse@demo1`; click "Grant
   access"; assert "Access granted".
3. **Clinician reads**: open `/en/patients/<PID>/records`; assert heading
   "Patient record" and the unique display name are visible.
4. **Patient audit view**: open `/en/audit`; assert at least one row is
   visible (do not assert clinical content; the audit view has none).
5. **Patient revokes**: open `/en/consent`, click the **first** "Revoke"
   button. Revoke is an inline two-click confirm, not a dialog
   (`frontend/src/app/[locale]/consent/page.tsx:96-140`): click "Revoke",
   then "Confirm revoke". Assert "Access revoked." is visible
   (`consent.json` `list.revoke.success`).
6. **Clinician locked out**: reload `/en/patients/<PID>/records`; assert
   "Record not found" is visible and the display name is not.

If step 1's "File new entry" link doesn't exist on the records page, the
uncommitted 2026-09-28 fix hasn't landed; STOP.

**Verify** (locally): `docker compose up --build -d --wait` from the repo
root, then `npx playwright test -c playwright.live.config.ts` from
`frontend/` → 1 passed. Run it twice: it must pass again (reruns are safe).

### Step 3: CI job

Add to `.github/workflows/ci.yml`:

```yaml
  e2e-live:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - run: docker compose up --build -d --wait
      - uses: actions/setup-node@v7
        with:
          node-version: 24
      - run: npm ci
        working-directory: frontend
      - run: npx playwright install --with-deps chromium
        working-directory: frontend
      - run: npm run test:e2e:live
        working-directory: frontend
      - if: failure()
        run: docker compose logs --tail 300
```

**Verify**: `npx --yes @action-validator/cli .github/workflows/ci.yml` exits 0
if that tool is available; otherwise confirm the YAML parses with
`python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml'))"` → no output.

### Step 4: Confirm the mocked suite is unaffected

**Verify**: `CI=1 NODE_ENV= npx playwright test` → same pass count as
before; `npx tsc --noEmit` → exit 0.

## Test plan

The deliverable is the test: one live end-to-end spec covering staff
filing, grant with step-up, clinician read, audit, revoke, lockout.

## Done criteria

- [ ] `npx playwright test -c playwright.live.config.ts` → 1 passed, twice in a row, against a running stack
- [ ] `rg -n "page.route" frontend/e2e-live` → no matches (nothing mocked)
- [ ] `CI=1 NODE_ENV= npx playwright test` → unchanged pass count
- [ ] `ci.yml` has an `e2e-live` job that dumps compose logs on failure
- [ ] Only in-scope files modified

## STOP conditions

- The live spec fails on a step whose UI works by hand: that's a real app
  bug. Report the failing step and the backend log lines; don't patch the
  app or loosen the assertion.
- `docker compose up --wait` doesn't reach healthy in CI within the job's
  default timeout twice in a row.
- The seeded IDs or accounts above don't exist (`rg 0c96112a seed/data`).

## Maintenance notes

- If plan 004 lands, add a step: the clinician clicks the patient's name in
  "Patients who have given you access" instead of opening the URL directly.
- If plan 005 lands, nothing changes here (the spec uses seeded accounts).
- The job takes minutes (image build + dev compile). If CI time matters,
  run it only on `main` and on PRs labelled `e2e`.
