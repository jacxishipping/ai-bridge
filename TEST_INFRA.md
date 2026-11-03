# AI Bridge Enterprise Dashboard — Test Infrastructure & Methodology Specification

**Document Version**: 1.0.0  
**Status**: Authoritative Test Infrastructure Specification  
**Scope**: `apps/dashboard` (Enterprise Autonomous Control Plane)  
**Author**: `teamwork_test_writer` (E2E Testing Track)  
**Target Milestone**: All Milestones (M1 through M6)  
**Date**: 2026-11-02  

---

## 1. Test Philosophy

The AI Bridge Enterprise Dashboard test suite is designed as an **opaque-box, requirement-driven, and specification-anchored testing infrastructure**.

### 1.1 Opaque-Box Principle
- Tests validate observable behavior, interface contracts, DOM output specifications, security guardrails, and architectural invariants without depending on internal implementation quirks.
- Tests do not write facades that artificially pass; if a component or file violates a requirement (e.g. legacy CSS, inline styles, missing icons, unhandled error states), the test explicitly fails and reports the defect for remediation by the implementation track.

### 1.2 Specification Anchoring
Every test case in the suite directly traces to one of the following authoritative project baselines:
1. **`PROJECT.md` Feature Inventory (F1 through F31)**: All 31 core features spanning Authentication, Shell, Fleet Observability, Remote Vision & Interactive Control, Multi-Turn Workflows, Governance & Security, Audit Ledgers, MCP Protocols, and System Diagnostics.
2. **`ORIGINAL_REQUEST.md` Core Requirements (R1 through R5)**:
   - **R1**: Strict Technology Stack & Zero Custom UI Components (`@jacxishippingorg/jx-ui-react`, `motion`, `lucide-react` exclusively; zero custom CSS, zero inline styles, zero custom wrappers).
   - **R2**: Senior Product Design & Anti-AI Aesthetics (no decorative gradients, blobs, emojis, marketing slogans, or oversized cards).
   - **R3**: Content, Typography & Iconography Standards (`JetBrains Mono` for telemetry/hashes/PIDs, `Plus Jakarta Sans` for UI, Lucide icons exclusively).
   - **R4**: Complete Dashboard Reconstruction (all 15 screens resolved with distinct context-appropriate layouts).
   - **R5**: Functional Accuracy, Local State & Purposeful Motion (interactive controls, filters, pagination, hold-to-confirm emergency stop, approvals, tabs, realistic local state store).
3. **`DASHBOARD_DESIGN_SPEC.md`**: Screen schemas, risk taxonomy (Tiers 1–4), and micro-interaction semantics.

---

## 2. 4-Tier Test Case Design Methodology

To ensure exhaustive test depth and defect detection across all 31 features, the test suite implements a structured 4-Tier testing matrix:

```
+-------------------------------------------------------------------------+
| Tier 4: Real-World Application Scenarios (Multi-Screen Workflows)       |
+-------------------------------------------------------------------------+
| Tier 3: Cross-Feature Combinations (Pairwise Component Interactions)    |
+-------------------------------------------------------------------------+
| Tier 2: Boundary & Corner Cases (>= 5 Edge Cases Per Feature)           |
+-------------------------------------------------------------------------+
| Tier 1: Feature Coverage (>= 5 Happy-Path Cases Per Feature)            |
+-------------------------------------------------------------------------+
```

### 2.1 Tier 1: Feature Coverage (>= 5 Tests Per Feature)
- **Minimum Threshold**: $\ge 5$ distinct test cases for every one of the 31 features ($31 \times 5 = 155$ minimum tests).
- **Scope**: Exercises the primary happy-path behavior, default inputs, data rendering, schema conformance, and normal operational state transitions.
- **Verification Focus**: Confirms that every feature renders its essential layout primitives, binds expected props, reflects active state, and completes baseline user interactions.

### 2.2 Tier 2: Boundary & Corner Cases (>= 5 Tests Per Feature)
- **Minimum Threshold**: $\ge 5$ boundary/corner cases for every one of the 31 features ($31 \times 5 = 155$ minimum tests).
- **Scope**:
  1. *Empty / Null / Undefined States*: Zero devices returned, empty task logs, missing screenshot payloads, no active MCP clients.
  2. *Extreme Scale & Truncation*: 10,000 log buffer lines, 40+ concurrent nodes, huge JSON payloads, long command strings.
  3. *Network Latency & Timeout Spikes*: Gateway ping > 500ms, stream disconnection, SLA timer countdown expiration (`00:00`).
  4. *Adversarial Input & Injection*: Malformed JSON arguments, dangerous shell payloads (`rm -rf /`), special ANSI color escape sequences, invalid regex in log filters.
  5. *Accidental / Rapid Invocations*: Rapid double-clicks on killswitches, button debounce checks, spacebar presses inside search input fields vs viewport hotkey triggers.

### 2.3 Tier 3: Cross-Feature Combinations (Pairwise Interactions)
- **Scope**: Tests dynamic interactions where two or more features converge:
  - *Emergency All-Stop (F4) + Task Queue (F9)*: Verifies active tasks transition to cancelled/paused immediately across all nodes.
  - *Device 360 (F8) + Audit Trail (F22)*: Terminating a process creates a cryptographically sequenced block in the audit ledger.
  - *Dual-Control Takeover (F12) + Low-Latency Canvas (F11)*: Activating operator takeover locks agent inputs while maintaining 60 FPS video stream.
  - *AST Diff Inspector (F19) + Human Approvals (F18)*: Approving a Tier-3 command executes the command and clears the urgent badge.
  - *MCP Protocol Gateway (F24) + OAuth Vault (F25)*: Revoking an OAuth bearer immediately tears down active SSE client streams.
  - *Command Palette ⌘K (F3) + Navigation*: Fuzzy query jumps directly to nested tabs in Screen 3 (Device 360) or Screen 11 (Security Policies).

### 2.4 Tier 4: Real-World Application Scenarios (E2E User Workflows)
- **Scope**: End-to-end multi-step operator workflows replicating real enterprise incidents:
  - *Scenario 1: SecOps Incident Response & Emergency Fleet Quarantine*: Operator receives high-risk alert -> inspects AST command diff in Human Approvals -> denies unauthorized payload -> engages Emergency All-Stop -> verifies Merkle ledger hash.
  - *Scenario 2: Device Health Remediation & Process Eviction*: Operator identifies high CPU on node via Device 360 -> filters top processes -> terminates rogue PID with hold-to-confirm -> monitors ring buffer log stream.
  - *Scenario 3: Cross-Platform Machine Enrollment*: Operator opens Enroller modal -> toggles Windows PowerShell script -> copies tokenized command -> simulates agent heartbeat -> verifies node appears in SmartDataTable.
  - *Scenario 4: Autonomous Vision Task Execution & Set-of-Marks Inspection*: Operator dispatches UI automation task -> monitors 4-turn DAG stepper -> inspects SoM visual overlay -> verifies bounding box coordinates.
  - *Scenario 5: Zero-Trust Gateway Rotation & Credential Lifecycle*: Operator logs in via Admin Secret Token -> rotates gateway secret -> generates new OAuth client with DPoP PKCE -> validates MCP JSON-RPC frame.

---

## 3. Requirement Verification Suites (R1 through R5)

In addition to the 4-tier feature matrix, dedicated verification test suites enforce non-negotiable architectural mandates:

| Requirement | Test Suite File | What is Verified |
| :--- | :--- | :--- |
| **R1: Strict Tech Stack & Zero Custom UI** | `r1-tech-stack.test.ts` | 1. Only `@jacxishippingorg/jx-ui-react`, `motion`, `lucide-react`, React in `package.json`.<br>2. Deletion of `fluent2.css` and `jxui.css`.<br>3. Zero inline `style={{ ... }}` attributes across `src/`.<br>4. Elimination of custom wrappers (`ConfirmDialog`, `Pager`, `ViewLoadingSkeleton`).<br>5. No third-party UI libraries (Chakra, MUI, AntD, Tailwind custom classes). |
| **R2 & R3: Anti-AI Aesthetics & Icon Standards** | `r2-r3-anti-ai.test.ts` | 1. Zero purple/pink/blue gradient styles or decorative background blobs.<br>2. Zero emojis in code, table headers, logs, or status tags.<br>3. Removal of Google Fonts `Material Symbols Outlined` from `index.html`.<br>4. Exclusive usage of `lucide-react` icons with uniform 16-20px sizing.<br>5. Monospace font token (`JetBrains Mono`) for all metrics, hashes, PIDs, and code. |
| **R4: Complete Dashboard Reconstruction** | `r4-reconstruction.test.ts` | 1. All 15 operational screens (0–14) defined with distinct, context-specific view layouts.<br>2. Route / view ID resolution for every screen.<br>3. Presence of designated header ribbons, data tables, metrics bentos, and modal dialogs.<br>4. Navigation contracts between SidebarNav, TopHeader, and root router. |
| **R5: Functional Accuracy & State Store** | `r5-functional-state.test.ts` | 1. Centralized local state store (`dashboardStore.ts`) providing 40 enrolled devices, tasks, approvals, audit logs, and system metrics.<br>2. Interactive filter, sorting, and pagination logic.<br>3. Hold-to-confirm button interaction patterns.<br>4. Synchronous and asynchronous state dispatch transitions. |

---

## 4. Feature Inventory Mapping (F1 through F31)

| Feature ID | Feature Name | Tier 1 Tests | Tier 2 Tests | Tier 3 Pairings | Tier 4 Scenarios |
| :---: | :--- | :---: | :---: | :---: | :---: |
| **F1** | Zero-Trust Dual-Auth Console | 5 | 5 | F1+F2 | Scenario 5 |
| **F2** | mTLS Control Plane Status Bar | 5 | 5 | F2+F4 | Scenario 1 |
| **F3** | Global Command Palette (⌘K) | 5 | 5 | F3+F5, F3+F7 | Scenario 2 |
| **F4** | Emergency All-Stop Killswitch | 5 | 5 | F4+F9, F4+F14 | Scenario 1 |
| **F5** | SmartDataTable Device Inventory | 5 | 5 | F5+F6, F5+F7 | Scenario 3 |
| **F6** | Cross-Platform Agent Enroller | 5 | 5 | F6+F5 | Scenario 3 |
| **F7** | Device 360 Hardware Gauges | 5 | 5 | F7+F8 | Scenario 2 |
| **F8** | Process Manager with Termination | 5 | 5 | F8+F22 | Scenario 2 |
| **F9** | Tool Dispatch Studio | 5 | 5 | F9+F10, F9+F4 | Scenario 4 |
| **F10** | Set-of-Marks (SoM) Visual Inspector | 5 | 5 | F10+F9 | Scenario 4 |
| **F11** | Low-Latency Desktop Stream Canvas | 5 | 5 | F11+F12 | Scenario 4 |
| **F12** | Dual-Control Operator Takeover | 5 | 5 | F12+F11 | Scenario 4 |
| **F13** | ANSI Monospace PTY Studio | 5 | 5 | F13+F22 | Scenario 1 |
| **F14** | Multi-Turn DAG Pipeline Stepper | 5 | 5 | F14+F10 | Scenario 4 |
| **F15** | Multi-Node Command Bus | 5 | 5 | F15+F22 | Scenario 1 |
| **F16** | Reactive Self-Healing Rule Cards | 5 | 5 | F16+F8 | Scenario 2 |
| **F17** | Multi-Provider Agent Hub | 5 | 5 | F17+F9 | Scenario 5 |
| **F18** | Human-in-the-Loop Approval Modal | 5 | 5 | F18+F19, F18+F4 | Scenario 1 |
| **F19** | AST Command Diff Inspector | 5 | 5 | F19+F18 | Scenario 1 |
| **F20** | Executable Allowlist Matrix | 5 | 5 | F20+F18 | Scenario 1 |
| **F21** | Webhook Dispatcher Suite | 5 | 5 | F21+F18 | Scenario 1 |
| **F22** | Merkle Root Integrity Ledger | 5 | 5 | F22+F23, F22+F8 | Scenario 1, 5 |
| **F23** | Multi-Format Audit Exporter | 5 | 5 | F23+F22 | Scenario 5 |
| **F24** | MCP Protocol Gateway Monitor | 5 | 5 | F24+F26, F24+F25 | Scenario 5 |
| **F25** | OAuth 2.0 Credential Vault | 5 | 5 | F25+F24 | Scenario 5 |
| **F26** | Wire Protocol Realtime Audit Drawer | 5 | 5 | F26+F24 | Scenario 5 |
| **F27** | Monospace Systemd Log Canvas | 5 | 5 | F27+F28, F27+F29 | Scenario 2 |
| **F28** | Structured JSON Log Inspector | 5 | 5 | F28+F27 | Scenario 2 |
| **F29** | Stream Pause Hotkey (Spacebar) | 5 | 5 | F29+F27 | Scenario 2 |
| **F30** | Zero-Drop Ring Buffer Meter | 5 | 5 | F30+F27 | Scenario 2 |
| **F31** | Legacy CSS & Wrapper Elimination | 5 | 5 | F31+R1 | Scenario 1–5 |
| **TOTAL** | **31 Features** | **155** | **155** | **15+** | **10+** |

**Grand Total**: $\ge 350$ automated test cases.

---

## 5. Test Runner Architecture & Execution

### 5.1 Technology Selection
- **Runner**: `tsx` (TypeScript Execute Engine) executing standalone TypeScript test modules via Node 26.
- **Assertion Engine**: Native `node:assert/strict` paired with our custom typed test harness `apps/dashboard/src/tests/harness.ts`.
- **Zero Heavyweight Conflicts**: Bypasses Vitest/Vite peer dependency lockouts while providing instant execution, colored ANSI diffs, tier aggregation, and exit code propagation.

### 5.2 Directory Structure
```
apps/dashboard/src/tests/
├── harness.ts                      # Custom BDD-style test framework & assertions
├── run-all-tests.ts                # Master runner aggregating all test suites
├── r1-tech-stack.test.ts           # R1 compliance suite
├── r2-r3-anti-ai.test.ts           # R2 & R3 design & icon standards suite
├── r4-reconstruction.test.ts       # R4 15-screen reconstruction suite
├── r5-functional-state.test.ts     # R5 local state store & interaction suite
├── tier1-feature-coverage.test.ts  # Tier 1: F1-F31 (155 tests)
├── tier2-boundary-corner.test.ts   # Tier 2: F1-F31 (155 tests)
├── tier3-combinations.test.ts      # Tier 3: Cross-feature pairwise tests
└── tier4-scenarios.test.ts         # Tier 4: Real-world operator workflows
```

### 5.3 Execution Commands

**Execute Entire Test Suite**:
```bash
# From workspace root
npm --prefix apps/dashboard test

# Or from inside apps/dashboard
cd apps/dashboard
npm test
```

**Execute Specific Suites with `tsx`**:
```bash
# Run R1-R5 Requirement Suites
npx tsx src/tests/r1-tech-stack.test.ts
npx tsx src/tests/r2-r3-anti-ai.test.ts
npx tsx src/tests/r4-reconstruction.test.ts
npx tsx src/tests/r5-functional-state.test.ts

# Run Tiered Suites
npx tsx src/tests/tier1-feature-coverage.test.ts
npx tsx src/tests/tier2-boundary-corner.test.ts
npx tsx src/tests/tier3-combinations.test.ts
npx tsx src/tests/tier4-scenarios.test.ts
```

---

## 6. Defect Escalation & Reporting Protocol

When a test identifies an architectural violation or implementation failure:
1. **Opaque Reporting**: The test runner prints the exact file path, offending line, rule violated, and expected vs received values.
2. **No Facades**: The test writer **must never** modify production application code to force a test to pass.
3. **Escalation Log**: Failures are formally compiled into `TEST_READY.md` under the *Discovered Defect Escalation Report* for immediate resolution by the implementing milestone workers (`worker_m1`, `worker_m2`, etc.).
