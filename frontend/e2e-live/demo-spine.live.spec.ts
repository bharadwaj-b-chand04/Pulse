import { expect, test, type Page } from "@playwright/test";

// Live demo spine (issue #56, plan 006). Runs against the real Compose
// stack — Caddy, frontend, backend, Postgres, Redis — with nothing mocked.
// Requires `docker compose up --build -d --wait` from the repo root first.
// Three browser contexts (staff, patient, clinician) so cookies don't
// collide, mirroring three separate people in the demo.

const PATIENT_ID = "0c96112a-1653-5403-999c-30ec1ef6dda8";
const STAFF_EMAIL = "staff000@example.com";
const PATIENT_EMAIL = "demo.patient.en@example.com";
const CLINICIAN_EMAIL = "clinician0@example.com";
const PASSWORD = "Pulse@demo1";

async function login(page: Page, email: string) {
  await page.goto("/en/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.endsWith("/login"));
}

test("full demo spine against the live stack: file, grant, read, audit, revoke, lockout", async ({
  browser,
}) => {
  test.slow();

  const displayName = `Live check ${Date.now()}`;

  const staffContext = await browser.newContext();
  const patientContext = await browser.newContext();
  const clinicianContext = await browser.newContext();

  try {
    const staffPage = await staffContext.newPage();
    const patientPage = await patientContext.newPage();
    const clinicianPage = await clinicianContext.newPage();

    // 1. Staff files an entry
    await login(staffPage, STAFF_EMAIL);
    await staffPage.goto(`/en/patients/${PATIENT_ID}/records`);
    await staffPage.waitForLoadState("networkidle");
    await staffPage.getByRole("link", { name: "File new entry" }).click();
    await staffPage.waitForLoadState("networkidle");
    await expect(staffPage.getByLabel("Patient ID")).toHaveValue(PATIENT_ID);
    await staffPage.getByRole("combobox", { name: "Entry type" }).click();
    await staffPage.getByRole("option", { name: "Diagnosis" }).click();
    await staffPage.locator('input[type="datetime-local"]').fill("2026-08-01T10:00");
    await staffPage.getByLabel("Code system").fill("ICD-10");
    await staffPage.getByLabel("Code", { exact: true }).fill("E11");
    await staffPage.getByLabel("Display name").fill(displayName);
    await staffPage.getByRole("button", { name: "File entry" }).click();
    await expect(staffPage.getByText("View entry")).toBeVisible();
    await staffPage.getByText("View entry").click();
    await expect(staffPage.getByText(displayName)).toBeVisible();

    // 2. Patient grants consent to the clinician
    await login(patientPage, PATIENT_EMAIL);
    await patientPage.goto("/en/consent/new");
    await patientPage.waitForLoadState("networkidle");
    await patientPage.getByLabel("Clinician email").fill(CLINICIAN_EMAIL);
    await patientPage.getByRole("combobox", { name: "Purpose" }).click();
    await patientPage.getByRole("option", { name: "Treatment" }).click();
    const expiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const expiryValue = expiry.toISOString().slice(0, 16);
    await patientPage.locator('input[type="datetime-local"]').fill(expiryValue);
    await patientPage.getByLabel("Confirm with your password").fill(PASSWORD);
    await patientPage.getByRole("button", { name: "Grant access" }).click();
    await expect(patientPage.getByText("Access granted")).toBeVisible();

    // 3. Clinician reads the patient's record
    await login(clinicianPage, CLINICIAN_EMAIL);
    await clinicianPage.goto(`/en/patients/${PATIENT_ID}/records`);
    await clinicianPage.waitForLoadState("networkidle");
    await expect(clinicianPage.getByRole("heading", { name: "Patient record" })).toBeVisible();
    await expect(clinicianPage.getByText(displayName)).toBeVisible();

    // 4. Patient's own audit view shows at least one row
    await patientPage.goto("/en/audit");
    await patientPage.waitForLoadState("networkidle");
    await expect(patientPage.locator("table tbody tr").first()).toBeVisible();

    // 5. Patient revokes consent
    await patientPage.goto("/en/consent");
    await patientPage.waitForLoadState("networkidle");
    await patientPage.getByRole("button", { name: "Revoke" }).first().click();
    await patientPage.getByRole("button", { name: "Confirm revoke" }).click();
    await expect(patientPage.getByText("Access revoked.")).toBeVisible();

    // 6. Clinician is now locked out
    await clinicianPage.reload();
    await clinicianPage.waitForLoadState("networkidle");
    await expect(clinicianPage.getByText("Record not found")).toBeVisible();
    await expect(clinicianPage.getByText(displayName)).not.toBeVisible();
  } finally {
    await staffContext.close();
    await patientContext.close();
    await clinicianContext.close();
  }
});
