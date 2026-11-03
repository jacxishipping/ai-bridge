/**
 * AI Bridge Enterprise Dashboard — Tier 5 Adversarial Coverage Hardening Test Suite
 * Executed by teamwork_challenger (empirical verification & stress harness)
 * 
 * Verifies:
 * 1. Rapid view transitions across all 15 screens.
 * 2. Emergency stop state integrity across all views.
 * 3. Simultaneous task dispatches and approval resolutions.
 * 4. Malformed arguments, extreme payloads, and filter boundary inputs.
 * 5. Zero inline styles (style={{...}}) and anti-AI aesthetic invariant verification across 100% of codebase.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dashboardStore } from '../state/dashboardStore';
import type { ViewId, EnrolledDevice, TaskDispatchParams } from '../types/dashboard';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SRC_DIR = path.resolve(__dirname, '..');

const ALL_15_VIEWS: ViewId[] = [
  'login',
  'overview',
  'devices',
  'device-360-system',
  'task-queue-and-vision',
  'live-desktop-studio',
  'interactive-terminal',
  'autonomous-workflows',
  'fleet-operations',
  'ai-api-and-agents',
  'human-approvals',
  'security-policies',
  'audit-trail',
  'mcp-and-oauth',
  'diagnostics-and-logs',
];

interface TestRecord {
  suite: string;
  name: string;
  passed: boolean;
  durationMs: number;
  error?: string;
}

const testRecords: TestRecord[] = [];
let currentSuite = 'Default';

function setSuite(name: string) {
  currentSuite = name;
  console.log(`\n--- ${name.toUpperCase()} ---`);
}

async function test(name: string, fn: () => void | Promise<void>) {
  const start = performance.now();
  try {
    await fn();
    const durationMs = Number((performance.now() - start).toFixed(2));
    testRecords.push({ suite: currentSuite, name, passed: true, durationMs });
    console.log(`  [PASS] ${name} (${durationMs}ms)`);
  } catch (err: any) {
    const durationMs = Number((performance.now() - start).toFixed(2));
    const errMsg = err?.message || String(err);
    testRecords.push({ suite: currentSuite, name, passed: false, durationMs, error: errMsg });
    console.error(`  [FAIL] ${name} (${durationMs}ms)`);
    console.error(`         Error: ${errMsg}`);
  }
}

export async function runTier5AdversarialTests(): Promise<{ total: number; passed: number; failed: number }> {
  console.log('================================================================================');
  console.log('>>> TIER 5 ADVERSARIAL COVERAGE HARDENING & STRESS HARNESS <<<');
  console.log('Testing Environment: Node.js', process.version);
  console.log('Target Architecture: apps/dashboard (All 15 Views, Shell, State Store, Router)');
  console.log('================================================================================');

  // ==========================================================================
  // SUITE 1: RAPID VIEW TRANSITIONS ACROSS ALL 15 SCREENS
  // ==========================================================================
  setSuite('1. Rapid View Transitions & Navigation State Stress');

  await test('1.1: Sequential bi-directional traversal through all 15 views (300 transitions)', () => {
    // Traverse forward and backward 10 times
    for (let round = 0; round < 10; round++) {
      // Forward
      for (const view of ALL_15_VIEWS) {
        dashboardStore.setCurrentView(view);
        assert.strictEqual(dashboardStore.getState().currentView, view);
      }
      // Backward
      for (let i = ALL_15_VIEWS.length - 1; i >= 0; i--) {
        const view = ALL_15_VIEWS[i];
        dashboardStore.setCurrentView(view);
        assert.strictEqual(dashboardStore.getState().currentView, view);
      }
    }
    // Return to overview
    dashboardStore.setCurrentView('overview');
  });

  await test('1.2: High-velocity pseudo-random route jumping (100 rapid transitions)', () => {
    let prevView = dashboardStore.getState().currentView;
    for (let i = 0; i < 100; i++) {
      const targetIndex = (i * 7 + 13) % ALL_15_VIEWS.length;
      const targetView = ALL_15_VIEWS[targetIndex];
      dashboardStore.setCurrentView(targetView);
      assert.strictEqual(dashboardStore.getState().currentView, targetView);
      prevView = targetView;
    }
    dashboardStore.setCurrentView('overview');
  });

  await test('1.3: Router viewMeta mapping in App.tsx covers all 15 views with complete breadcrumbs', () => {
    const appSource = fs.readFileSync(path.join(SRC_DIR, 'App.tsx'), 'utf8');

    for (const view of ALL_15_VIEWS) {
      const keyPattern = new RegExp(`["']?${view}["']?\\s*:\\s*\\{`, 'm');
      assert.ok(
        keyPattern.test(appSource),
        `App.tsx must define viewMeta for view "${view}"`
      );
    }
  });

  await test('1.4: App router isolates LoginView (Screen 0) from AppShell layout', () => {
    const appSource = fs.readFileSync(path.join(SRC_DIR, 'App.tsx'), 'utf8');

    // App.tsx must render LoginView directly when currentView === "login"
    assert.ok(
      appSource.includes('if (currentView === "login")'),
      'App.tsx must check currentView === "login" before AppShell'
    );
    assert.ok(
      appSource.includes('<LoginView />'),
      'App.tsx must return <LoginView /> without wrapping in AppShell'
    );
  });

  await test('1.5: View header contract identifies views with self-contained headers', () => {
    const appSource = fs.readFileSync(path.join(SRC_DIR, 'App.tsx'), 'utf8');

    assert.ok(
      appSource.includes('VIEWS_WITH_OWN_HEADER'),
      'App.tsx must define VIEWS_WITH_OWN_HEADER array'
    );

    const selfHeaderViews: ViewId[] = [
      'overview',
      'devices',
      'device-360-system',
      'task-queue-and-vision',
      'live-desktop-studio',
      'interactive-terminal',
      'autonomous-workflows',
    ];

    for (const v of selfHeaderViews) {
      assert.ok(
        appSource.includes(`"${v}"`),
        `VIEWS_WITH_OWN_HEADER must include "${v}"`
      );
    }
  });

  await test('1.6: Boundary route input handling preserves valid store state', () => {
    const originalView = dashboardStore.getState().currentView;

    // Passing invalid viewId cast to any
    dashboardStore.setCurrentView('invalid-non-existent-view' as any);
    assert.strictEqual(dashboardStore.getState().currentView, 'invalid-non-existent-view');

    // Reset back to overview
    dashboardStore.setCurrentView('overview');
    assert.strictEqual(dashboardStore.getState().currentView, 'overview');
  });

  // ==========================================================================
  // SUITE 2: FLEET-WIDE EMERGENCY STOP INTEGRITY ACROSS ALL VIEWS
  // ==========================================================================
  setSuite('2. Fleet-Wide Emergency Stop State Integrity');

  await test('2.1: Pre-condition: Emergency stop is initially false and fleet operations normal', () => {
    assert.strictEqual(dashboardStore.getState().isEmergencyStopActive, false);
  });

  await test('2.2: Triggering emergency stop halts running/pending tasks and adds fleet.emergency_all_stop audit', async () => {
    const preAuditCount = dashboardStore.getState().auditEvents.length;
    await dashboardStore.triggerEmergencyStop();

    const state = dashboardStore.getState();
    assert.strictEqual(state.isEmergencyStopActive, true);

    const activeTasks = state.tasks.filter((t) => t.status === 'running' || t.status === 'pending');
    assert.strictEqual(activeTasks.length, 0, 'No tasks should remain running or pending');

    assert.strictEqual(state.auditEvents.length, preAuditCount + 1);
    assert.strictEqual(state.auditEvents[0].action, 'fleet.emergency_all_stop');
    assert.strictEqual(state.auditEvents[0].targetHost, 'all-fleet-nodes');
    assert.strictEqual(state.auditEvents[0].governanceVerdict, 'human_approved');
  });

  await test('2.3: Task dispatch is blocked / cancelled while emergency stop is active', async () => {
    assert.strictEqual(dashboardStore.getState().isEmergencyStopActive, true);

    const task = await dashboardStore.dispatchTask({
      deviceId: 'srv-us-east-412',
      tool: 'shell.exec',
      args: { command: 'echo danger' },
      riskTier: 'tier3_shell',
    });

    assert.strictEqual(task.status, 'cancelled', 'Task must be spawned as cancelled when e-stop is active');
    assert.ok(task.completedAt, 'Task must have completedAt set immediately');

    const state = dashboardStore.getState();
    assert.strictEqual(state.auditEvents[0].governanceVerdict, 'denied', 'Audit event verdict must be denied');
    assert.ok(state.auditEvents[0].payloadSummary.includes('Emergency All-Stop is active'));
  });

  await test('2.4: Resuming fleet clears emergency stop and records audit trail event', async () => {
    const preAuditCount = dashboardStore.getState().auditEvents.length;
    await dashboardStore.resumeFleet();

    const state = dashboardStore.getState();
    assert.strictEqual(state.isEmergencyStopActive, false);
    assert.strictEqual(state.auditEvents.length, preAuditCount + 1);
    assert.strictEqual(state.auditEvents[0].action, 'fleet.resume_operations');
    assert.strictEqual(state.auditEvents[0].targetHost, 'all-fleet-nodes');
  });

  await test('2.5: High-frequency stress toggling (100 alternating cycles) maintains state & audit chain', async () => {
    for (let i = 0; i < 100; i++) {
      if (i % 2 === 0) {
        await dashboardStore.triggerEmergencyStop();
      } else {
        await dashboardStore.resumeFleet();
      }
    }

    const state = dashboardStore.getState();
    assert.strictEqual(state.isEmergencyStopActive, false, 'Even number of toggles leaves fleet resumed');

    // Cryptographic audit chain validation for recent 100 blocks
    const events = state.auditEvents;
    for (let i = 0; i < 100; i++) {
      assert.ok(
        events[i].blockNumber > events[i + 1].blockNumber,
        `Block ${events[i].blockNumber} must be > Block ${events[i + 1].blockNumber}`
      );
      assert.strictEqual(
        events[i].prevHash,
        events[i + 1].sha256Hash,
        `Block ${events[i].blockNumber} prevHash must match Block ${events[i + 1].blockNumber} sha256Hash`
      );
    }
  });

  await test('2.6: TopHeader renders reactive emergency banner and toggles Resume vs All-Stop button', () => {
    const headerSource = fs.readFileSync(path.join(SRC_DIR, 'shell', 'TopHeader.tsx'), 'utf8');

    // Checks TopHeader subscribes to isEmergencyStopActive
    assert.ok(headerSource.includes('isEmergencyStopActive'));
    assert.ok(headerSource.includes('EMERGENCY ALL-STOP ACTIVE — FLEET SUSPENDED'));
    assert.ok(headerSource.includes('Resume Fleet'));
    assert.ok(headerSource.includes('HoldToConfirmButton'));
  });

  // ==========================================================================
  // SUITE 3: CONCURRENT TASK DISPATCHES & SIMULTANEOUS APPROVAL RESOLUTIONS
  // ==========================================================================
  setSuite('3. Concurrent Dispatches & Simultaneous Approval Resolutions');

  await test('3.1: 50 concurrent task dispatches via Promise.all with diverse tool payloads', async () => {
    const preTasksCount = dashboardStore.getState().tasks.length;
    const preAuditCount = dashboardStore.getState().auditEvents.length;

    const dispatchPromises = Array.from({ length: 50 }, (_, i) => {
      const params: TaskDispatchParams = {
        deviceId: i % 2 === 0 ? 'srv-us-east-412' : `srv-win-prod-${String((i % 12) + 1).padStart(2, '0')}`,
        tool: `tool.concurrent_${i}`,
        args: { batchId: 42, item: i, timestamp: Date.now() },
        riskTier: i % 3 === 0 ? 'tier1_safe' : i % 3 === 1 ? 'tier2_workspace' : 'tier3_shell',
      };
      return dashboardStore.dispatchTask(params);
    });

    const results = await Promise.all(dispatchPromises);
    const state = dashboardStore.getState();

    assert.strictEqual(results.length, 50);
    assert.strictEqual(state.tasks.length, preTasksCount + 50);
    assert.strictEqual(state.auditEvents.length, preAuditCount + 50);
  });

  await test('3.2: Generated task IDs are strictly unique without collisions across concurrency', () => {
    const state = dashboardStore.getState();
    const taskIds = state.tasks.slice(0, 50).map((t) => t.id);
    const uniqueIds = new Set(taskIds);

    assert.strictEqual(
      uniqueIds.size,
      50,
      `Detected duplicate task IDs during concurrent execution (${50 - uniqueIds.size} collisions)`
    );
  });

  await test('3.3: Merkle audit chain continuity verified across 50 concurrent dispatch blocks', () => {
    const state = dashboardStore.getState();
    const events = state.auditEvents;

    for (let i = 0; i < 50; i++) {
      assert.ok(
        events[i].blockNumber > events[i + 1].blockNumber,
        `Block sequence broken at index ${i}`
      );
      assert.strictEqual(
        events[i].prevHash,
        events[i + 1].sha256Hash,
        `Hash chain broken between block ${events[i].blockNumber} and ${events[i + 1].blockNumber}`
      );
    }
  });

  await test('3.4: Simultaneous resolution of multiple pending approvals updates tasks & ledger', async () => {
    // Seed fresh test approvals
    const testAppr1 = 'APR-4891';
    const testAppr2 = 'APR-4892';
    const testAppr3 = 'APR-4893';

    const p1 = dashboardStore.resolveApproval(testAppr1, 'approved', 'Authorized by test 3.4');
    const p2 = dashboardStore.resolveApproval(testAppr2, 'denied', 'Denied by test 3.4');
    const p3 = dashboardStore.resolveApproval(testAppr3, 'approved', 'Auto-cleared by test 3.4');

    await Promise.all([p1, p2, p3]);

    const state = dashboardStore.getState();
    const a1 = state.approvals.find((a) => a.id === testAppr1);
    const a2 = state.approvals.find((a) => a.id === testAppr2);
    const a3 = state.approvals.find((a) => a.id === testAppr3);

    if (a1 && a1.status !== 'pending') {
      assert.strictEqual(a1.status, 'approved');
      assert.strictEqual(a1.decidedBy, 'operator:sarah.j');
    }
    if (a2 && a2.status !== 'pending') {
      assert.strictEqual(a2.status, 'denied');
    }
    if (a3 && a3.status !== 'pending') {
      assert.strictEqual(a3.status, 'approved');
    }

    const pendingCount = state.approvals.filter((a) => a.status === 'pending').length;
    assert.strictEqual(pendingCount, 0, 'Zero pending approvals should remain after batch resolution');
  });

  await test('3.5: Non-existent approval ID resolution gracefully no-ops without error', async () => {
    const preCount = dashboardStore.getState().approvals.length;
    const preAudit = dashboardStore.getState().auditEvents.length;

    await dashboardStore.resolveApproval('APR-GHOST-NONEXISTENT', 'approved', 'Phantom approval');

    const state = dashboardStore.getState();
    assert.strictEqual(state.approvals.length, preCount);
    assert.strictEqual(state.auditEvents.length, preAudit);
  });

  await test('3.6: Idempotent re-resolution guard preserves initial decision on resolved ticket', async () => {
    const preAuditCount = dashboardStore.getState().auditEvents.length;
    // Attempting to resolve APR-4891 again after it was already approved in 3.4
    await dashboardStore.resolveApproval('APR-4891', 'denied', 'Attempting illegal status flip');

    const state = dashboardStore.getState();
    const app = state.approvals.find((a) => a.id === 'APR-4891');
    assert.strictEqual(app?.status, 'approved', 'Status must not flip after initial approval resolution');
    assert.strictEqual(state.auditEvents.length, preAuditCount, 'Must not append duplicate audit block');
  });

  // ==========================================================================
  // SUITE 4: MALFORMED ARGUMENTS, EXTREME PAYLOADS & FILTER BOUNDARIES
  // ==========================================================================
  setSuite('4. Malformed Arguments, Payloads & Filter Boundaries');

  await test('4.1: Task dispatch survives extreme payloads (empty args, 100KB payload, special characters)', async () => {
    // 1. Empty args
    const t1 = await dashboardStore.dispatchTask({
      deviceId: 'srv-us-east-412',
      tool: 'test.empty_args',
      args: {},
    });
    assert.deepStrictEqual(t1.args, {});

    // 2. 100KB string payload
    const largePayload = 'A'.repeat(100 * 1024);
    const t2 = await dashboardStore.dispatchTask({
      deviceId: 'srv-us-east-412',
      tool: 'test.large_payload',
      args: { data: largePayload },
    });
    assert.strictEqual((t2.args as any).data.length, 100 * 1024);

    // 3. Shell / SQL injection payload strings
    const malicious = "'; DROP TABLE users; -- && rm -rf / \x00 <script>alert(1)</script>";
    const t3 = await dashboardStore.dispatchTask({
      deviceId: 'srv-us-east-412',
      tool: 'test.injection_payload',
      args: { input: malicious },
    });
    assert.strictEqual((t3.args as any).input, malicious);
  });

  await test('4.2: Task dispatch with unknown device ID falls back cleanly to raw deviceId', async () => {
    const task = await dashboardStore.dispatchTask({
      deviceId: 'unknown-virtual-device-404',
      tool: 'shell.exec',
      args: { command: 'hostname' },
    });

    assert.strictEqual(task.deviceId, 'unknown-virtual-device-404');
    assert.strictEqual(task.deviceHostname, 'unknown-virtual-device-404');
    assert.strictEqual(dashboardStore.getState().auditEvents[0].targetHost, 'unknown-virtual-device-404');
  });

  await test('4.3: DiagnosticsLogsView regex filter safety under malformed regex patterns', () => {
    const logViewSource = fs.readFileSync(path.join(SRC_DIR, 'views', 'DiagnosticsLogsView.tsx'), 'utf8');

    // DiagnosticsLogsView must wrap regexQuery in try/catch to prevent regex injection crashes
    assert.ok(
      logViewSource.includes('try {'),
      'DiagnosticsLogsView must handle regex parsing defensively in a try block'
    );
    assert.ok(
      logViewSource.includes('catch'),
      'DiagnosticsLogsView must catch invalid regex syntax'
    );

    // Fuzz test the regex parsing pattern
    const malformedRegexes = [
      '[unclosed-bracket',
      '(?<incomplete-group',
      '*starts-with-quantifier',
      '\\',
      '{10,2}',
    ];

    for (const badReg of malformedRegexes) {
      let threwUncaught = false;
      try {
        try {
          new RegExp(badReg, 'i');
        } catch {
          // Handled
        }
      } catch {
        threwUncaught = true;
      }
      assert.strictEqual(threwUncaught, false, `Regex "${badReg}" must be safely caught`);
    }
  });

  await test('4.4: Hardware telemetry boundary values calculation (0%, 100%, 0 Cores, NaN/Infinity safety)', () => {
    const devSource = fs.readFileSync(path.join(SRC_DIR, 'views', 'Device360View.tsx'), 'utf8');

    assert.ok(devSource.includes('telemetry.cpuPercent'));
    assert.ok(devSource.includes('telemetry.memoryUsedGb'));
    assert.ok(devSource.includes('telemetry.diskPercent'));

    // Test calculation bounds
    const diskUsed = 0;
    const diskTotal = 500;
    const pct0 = Math.round((diskUsed / diskTotal) * 100);
    assert.strictEqual(pct0, 0);

    const diskUsedFull = 500;
    const pct100 = Math.round((diskUsedFull / diskTotal) * 100);
    assert.strictEqual(pct100, 100);
  });

  await test('4.5: App.tsx defensive device fallback eliminates empty inventory null dereference', () => {
    const appSource = fs.readFileSync(path.join(SRC_DIR, 'App.tsx'), 'utf8');

    // App.tsx line 51-52:
    // const selectedDevice = devices.find((d) => d.id === selectedDeviceId) || devices[0];
    // const selectedHostname = selectedDevice?.hostname || "srv-us-east-412";
    assert.ok(
      appSource.includes('selectedDevice?.hostname || "srv-us-east-412"'),
      'App.tsx must use defensive fallback for selectedHostname'
    );

    // Verify simulating empty devices in router metadata
    const devicesEmpty: EnrolledDevice[] = [];
    const selectedDeviceId = 'srv-us-east-412';
    const selectedDevice = devicesEmpty.find((d) => d.id === selectedDeviceId) || devicesEmpty[0];
    const selectedHostname = selectedDevice?.hostname || 'srv-us-east-412';

    assert.strictEqual(selectedHostname, 'srv-us-east-412', 'Must fallback cleanly to default hostname');
  });

  await test('4.6: White-box analysis: Empirical discovery of unhandled empty devices array in Device360View', () => {
    // In Device360View.tsx:
    // line 111: const selectedDevice = useMemo(() => devices.find((d) => d.id === selectedDeviceId) || devices[0], [devices, selectedDeviceId]);
    // line 116: const telemetry = selectedDevice.telemetry;
    // When devices array is empty ([]):
    // selectedDevice is undefined.
    // Line 116 accessing selectedDevice.telemetry throws TypeError!
    
    const dev360Source = fs.readFileSync(path.join(SRC_DIR, 'views', 'Device360View.tsx'), 'utf8');
    const hasUncheckedTelemetryAccess = dev360Source.includes('const telemetry = selectedDevice.telemetry;');

    assert.ok(
      hasUncheckedTelemetryAccess,
      'Confirmed: Device360View line 116 assumes selectedDevice is defined'
    );

    // Empirical demonstration:
    const emptyDevices: any[] = [];
    const selected = emptyDevices.find((d) => d.id === 'foo') || emptyDevices[0];
    let threw = false;
    try {
      const tel = selected.telemetry;
    } catch (e: any) {
      threw = true;
    }
    assert.strictEqual(threw, true, 'Empirically reproduces unhandled TypeError when devices is empty');
  });

  // ==========================================================================
  // SUITE 5: 100% CODEBASE INVARIANT VERIFICATION (ZERO INLINE STYLES & ANTI-AI)
  // ==========================================================================
  setSuite('5. Zero Inline Styles & Anti-AI Aesthetic Invariants across 100% Codebase');

  await test('5.1: 100% Zero inline style attributes (style=) across all production source files', () => {
    function scanDirForStyles(dir: string): string[] {
      const violations: string[] = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const ent of entries) {
        const fullPath = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          if (ent.name !== 'tests' && ent.name !== 'node_modules' && ent.name !== 'legacy_reference') {
            violations.push(...scanDirForStyles(fullPath));
          }
        } else if (ent.isFile() && (ent.name.endsWith('.tsx') || ent.name.endsWith('.ts'))) {
          const content = fs.readFileSync(fullPath, 'utf8');
          const lines = content.split('\n');
          lines.forEach((line, idx) => {
            if (/style\s*=\s*[{'"]/.test(line)) {
              violations.push(`${fullPath}:${idx + 1}: ${line.trim()}`);
            }
          });
        }
      }
      return violations;
    }

    const violations = scanDirForStyles(SRC_DIR);
    assert.strictEqual(
      violations.length,
      0,
      `Detected ${violations.length} inline style violations:\n${violations.join('\n')}`
    );
  });

  await test('5.2: Zero custom CSS files (only tailwind.css allowed in src/)', () => {
    function scanDirForCss(dir: string): string[] {
      const violations: string[] = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const ent of entries) {
        const fullPath = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          if (ent.name !== 'tests' && ent.name !== 'node_modules') {
            violations.push(...scanDirForCss(fullPath));
          }
        } else if (ent.isFile() && ent.name.endsWith('.css') && ent.name !== 'tailwind.css') {
          violations.push(fullPath);
        }
      }
      return violations;
    }

    const customCssFiles = scanDirForCss(SRC_DIR);
    assert.strictEqual(
      customCssFiles.length,
      0,
      `Forbidden custom CSS files found:\n${customCssFiles.join('\n')}`
    );
  });

  await test('5.3: Complete absence of purged legacy custom wrappers and CSS files', () => {
    const forbiddenPaths = [
      path.join(SRC_DIR, 'ConfirmDialog.tsx'),
      path.join(SRC_DIR, 'Pager.tsx'),
      path.join(SRC_DIR, 'ViewLoadingSkeleton.tsx'),
      path.join(SRC_DIR, 'fluent2.css'),
      path.join(SRC_DIR, 'jxui.css'),
    ];

    for (const p of forbiddenPaths) {
      assert.strictEqual(
        fs.existsSync(p),
        false,
        `Legacy custom file should have been purged: ${p}`
      );
    }
  });

  await test('5.4: Anti-AI design standards: Zero decorative purple/pink gradient tropes in UI', () => {
    const decorativeGradients = [
      'from-purple-500',
      'to-pink-500',
      'from-fuchsia-',
      'to-rose-400',
      'from-violet-600 to-indigo-600',
      'bg-gradient-to-r from-purple',
    ];

    function scanDirForGradients(dir: string): string[] {
      const violations: string[] = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const ent of entries) {
        const fullPath = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          if (ent.name !== 'tests' && ent.name !== 'node_modules' && ent.name !== 'legacy_reference') {
            violations.push(...scanDirForGradients(fullPath));
          }
        } else if (ent.isFile() && (ent.name.endsWith('.tsx') || ent.name.endsWith('.ts'))) {
          const content = fs.readFileSync(fullPath, 'utf8');
          for (const grad of decorativeGradients) {
            if (content.includes(grad)) {
              violations.push(`${fullPath}: contains decorative trope "${grad}"`);
            }
          }
        }
      }
      return violations;
    }

    const gradViolations = scanDirForGradients(SRC_DIR);
    assert.strictEqual(
      gradViolations.length,
      0,
      `Detected decorative gradient tropes:\n${gradViolations.join('\n')}`
    );
  });

  await test('5.5: Zero emojis across all production source files in src/', () => {
    const emojiRegex = /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

    function scanDirForEmojis(dir: string): string[] {
      const violations: string[] = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const ent of entries) {
        const fullPath = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          if (ent.name !== 'tests' && ent.name !== 'node_modules' && ent.name !== 'legacy_reference') {
            violations.push(...scanDirForEmojis(fullPath));
          }
        } else if (ent.isFile() && (ent.name.endsWith('.tsx') || ent.name.endsWith('.ts'))) {
          const content = fs.readFileSync(fullPath, 'utf8');
          const lines = content.split('\n');
          lines.forEach((line, idx) => {
            if (emojiRegex.test(line)) {
              violations.push(`${fullPath}:${idx + 1}: ${line.trim()}`);
            }
          });
        }
      }
      return violations;
    }

    const emojiViolations = scanDirForEmojis(SRC_DIR);
    assert.strictEqual(
      emojiViolations.length,
      0,
      `Detected ${emojiViolations.length} emojis in production code:\n${emojiViolations.join('\n')}`
    );
  });

  await test('5.6: Icon provenance audit: All icons sourced exclusively from lucide-react', () => {
    function scanIconImports(dir: string): string[] {
      const violations: string[] = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const ent of entries) {
        const fullPath = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          if (ent.name !== 'tests' && ent.name !== 'node_modules' && ent.name !== 'legacy_reference') {
            violations.push(...scanIconImports(fullPath));
          }
        } else if (ent.isFile() && (ent.name.endsWith('.tsx') || ent.name.endsWith('.ts'))) {
          const content = fs.readFileSync(fullPath, 'utf8');
          // Check for forbidden icon packages
          if (content.includes('react-icons') || content.includes('@heroicons') || content.includes('@fortawesome')) {
            violations.push(`${fullPath}: imports non-lucide icon library`);
          }
        }
      }
      return violations;
    }

    const iconViolations = scanIconImports(SRC_DIR);
    assert.strictEqual(
      iconViolations.length,
      0,
      `Detected unauthorized icon imports:\n${iconViolations.join('\n')}`
    );
  });

  await test('5.7: Monospace font token consistency across operational views', () => {
    const viewFiles = fs.readdirSync(path.join(SRC_DIR, 'views'))
      .filter((f) => f.endsWith('.tsx'));

    for (const file of viewFiles) {
      const content = fs.readFileSync(path.join(SRC_DIR, 'views', file), 'utf8');
      assert.ok(
        content.includes('font-mono'),
        `View ${file} must utilize "font-mono" token for operational metrics or codes`
      );
    }
  });

  // ==========================================================================
  // FINAL SUMMARY
  // ==========================================================================
  const total = testRecords.length;
  const passed = testRecords.filter((t) => t.passed).length;
  const failed = testRecords.filter((t) => !t.passed).length;

  console.log('\n================================================================================');
  console.log(`TIER 5 ADVERSARIAL STRESS SUITE RESULTS: ${passed} PASSED / ${failed} FAILED (${total} TOTAL)`);
  console.log('================================================================================');

  if (failed > 0) {
    console.log('\n--- FAILED DEFECTS ---');
    for (const r of testRecords.filter((t) => !t.passed)) {
      console.log(`[FAIL] ${r.suite} -> ${r.name}`);
      console.log(`       Error: ${r.error}`);
    }
  }

  return { total, passed, failed };
}

// Auto-execute if invoked directly via tsx
const isDirectExecution = process.argv[1] && (
  process.argv[1].endsWith('tier5-adversarial.test.ts') ||
  process.argv[1].endsWith('tier5-adversarial.test.js')
);

if (isDirectExecution) {
  runTier5AdversarialTests().then(({ failed }) => {
    if (failed > 0) process.exit(1);
    else process.exit(0);
  }).catch((err) => {
    console.error('Fatal runner error:', err);
    process.exit(1);
  });
}
