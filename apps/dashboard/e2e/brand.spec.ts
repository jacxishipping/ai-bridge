import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const view of ["login", "overview", "live"]) {
  test(`brand assets load in the ${view} workspace`, async ({ page }) => {
    await page.route("**/api/auth/me", (route) => route.fulfill({ json: { username: "Brand reviewer", role: "viewer" } }));
    await page.route("**/api/devices", (route) => route.fulfill({ json: [] }));
    await page.route("**/health", (route) => route.fulfill({ json: { emergency_stop: false } }));
    await page.goto(`/#/${view}`);
    const mark = page.locator(".product-brand img:visible").first();
    await expect(mark).toBeVisible();
    await expect.poll(() => mark.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth === 40)).toBe(true);
    const favicon = await page.locator('link[rel="icon"]').getAttribute("href");
    expect((await page.request.get(favicon!)).ok()).toBe(true);
    if (view === "login") {
      await expect(page).toHaveTitle("Sign in · AI Bridge");
      await expect(page.getByRole("button", { name: "Sign in", exact: true })).toHaveCSS("background-color", "rgb(37, 99, 235)");
    }
  });
}

for (const width of [320, 1440]) {
  test(`international device names remain usable at ${width}px`, async ({ page }) => {
    const arabic = "مركز البيانات — الرياض";
    const japanese = "東京データセンター・本番";
    await page.setViewportSize({ width, height: 1000 });
    await page.route("**/api/auth/me", (route) => route.fulfill({ json: { username: "فريق العمليات", role: "viewer" } }));
    await page.route("**/health", (route) => route.fulfill({ json: { emergency_stop: false } }));
    await page.route("**/api/devices", (route) => route.fulfill({ json: [
      { id: "riyadh", name: arabic, status: "online" }, { id: "tokyo", name: japanese, status: "offline" },
    ] }));
    await page.route("**/api/devices/riyadh/overview", (route) => route.fulfill({ json: {} }));
    await page.goto("/#/live");
    await expect(page.getByRole("button", { name: arabic, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: japanese, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
    await page.getByLabel("Find device").fill("الرياض");
    await expect(page.getByRole("region", { name: "Live device inventory" }).getByRole("row")).toHaveCount(2);
    await page.getByRole("button", { name: arabic, exact: true }).click();
    const title = page.getByRole("heading", { name: arabic, exact: true });
    await expect(title).toHaveAttribute("dir", "auto");
    await expect(title).toHaveCSS("direction", "rtl");
  });
}
