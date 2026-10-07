"""P004 (#56-adjacent) — a Clinician's list of Patients who granted them
access. Identity only (`patientId`/`fullName`/`expiresAt`), live
`access_permission` rows only (`expires_at > now()`), never a cached
value (clinical-safety.md). Negative first (backend.md): the route does
not exist yet, so every test in this file fails 404 before Step 2-5 land.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta

import pytest_asyncio
import records_helpers as rh
from helpers import RegisterAndLogin, wipe_identity
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.adapters.notifications import FakeNotificationProvider
from app.main import app
from app.modules.consent.dependencies import get_notification_provider

_PW = "correct-horse-staple-9"


@pytest_asyncio.fixture(autouse=True)
async def _isolate(app_database_url: str) -> AsyncIterator[None]:
    yield
    await rh.wipe_records(app_database_url)
    await wipe_identity(app_database_url)


@pytest_asyncio.fixture(autouse=True)
async def _fake_notifications() -> AsyncIterator[None]:
    app.dependency_overrides[get_notification_provider] = FakeNotificationProvider
    yield
    app.dependency_overrides.pop(get_notification_provider, None)


def _grant_body(grantee_user_id: str, **overrides: object) -> dict[str, object]:
    body: dict[str, object] = {
        "granteeUserId": grantee_user_id,
        "purpose": "TREATMENT",
        "expiresAt": (datetime.now(UTC) + timedelta(days=30)).isoformat(),
    }
    body.update(overrides)
    return body


async def _expire_permission(app_database_url: str, consent_id: str) -> None:
    """Backdate the live `access_permission` row's `expires_at` directly —
    granting rejects a past expiry, so the only way to produce one is SQL,
    same precedent as `records_helpers.supersede_entry`'s raw UPDATE."""
    engine = create_async_engine(app_database_url)
    try:
        async with engine.begin() as conn:
            await conn.execute(
                text("UPDATE access_permission SET expires_at = :past WHERE consent_id = :cid"),
                {"past": datetime.now(UTC) - timedelta(days=1), "cid": consent_id},
            )
    finally:
        await engine.dispose()


async def test_clinician_with_no_grants_gets_empty_list(
    client: AsyncClient, register_and_login: RegisterAndLogin
) -> None:
    await register_and_login(email="ctp-clin-empty@example.com", role="CLINICIAN")

    resp = await client.get("/api/v1/consents/granted-to-me")
    assert resp.status_code == 200
    assert resp.json() == {"items": [], "nextCursor": None}


async def test_revoked_consent_is_absent(
    client: AsyncClient, register_and_login: RegisterAndLogin, app_database_url: str
) -> None:
    await register_and_login(email="ctp-patient-revoke@example.com")
    await register_and_login(email="ctp-clin-revoke@example.com", role="CLINICIAN")
    clin_id = str(await rh.user_id_for_email(app_database_url, "ctp-clin-revoke@example.com"))
    await register_and_login(email="ctp-patient-revoke@example.com")
    await client.post("/api/v1/auth/step-up", json={"password": _PW})
    consent_id = (await client.post("/api/v1/consents", json=_grant_body(clin_id))).json()["id"]
    revoke = await client.post(f"/api/v1/consents/{consent_id}/revocation", json={})
    assert revoke.status_code == 200

    await register_and_login(email="ctp-clin-revoke@example.com")
    resp = await client.get("/api/v1/consents/granted-to-me")
    assert resp.status_code == 200
    assert resp.json()["items"] == []


async def test_expired_permission_is_absent(
    client: AsyncClient, register_and_login: RegisterAndLogin, app_database_url: str
) -> None:
    await register_and_login(email="ctp-patient-expired@example.com")
    await register_and_login(email="ctp-clin-expired@example.com", role="CLINICIAN")
    clin_id = str(await rh.user_id_for_email(app_database_url, "ctp-clin-expired@example.com"))
    await register_and_login(email="ctp-patient-expired@example.com")
    await client.post("/api/v1/auth/step-up", json={"password": _PW})
    consent_id = (await client.post("/api/v1/consents", json=_grant_body(clin_id))).json()["id"]
    await _expire_permission(app_database_url, consent_id)

    await register_and_login(email="ctp-clin-expired@example.com")
    resp = await client.get("/api/v1/consents/granted-to-me")
    assert resp.status_code == 200
    assert resp.json()["items"] == []


async def test_clinician_b_does_not_see_clinician_as_grant(
    client: AsyncClient, register_and_login: RegisterAndLogin, app_database_url: str
) -> None:
    await register_and_login(email="ctp-patient-two-clin@example.com")
    await register_and_login(email="ctp-clin-a2@example.com", role="CLINICIAN")
    clin_a_id = str(await rh.user_id_for_email(app_database_url, "ctp-clin-a2@example.com"))
    await register_and_login(email="ctp-clin-b2@example.com", role="CLINICIAN")
    await register_and_login(email="ctp-patient-two-clin@example.com")
    await client.post("/api/v1/auth/step-up", json={"password": _PW})
    await client.post("/api/v1/consents", json=_grant_body(clin_a_id))

    await register_and_login(email="ctp-clin-b2@example.com")
    resp = await client.get("/api/v1/consents/granted-to-me")
    assert resp.status_code == 200
    assert resp.json()["items"] == []


async def test_patient_provider_staff_and_administrator_get_403(
    client: AsyncClient, register_and_login: RegisterAndLogin
) -> None:
    await register_and_login(email="ctp-role-patient@example.com", role="PATIENT")
    assert (await client.get("/api/v1/consents/granted-to-me")).status_code == 403

    await register_and_login(email="ctp-role-staff@example.com", role="PROVIDER_STAFF")
    assert (await client.get("/api/v1/consents/granted-to-me")).status_code == 403

    await register_and_login(email="ctp-role-admin@example.com", role="ADMINISTRATOR")
    assert (await client.get("/api/v1/consents/granted-to-me")).status_code == 403


async def test_response_items_have_exactly_identity_keys(
    client: AsyncClient, register_and_login: RegisterAndLogin, app_database_url: str
) -> None:
    await register_and_login(email="ctp-patient-keys@example.com")
    await register_and_login(email="ctp-clin-keys@example.com", role="CLINICIAN")
    clin_id = str(await rh.user_id_for_email(app_database_url, "ctp-clin-keys@example.com"))
    await register_and_login(email="ctp-patient-keys@example.com")
    await client.post("/api/v1/auth/step-up", json={"password": _PW})
    await client.post("/api/v1/consents", json=_grant_body(clin_id))

    await register_and_login(email="ctp-clin-keys@example.com")
    resp = await client.get("/api/v1/consents/granted-to-me")
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 1
    assert set(items[0].keys()) == {"patientId", "fullName", "expiresAt"}


async def test_clinician_sees_patient_after_grant(
    client: AsyncClient, register_and_login: RegisterAndLogin, app_database_url: str
) -> None:
    await register_and_login(email="ctp-patient-positive@example.com")
    pid = (await client.get("/api/v1/patients/me")).json()["id"]
    full_name = (await client.get("/api/v1/patients/me")).json()["fullName"]
    await register_and_login(email="ctp-clin-positive@example.com", role="CLINICIAN")
    clin_id = str(await rh.user_id_for_email(app_database_url, "ctp-clin-positive@example.com"))
    await register_and_login(email="ctp-patient-positive@example.com")
    await client.post("/api/v1/auth/step-up", json={"password": _PW})
    await client.post("/api/v1/consents", json=_grant_body(clin_id))

    await register_and_login(email="ctp-clin-positive@example.com")
    resp = await client.get("/api/v1/consents/granted-to-me")
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 1
    assert items[0]["patientId"] == pid
    assert items[0]["fullName"] == full_name
