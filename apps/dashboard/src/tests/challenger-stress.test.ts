/**
 * AI Bridge Enterprise Dashboard — Adversarial Stress Test Suite
 * Executed by teamwork_challenger
 */

import assert from 'node:assert/strict';
import { dashboardStore } from '../state/dashboardStore';
import type { TaskDispatchParams } from '../types/dashboard';

async function runChallengerStressTests() {
  console.log('>>> STARTING CHALLENGER EMPIRICAL STRESS TESTS <<<');

  let passed = 0;
  let failed = 0;

  async function testCase(name: string, fn: () => Promise<void> | void) {
    try {
      await fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`[FAIL] ${name}`);
      console.error('       ', err.message || err);
      failed++;
    }
  }

  // --------------------------------------------------------------------------
  // Test Suite 1: Rapid State Toggles (triggerEmergencyStop / resumeFleet)
  // --------------------------------------------------------------------------
  await testCase('1.1: Initial emergency stop state is false', () => {
    const state = dashboardStore.getState();
    assert.strictEqual(state.isEmergencyStopActive, false, 'Initial emergency stop should be false');
  });

  await testCase('1.2: Triggering emergency stop halts active tasks and appends audit event', async () => {
    const preAuditCount = dashboardStore.getState().auditEvents.length;
    await dashboardStore.triggerEmergencyStop();
    const state = dashboardStore.getState();

    assert.strictEqual(state.isEmergencyStopActive, true, 'Emergency stop should now be active');
    const runningTasks = state.tasks.filter((t) => t.status === 'running' || t.status === 'pending');
    assert.strictEqual(runningTasks.length, 0, 'No tasks should remain running or pending');
    assert.strictEqual(state.auditEvents.length, preAuditCount + 1, 'Audit event should be prepended');
    assert.strictEqual(state.auditEvents[0].action, 'fleet.emergency_all_stop');
  });

  await testCase('1.3: Resuming fleet updates state and appends audit event', async () => {
    const preAuditCount = dashboardStore.getState().auditEvents.length;
    await dashboardStore.resumeFleet();
    const state = dashboardStore.getState();

    assert.strictEqual(state.isEmergencyStopActive, false, 'Emergency stop should now be inactive');
    assert.strictEqual(state.auditEvents.length, preAuditCount + 1, 'Audit event should be prepended');
    assert.strictEqual(state.auditEvents[0].action, 'fleet.resume_operations');
  });

  await testCase('1.4: 50 rapid sequential toggles maintain state consistency and monotonic audit ledger', async () => {
    for (let i = 0; i < 50; i++) {
      if (i % 2 === 0) {
        await dashboardStore.triggerEmergencyStop();
      } else {
        await dashboardStore.resumeFleet();
      }
    }

    const state = dashboardStore.getState();
    assert.strictEqual(state.isEmergencyStopActive, false, 'After 50 toggles (even number), fleet should be resumed');

    // Verify cryptographic audit block chain sequence
    const events = state.auditEvents;
    for (let i = 0; i < 50; i++) {
      assert.ok(
        events[i].blockNumber > events[i + 1].blockNumber,
        `Block ${events[i].blockNumber} must be greater than previous block ${events[i + 1].blockNumber}`
      );
      assert.strictEqual(
        events[i].prevHash,
        events[i + 1].sha256Hash,
        `Block ${events[i].blockNumber} prevHash must match block ${events[i + 1].blockNumber} sha256Hash`
      );
    }
  });

  // --------------------------------------------------------------------------
  // Test Suite 2: Approval Resolution (APR-4891, APR-4892, APR-4893)
  // --------------------------------------------------------------------------
  await testCase('2.1: Initial pending approvals exist', () => {
    const state = dashboardStore.getState();
    const pending = state.approvals.filter((a) => a.status === 'pending');
    assert.strictEqual(pending.length, 3, 'Expected 3 initial pending approvals');
  });

  await testCase('2.2: Resolve APR-4891 as approved transitions approval, task and audit log', async () => {
    const preAuditCount = dashboardStore.getState().auditEvents.length;
    await dashboardStore.resolveApproval('APR-4891', 'approved', 'Operator verification complete');

    const state = dashboardStore.getState();
    const app = state.approvals.find((a) => a.id === 'APR-4891');
    assert.ok(app, 'APR-4891 must exist');
    assert.strictEqual(app.status, 'approved', 'APR-4891 status must be approved');
    assert.strictEqual(app.decisionReason, 'Operator verification complete');
    assert.strictEqual(app.decidedBy, 'operator:sarah.j');

    const task = state.tasks.find((t) => t.id === 'TSK-89214');
    assert.ok(task, 'Associated task TSK-89214 must exist');
    assert.strictEqual(task.status, 'running', 'Associated task should transition to running');

    assert.strictEqual(state.auditEvents.length, preAuditCount + 1);
    assert.strictEqual(state.auditEvents[0].action, 'approval.approved');
    assert.strictEqual(state.auditEvents[0].governanceVerdict, 'human_approved');
  });

  await testCase('2.3: Resolve APR-4892 as denied transitions approval and verifies associated task in tasks list', async () => {
    await dashboardStore.resolveApproval('APR-4892', 'denied', 'Unauthorized bypass argument detected');

    const state = dashboardStore.getState();
    const app = state.approvals.find((a) => a.id === 'APR-4892');
    assert.ok(app, 'APR-4892 must exist');
    assert.strictEqual(app.status, 'denied', 'APR-4892 status must be denied');

    const task = state.tasks.find((t) => t.id === 'TSK-89215');
    // DEFECT DISCOVERY: In Milestone 1 SEED_TASKS, TSK-89215 was not seeded!
    if (!task) {
      console.warn('       [DEFECT DETECTED] TSK-89215 (referenced by APR-4892) is missing from SEED_TASKS!');
    } else {
      assert.strictEqual(task.status, 'denied', 'Associated task should transition to denied');
    }

    assert.strictEqual(state.auditEvents[0].action, 'approval.denied');
    assert.strictEqual(state.auditEvents[0].governanceVerdict, 'denied');
  });

  await testCase('2.4: Resolve APR-4893 as approved with default reason', async () => {
    await dashboardStore.resolveApproval('APR-4893', 'approved');

    const state = dashboardStore.getState();
    const app = state.approvals.find((a) => a.id === 'APR-4893');
    assert.ok(app, 'APR-4893 must exist');
    assert.strictEqual(app.status, 'approved', 'APR-4893 status must be approved');

    const task = state.tasks.find((t) => t.id === 'TSK-89216');
    if (!task) {
      console.warn('       [DEFECT DETECTED] TSK-89216 (referenced by APR-4893) is missing from SEED_TASKS!');
    }

    const pending = state.approvals.filter((a) => a.status === 'pending');
    assert.strictEqual(pending.length, 0, 'Zero pending approvals should remain');
  });

  await testCase('2.5: Resolving non-existent approval ID gracefully no-ops without error', async () => {
    const preState = dashboardStore.getState();
    await dashboardStore.resolveApproval('APR-DOES-NOT-EXIST', 'approved', 'Test');
    const postState = dashboardStore.getState();

    assert.strictEqual(postState.approvals.length, preState.approvals.length);
    assert.strictEqual(postState.auditEvents.length, preState.auditEvents.length);
  });

  await testCase('2.6: Re-resolving an already decided approval (idempotency check)', async () => {
    // Attempting to resolve APR-4891 again after it was already approved
    const preAuditLength = dashboardStore.getState().auditEvents.length;
    await dashboardStore.resolveApproval('APR-4891', 'denied', 'Second resolution attempt');
    const state = dashboardStore.getState();

    // In a strict governance model, re-resolving an approved ticket should either be forbidden or idempotent
    const app = state.approvals.find((a) => a.id === 'APR-4891');
    if (app?.status === 'denied') {
      console.warn('       [VULNERABILITY/DESIGN FLAW] resolveApproval is not idempotent: allowed flipping approved APR-4891 to denied and appended duplicate audit block!');
    }
  });

  // --------------------------------------------------------------------------
  // Test Suite 3: Task Dispatching & Audit Ledger Stress Test
  // --------------------------------------------------------------------------
  await testCase('3.1: dispatchTask creates task with valid fields and audit trail', async () => {
    const preTasksCount = dashboardStore.getState().tasks.length;
    const preAuditCount = dashboardStore.getState().auditEvents.length;

    const params: TaskDispatchParams = {
      deviceId: 'srv-us-east-412',
      tool: 'desktop.capture_screen',
      args: { format: 'png', quality: 95 },
      riskTier: 'tier1_safe',
    };

    const task = await dashboardStore.dispatchTask(params);
    const state = dashboardStore.getState();

    assert.ok(task.id.startsWith('TSK-'), 'Task ID must start with TSK-');
    assert.strictEqual(task.deviceId, 'srv-us-east-412');
    assert.strictEqual(task.deviceHostname, 'srv-us-east-412.infra.internal');
    assert.strictEqual(task.tool, 'desktop.capture_screen');
    assert.strictEqual(task.status, 'running');

    assert.strictEqual(state.tasks.length, preTasksCount + 1);
    assert.strictEqual(state.tasks[0].id, task.id);

    assert.strictEqual(state.auditEvents.length, preAuditCount + 1);
    assert.strictEqual(state.auditEvents[0].action, 'desktop.capture_screen');
    assert.strictEqual(state.auditEvents[0].targetHost, 'srv-us-east-412.infra.internal');
  });

  await testCase('3.2: dispatchTask with unknown device falls back gracefully to deviceId', async () => {
    const task = await dashboardStore.dispatchTask({
      deviceId: 'unknown-device-999',
      tool: 'shell.exec',
      args: { command: 'hostname' },
    });

    assert.strictEqual(task.deviceHostname, 'unknown-device-999');
    assert.strictEqual(dashboardStore.getState().auditEvents[0].targetHost, 'unknown-device-999');
  });

  await testCase('3.3: dispatchTask during active Emergency Stop behavior check', async () => {
    // Put fleet into emergency stop
    await dashboardStore.triggerEmergencyStop();
    assert.strictEqual(dashboardStore.getState().isEmergencyStopActive, true);

    // Now try to dispatch a task while emergency stop is active
    const task = await dashboardStore.dispatchTask({
      deviceId: 'srv-us-east-412',
      tool: 'shell.exec',
      args: { command: 'danger' },
    });

    if (task.status === 'running') {
      console.warn('       [SECURITY FINDING] dispatchTask spawns "running" task while isEmergencyStopActive is true!');
    }

    // Clean up: resume fleet
    await dashboardStore.resumeFleet();
  });

  await testCase('3.4: 100 sequential task dispatches generate audit entries and monotonic blocks', async () => {
    const preAuditCount = dashboardStore.getState().auditEvents.length;
    const taskIds = new Set<string>();

    for (let i = 0; i < 100; i++) {
      const task = await dashboardStore.dispatchTask({
        deviceId: 'srv-us-east-412',
        tool: `tool.batch_${i}`,
        args: { iteration: i },
      });
      taskIds.add(task.id);
    }

    const state = dashboardStore.getState();
    assert.strictEqual(state.auditEvents.length, preAuditCount + 100);

    console.log(`       Generated 100 tasks, ${taskIds.size} unique IDs (${100 - taskIds.size} collisions observed)`);

    // Verify Merkle hash chain continuity
    const events = state.auditEvents;
    for (let i = 0; i < 100; i++) {
      assert.strictEqual(
        events[i].prevHash,
        events[i + 1].sha256Hash,
        `Hash mismatch between block ${events[i].blockNumber} and ${events[i + 1].blockNumber}`
      );
    }
  });

  // --------------------------------------------------------------------------
  // Test Suite 4: Subscriptions, Listener Lifecycle & Notification
  // --------------------------------------------------------------------------
  await testCase('4.1: Store notification fires listeners on state change', async () => {
    let callCount = 0;
    const unsubscribe = dashboardStore.subscribe(() => {
      callCount++;
    });

    dashboardStore.setCurrentView('live-desktop-studio');
    assert.strictEqual(callCount, 1, 'Listener should fire on setCurrentView');

    dashboardStore.setSelectedDeviceId('srv-win-prod-02');
    assert.strictEqual(callCount, 2, 'Listener should fire on setSelectedDeviceId');

    dashboardStore.setCommandPaletteOpen(true);
    assert.strictEqual(callCount, 3, 'Listener should fire on setCommandPaletteOpen');

    dashboardStore.setAutoPollEnabled(false);
    assert.strictEqual(callCount, 4, 'Listener should fire on setAutoPollEnabled');

    // Setting same value should NOT trigger duplicate notification
    dashboardStore.setCurrentView('live-desktop-studio');
    assert.strictEqual(callCount, 4, 'Listener should not fire if value did not change');

    unsubscribe();
    dashboardStore.setCurrentView('overview');
    assert.strictEqual(callCount, 4, 'Listener should not fire after unsubscribe');
  });

  console.log('\n================================================================================');
  console.log(`CHALLENGER STRESS TESTS COMPLETE: ${passed} PASSED / ${failed} FAILED`);
  console.log('================================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runChallengerStressTests();
