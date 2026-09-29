# Plan 002: Only Provider Staff can open the "File a new entry" form

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 079e7df..HEAD -- 'frontend/src/app/[locale]/timeline/new/page.tsx' frontend/e2e/entry-upload.spec.ts frontend/src/i18n/messages`
> This plan was written against 079e7df **plus** an uncommitted fix (the form
> now reads `?patientId=` via `use(searchParams)`). The diff will therefore
> show that fix; compare the "Current state" excerpts below against the live
> file. On any other mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (UX)
- **Planned at**: commit `079e7df` + working-tree fix, 2026-09-28

## Why this matters

Only the Provider Staff role holds `RECORDS_WRITE`, so only Provider Staff
can file a Medical Entry. A Patient, Clinician or Administrator who opens
`/en/timeline/new` (by URL or bookmark) sees the whole form, fills it in,
and only on submit gets "You do not have access to this." (a 403). The
screen should say up front that it is for Provider Staff, the same way the
clinician screen already does.

## Current state

- `backend/app/core/authz.py:86-93` — `Role.PROVIDER_STAFF` is the only role
  whose permission set contains `Permission.RECORDS_WRITE`. Do not change it.
- `frontend/src/app/[locale]/timeline/new/page.tsx` — the entry form. A
  client component (`"use client"`). Today it starts:

  ```tsx
  export default function NewEntryPage({
    searchParams,
  }: {
    searchParams: Promise<{ patientId?: string }>;
  }) {
    const { patientId: initialPatientId } = use(searchParams);
    const t = useTranslations("entry");
  ```

  It has no role check.
- **Exemplar to copy:** `frontend/src/app/[locale]/clinician/page.tsx:29-97`
  gates its screen on `/auth/me`. The pattern:

  ```tsx
  const [gate, setGate] = useState<GateState>({ status: "loading" });
  useEffect(() => {
    let active = true;
    api
      .get<Me>("/auth/me")
      .then((me) => {
        if (!active) return;
        setGate(
          me.role === "CLINICIAN" || me.role === "PROVIDER_STAFF"
            ? { status: "ready" }
            : { status: "denied" },
        );
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiError && (err.status === 401 || err.code === "SESSION_EXPIRED")) {
          router.replace("/login");
          return;
        }
        setGate({ status: "error" });
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  ```

  and renders a destructive `<Alert>` with `TriangleAlertIcon` for
  `denied` / `error`. Read the whole file before starting and match it.
- `Me` type: `frontend/src/lib/auth.ts:10` (`userId`, `role`, `email`,
  `emailVerified`).
- i18n: one JSON catalog per feature per locale under
  `frontend/src/i18n/messages/{en,hi,ta,ml}/`. The entry form uses the
  `entry` namespace (`entry.json`). Missing keys throw in dev and CI, so any
  key added to `en` **must** be added to `hi`, `ta` and `ml` too. Hindi,
  Tamil and Malayalam are machine-translated in this project (see
  `docs/locale-review.md`); write a sensible translation, never leave English.
- Project rule (`.claude/rules/frontend.md`): colour never carries meaning
  alone. Use the icon plus text, as the exemplar does.

## Commands you will need

Run from `frontend/`. The shell may export `NODE_ENV=development`; prefix
Playwright with `NODE_ENV=`.

| Purpose   | Command | Expected on success |
|-----------|---------|---------------------|
| Install   | `npm ci` | exit 0 |
| Browsers  | `npx playwright install chromium` | exit 0 |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Lint      | `npx eslint 'src/app/[locale]/timeline/new/page.tsx' e2e/entry-upload.spec.ts` | exit 0, no errors |
| E2E       | `CI=1 NODE_ENV= npx playwright test` | all pass |

If Playwright reports `SyntaxError: Unexpected end of JSON input` from
`[WebServer]`, a stale `.next` directory is the cause: move `frontend/.next`
out of the repo (do not delete other files) and rerun.

## Scope

**In scope:**
- `frontend/src/app/[locale]/timeline/new/page.tsx`
- `frontend/src/i18n/messages/{en,hi,ta,ml}/entry.json`
- `frontend/e2e/entry-upload.spec.ts`
- `frontend/e2e/demo-spine.spec.ts` (only to add an `/auth/me` mock if the
  gate breaks it; see Step 3)

**Out of scope:**
- Anything in `backend/`: the 403 is correct and stays.
- `frontend/src/app/[locale]/clinician/page.tsx`: the exemplar; copy from
  it, do not refactor it into a shared hook (one other caller does not
  justify an abstraction).

## Git workflow

- Branch: `fix/entry-form-staff-gate`
- Conventional commits, e.g. `fix(frontend): gate entry form to provider staff`
- Do not push or open a PR unless told to.

## Steps

### Step 1: Write the failing test

In `frontend/e2e/entry-upload.spec.ts`, add a test: mock `**/api/v1/auth/me`
to return `{ userId: "u-pat", email: "p@example.com", role: "PATIENT",
emailVerified: true }`, go to `/en/timeline/new`, and expect the text
"Filing entries is for Provider staff only." to be visible and
`page.getByRole("button", { name: "File entry" })` to have count 0.

**Verify**: `CI=1 NODE_ENV= npx playwright test e2e/entry-upload.spec.ts --retries=0` → the new test fails; the rest pass.

### Step 2: Add the gate

In `timeline/new/page.tsx`, add a `gate` state and `/auth/me` effect copied
from the exemplar. `ready` only when `me.role === "PROVIDER_STAFF"`. While
loading, render the `loading` text; on `denied` / `error`, render the
destructive Alert and no form. Hooks must all run before any early return
(React rules of hooks), so place the early returns after every `useState` /
`useEffect` call in the component.

Add to `entry.json` in all four locales, under a new `"gate"` object:
`"title": "Provider staff access required"`,
`"denied": "Filing entries is for Provider staff only."`,
`"error": "Could not verify your access."`, `"loading": "Loading…"`.

**Verify**: `npx tsc --noEmit` → exit 0; the Step 1 test now passes.

### Step 3: Keep the existing tests green

The other tests on this page (`entry-upload.spec.ts` 422/413/prefill tests,
and step 2 of `demo-spine.spec.ts`) do not mock `/auth/me` for Provider
Staff. Add a mock returning `role: "PROVIDER_STAFF"` in each. In
`entry-upload.spec.ts` the prefill test already mocks `/auth/me` with
`PROVIDER_STAFF`; reuse that shape. In `demo-spine.spec.ts` the catch-all
route handler (`page.route("**/api/v1/**", ...)`) needs an `/auth/me`
branch; that test signs up as a patient but files as staff, so return
`PROVIDER_STAFF` only while on the entry form step (a boolean flag, like
the existing `asClinician` flag in that file).

**Verify**: `CI=1 NODE_ENV= npx playwright test` → all pass.

## Test plan

- New: patient is shown the gate message and no submit button.
- Existing 422/413/prefill tests and demo-spine still pass with a staff mock.
- Pattern: `e2e/entry-upload.spec.ts` (existing prefill test's route mock).

## Done criteria

- [ ] `npx tsc --noEmit` exits 0
- [ ] `CI=1 NODE_ENV= npx playwright test` → all pass, including the new gate test
- [ ] `rg -c '"gate"' frontend/src/i18n/messages/*/entry.json` → 4 files, 1 match each
- [ ] Only in-scope files modified (`git status`)
- [ ] `plans/README.md` row updated

## STOP conditions

- `timeline/new/page.tsx` no longer matches the excerpt above.
- Adding the gate requires changing the backend or `lib/auth.ts`.
- `demo-spine.spec.ts` cannot be kept green without restructuring it.

## Maintenance notes

- If another role ever gains `RECORDS_WRITE`, update this gate too; the
  list of roles is duplicated between `authz.py` and this page.
- Reviewer: check that no hook runs after an early return.
