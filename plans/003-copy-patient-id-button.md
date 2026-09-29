# Plan 003: Patients can copy their Patient ID with one tap

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 079e7df..HEAD -- 'frontend/src/app/[locale]/profile/page.tsx' frontend/src/i18n/messages frontend/e2e/smoke.spec.ts`
> On a mismatch with the excerpts below, STOP.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction (UX)
- **Planned at**: commit `079e7df`, 2026-09-28

## Why this matters

A Patient shares their Patient ID (a 36-character UUID) with Provider Staff
and clinicians, because there is no patient search. The profile page shows
it as plain text and even says "Share this with a clinician…", but there is
no copy button, so on a phone the user has to long-press and select a UUID
by hand. A copy button removes that friction for the demo and for users.

## Current state

- `frontend/src/app/[locale]/profile/page.tsx:138-172` renders the profile as
  rows of `[label, value]`:

  ```tsx
  const rows: Array<[string, string]> = [
    [t("fields.patientId"), profile.id],
    [t("fields.fullName"), show(profile.fullName)],
    ...
  ];
  ...
  {rows.map(([label, value]) => (
    <div key={label} className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-3 sm:gap-4">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground tabular-nums sm:col-span-2">{value}</dd>
    </div>
  ))}
  ...
  <p className="text-xs text-pretty text-muted-foreground">{t("patientIdHint")}</p>
  ```

- UI primitives live in `frontend/src/components/ui/` (shadcn/ui). Use the
  existing `Button` (`@/components/ui/button`, `variant="outline"`,
  `size="sm"`) and a `lucide-react` icon (`CopyIcon`, `CheckIcon`); both
  are already dependencies. Do not add a toast library.
- Use the platform API `navigator.clipboard.writeText(...)`. It needs a
  secure context; `http://localhost` counts as one.
- i18n: `frontend/src/i18n/messages/{en,hi,ta,ml}/profile.json`. Every new
  key must exist in all four locales (missing keys throw in CI). Hindi,
  Tamil and Malayalam are machine-translated in this project; translate,
  never leave English.

## Commands you will need

Run from `frontend/`.

| Purpose   | Command | Expected on success |
|-----------|---------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Lint      | `npx eslint 'src/app/[locale]/profile/page.tsx' e2e/smoke.spec.ts` | exit 0 |
| E2E       | `CI=1 NODE_ENV= npx playwright test` | all pass |

## Scope

**In scope:**
- `frontend/src/app/[locale]/profile/page.tsx`
- `frontend/src/i18n/messages/{en,hi,ta,ml}/profile.json`
- `frontend/e2e/smoke.spec.ts` (add one test)

**Out of scope:**
- Any other page. Do not build a shared "CopyableField" component; there
  is one caller.

## Git workflow

- Branch: `feat/copy-patient-id`
- Commit: `feat(frontend): add copy button for patient id`

## Steps

### Step 1: Failing test

`e2e/smoke.spec.ts` already has a test "login redirects to the profile and
renders identity fields" that mocks `/patients/me`. Copy its mocks into a
new test that grants clipboard permission
(`await context.grantPermissions(["clipboard-read", "clipboard-write"])`),
opens `/en/profile`, clicks the button named "Copy Patient ID", then asserts
`await page.evaluate(() => navigator.clipboard.readText())` equals the
mocked id and the button now reads "Copied".

**Verify**: `CI=1 NODE_ENV= npx playwright test e2e/smoke.spec.ts --retries=0` → the new test fails.

### Step 2: Implement

Render the Patient ID row separately from the other rows (keep them in the
`rows` map). Next to the id, add a `Button` with an `aria-label` of
`t("copyPatientId")` whose text is `t("copyPatientId")`, or `t("copied")`
for 2 seconds after a successful copy (`useState` + `setTimeout`). On a
rejected promise, do nothing: the id stays visible and selectable.

Add to `profile.json` (all four locales): `"copyPatientId": "Copy Patient ID"`,
`"copied": "Copied"`.

**Verify**: `npx tsc --noEmit` → exit 0; Step 1 test passes.

## Test plan

- New smoke test as above. Pattern: existing profile test in `e2e/smoke.spec.ts`.

## Done criteria

- [ ] `npx tsc --noEmit` exits 0
- [ ] `CI=1 NODE_ENV= npx playwright test` → all pass
- [ ] `rg -c copyPatientId frontend/src/i18n/messages/*/profile.json` → 4 files
- [ ] Only in-scope files modified

## STOP conditions

- The profile page no longer renders the id via the `rows` array.
- Clipboard permission cannot be granted in the Playwright Chromium setup
  (report; do not remove the assertion).

## Maintenance notes

- If plan 004 (clinician's consented-patient list) lands, clinicians stop
  needing the id, but Provider Staff still do; keep this button.
