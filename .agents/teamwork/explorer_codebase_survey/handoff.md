# Codebase Survey & Technical Assessment: `apps/dashboard`

**Author**: `teamwork_explorer`  
**Date**: 2026-11-02  
**Target Application**: `apps/dashboard`  
**Objective**: Comprehensive technical survey of codebase, dependencies, build/test scripts, file layout, and R1-R5 requirement violations in preparation for full dashboard reconstruction.

---

## 1. Observation

### 1.1 Dependency Audit & `package.json`

Direct inspection of `apps/dashboard/package.json` (lines 1–28):
```json
{
  "name": "ai-bridge-dashboard",
  "version": "0.2.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@jacxishippingorg/jx-ui-react": "^3.0.0",
    "lucide-react": "^0.469.0",
    "motion": "^14.9.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.3.3",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "tailwindcss": "^4.3.3",
    "typescript": "^5.5.0",
    "vite": "^5.4.0"
  }
}
```

Key observations on dependencies:
- **Installed Runtime Dependencies**: Exactly matches Requirement R1 specifications. Only `@jacxishippingorg/jx-ui-react` (v3.0.0), `motion` (v14.9.0), and `lucide-react` (v0.469.0), with standard React 18 peer dependencies (`react`, `react-dom`).
- **Installed Dev Dependencies**: Standard React Vite bundler tooling (`vite`, `@vitejs/plugin-react`, `typescript`, `@types/react`, `@types/react-dom`) plus Tailwind CSS v4 compiler engine (`tailwindcss`, `@tailwindcss/vite`).
- **Grep for External Imports in `src/`**:
  - `grep_search` across `apps/dashboard/src/` for `from "lucide-react"` returned **0 results**.
  - `grep_search` across `apps/dashboard/src/` for `from "motion"` returned **0 results**.
  - `grep_search` across `apps/dashboard/src/` for `from "@jacxishippingorg/jx-ui-react"` returned **14 results** (`App.tsx`, `ConfirmDialog.tsx`, `Pager.tsx`, `AiApiHub.tsx`, `AuditTrail.tsx`, `ConnectionsHub.tsx`, `DeviceDetailDashboard.tsx`, `DevicePolicyEditor.tsx`, `DiagnosticsLogs.tsx`, `FleetOperations.tsx`, `HumanApprovals.tsx`, `LiveDesktopStudio.tsx`, `SecurityPolicies.tsx`, `WorkflowPlanner.tsx`).
  - No other third-party npm packages are imported.

### 1.2 Build & TypeScript Configurations

- **`apps/dashboard/tsconfig.json`** (lines 1–18):
  ```json
  {
    "compilerOptions": {
      "target": "ES2020",
      "module": "ESNext",
      "moduleResolution": "bundler",
      "jsx": "react-jsx",
      "strict": true,
      "skipLibCheck": true,
      "types": [
        "vite/client"
      ],
      "noEmit": true
    },
    "include": [
      "src"
    ]
  }
  ```
- **`apps/dashboard/vite.config.ts`** (lines 1–30):
  ```ts
  import { defineConfig } from "vite";
  import react from "@vitejs/plugin-react";
  import tailwindcss from "@tailwindcss/vite";

  export default defineConfig({
    plugins: [tailwindcss(), react()],
    server: { port: 5173 },
    define: {
      "import.meta.env.VITE_API_URL": JSON.stringify(process.env.VITE_API_URL || ""),
    },
    build: {
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom/")) {
              return "vendor-react";
            }
            if (id.includes("node_modules/@jacxishippingorg/jx-ui-react")) {
              return "vendor-jxui";
            }
            if (id.includes("node_modules/lucide-react") || id.includes("node_modules/motion")) {
              return "vendor-motion";
            }
          },
        },
      },
    },
  });
  ```
- **`apps/dashboard/index.html`** (lines 10–13):
  ```html
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400;1,600&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" />
  </head>
  <body class="jx-body">
  ```
  *Notice line 11: Links to Google Fonts `Material Symbols Outlined`.*

### 1.3 File Layout & Inventory of `apps/dashboard/src/`

Listing of `apps/dashboard/src/` (21 files, 0 subdirectories):
| Filename | Size (Bytes) | Role / Purpose | Status / Action Needed |
| :--- | :--- | :--- | :--- |
| `main.tsx` | 441 B | Application entrypoint with `JXThemeProvider` | Imports custom CSS files; needs cleanup |
| `tailwind.css` | 163 B | `@import "tailwindcss"; @source "...";` | Required by JXUI v4 engine; keep clean |
| `fluent2.css` | 47,636 B (1,793 lines) | Microsoft Fluent 2 CSS system clone | **Violates R1; MUST BE DELETED** |
| `jxui.css` | 64,133 B (2,090 lines) | Custom CSS tokens, gradients, classes | **Violates R1; MUST BE DELETED** |
| `App.tsx` | 277,094 B (5,198 lines) | Monolithic root shell, login, overview, tasks | **Violates R1; MUST BE REPLACED** |
| `api.ts` | 11,769 B (167 lines) | Complete backend REST client & SSE URLs | Clean TypeScript client; keep & modularize |
| `ConfirmDialog.tsx` | 1,784 B (67 lines) | Custom wrapper for `GlassModal` + `JXButton` | **Violates R1; MUST BE PURGED** |
| `Pager.tsx` | 587 B (26 lines) | Custom wrapper for `JXPagination` | **Violates R1; MUST BE PURGED** |
| `ViewLoadingSkeleton.tsx` | 1,219 B (44 lines) | Custom loading spinner using raw divs | **Violates R1; MUST BE PURGED** |
| `AiApiHub.tsx` | 66,241 B (1,324 lines) | Screen 9: AI API & Custom Agents Hub | Full of inline styles & f2 classes; reconstruct |
| `AuditTrail.tsx` | 50,195 B (963 lines) | Screen 12: Append-Only Audit Trail | Full of inline styles & f2 classes; reconstruct |
| `ConnectionsHub.tsx` | 47,567 B (936 lines) | Screen 13: MCP & OAuth Connections | Full of inline styles & f2 classes; reconstruct |
| `DeviceDetailDashboard.tsx` | 91,499 B (1,691 lines) | Screen 3: Device 360 System Dashboard | Full of inline styles & f2 classes; reconstruct |
| `DevicePolicyEditor.tsx` | 40,685 B (814 lines) | Device Policy Sub-view | Full of inline styles & f2 classes; reconstruct |
| `DiagnosticsLogs.tsx` | 35,447 B (686 lines) | Screen 14: Diagnostics & Logs | Full of inline styles & f2 classes; reconstruct |
| `FleetOperations.tsx` | 95,753 B (1,775 lines) | Screen 8: Fleet Operations & Self-Healing | Full of inline styles & f2 classes; reconstruct |
| `HumanApprovals.tsx` | 39,742 B (786 lines) | Screen 10: Human Approvals | Full of inline styles & f2 classes; reconstruct |
| `LiveDesktopStudio.tsx` | 85,590 B (1,514 lines) | Screen 5: Live Desktop Studio | Full of inline styles & f2 classes; reconstruct |
| `SecurityPolicies.tsx` | 53,900 B (1,029 lines) | Screen 11: Security Policies & Webhooks | Full of inline styles & f2 classes; reconstruct |
| `TerminalStudio.tsx` | 31,518 B (608 lines) | Screen 6: Interactive Terminal | Full of inline styles & f2 classes; reconstruct |
| `WorkflowPlanner.tsx` | 48,126 B (1,038 lines) | Screen 7: Autonomous Workflows | Full of inline styles & f2 classes; reconstruct |

### 1.4 Violations of Requirement R1 & Acceptance Criteria

1. **Custom CSS Files**:
   - `src/fluent2.css` (47.6 KB, 1,793 lines): Defines custom Fluent 2 design tokens (`--colorBrand*`, `--colorNeutral*`), typography, and `.f2-*` utility classes (`.f2-badge`, `.f2-card`, `.f2-table`, `.f2-messagebar`, `.f2-ability-grid`, `.f2-pulse-dot`).
   - `src/jxui.css` (64.1 KB, 2,090 lines): Defines custom tokens (`--jx-*`), canvas gradients, shadows, custom keyframes (`jxSpin`), and component resets.
   - `src/main.tsx` imports both files directly on lines 5 and 6:
     ```tsx
     import "./tailwind.css";
     import "./fluent2.css";
     import "./jxui.css";
     ```
2. **Inline `style={{ ... }}` Attributes**:
   - Quantitative grep search across `apps/dashboard/src` revealed **over 2,100 occurrences** of inline `style={{ ... }}` tags.
   - Example from `WorkflowPlanner.tsx:233`: `<div style={{ display: "flex", flexDirection: "column", gap: 20 }}>`
   - Example from `App.tsx:519`: `<div className="f2-bar-track" style={{ flex: 1, height: 7, borderRadius: 9999, background: "var(--jx-surface-sunken)", overflow: "hidden", border: "1px solid var(--jx-border-subtle)" }}>`
3. **Custom UI Component Wrapper Abstractions**:
   - `ConfirmDialog.tsx`: Wraps `GlassModal` + `JXButton` with custom layout and inline styles.
   - `Pager.tsx`: Wraps `JXPagination` with `<div style={{ marginTop: 14 }}>`.
   - `ViewLoadingSkeleton.tsx`: Manually builds a spinning circle using raw HTML `<div>` with `animation: "jxSpin 0.8s linear infinite"` instead of using JXUI's `JXSkeleton` or progress components.
4. **Alternative Icon Fonts & Manually Recreated Elements**:
   - `index.html` loads Google Fonts `Material Symbols Outlined`.
   - Over 400 instances of `<span className="material-symbols-outlined">...</span>` are used instead of `lucide-react`.
   - Raw SVG graphics rendered manually (e.g., in `DeviceDetailDashboard.tsx:104`).
   - Emojis used in labels (e.g. `🛡️ Custom Guardrails Active`, `🌐 Inheriting Global Policy` in `DevicePolicyEditor.tsx:428-430`).
5. **Underutilized / Missing Libraries**:
   - `lucide-react`: Installed but never imported.
   - `motion`: Installed but never imported.

### 1.5 Architecture, Routing Mechanism & State Management

- **Routing Mechanism**:
  - Handled via local React state in `App.tsx` (line 53):
    `type View = "overview" | "devices" | "device_detail" | "tasks" | "approvals" | "audit" | "policies" | "connections" | "ai_api" | "workflows" | "fleet_ops" | "live_studio" | "terminal" | "logs";`
    `const [view, setView] = useState<View>("overview");`
  - Rendered via conditional branching (`renderContent()`) in `App.tsx`.
  - No synchronization with browser URL (`window.location.hash` or history).
- **State Management**:
  - No global state management libraries (Redux, Zustand, Recoil).
  - Component-local state via React hooks (`useState`, `useEffect`, `useCallback`, `useMemo`, `useRef`).
  - Auth tokens stored in `localStorage` (`ai_bridge_admin_token`, `ai_bridge_session_token`).
  - Theme state stored in `localStorage` (`ai_bridge_theme`) and managed by `JXThemeProvider`.
- **Backend API & Data Flow**:
  - `src/api.ts` provides complete, fully functioning async methods for every fleet endpoint (`devices`, `tasks`, `approvals`, `audit`, `policies`, `connections`, `logs`, `ai`, `workflows`, `fleet`, `terminal`, `desktop`).
  - Uses fetch API with automatic token injection (`X-Session-Token` or `X-Admin-Token`) and 401 token refresh handling.
  - Generates SSE streaming URLs for workflows and terminal sessions.

### 1.6 Build and Verification Tooling Commands & Outputs

1. **TypeScript Type Check Command**:
   - Executed: `cd apps/dashboard; npx tsc -b`
   - Exit code: **0**
   - Output: No errors. Clean exit.
   - *Note on execution context*: Running `npx --prefix apps/dashboard tsc -b` from repo root failed with `error TS5083: Cannot read file 'C:/Users/Administrator/Documents/GitHub/ai-bridge/tsconfig.json'` because `tsc -b` searches for the tsconfig in the working directory. Typecheck must either run inside `apps/dashboard` or via `npm --prefix apps/dashboard run build`.
2. **Production Build Command**:
   - Executed: `npm --prefix apps/dashboard run build`
   - Exit code: **0**
   - Output verbatim:
     ```
     > ai-bridge-dashboard@0.2.0 build
     > tsc -b && vite build

     vite v5.4.21 building for production...
     transforming...
     ✓ 2430 modules transformed.
     rendering chunks...
     warnings when minifying css:
     ▲ [WARNING] "task" is not a known CSS property [unsupported-css-property]
     computing gzip size...
     dist/index.html                                  1.35 kB │ gzip:  0.67 kB
     dist/assets/index-C8h_5lQw.css                 298.15 kB │ gzip: 38.55 kB
     dist/assets/vendor-react-DhEz86-d.js           141.80 kB │ gzip: 45.42 kB
     dist/assets/index-iM_5bbSB.js                  159.54 kB │ gzip: 37.63 kB
     dist/assets/vendor-jxui-BU_hvFg_.js            189.67 kB │ gzip: 54.26 kB
     ✓ built in 17.39s
     ```
   - *Notice CSS bundle size is 298.15 kB due to 110 KB of custom CSS in `fluent2.css` and `jxui.css`, plus an invalid CSS property warning.*
3. **Test Runner Command**:
   - `npm test` or `npm --prefix apps/dashboard test` fails:
     `npm error Missing script: "test"`
   - Neither Vitest nor Jest is currently installed in `apps/dashboard/package.json`.
   - Tests in the repository root (`tests/`) are Python pytest suites for the backend control plane (`tests/unit/`, `tests/integration/`, `tests/e2e/`).

---

## 2. Logic Chain

1. **Premise 1**: Requirement R1 dictates that only `@jacxishippingorg/jx-ui-react`, `motion`, and `lucide-react` are imported in `apps/dashboard`, and strictly forbids custom React UI components, custom component wrappers, custom CSS, inline styles, CSS modules, SCSS, Tailwind custom classes, manually recreated UI elements, and custom SVG icons.
2. **Premise 2 (Observation 1.1 & 1.4)**: `package.json` specifies the exact required dependencies (`@jacxishippingorg/jx-ui-react`, `motion`, `lucide-react`), but the existing codebase completely fails to import `lucide-react` and `motion`, substituting Google Fonts Material Symbols and custom CSS animations.
3. **Premise 3 (Observation 1.3 & 1.4)**: `fluent2.css` (47.6 KB) and `jxui.css` (64.1 KB) are local custom CSS stylesheets defining thousands of non-standard CSS tokens, gradients, and classes. Furthermore, over 2,100 inline `style={{ ... }}` attributes exist across the 21 source files, and 3 custom wrapper components (`ConfirmDialog`, `Pager`, `ViewLoadingSkeleton`) were created.
4. **Premise 4 (Observation 1.3 & JXUI Catalog)**: `@jacxishippingorg/jx-ui-react` exports 361 components across 18 categories, including complete layout containers (`JXBox`, `JXGrid`, `JXGridItem`, `JXStack`, `JXContainer`), navigation primitives (`JXNavigationRail`, `JXAppBar`, `JXBreadcrumbs`, `JXTabs`), feedback modals (`JXDialog`, `GlassModal`), loading indicators (`JXSkeleton`, `JXProgress`), tables (`JXTable`, `SmartDataTable`), inputs (`JXTextField`, `JXSelect`, `JXSwitch`), and data display (`JXBadge`, `JXChip`, `JXDivider`, `JXTypography`).
5. **Deduction 1**: The current codebase is in severe violation of Requirement R1 and R2 across every single screen file. It cannot be salvaged through minor edits; it requires an architectural reconstruction.
6. **Deduction 2**: Every custom wrapper and inline style can be replaced directly by native `@jacxishippingorg/jx-ui-react` components with their supported props and layout primitives (`JXStack`, `JXBox`, `JXGrid`).
7. **Deduction 3**: Purging `fluent2.css` and `jxui.css`, removing the Material Symbols link in `index.html`, replacing all icon spans with `lucide-react` icons, and utilizing `motion` for animated page/card transitions will bring `apps/dashboard` into 100% compliance with R1-R5 while preserving all functional API workflows in `api.ts`.
8. **Deduction 4**: Build verification (`npm --prefix apps/dashboard run build` and `cd apps/dashboard; npx tsc -b`) is confirmed to work with exit code 0. Post-reconstruction verification must ensure the build continues to produce exit code 0 without any custom CSS or TypeScript errors.

---

## 3. Caveats

1. **Tailwind CSS v4 Integration**: `@jacxishippingorg/jx-ui-react` does not ship pre-compiled CSS files; it relies on Tailwind CSS v4 compiler scanning the library sources. Therefore, `@tailwindcss/vite` in `vite.config.ts` and `@import "tailwindcss"; @source "../node_modules/@jacxishippingorg/jx-ui-react";` in `src/tailwind.css` must remain as the library's required build infrastructure. However, application code in `apps/dashboard` must not author custom CSS or one-off Tailwind style overrides.
2. **Zero-Test Suite in `apps/dashboard`**: Currently, there is no frontend test runner (e.g. Vitest) installed in `apps/dashboard`. Testing has relied strictly on TypeScript static checking (`tsc -b`) and Vite production bundle compilation (`vite build`). If automated frontend tests are required for the acceptance criteria, Vitest and `@testing-library/react` will need to be configured.
3. **Backend API Readiness**: `src/api.ts` is fully implemented and relies on an active control plane server on `http://127.0.0.1:8000` (or `VITE_API_URL`). When offline, screens must handle fallback / sample state gracefully without crashing.

---

## 4. Conclusion & Recommended Reconstruction Architecture

### 4.1 Current Assessment Summary

- **Requirement R1 Compliance**: **FAIL**. Massive violations (110 KB of custom CSS in 2 files, 2,100+ inline styles, 3 custom wrapper components, 400+ Material Symbol font icons, 0 imports of `lucide-react` and `motion`).
- **Dependency Audit**: **PASS**. Only approved packages installed (`@jacxishippingorg/jx-ui-react`, `motion`, `lucide-react`, React 18).
- **TypeScript & Build Health**: **PASS**. Clean exit code 0 on `tsc -b` and `vite build`.
- **API Coverage**: **PASS**. `src/api.ts` provides complete backend connectivity for all 15 screens.

### 4.2 Files to Purge / Remove

1. `apps/dashboard/src/fluent2.css` -> **DELETE**
2. `apps/dashboard/src/jxui.css` -> **DELETE**
3. `apps/dashboard/src/ConfirmDialog.tsx` -> **DELETE** (replace with native `JXDialog` / `GlassModal`)
4. `apps/dashboard/src/Pager.tsx` -> **DELETE** (replace with native `JXPagination`)
5. `apps/dashboard/src/ViewLoadingSkeleton.tsx` -> **DELETE** (replace with native `JXSkeleton` / `JXProgress`)
6. `apps/dashboard/index.html` -> **REMOVE** Google Fonts `Material Symbols Outlined` link
7. `apps/dashboard/src/main.tsx` -> **REMOVE** imports of `fluent2.css` and `jxui.css`

### 4.3 Proposed Clean Modular Directory Layout

```
apps/dashboard/
├── index.html                           # Clean HTML without external Material Symbols font
├── package.json                         # Strict dependencies only
├── tsconfig.json                        # Strict TypeScript bundler configuration
├── vite.config.ts                       # Vite + @tailwindcss/vite + react
└── src/
    ├── main.tsx                         # App entrypoint with JXThemeProvider and tailwind.css ONLY
    ├── tailwind.css                     # Tailwind v4 import + @source for JXUI only
    ├── api.ts                           # REST API client & SSE streams (pure TS, zero UI)
    ├── types.ts                         # Shared TypeScript interfaces (Device, Task, Approval, Policy, etc.)
    ├── layout/
    │   ├── Shell.tsx                    # Global layout using JXNavigationRail and JXAppBar
    │   ├── Header.tsx                   # Top bar controls (gateway status, auto-poll, theme, halt)
    │   └── CommandPalette.tsx           # Quick jump modal (Ctrl+K) using JXUI / motion
    ├── views/                           # 15 distinct screen modules using ONLY JXUI, motion, lucide-react
    │   ├── LoginView.tsx                # Screen 0: Login & Authentication Console
    │   ├── OverviewView.tsx             # Screen 1: Command Overview
    │   ├── DevicesView.tsx              # Screen 2: Enrolled Devices
    │   ├── DeviceDetailView.tsx         # Screen 3: Device 360 System Dashboard
    │   ├── TasksView.tsx                # Screen 4: Task Queue & Vision Inspector
    │   ├── LiveStudioView.tsx           # Screen 5: Live Desktop Studio & Takeover
    │   ├── TerminalView.tsx             # Screen 6: Interactive Terminal
    │   ├── WorkflowsView.tsx            # Screen 7: Autonomous Workflows & Multi-Turn Plans
    │   ├── FleetOpsView.tsx             # Screen 8: Fleet Operations & Self-Healing Hub
    │   ├── AiApiView.tsx                # Screen 9: AI API & Custom Agents Hub
    │   ├── ApprovalsView.tsx            # Screen 10: Human-in-the-Loop Approvals
    │   ├── PoliciesView.tsx             # Screen 11: Security Policies & Webhooks
    │   ├── AuditView.tsx                # Screen 12: Append-Only Audit Trail
    │   ├── ConnectionsView.tsx          # Screen 13: MCP & OAuth Connections
    │   └── LogsView.tsx                 # Screen 14: Service Diagnostics & Logs
    └── modals/                          # Pure JXUI dialogs (EmergencyHaltDialog, DeviceEnrollModal, etc.)
```

### 4.4 Migration Strategy for Reconstruction

1. **Step 1: Clean Foundation & Styling Purge**
   - Delete `fluent2.css`, `jxui.css`, `ConfirmDialog.tsx`, `Pager.tsx`, `ViewLoadingSkeleton.tsx`.
   - Update `main.tsx` to import only `tailwind.css` and wrap root in `<JXThemeProvider defaultMode="dark" defaultAccent="indigo" storageKey="ai_bridge_theme">`.
   - Clean `index.html` to eliminate Material Symbols font link.
2. **Step 2: Navigation Shell & Global State Architecture**
   - Build `src/layout/Shell.tsx` using `JXNavigationRail` and `JXAppBar`.
   - Implement header controls in `src/layout/Header.tsx` (Gateway latency indicator, Auto-refresh toggle, Emergency halt trigger, Theme switch, Profile session menu).
   - Implement `CommandPalette.tsx` using JXUI modals and `motion`.
3. **Step 3: Component Mapping & Screen Re-implementation**
   - Systematically rebuild screens 0 through 14 in `src/views/`.
   - Replace every raw HTML element and inline `style={{ ... }}` with:
     - Layout: `JXStack`, `JXGrid`, `JXGridItem`, `JXBox`, `JXContainer`
     - Action: `JXButton`, `JXButtonGroup`, `HoldToConfirmButton` (for emergency/destructive actions)
     - Surfaces: `JXCard`, `JXCardHeader`, `JXCardContent`, `JXPaper`, `GlassModal`
     - Data Display: `JXTable`, `JXBadge`, `JXChip`, `JXDivider`, `JXTypography`, `MetricCard`
     - Feedback & Loading: `JXSkeleton`, `JXProgress`, `JXAlert`, `JXSnackbar`
     - Inputs: `JXTextField`, `JXSelect`, `JXSwitch`, `JXCheckbox`, `JXAutocomplete`
     - Icons: Sourced exclusively from `lucide-react` with consistent 16-20px sizing.
     - Animations: Purposeful entrance, tab transition, and modal fades via `motion`.
4. **Step 4: Continuous Build & Type Verification**
   - Run `cd apps/dashboard; npx tsc -b` and `npm --prefix apps/dashboard run build` at every phase to guarantee zero type errors and zero bundling warnings.

---

## 5. Verification Method

To independently verify the observations and findings in this report:

1. **Verify Dependencies in `package.json`**:
   ```bash
   cat apps/dashboard/package.json
   ```
   Check that only `@jacxishippingorg/jx-ui-react`, `motion`, `lucide-react`, `react`, and `react-dom` are in `dependencies`.

2. **Verify Custom CSS Files & Inline Styles Violations**:
   ```powershell
   # Inspect custom CSS files
   Get-Item apps/dashboard/src/fluent2.css, apps/dashboard/src/jxui.css | Select-Object Name, Length

   # Count occurrences of inline styles across src/
   (Select-String -Path "apps/dashboard/src/*.tsx" -Pattern "style=\{\{").Count

   # Count occurrences of material symbols
   (Select-String -Path "apps/dashboard/src/*.tsx" -Pattern "material-symbols").Count

   # Check imports of lucide-react (should currently be 0)
   (Select-String -Path "apps/dashboard/src/*.tsx" -Pattern "from ['""]lucide-react").Count

   # Check imports of motion (should currently be 0)
   (Select-String -Path "apps/dashboard/src/*.tsx" -Pattern "from ['""]motion").Count
   ```

3. **Verify TypeScript Typechecking**:
   ```powershell
   cd apps/dashboard
   npx tsc -b
   ```
   Expected output: Exit code 0, no errors.

4. **Verify Production Bundle Compilation**:
   ```powershell
   npm --prefix apps/dashboard run build
   ```
   Expected output: Exit code 0, generates `dist/assets/`. Note that in the current pre-reconstruction state, a CSS warning (`[WARNING] "task" is not a known CSS property`) occurs during minification due to `fluent2.css`/`jxui.css`. Post-reconstruction, CSS bundling should compile cleanly without any CSS warnings.
