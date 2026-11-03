## 2026-11-02T23:40:55Z
Objective: Milestone 2 — Fleet & Hardware Observability Views
1. Apply store hardening to `dashboardStore.ts`:
   - Add `TSK-89215` and `TSK-89216` to `SEED_TASKS`.
   - Prevent task spawning with 'running' status if `isEmergencyStopActive` is true.
   - Make `resolveApproval` idempotent.
2. Implement `apps/dashboard/src/views/LoginView.tsx` (Screen 0):
   - Centered glass card (`JXCard` / `JXBox`), "AI Bridge Fleet Gateway".
   - Gateway ping chip (`Online: 14ms`).
   - "Continue with Google SSO" button.
   - Tab switcher for "Admin Secret Token" and "Operator Login" with entropy bar.
   - mTLS session checkbox and primary login button with loading transition.
3. Implement `apps/dashboard/src/views/OverviewView.tsx` (Screen 1):
   - 4-metric Bento ribbon (`Active Fleet Nodes`, `Task Throughput 24h`, `Pending Approvals`, `Median Fleet Heartbeat`).
   - 2-column analytics: Risk tier volume breakdown and Task status breakdown.
   - 4 quick launchpad dispatch action chips.
   - Live activity audit feed showing last tool dispatches with inspect action.
4. Implement `apps/dashboard/src/views/DevicesView.tsx` (Screen 2):
   - Top metrics ribbon (Total, Online, Windows, Linux/macOS).
   - Filter toolbar: Status chips, Platform segmented controls (All, Windows, Ubuntu, macOS), search input.
   - SmartDataTable with 7 columns (Status ping dot, Device identity/UUID/arch, OS release with platform icon, polling cadence/latency, workspace path, assigned models, sticky actions: "Inspect 360", "Dispatch Tool").
   - "Enroll Device" modal with tabbed copyable curl (Linux/macOS) and PowerShell (Windows) one-liners.
5. Implement `apps/dashboard/src/views/Device360View.tsx` (Screen 3):
   - Node selector dropdown.
   - 4 hardware telemetry gauges (CPU per-core breakdown, RAM/Swap used/total, Storage volumes progress bars, live RX/TX network throughput).
   - 4 JXTabs panels:
     * Tab 1: Running Processes (PID, name, CPU %, RAM %, with "Kill Process" confirmation action).
     * Tab 2: Installed Applications (binaries, versions, publisher, launch action).
     * Tab 3: Network Sockets & Ports (TCP/UDP listening ports, states).
     * Tab 4: System Daemons (service daemons with start/stop/restart).
   - Security fingerprint drawer (SHA-256 host fingerprint, mTLS cert expiry countdown, TPM 2.0 PCR status).
6. Compliance constraints:
   - ZERO inline styles (`style={{...}}`).
   - Pure `@jacxishippingorg/jx-ui-react`, `motion/react`, and `lucide-react`.
   - Run verification: `npm --prefix apps/dashboard run build` and `npm --prefix apps/dashboard test`.
7. Write `c:\Users\Administrator\Documents\GitHub\ai-bridge\.agents\teamwork\worker_m2\handoff.md` and send completion message.
