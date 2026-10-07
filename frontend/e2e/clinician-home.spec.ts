import { expect, test } from "@playwright/test";

// Every backend call is mocked here — no FastAPI / Postgres / Redis needed
// (pattern: e2e/timeline.spec.ts).
const PATIENT_ID = "33333333-3333-3333-3333-333333333333";

const FIXTURE_ME_CLINICIAN = {
  userId: "u1",
  role: "CLINICIAN",
  email: "clin@example.com",
  emailVerified: true,
};

function mockRoutes(page: import("@playwright/test").Page, items: unknown[]) {
  return page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const json = (status: number, body: unknown) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });

    if (url.pathname.includes("/auth/me")) return json(200, FIXTURE_ME_CLINICIAN);
    if (url.pathname.includes("/consents/granted-to-me")) {
      return json(200, { items, nextCursor: null });
    }
    return json(404, { error: { code: "NOT_FOUND", message: "not found" } });
  });
}

test("the clinician home lists a consented patient as a link", async ({ page }) => {
  await mockRoutes(page, [
    { patientId: PATIENT_ID, fullName: "Aarav Menon", expiresAt: "2026-12-01T00:00:00Z" },
  ]);
  await page.goto("/en/clinician");

  const link = page.getByRole("link", { name: /Aarav Menon/ });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", `/en/patients/${PATIENT_ID}/records`);
});

test("an empty list shows the empty state and keeps the Patient ID form", async ({ page }) => {
  await mockRoutes(page, []);
  await page.goto("/en/clinician");

  await expect(page.getByText("No patient has given you access yet.")).toBeVisible();
  await expect(page.getByLabel("Patient ID")).toBeVisible();
});
