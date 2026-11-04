import { expect, Page, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const devices = [
  { id: "alpha-id", name: "Alpha", hostname: "alpha.local", os: "linux", status: "online", last_seen: 1793830000 },
  { id: "bravo-id", name: "Bravo", hostname: "bravo.local", os: "windows", status: "offline", last_seen: null },
  { id: "retired-id", name: "Retired", status: "offline", revoked: true },
];
const approval = {
  id: "approval-one", task_id: "shell-task", device_id: "alpha-id", device_name: "Alpha",
  tool: "run_shell", args: { command: "systemctl restart nginx" }, tier: 3, status: "pending",
  reason: "Tier-3 operation requires human approval.",
};
async function mockLive(page: Page, options: { role?: string; empty?: boolean; stopped?: boolean } = {}) {
  await page.route("**/health", (route) => route.fulfill({ json: { version: "test", emergency_stop: !!options.stopped } }));
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/me") return route.fulfill({ json: { username: "workspace-admin", role: options.role || "admin" } });
    if (path === "/api/devices") return route.fulfill({ json: options.empty ? [] : devices });
    if (path === "/api/tasks" || path === "/api/approvals") return route.fulfill({ json: [] });
    if (path.endsWith("/overview")) return route.fulfill({ json: { system_info: { architecture: "x86_64" }, device: { effective_policy: { allow_tier3: false } } } });
    return route.fulfill({ status: 404, json: { detail: "Unmocked endpoint" } });
  });
}

test("inventory remembers filters and sort, supports named views and clear-filter recovery", async ({ page }) => {
  await mockLive(page);
  await page.goto("/#/live");
  await page.getByLabel("Find device").fill("Bravo");
  await page.getByLabel("Device status", { exact: true }).selectOption("offline");
  await page.getByLabel("Sort devices").selectOption("last_seen");
  await page.getByRole("button", { name: "Save view", exact: true }).click();
  await page.getByLabel("View name").fill("Offline Windows");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.reload();
  await expect(page.getByLabel("Find device")).toHaveValue("Bravo");
  await expect(page.getByLabel("Device status", { exact: true })).toHaveValue("offline");
  await expect(page.getByLabel("Sort devices")).toHaveValue("last_seen");
  await expect(page.getByRole("region", { name: "Live device inventory" }).getByRole("row")).toHaveCount(2);
  await page.getByLabel("Find device").fill("missing");
  await page.getByRole("button", { name: "Clear device filters" }).click();
  await expect(page.getByRole("region", { name: "Live device inventory" }).getByRole("row")).toHaveCount(4);
  await page.getByText("Saved views (1)", { exact: true }).click();
  await page.getByRole("button", { name: "Offline Windows", exact: true }).click();
  await expect(page.getByLabel("Find device")).toHaveValue("Bravo");
  await page.getByRole("button", { name: "Remove saved view Offline Windows" }).click();
  await expect(page.getByText("Saved views (0)", { exact: true })).toBeVisible();
});

test("corrupt saved preferences recover without breaking the fleet", async ({ page }) => {
  await mockLive(page);
  await page.addInitScript(() => localStorage.setItem("ai_bridge_views:v1:http://127.0.0.1:8000:workspace-admin:admin", '{"filters":{"sort":"bad","query":42},"views":[null,{"name":false}]}'));
  await page.goto("/#/live");
  await expect(page.getByLabel("Find device")).toHaveValue("");
  await expect(page.getByLabel("Sort devices")).toHaveValue("name");
  await expect(page.getByText("Saved views (0)", { exact: true })).toBeVisible();
});

test("unavailable browser storage keeps filters usable and explains persistence limits", async ({ page }) => {
  await mockLive(page);
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => { throw new DOMException("Storage unavailable", "QuotaExceededError"); };
  });
  await page.goto("/#/live");
  await expect(page.getByText("Browser storage is unavailable.", { exact: false })).toBeVisible();
  await page.getByLabel("Find device").fill("Bravo");
  await expect(page.getByRole("region", { name: "Live device inventory" }).getByRole("row")).toHaveCount(2);
});

test("device workspace preserves device and tab across reload, Back and section navigation", async ({ page }) => {
  await mockLive(page);
  const mutations: string[] = [];
  page.on("request", (request) => { if (request.method() !== "GET") mutations.push(request.url()); });
  await page.goto("/#/live");
  await page.getByRole("button", { name: "Alpha", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Alpha", exact: true })).toBeVisible();
  await expect(page.getByText("alpha-id", { exact: false })).not.toBeVisible();
  const tabs = page.getByRole("navigation", { name: "Device workspace" });
  await tabs.getByRole("button", { name: "Terminal", exact: true }).click();
  await expect(page).toHaveURL(/device=alpha-id&tab=terminal/);
  await expect(page.getByText("An interactive remote shell is not available here.", { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Run command", exact: true })).toBeVisible();
  await page.getByRole("navigation", { name: "Control plane sections" }).getByRole("button", { name: "Approvals", exact: true }).click();
  await expect(page.getByText("No pending approvals", { exact: true })).toBeVisible();
  await page.getByRole("navigation", { name: "Control plane sections" }).getByRole("button", { name: "Devices", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Alpha", exact: true })).toBeVisible();
  await tabs.getByRole("button", { name: "Desktop", exact: true }).click();
  await expect(page.getByRole("button", { name: "Capture snapshot" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("button", { name: "Run command", exact: true })).toBeVisible();
  expect(mutations).toEqual([]);
});

test("unknown device deep links do not silently select a different device", async ({ page }) => {
  await mockLive(page);
  await page.goto("/#/live?device=not-in-account&tab=terminal");
  await expect(page.getByText("Device not available", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run command", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "All devices", exact: true }).click();
  await expect(page.getByRole("button", { name: "Alpha", exact: true })).toBeVisible();
});

test("bulk review lists exact targets, skips revoked devices, and reports partial rejection", async ({ page }) => {
  await mockLive(page);
  const submitted: any[] = [];
  await page.route("**/api/tasks", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [] });
    const body = route.request().postDataJSON(); submitted.push(body);
    return body.device_id === "alpha-id" ? route.fulfill({ json: { task_id: "new-one", status: "queued" } }) :
      route.fulfill({ status: 403, json: { detail: "Tool disabled by device policy." } });
  });
  await page.goto("/#/live");
  await page.getByLabel("Select visible devices").check();
  await expect(page.getByLabel("Select Retired", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Run on selected" }).click();
  await page.getByRole("button", { name: "Review task", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("alpha-id");
  await expect(dialog).toContainText("bravo-id");
  await expect(dialog).not.toContainText("retired-id");
  await expect(dialog).toContainText("Read-only");
  expect(submitted).toEqual([]);
  await page.getByRole("button", { name: "Submit task", exact: true }).click();
  await expect(dialog).toContainText("Alpha — Submitted");
  await expect(dialog).toContainText("Bravo — Rejected");
  await expect(dialog).toContainText("Tool disabled by device policy");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  expect(submitted).toEqual([
    { device_id: "alpha-id", tool: "get_system_info", args: {} },
    { device_id: "bravo-id", tool: "get_system_info", args: {} },
  ]);
});

test("unknown bulk outcome stops remaining submissions and offers no blind retry", async ({ page }) => {
  await mockLive(page);
  let submissions = 0;
  await page.route("**/api/tasks", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [] });
    submissions++; return route.abort("failed");
  });
  await page.goto("/#/live");
  await page.getByLabel("Select visible devices").check();
  await page.getByRole("button", { name: "Run on selected" }).click();
  await page.getByRole("button", { name: "Review task", exact: true }).click();
  await page.getByRole("button", { name: "Submit task", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Alpha — Outcome unknown");
  await expect(page.getByRole("dialog")).toContainText("Bravo — Not submitted");
  await expect(page.getByRole("button", { name: "Submit task", exact: true })).toHaveCount(0);
  expect(submissions).toBe(1);
});

test("submitting to a non-default tenant preserves the selected device scope", async ({ page }) => {
  await mockLive(page);
  await page.route("**/api/devices", (route) => route.fulfill({ json: [{ ...devices[0], tenant: "operations" }] }));
  let submitted: unknown;
  await page.route("**/api/tasks*", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [] });
    submitted = route.request().postDataJSON();
    return route.fulfill({ json: { task_id: "scoped-task", status: "queued" } });
  });
  await page.goto("/#/live?device=alpha-id&tab=tasks");
  await page.getByRole("button", { name: "New task", exact: true }).click();
  await page.getByRole("button", { name: "Review task", exact: true }).click();
  await page.getByRole("button", { name: "Submit task", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Alpha — Submitted");
  expect(submitted).toEqual({ device_id: "alpha-id", tool: "get_system_info", args: {}, tenant: "operations" });
});

test("slow task reads are not superseded forever by background polling", async ({ page }) => {
  await mockLive(page);
  let reads = 0;
  await page.route("**/api/tasks*", async (route) => {
    reads++;
    await new Promise((resolve) => setTimeout(resolve, 5500));
    await route.fulfill({ json: [{ id: "slow", device_id: "alpha-id", tool: "get_system_info", status: "completed" }] });
  });
  await page.goto("/#/live?section=tasks");
  await expect(page.getByRole("region", { name: "Tasks", exact: true }).locator("li > details > summary")).toContainText("Completed", { timeout: 10000 });
  // Development StrictMode starts two initial reads; polling must not add an overlapping third.
  expect(reads).toBeLessThanOrEqual(2);
});

test("task queue shows actual lifecycle and results, and retries only reviewed read-only failures", async ({ page }) => {
  await mockLive(page);
  let status = "queued";
  let submissions = 0;
  await page.route("**/api/tasks*", (route) => {
    if (route.request().method() !== "GET") {
      submissions++; return route.fulfill({ json: { task_id: "retried", status: "queued" } });
    }
    return route.fulfill({ json: [
      { id: "one", device_id: "alpha-id", tool: "get_system_info", args_json: "{}", status, result: status === "completed" ? '{"architecture":"arm64"}' : "" },
      { id: "bad", device_id: "alpha-id", tool: "get_resource_usage", args_json: "{}", status: "failed", result: "Agent disconnected" },
      { id: "danger", device_id: "alpha-id", tool: "run_shell", args_json: '{"command":"restart"}', status: "failed" },
    ] });
  });
  await page.goto("/#/live?section=tasks");
  const list = page.getByRole("region", { name: "Tasks", exact: true });
  await expect(list).toContainText("Submitted");
  status = "running"; await page.getByRole("button", { name: "Refresh tasks", exact: true }).click();
  await expect(list).toContainText("Running");
  status = "completed"; await page.getByRole("button", { name: "Refresh tasks", exact: true }).click();
  await expect(list).toContainText("Completed");
  await list.locator("summary").filter({ hasText: "get_system_info" }).click();
  await expect(list.getByText(/"architecture": "arm64"/)).toBeVisible();
  await list.locator("summary").filter({ hasText: "get_resource_usage" }).click();
  await page.getByRole("button", { name: "Review retry", exact: true }).click();
  expect(submissions).toBe(0);
  await page.getByRole("button", { name: "Review task", exact: true }).click();
  await page.getByRole("button", { name: "Submit task", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Alpha — Submitted");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await list.locator("summary").filter({ hasText: "run_shell" }).click();
  await expect(list.getByText("No automatic retry.", { exact: false })).toBeVisible();
  expect(submissions).toBe(1);
  await page.getByRole("button", { name: "Failed tasks", exact: true }).click();
  await expect(page.getByLabel("Task status")).toHaveValue("failed");
  await expect(list.locator("li")).toHaveCount(2);
});

test("command and snapshot tabs use policy-checked task submission, not host terminal or capture GET", async ({ page }) => {
  await mockLive(page);
  const submissions: any[] = [];
  const unexpected: string[] = [];
  page.on("request", (request) => { if (/terminal\/sessions|desktop\/frame/.test(request.url())) unexpected.push(request.url()); });
  await page.route("**/api/tasks*", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [] });
    submissions.push(route.request().postDataJSON());
    return route.fulfill({ json: { task_id: `task-${submissions.length}`, status: "needs_approval" } });
  });
  await page.goto("/#/live?device=alpha-id&tab=terminal");
  await page.getByRole("button", { name: "Run command", exact: true }).click();
  await page.getByLabel("Command", { exact: true }).fill("uname -a");
  await page.getByRole("button", { name: "Review task", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("uname -a");
  await page.getByRole("button", { name: "Submit task", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Awaiting approval");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("navigation", { name: "Device workspace" }).getByRole("button", { name: "Desktop", exact: true }).click();
  await page.getByRole("button", { name: "Capture snapshot", exact: true }).click();
  await page.getByRole("button", { name: "Review task", exact: true }).click();
  await page.getByRole("button", { name: "Submit task", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Awaiting approval");
  expect(submissions).toEqual([
    { device_id: "alpha-id", tool: "run_shell", args: { command: "uname -a" } },
    { device_id: "alpha-id", tool: "capture_desktop_frame", args: {} },
  ]);
  expect(unexpected).toEqual([]);
});

for (const format of ["png", "jpeg"]) {
  test(`completed ${format} snapshots render actual task output without exposing base64 text`, async ({ page }) => {
    await mockLive(page);
    const image = await page.evaluate((format) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      return canvas.toDataURL(`image/${format}`).split(",")[1];
    }, format);
    await page.route("**/api/tasks*", (route) => route.fulfill({ json: [{
      id: "frame", device_id: "alpha-id", tool: "capture_desktop_frame", status: "completed",
      result: JSON.stringify({ base64_data: image, timestamp: 1793830000 }),
    }] }));
    await page.goto("/#/live?device=alpha-id&tab=desktop");
    await page.locator("summary").filter({ hasText: "capture_desktop_frame" }).click();
    const frame = page.getByRole("img", { name: "Captured device desktop", exact: true });
    await expect(frame).toBeVisible();
    await expect.poll(() => frame.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth === 1)).toBe(true);
    await expect(page.getByText("[Image displayed above]", { exact: false })).toBeVisible();
    await expect(frame).toHaveAttribute("src", new RegExp(`^data:image/${format};base64,`));
  });
}

test("approval review shows exact action and records decision reason; conflicts cannot be resubmitted", async ({ page }) => {
  await mockLive(page);
  await page.route("**/api/approvals", (route) => route.fulfill({ json: [approval] }));
  const decisions: any[] = [];
  await page.route("**/api/approvals/approval-one/decide", (route) => {
    decisions.push(route.request().postDataJSON());
    return route.fulfill({ status: 409, json: { detail: "Approval is already denied." } });
  });
  await page.goto("/#/live?section=approvals");
  await expect(page.getByText("Not recorded by the server", { exact: true })).toBeVisible();
  await expect(page.getByText(/"command": "systemctl restart nginx"/)).toBeVisible();
  await page.getByRole("button", { name: "Review approval", exact: true }).click();
  await page.getByLabel("Decision reason (optional)").fill("Maintenance window approved");
  await page.getByRole("button", { name: "Confirm approval", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Approval is already denied");
  await expect(page.getByRole("button", { name: "Confirm approval", exact: true })).toHaveCount(0);
  expect(decisions).toEqual([{ decision: "approved", reason: "Maintenance window approved" }]);
});

test("enrollment is actionable and one-time credentials are never persisted", async ({ page }) => {
  await mockLive(page, { empty: true });
  let enrollments = 0;
  await page.route("**/api/devices/enroll", (route) => {
    enrollments++;
    expect(route.request().postDataJSON()).toEqual({ name: "New agent" });
    return route.fulfill({ json: { device_id: "new-device", device_token: "one-time-secret" } });
  });
  await page.goto("/#/live");
  await page.getByRole("button", { name: "Enroll device", exact: true }).click();
  await page.getByLabel("Device name", { exact: true }).fill("New agent");
  await page.getByRole("button", { name: "Create enrollment", exact: true }).click();
  await expect(page.getByLabel("Device token", { exact: true })).toHaveValue("one-time-secret");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByLabel("Device token", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain("one-time-secret");
  expect(enrollments).toBe(1);
});

test("viewers and a stopped fleet cannot submit tasks from workspace or bulk controls", async ({ page }) => {
  await mockLive(page, { role: "viewer" });
  await page.goto("/#/live");
  await expect(page.getByLabel("Select visible devices")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Enroll device", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Alpha", exact: true }).click();
  await page.getByRole("navigation", { name: "Device workspace" }).getByRole("button", { name: "Terminal", exact: true }).click();
  await expect(page.getByRole("button", { name: "Run command", exact: true })).toBeDisabled();
  await mockLive(page, { stopped: true });
  await page.reload();
  await expect(page.getByRole("button", { name: "Run command", exact: true })).toBeDisabled();
});

for (const width of [390, 1440]) {
  for (const route of ["", "?device=alpha-id&tab=details", "?device=alpha-id&tab=terminal", "?section=approvals"]) {
    test(`live workspace ${route || "inventory"} is accessible at ${width}px`, async ({ page }) => {
      await mockLive(page);
      await page.route("**/api/approvals", (request) => request.fulfill({ json: [approval] }));
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`/#/live${route}`);
      await expect(page.getByRole("navigation", { name: "Control plane sections" })).toBeVisible();
      await expect(page.locator("h1")).toHaveCount(1);
      expect(await page.locator("main").evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
    });
  }
}
