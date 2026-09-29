# Plan 004: Clinicians see a list of patients who have granted them access

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 079e7df..HEAD -- backend/app/core/authz.py backend/app/modules/consent 'frontend/src/app/[locale]/clinician/page.tsx' frontend/src/lib/consent.ts frontend/src/i18n/messages`
> On a mismatch with the excerpts below, STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: direction (UX)
- **Planned at**: commit `079e7df`, 2026-09-28

## Why this matters

A Clinician's only way into a record is pasting the Patient's UUID into
`/en/clinician`. Nothing tells a clinician which patients have granted them
access, so in the demo someone copies a UUID between browser windows, and
a real clinician has no way to find their patients. The backend already
knows exactly who has granted each clinician access: the live
`access_permission` rows. Listing those patients (name and id, no clinical
data) on the clinician screen turns "paste a UUID" into "click a name".

## Domain rules this must honour (inlined from `.claude/rules/clinical-safety.md` and `CONTEXT.md`)

- A **Consent** is a Patient's grant to **one named Clinician**, with a
  mandatory expiry. Revoking deletes the derived `access_permission` row in
  the same transaction; that delete *is* the "no cached permission"
  mechanism. So the list must come from `access_permission` (live rows
  only) filtered to `expires_at > now()`, never from a cached value.
- "Never cache a permission decision." Do not cache this list anywhere
  (no React Query cache with staleTime, no Redis).
- This list returns **identity only** (Patient id and full name). It must
  never include clinical data: no entry types, no diagnoses, no counts of
  entries.
- Break-glass access (`break_glass_access` table) is **not** a Consent and
  must **not** appear in this list.
- Error responses use the coded envelope; the frontend renders from `code`.

## Current state

Backend (FastAPI, SQLAlchemy 2 async). Layering rules (`.claude/rules/backend.md`):
`routes.py` is HTTP only; `service.py` holds rules and has no SQL and no
FastAPI imports; `repository.py` holds all SQL. Modules talk through each
other's `service` only (CI lints this: `scripts/lint_cross_module_imports.py`).
Every route declares a permission via `requires(...)` or CI fails
(`tests/test_route_coverage.py`).

- `backend/app/core/authz.py:18` — `class Permission(StrEnum)`; each member
  has a comment. `ROLE_PERMISSIONS` at line ~63 maps roles to frozensets.
  `Role.CLINICIAN` currently holds `USER_CREDENTIALS_CHANGE, RECORDS_READ,
  PROVIDER_READ, BREAK_GLASS_REQUEST`.
- `backend/app/modules/consent/models.py:53` — `AccessPermission`:
  `consent_id`, `patient_id`, `grantee_user_id` (indexed), `entry_types`,
  `from_date`, `to_date`, `expires_at`, `created_at`.
- `backend/app/modules/consent/repository.py:93-113` — exemplar for a
  cursor-paginated list (`list_consents_for_patient`), using
  `_pack_cursor` / `_unpack_cursor` and `_MAX_LIMIT = 100`. Match it.
- `backend/app/modules/consent/service.py` — imports `users_service`
  (`from app.modules.users import service as users_service`, check the
  exact import line in the file) and uses `users_service.get_user_by_email`.
  `users_service.get_patient(session, patient_id)` returns a `Patient` with
  `.id` and `.full_name`; `admin/service.py:60` calls it per row, which is
  the accepted pattern here.
- `backend/app/modules/consent/routes.py:56-68` — exemplar route:

  ```python
  @router.get(
      "/consents",
      dependencies=[requires(Permission.CONSENT_READ_SELF)],
  )
  async def list_consents(
      ctx: CurrentUser,
      session: SessionDep,
      patient_id: Annotated[UUID | None, Query(alias="patientId")] = None,
      cursor: str | None = None,
      limit: int = 50,
  ) -> Page[Consent]:
      return await service.list_consents(session, ctx.actor, patient_id, cursor=cursor, limit=limit)
  ```

- Schemas inherit `PulseSchema` (camelCase on the wire). See
  `backend/app/modules/consent/schemas.py`.
- Tests: real Postgres + Redis via testcontainers (Docker required).
  Exemplar: `backend/tests/test_consent_service.py` (fixtures
  `register_and_login`, `_clinician_client`, `_grant_body`, and the step-up
  call before granting). **Write the negative tests first**
  (project rule: a positive test passes even when the filter is missing).

Frontend (Next.js App Router, next-intl, shadcn/ui):

- `frontend/src/app/[locale]/clinician/page.tsx` — gates on `/auth/me`
  (Clinician or Provider Staff), then shows a "Patient ID" form that pushes
  to `/patients/{id}/records`. Keep the form (Provider Staff and break-glass
  still need it).
- `frontend/src/lib/consent.ts` — hand-written API types for consent. Add
  the new type here next to the others.
- i18n: `frontend/src/i18n/messages/{en,hi,ta,ml}/clinicianHome.json`.
  Every new key in all four locales (missing keys throw in CI).
  Patient names are identity data and render as stored; don't translate them.

## Commands you will need

| Purpose | Command (dir) | Expected |
|---|---|---|
| Backend tests | `uv run pytest tests/test_consented_patients.py` (backend/) | all pass |
| All backend tests | `uv run pytest` (backend/) | all pass |
| Backend lint | `uv run ruff check . && uv run mypy .` (backend/) | exit 0 |
| Enforcement lints | `uv run python scripts/lint_cross_module_imports.py && uv run python scripts/lint_entry_query.py && uv run python scripts/lint_actor_first.py` (backend/) | exit 0 |
| Frontend types | `npx tsc --noEmit` (frontend/) | exit 0 |
| E2E | `CI=1 NODE_ENV= npx playwright test` (frontend/) | all pass |

## Scope

**In scope:**
- `backend/app/core/authz.py` (one new Permission, granted to CLINICIAN only)
- `backend/app/modules/consent/{repository,service,routes,schemas}.py`
- `backend/tests/test_consented_patients.py` (create)
- `backend/tests/test_permission_resolution.py` (only if it pins permission sets and fails)
- `frontend/src/app/[locale]/clinician/page.tsx`
- `frontend/src/lib/consent.ts`
- `frontend/src/i18n/messages/{en,hi,ta,ml}/clinicianHome.json`
- `frontend/e2e/demo-spine.spec.ts` or a new `frontend/e2e/clinician-home.spec.ts`

**Out of scope:**
- `accessible_entries` and anything in `backend/app/modules/records/`.
- Audit events: this endpoint returns identity only, not clinical data, so
  it emits no `ENTRY_VIEWED`. Do not add a new audit action.
- Break-glass grants.
- Migrations: `access_permission.grantee_user_id` is already indexed.

## Git workflow

- Branch: `feat/clinician-consented-patients`
- Commits, e.g. `feat(consent): list patients who granted the clinician access`

## Steps

### Step 1: Negative tests first

Create `backend/tests/test_consented_patients.py` modelled on
`test_consent_service.py` (same autouse fixtures). Endpoint:
`GET /api/v1/consents/granted-to-me`. Tests, in this order:

1. A Clinician with no grants gets `{"items": [], "nextCursor": null}`.
2. After the Patient **revokes**, the patient is absent.
3. A consent whose `expiresAt` is in the past is absent. (Granting rejects
   past expiry, so update the `access_permission.expires_at` directly with
   SQL in the test, the same way other tests manipulate state; if no such
   precedent exists, STOP and report.)
4. Clinician B does not see a consent granted to Clinician A.
5. A Patient, a Provider Staff user and an Administrator each get 403
   (coarse role gate; this is not a consent-denied read, so 403 is correct).
6. The response items contain exactly the keys `patientId`, `fullName`,
   `expiresAt`, and nothing else.
7. Positive: after a grant, the Clinician sees the patient.

**Verify**: `uv run pytest tests/test_consented_patients.py` → all fail (404 route not found).

### Step 2: Permission

Add `CONSENT_READ_GRANTED = "CONSENT_READ_GRANTED"` to `Permission` with a
comment ("A Clinician listing Patients whose live Consent names them.
Identity only."), and add it to `Role.CLINICIAN`'s set only.

**Verify**: `uv run pytest tests/test_permission_resolution.py` → pass (if it
fails because it pins exact sets, update the pinned set for CLINICIAN only).

### Step 3: Repository

In `consent/repository.py`, add
`list_live_permissions_for_grantee(session, grantee_user_id, *, now, cursor, limit)`
returning `(list[AccessPermission], next_cursor)`: `select(AccessPermission)`
where `grantee_user_id == grantee_user_id` and `expires_at > now`, ordered by
`created_at desc, id desc`, cursor-paginated exactly like
`list_consents_for_patient`.

### Step 4: Schema + service

`schemas.py`: `class ConsentedPatient(PulseSchema): patient_id: UUID;
full_name: str; expires_at: datetime`.

`service.py`: `async def list_consented_patients(session, actor, *, cursor,
limit) -> Page[ConsentedPatient]`. Uses `actor.user_id` as the grantee (never
a parameter from the request), `datetime.now(UTC)` as `now`, then
`users_service.get_patient` per row to fill `full_name`. Skip a row whose
patient is `None` (merged/removed). Add a comment:
`# ponytail: one get_patient per row (<=100); batch if lists grow.`

### Step 5: Route

`routes.py`: `GET /consents/granted-to-me`,
`dependencies=[requires(Permission.CONSENT_READ_GRANTED)]`, params `cursor`,
`limit: int = 50`. Declare it **above** any `/consents/{consent_id}` route
so the path is not captured as an id.

**Verify**: `uv run pytest tests/test_consented_patients.py tests/test_route_coverage.py` → all pass. Then `uv run ruff check . && uv run mypy .` and the three lint scripts → exit 0.

### Step 6: Frontend

- `lib/consent.ts`: `export interface ConsentedPatient { patientId: string; fullName: string; expiresAt: string; }`
- `clinician/page.tsx`: store the role from `/auth/me`. When the role is
  `CLINICIAN`, fetch `/consents/granted-to-me` (use the `Page<T>` type from
  `lib/records.ts`) and render above the form a Card titled
  `t("patients.title")` with one link row per patient to
  `/patients/{patientId}/records`: full name, the id in muted text, and
  "Access until {date}" formatted with `formatDate` from `lib/format.ts`.
  Empty state: `t("patients.empty")`. Error: an inline destructive Alert;
  the Patient ID form must stay usable either way. Provider Staff see no
  list (they get 403 from this endpoint; don't call it for them).
- `clinicianHome.json`, all four locales: `patients.title` "Patients who
  have given you access", `patients.empty` "No patient has given you access
  yet.", `patients.until` "Access until {date}", `patients.error` "Could not
  load your patients."

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 7: E2E

New `frontend/e2e/clinician-home.spec.ts`: mock `/auth/me` as `CLINICIAN`,
mock `/consents/granted-to-me` with one item; assert the name is a link to
`/en/patients/<id>/records`. Second test: empty list shows the empty text
and the Patient ID form is still present. Pattern: `e2e/timeline.spec.ts`
`mockRoutes`.

**Verify**: `CI=1 NODE_ENV= npx playwright test` → all pass.

## Test plan

Seven backend integration tests (Step 1) plus two e2e tests (Step 7).

## Done criteria

- [ ] `uv run pytest` (backend) → all pass, including `test_consented_patients.py` (7 tests)
- [ ] `uv run ruff check . && uv run mypy .` → exit 0; the three lint scripts → exit 0
- [ ] `npx tsc --noEmit` and `CI=1 NODE_ENV= npx playwright test` → pass
- [ ] `rg -n "granted-to-me" backend/app` → exactly one route definition
- [ ] `rg -c '"patients"' frontend/src/i18n/messages/*/clinicianHome.json` → 4 files
- [ ] Only in-scope files modified

## STOP conditions

- The negative tests pass before the route exists (the test is wrong).
- Filling `full_name` seems to need a join on the `patient` table inside
  `consent/repository.py` (cross-module table access is forbidden).
- The project turns out to require an audit event for identity-only reads
  (check `.claude/rules/clinical-safety.md` "Audit"; if it says so, stop).
- Test 3 needs a new test helper module to backdate `expires_at`.

## Maintenance notes

- If break-glass should ever appear here, it needs its own visual
  treatment and a product decision; it's excluded on purpose.
- Reviewer: confirm the grantee is always `actor.user_id` and that no
  clinical field leaks into `ConsentedPatient`.
- `docs/demo.md` step 6 can then say "click the patient's name" instead of
  pasting the id; update it in the same PR.
