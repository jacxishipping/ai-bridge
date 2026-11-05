import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.beforeEach(async ({ page }) => {
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== "127.0.0.1") return route.continue();
    const path = url.pathname;
    const responses: Record<string, unknown> = {
      "/api/auth/me": { username: "Operations reviewer", role: "admin" },
      "/health": { emergency_stop: false },
      "/api/devices": [
        { id: "alpha", name: "Production EU", status: "online", last_seen: Date.now() / 1000, group: "Production", tags: ["eu"] },
        { id: "beta", name: "Staging US", status: "offline", group: "Staging", tags: ["us"] },
      ],
      "/api/tasks": [],
      "/api/approvals": [],
      "/api/audit": [{ id: 1, tool: "enroll_device", actor: "Operations reviewer", decision: "allowed", ts: 1700000000 }],
      "/api/policies": { version: 2, policy: { allow_tier3: false, desktop_enabled: false, allowed_apps: [], allowed_services: [] } },
      "/api/connections": { mcp: { up: true }, oauth_gateway: { up: false }, chatgpt: { clients: [] } },
      "/api/logs": { lines: ["Service started", "Ready for requests"] },
      "/api/auth/users": [{ username: "reader@example.test", role: "viewer", disabled: false }],
      "/api/fleet/notifications": { offline_devices: 1, failed_tasks_24h: 2, pending_approvals: 3 },
      "/api/devices/alpha/overview": { system_info: { hostname: "alpha" } },
    };
    if (Object.hasOwn(responses, path)) return route.fulfill({ json: responses[path] });
    if (path.startsWith("/api/")) return route.fulfill({ status: 404, json: { detail: "Not mocked" } });
    return route.continue();
  });
});

test("density preference persists and touch targets remain usable", async ({ page }) => {
  await page.goto("/#/live");
  await page.getByLabel("Display density").selectOption("comfortable");
  await expect(page.getByRole("button", { name: "Refresh", exact: true })).toHaveCSS("min-height", "44px");
  await page.reload();
  await expect(page.getByLabel("Display density")).toHaveValue("comfortable");
  await page.getByLabel("Display density").selectOption("compact");
  await expect(page.getByRole("button", { name: "Refresh", exact: true })).toHaveCSS("min-height", "34px");
});

test("group and tag filters survive a shareable URL and can be cleared", async ({ page }) => {
  await page.goto("/#/live");
  await page.getByLabel("Filter group").selectOption("Production");
  await page.getByLabel("Filter tag").selectOption("eu");
  await expect(page.getByRole("button", { name: "Staging US", exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(/group=Production/);
  const url = page.url();
  await page.evaluate(() => localStorage.clear());
  await page.goto(url);
  await expect(page.getByLabel("Filter group")).toHaveValue("Production");
  await expect(page.getByRole("button", { name: "Production EU", exact: true })).toBeVisible();
  await page.getByLabel("Filter group").selectOption("");
  await page.getByLabel("Filter tag").selectOption("");
  await expect(page.getByRole("button", { name: "Staging US", exact: true })).toBeVisible();
});

test("account changes require explicit confirmation and explain session revocation", async ({ page }) => {
  let submitted: unknown;
  await page.route("**/api/auth/users/reader%40example.test", async route => {
    submitted = route.request().postDataJSON();
    await route.fulfill({ json: { sessions_revoked: true } });
  });
  await page.goto("/#/live?section=users");
  await page.getByRole("button", { name: "Edit reader@example.test" }).click();
  await page.getByLabel("Account role").selectOption("operator");
  expect(submitted).toBeUndefined();
  await page.getByRole("button", { name: "Confirm access change" }).click();
  await expect.poll(() => submitted).toEqual({ role: "operator", disabled: false });
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("policy review submits a real version only after confirmation", async ({ page }) => {
  let writes = 0;
  let payload: any;
  await page.route("**/api/policies", route => {
    if (route.request().method() === "POST") {
      writes++; payload = route.request().postDataJSON();
      return route.fulfill({ json: { version: 3 } });
    }
    return route.fulfill({ json: { version: 2, policy: { allow_tier3: false } } });
  });
  await page.goto("/#/live?section=policies");
  await page.getByRole("button", { name: "Edit global policy" }).click();
  await page.getByLabel("Reason for change").fill("Allow approved workstation captures");
  await page.getByLabel("Enable desktop tools").check();
  await page.getByRole("button", { name: "Review change" }).click();
  expect(writes).toBe(0);
  await page.getByRole("button", { name: "Publish policy" }).click();
  await expect.poll(() => writes).toBe(1);
  expect(payload.desktop_enabled).toBe(true);
  expect(payload.allow_tier3).toBe(false);
});

test("viewer management pages never offer privileged reads or writes", async ({ page }) => {
  await page.route("**/api/auth/me", route => route.fulfill({ json: { username: "Reader", role: "viewer" } }));
  const requests: string[] = [];
  page.on("request", request => { if (["/api/logs", "/api/auth/users"].includes(new URL(request.url()).pathname)) requests.push(request.url()); });
  await page.goto("/#/live?section=users");
  await expect(page.getByText("User management requires an administrator.")).toBeVisible();
  await page.getByRole("button", { name: "Logs", exact: true }).click();
  await expect(page.getByText(/Service logs require an administrator/)).toBeVisible();
  expect(requests).toEqual([]);
  await page.getByRole("button", { name: "Policies", exact: true }).click();
  await expect(page.getByRole("button", { name: "Edit global policy" })).toBeDisabled();
});

test("full task history uses server pagination and preserves device scope", async ({ page }) => {
  const queries: URLSearchParams[] = [];
  await page.route("**/api/tasks/history?**", route => {
    const params = new URL(route.request().url()).searchParams;
    queries.push(params);
    return route.fulfill({ json: { total: 26, items: [{ id: `task-page-${params.get("page")}`, tool: "get_system_info", device_id: "alpha", status: "completed" }] } });
  });
  await page.goto("/#/live?device=alpha&tab=tasks");
  await page.getByLabel("Search full server history").check();
  await expect(page.getByText("26 results · Page 1 of 2")).toBeVisible();
  await page.getByRole("button", { name: "Next page" }).click();
  await expect.poll(() => queries.at(-1)?.get("page")).toBe("2");
  expect(queries.at(-1)?.get("device_id")).toBe("alpha");
});

for (const width of [390, 1440]) {
  for (const section of ["audit", "policies", "connections", "logs", "users", "notifications"]) {
    test(`${section} is accessible at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/#/live?section=${section}`);
      await expect(page.getByRole("heading", { name: section.charAt(0).toUpperCase() + section.slice(1), exact: true })).toBeVisible();
      await expect(page.getByText(/^Updated /).last()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
    });
  }
}
