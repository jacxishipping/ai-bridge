import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { username: "Reviewer", role: "admin" } }));
  await page.route("**/health", (route) => route.fulfill({ json: { emergency_stop: false } }));
  await page.route("**/api/devices", (route) => route.fulfill({ json: [
    { id: "alpha", name: "Production", status: "online" },
    { id: "beta", name: "Build agent", status: "offline" },
  ] }));
});

test("desktop shell and inventory use compact dimensions", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/#/overview");
  await expect(page.locator(".product-topbar")).toHaveCSS("min-height", "56px");
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toHaveCSS("width", "208px");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCSS("font-size", "20px");
  const button = page.getByRole("button", { name: "View devices", exact: true });
  expect((await button.boundingBox())!.height).toBeLessThanOrEqual(36);
  await expect(page.locator(".product-surface").first()).toHaveCSS("padding", "14px");

  await page.goto("/#/live");
  await expect(page.getByRole("button", { name: "Production", exact: true })).toBeVisible();
  await expect(page.getByLabel("Find device")).toHaveCSS("min-height", "34px");
  const row = page.getByRole("row").filter({ has: page.getByRole("button", { name: "Production", exact: true }) });
  expect((await row.boundingBox())!.height).toBeLessThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

for (const setup of [
  { name: "narrow screen", viewport: { width: 390, height: 900 }, hasTouch: false },
  { name: "large touch screen", viewport: { width: 1440, height: 900 }, hasTouch: true },
]) {
  test.describe(setup.name, () => {
    test.use({ viewport: setup.viewport, hasTouch: setup.hasTouch });
    test("keeps generous interactive targets without page overflow", async ({ page }) => {
      await page.goto("/#/live");
      await expect(page.getByRole("button", { name: "Production", exact: true })).toBeVisible();
      const refresh = page.getByRole("button", { name: "Refresh", exact: true });
      expect((await refresh.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect((await page.getByLabel("Find device").boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect((await page.getByRole("button", { name: "Devices", exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    });
  });
}
