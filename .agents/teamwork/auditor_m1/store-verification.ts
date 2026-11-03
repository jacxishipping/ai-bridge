import assert from "node:assert/strict";
import { dashboardStore } from "../../../apps/dashboard/src/state/dashboardStore.ts";

async function runStoreTests() {
  console.log("Testing dashboardStore instance directly...");

  const state1 = dashboardStore.getState();
  assert.equal(state1.currentView, "overview");
  assert.equal(state1.devices.length, 40, "Must have exactly 40 devices");
  assert.equal(state1.isEmergencyStopActive, false);
  assert.equal(state1.approvals.length, 3);
  assert.equal(state1.approvals.filter(a => a.status === "pending").length, 3);

  // Test listener notification
  let notifications = 0;
  const unsubscribe = dashboardStore.subscribe(() => {
    notifications++;
  });

  // Test setCurrentView
  dashboardStore.setCurrentView("devices");
  assert.equal(dashboardStore.getState().currentView, "devices");
  assert.equal(notifications, 1, "Must notify on view change");

  // Idempotent view change should not notify
  dashboardStore.setCurrentView("devices");
  assert.equal(notifications, 1, "Idempotent view change should not notify");

  // Test setSelectedDeviceId
  dashboardStore.setSelectedDeviceId("srv-win-prod-01");
  assert.equal(dashboardStore.getState().selectedDeviceId, "srv-win-prod-01");
  assert.equal(notifications, 2, "Must notify on device selection");

  // Test Emergency Stop
  await dashboardStore.triggerEmergencyStop();
  const stateEmergency = dashboardStore.getState();
  assert.equal(stateEmergency.isEmergencyStopActive, true);
  assert.equal(notifications, 3, "Must notify on emergency stop");
  // Check that all running tasks are cancelled
  for (const t of stateEmergency.tasks) {
    assert.notEqual(t.status, "running", "No task should be running after emergency stop");
  }
  // Check audit ledger entry was prepended
  assert.equal(stateEmergency.auditEvents[0].action, "fleet.emergency_all_stop");

  // Test Resume Fleet
  await dashboardStore.resumeFleet();
  const stateResumed = dashboardStore.getState();
  assert.equal(stateResumed.isEmergencyStopActive, false);
  assert.equal(notifications, 4, "Must notify on fleet resume");
  assert.equal(stateResumed.auditEvents[0].action, "fleet.resume_operations");

  // Test resolveApproval: Approve
  await dashboardStore.resolveApproval("APR-4891", "approved", "Approved by auditor test");
  const stateApproved = dashboardStore.getState();
  const apr1 = stateApproved.approvals.find(a => a.id === "APR-4891");
  assert.equal(apr1?.status, "approved");
  assert.equal(apr1?.decidedBy, "operator:sarah.j");
  assert.equal(apr1?.decisionReason, "Approved by auditor test");
  assert.equal(notifications, 5, "Must notify on approval resolve");
  assert.equal(stateApproved.auditEvents[0].action, "approval.approved");

  // Test resolveApproval: Deny
  await dashboardStore.resolveApproval("APR-4892", "denied", "Dangerous token detected");
  const stateDenied = dashboardStore.getState();
  const apr2 = stateDenied.approvals.find(a => a.id === "APR-4892");
  assert.equal(apr2?.status, "denied");
  assert.equal(apr2?.decisionReason, "Dangerous token detected");
  assert.equal(notifications, 6, "Must notify on approval denial");
  assert.equal(stateDenied.auditEvents[0].action, "approval.denied");

  // Test task dispatch
  const task = await dashboardStore.dispatchTask({
    deviceId: "srv-us-east-412",
    tool: "desktop.capture_screen",
    riskTier: "tier1_safe",
  });
  const stateDispatched = dashboardStore.getState();
  assert.equal(stateDispatched.tasks[0].id, task.id);
  assert.equal(stateDispatched.tasks[0].tool, "desktop.capture_screen");
  assert.equal(notifications, 7, "Must notify on task dispatch");
  assert.equal(stateDispatched.auditEvents[0].action, "desktop.capture_screen");

  // Test unsubscribe
  unsubscribe();
  dashboardStore.setCurrentView("overview");
  assert.equal(notifications, 7, "Should not notify after unsubscribe");

  console.log("All dashboardStore empirical assertions passed cleanly!");
}

runStoreTests().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
