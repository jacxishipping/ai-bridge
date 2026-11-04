# AI Bridge dashboard

## Run locally

From the repository root, start the Python control plane:

```sh
python -m ai_bridge.control
```

Then, in another terminal:

```sh
cd apps/dashboard
npm ci
npm run dev -- --host 127.0.0.1
```

Open http://127.0.0.1:5173. The development API defaults to
http://127.0.0.1:8000. Set `VITE_API_URL` to use a different control plane.
Do not put admin tokens or other credentials in frontend environment variables.

## Live versus preview

The initial screen offers actual admin-token or account authentication against
the API. Credentials are kept in session storage for the current tab, not
persisted in local storage. Configured identity providers are also supported;
the callback token is removed from the address bar before rendering.

The **Control plane** screen uses real identity, health, inventory, tasks and
approvals. It handles empty fleets, failed refreshes and expired sessions.
Administrators can enroll devices and request or clear the real emergency stop.
The server remains responsible for enforcing permissions.

- Device filters and sorting are remembered. Offline devices, failed tasks and
  up to ten named filter views are available. Only preferences are stored locally,
  scoped to the account and API; enrollment tokens and task output are not.
- A device workspace preserves its selection and Details, Tasks, Terminal or
  Desktop section in the URL, including on reload and Back/Forward.
- Terminal submits command tasks; it does **not** expose the backend’s
  control-plane-host shell as if it were a remote device terminal.
- Desktop submits explicit snapshot tasks, not continuous video or automatic
  capture requests. Screen capture and commands may require human approval.
- Bulk submissions list exact devices, action, arguments and risk before
  confirmation. Each device uses the normal policy-checked task endpoint.
  Results distinguish submission from execution and report partial rejection.
  An unknown outcome stops the remaining batch; no write is automatically retried.
- Tasks refresh every five seconds while the page is visible, with on-demand
  arguments, identifiers and output. Only known read-only failures with empty
  arguments offer a reviewed retry (a new task, not an automatic retry).
- Approvals show the exact arguments and reason, with a confirmed decision
  and optional decision note. The current API does not record requester identity;
  the UI says so rather than guessing. Conflicts require reconciliation.

**Explore demo workspace** opens the advanced dashboard preview. All 14
operational/governance screens use seeded browser-local data, not live fleet
telemetry. The persistent demo banner applies to every screen and action,
including enrollment previews, desktop, terminal, policies and approvals.
Demo actions never call the live mutation APIs. Refreshing resets demo state.
Other advanced preview screens remain separate from the live workspace.

Hash URLs preserve the selected screen and device on reload, and support
browser Back/Forward. On narrow screens, navigation moves into a menu.
Search supports arrow keys, Enter and Escape; dialogs trap focus and restore
it to their launcher when dismissed without navigation.

## Validate

```sh
npm run build
npm test
npm run test:browser
```

Browser tests exercise actual React screens at mobile and desktop sizes, check
horizontal overflow and automated WCAG A/AA rules with axe, and cover keyboard
navigation, confirmation, routing and authentication. API responses in these
regression tests are mocked; they do not operate on real devices.

On Windows the browser suite uses installed Microsoft Edge. On other platforms
install Playwright Chromium with `npx playwright install chromium` first.
`PLAYWRIGHT_CHANNEL` can select another installed Chromium channel.
The test runner starts Vite if it is not already running.

The shared `src/ui.tsx` adapters retain JXUI surfaces, inputs and buttons while
removing showcase-only defaults and supplying semantic progress, responsive
layout and native modal behavior. Keep product-specific fixes here rather than
duplicating them across views. Dark mode is the currently supported visual
design; automated checks are not a substitute for assistive-technology testing.

## Content and visual hierarchy

- Show information that supports an action, not decorative telemetry.
- The overview has three store-derived counts and the five most recent tasks.
- Detail pages start with their working controls, not repeated KPI ribbons.
- Use short labels shared by navigation and search. Avoid duplicate breadcrumbs,
  version badges, invented uptime, security certifications and inflated totals.
- Keep sample-data disclosure in one persistent line. Keep actual authorization
  requirements, risk information and destructive-action confirmations visible.
- Put payloads, endpoints and technical detail behind intentional inspection.
- Use neutral surfaces and normal title/body hierarchy; reserve color for
  actions, errors and statuses rather than decorating every heading.

## Brand system

The sign-in, live workspace and preview share the same bridge mark and wordmark.
`public/brand-mark.svg` is also the favicon. Product colors, surfaces, navigation,
typography and responsive shell rules live in `src/tailwind.css`; the `--product-*`
tokens are the source of truth for product chrome. JXUI interaction behavior stays
in the shared adapters instead of being reimplemented per screen.

Use cobalt for primary actions and selection. Keep success, warning and danger
colors semantic. Dark navy surfaces, restrained borders, readable type and
compact spacing replace glass effects and oversized promotional treatments.
Authentication artwork is decorative and never represents actual fleet data.

Density is shared rather than configured per view: 56px headers, 14px card
padding, 20px page titles and 34px desktop controls. The `--product-control-*`,
`--product-nav-*` and `--product-table-py` tokens govern interactive spacing.
Narrow screens (below 640px) and coarse pointers retain 44px button, field and
navigation targets. Do not use browser zoom or shrink body text to fit more data.

Device names and account names support mixed-direction text. Dates and counts
use the browser's locale. This is a visual brand system, not a translated UI;
there is no language picker or claim of full RTL localization.
