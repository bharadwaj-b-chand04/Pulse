# Plan 005: Public sign-up creates Patients only

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 079e7df..HEAD -- backend/app/modules/auth backend/tests/conftest.py backend/tests/test_auth_register.py 'frontend/src/app/[locale]/register/page.tsx' frontend/e2e/smoke.spec.ts frontend/e2e/demo-spine.spec.ts RUNNING.md`
> `demo-spine.spec.ts` and `RUNNING.md` carry an uncommitted fix from
> 2026-09-28 (step-up and staff filing); that diff is expected. On any
> other mismatch with the excerpts below, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED (22 backend test files register non-Patient users through the API; the escape hatch below keeps them working)
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `079e7df` + working-tree fix, 2026-09-28

## Why this matters

`POST /api/v1/auth/register` accepts any role, and the sign-up form offers
Patient, Clinician, Provider staff and Administrator. Anyone can therefore
make themselves an Administrator, or a Clinician whom a Patient might then
grant consent to. The project's central promise is that a Consent goes to
**one named, real Clinician**, and that Administrators are a trusted role
that reads no clinical data (ADR-0007). Self-service role choice undermines
both. `RUNNING.md` already lists this as a known gap. After this plan,
public sign-up creates Patients only; Clinicians, Provider Staff and
Administrators come from the seed data (the demo already uses seeded
accounts for every non-Patient role).

## Current state

- `backend/app/modules/auth/schemas.py:14-17`:

  ```python
  class RegisterRequest(PulseSchema):
      email: EmailStr
      password: str = Field(min_length=PASSWORD_MIN, max_length=PASSWORD_MAX)
      role: Role
  ```

- `backend/app/modules/auth/service.py:33-65` — `register(session, idp, *,
  email, password, role: str, locale)` creates the user with `role=Role(role)`
  and starts email verification. There is no role restriction.
- Errors: `PulseError(ErrorCode.X, "message", http_status=...)` from
  `app.core.exceptions`; codes in `app/core/errors.py` (`FORBIDDEN` exists).
  Codes are stable forever; reuse `FORBIDDEN` instead of adding one.
- `backend/tests/conftest.py:152-180` — fixture `register_and_login`
  registers users **through the HTTP API** with any role. About 22 test files
  depend on it for Clinicians, Provider Staff and Administrators.
- Env config style in this codebase: plain `os.environ.get(...)` read at
  call time, e.g. `backend/app/adapters/identity.py:85-88`.
- `frontend/src/app/[locale]/register/page.tsx:17`
  `const ROLES = ["PATIENT", "CLINICIAN", "PROVIDER_STAFF", "ADMINISTRATOR"] as const;`
  with a `Select` labelled `t("fields.role")` ("I am registering as") and
  validation `roleRequired` ("Choose a role.").
- `frontend/e2e/smoke.spec.ts:46` asserts "Choose a role." appears on an
  empty submit. `frontend/e2e/demo-spine.spec.ts:171-172` picks "Patient"
  from the "I am registering as" combobox.
- `RUNNING.md` §5.1 has a callout "Registering as **Administrator** is
  technically possible…", and "Known gaps" repeats it.

## Commands you will need

| Purpose | Command (dir) | Expected |
|---|---|---|
| Register tests | `uv run pytest tests/test_auth_register.py` (backend/) | pass |
| All backend tests | `uv run pytest` (backend/) | all pass |
| Backend lint | `uv run ruff check . && uv run mypy .` (backend/) | exit 0 |
| Frontend types | `npx tsc --noEmit` (frontend/) | exit 0 |
| E2E | `CI=1 NODE_ENV= npx playwright test` (frontend/) | all pass |

## Scope

**In scope:**
- `backend/app/modules/auth/service.py`
- `backend/tests/conftest.py` (set the test-only env var)
- `backend/tests/test_auth_register.py` (new tests)
- `frontend/src/app/[locale]/register/page.tsx`
- `frontend/src/i18n/messages/{en,hi,ta,ml}/auth.json` (only to delete now-unused keys, if lint or tsc flags them; otherwise leave them)
- `frontend/e2e/smoke.spec.ts`, `frontend/e2e/demo-spine.spec.ts`
- `RUNNING.md` (remove the two "Administrator is possible" notes)

**Out of scope:**
- `RegisterRequest` schema shape: keep `role` so existing clients and tests
  keep working. The rule is enforced in the service.
- Seed data, `compose.yaml`: seeded non-Patient accounts are how the demo works.
- An invite flow for clinicians. Not needed for the demo; a future plan.

## Git workflow

- Branch: `fix/patient-only-signup`
- Commit: `fix(auth): restrict self-registration to patients`

## Steps

### Step 1: Failing tests

In `backend/tests/test_auth_register.py`, add tests that temporarily clear
the escape hatch (`monkeypatch.delenv("PULSE_OPEN_ROLE_REGISTRATION",
raising=False)`) and assert that registering with role `ADMINISTRATOR`,
`CLINICIAN` and `PROVIDER_STAFF` each returns 403 with body
`error.code == "FORBIDDEN"`, and that no user row was created (log in with
the same email and password → 401). Also assert `PATIENT` still returns 201.

**Verify**: `uv run pytest tests/test_auth_register.py` → the three new negative tests fail.

### Step 2: Enforce in the service

In `auth/service.py` `register(...)`, before the duplicate-email check:

```python
if Role(role) != Role.PATIENT and os.environ.get("PULSE_OPEN_ROLE_REGISTRATION") != "1":
    raise PulseError(
        ErrorCode.FORBIDDEN,
        "Only patients can register themselves.",
        http_status=403,
    )
```

Add a one-line comment: non-Patient accounts are seeded; the env var exists
only so the test suite can create them through the API.

In `tests/conftest.py`, near the other module-level setup, add
`os.environ.setdefault("PULSE_OPEN_ROLE_REGISTRATION", "1")` with a comment
saying it's test-only. Never set it in `compose.yaml`.

**Verify**: `uv run pytest` → all pass (the Step 1 tests included).

### Step 3: Frontend form

In `register/page.tsx`, delete `ROLES`, the role `Select`, its `Field`, the
`role` state and the `roleRequired` check. Post `role: "PATIENT"`. Update
the heading or subtitle only if it mentions choosing a role.

Update `e2e/smoke.spec.ts` (drop the "Choose a role." assertion; keep the
other required-field assertions) and `e2e/demo-spine.spec.ts` (delete the
two lines that open the "I am registering as" combobox and pick "Patient").

**Verify**: `npx tsc --noEmit` → exit 0; `CI=1 NODE_ENV= npx playwright test` → all pass.

### Step 4: Docs

In `RUNNING.md`: in §5.1 change the Role bullet to say sign-up creates a
Patient, and delete the "Registering as Administrator…" callout; delete the
matching "Known gaps" bullet.

**Verify**: `rg -n "Registering as \*\*Administrator" RUNNING.md` → no matches.

## Test plan

- Backend: 3 negative tests (one per privileged role) + 1 positive, in
  `test_auth_register.py`, following that file's existing style.
- Frontend: existing smoke and demo-spine tests adjusted; they must stay green.

## Done criteria

- [ ] `uv run pytest` → all pass; new register tests present
- [ ] `uv run ruff check . && uv run mypy .` → exit 0
- [ ] `rg -n "PULSE_OPEN_ROLE_REGISTRATION" compose.yaml` → no matches
- [ ] `rg -n "ADMINISTRATOR" 'frontend/src/app/[locale]/register/page.tsx'` → no matches
- [ ] `npx tsc --noEmit` and `CI=1 NODE_ENV= npx playwright test` → pass
- [ ] Only in-scope files modified

## STOP conditions

- `uv run pytest` shows failures in tests that don't use `register_and_login`
  (something else registers privileged users).
- The seed loader calls `auth.service.register` (it should write users
  directly; check `backend/app/db/seed_loader.py`). If it does, stop.
- Any ADR or `.claude/decisions.md` entry records open role self-registration
  as a deliberate decision (`rg -n -i "self-regist|register.*role" docs/adr .claude/decisions.md`).

## Maintenance notes

- New Clinicians now need seeding (or a future invite flow). Mention this
  in `seed/README.md` if the team asks how to add one.
- Reviewer: confirm the env var is referenced only in `auth/service.py` and
  `tests/conftest.py`.
