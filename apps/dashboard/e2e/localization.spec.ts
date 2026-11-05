import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { languages, translate } from "../src/i18n/catalogs";

async function mockLive(page: Page) {
  await page.route("**/api/auth/oidc/config", route => route.fulfill({ json: { enabled: true } }));
  await page.route("**/api/auth/me", route => route.fulfill({ json: { username: "مشغل • user@example.test", role: "viewer" } }));
  await page.route("**/health", route => route.fulfill({ json: { emergency_stop: false } }));
  await page.route("**/api/devices", route => route.fulfill({ json: [
    { id: "host-01", name: "خادم • server-01", status: "online", last_seen: 1700000000 },
  ] }));
}

for (const language of languages) {
  test(`${language.code} translates sign-in and navigation without translating fleet data`, async ({ page }) => {
    await page.addInitScript(code => localStorage.setItem("ai_bridge_language", code), language.code);
    await mockLive(page);
    await page.goto("/#/login");
    await expect(page.locator("html")).toHaveAttribute("lang", language.code);
    await expect(page.locator("html")).toHaveAttribute("dir", language.dir);
    await expect(page.getByRole("heading", { name: translate(language.code, "Connect to AI Bridge"), exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: translate(language.code, "Sign in"), exact: true })).toBeVisible();
    await page.goto("/#/live");
    await expect(page.getByRole("heading", { name: translate(language.code, "Control plane"), exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: translate(language.code, "Devices"), exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "خادم • server-01", exact: true })).toBeVisible();
    // Safety copy is deliberately an explicitly English, LTR boundary.
    await expect(page.getByRole("region", { name: "Fleet safety" })).toHaveAttribute("lang", "en");
    await expect(page.getByRole("button", { name: "Stop fleet" })).toBeDisabled();
  });
}

for (const width of [390, 1440]) {
  for (const code of ["ar", "he", "fa", "ur"] as const) {
    test(`${code} RTL login and live shell are accessible at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript(locale => localStorage.setItem("ai_bridge_language", locale), code);
      await mockLive(page);
      for (const route of ["login", "live"]) {
        await page.goto(`/#/${route}`);
        await expect(page.locator("h1")).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
        expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
      }
      await page.getByRole("button", { name: translate(code, "Language"), exact: true }).click();
      const dialog = page.getByRole("dialog", { name: translate(code, "Language"), exact: true });
      await expect(dialog.getByRole("searchbox")).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(dialog).not.toBeVisible();
      await expect(page.getByRole("button", { name: translate(code, "Language"), exact: true })).toBeFocused();
    });
  }
}

test("search, switch and reload preserve language and unsubmitted credentials", async ({ page }) => {
  await page.goto("/#/login");
  await page.getByLabel("Admin token", { exact: true }).fill("not-a-real-secret");
  await page.getByRole("button", { name: "Language", exact: true }).click();
  await page.getByRole("searchbox").fill("Español");
  await page.getByRole("button", { name: "Español Spanish" }).click();
  await expect(page.getByLabel("Token de administrador", { exact: true })).toHaveValue("not-a-real-secret");
  await expect(page.getByRole("button", { name: "Idioma", exact: true })).toBeFocused();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.getByLabel("Token de administrador", { exact: true })).toHaveValue("");
  await page.getByRole("button", { name: "Idioma", exact: true }).click();
  await page.getByRole("searchbox").fill("not-a-language");
  await expect(page.getByRole("status")).toContainText("No matching translation");
  await page.getByRole("searchbox").fill("English");
  await page.getByRole("button", { name: "English English" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
});

test("unknown saved language falls back to English and switching makes no API writes", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("ai_bridge_language", "../../not-a-locale"));
  const writes: string[] = [];
  page.on("request", request => { if (!["GET", "HEAD"].includes(request.method())) writes.push(request.url()); });
  await page.goto("/#/login");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.getByRole("button", { name: "Language", exact: true }).click();
  await page.getByRole("searchbox").fill("العربية");
  await page.getByRole("button", { name: "العربية Arabic" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  expect(writes).toEqual([]);
});

test("blocked storage changes this visit only and explains why", async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException("Blocked", "SecurityError"); }; });
  await page.goto("/#/login");
  await page.getByRole("button", { name: "Language", exact: true }).click();
  await page.getByRole("searchbox").fill("Deutsch");
  await page.getByRole("button", { name: "Deutsch German" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(page.getByRole("status")).toContainText("visit only");
  await page.getByRole("button", { name: "Schließen", exact: true }).last().click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("language changes synchronize across tabs", async ({ context, page }) => {
  await page.goto("/#/login");
  const other = await context.newPage();
  await other.goto("/#/login");
  await page.getByRole("button", { name: "Language", exact: true }).click();
  await page.getByRole("searchbox").fill("日本語");
  await page.getByRole("button", { name: "日本語 Japanese" }).click();
  await expect(other.locator("html")).toHaveAttribute("lang", "ja");
  await expect(other.getByRole("heading", { name: "AI Bridge に接続", exact: true })).toBeVisible();
});
