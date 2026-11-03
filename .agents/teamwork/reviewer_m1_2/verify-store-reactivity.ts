import { dashboardStore } from '../../../apps/dashboard/src/state/dashboardStore.ts';

async function verifyReactivity() {
  let notified = 0;
  const unsubscribe = dashboardStore.subscribe(() => { notified++; });

  // 1. Initial state
  const s0 = dashboardStore.getState();
  console.log('Initial view:', s0.currentView);
  console.log('Emergency active:', s0.isEmergencyStopActive);

  // 2. View change
  dashboardStore.setCurrentView('devices');
  console.log('After view change:', dashboardStore.getState().currentView, 'notified:', notified);

  // 3. Emergency stop
  const runningBefore = dashboardStore.getState().tasks.filter(t => t.status === 'running').length;
  const auditBefore = dashboardStore.getState().auditEvents.length;
  await dashboardStore.triggerEmergencyStop();
  const s1 = dashboardStore.getState();
  console.log('Emergency active after trigger:', s1.isEmergencyStopActive);
  console.log('Running tasks after trigger:', s1.tasks.filter(t => t.status === 'running').length, 'was:', runningBefore);
  console.log('Cancelled tasks:', s1.tasks.filter(t => t.status === 'cancelled').length);
  console.log('Audit events after trigger:', s1.auditEvents.length, 'was:', auditBefore);
  console.log('Latest audit action:', s1.auditEvents[0].action);
  console.log('Notified count:', notified);

  // 4. Resume fleet
  await dashboardStore.resumeFleet();
  const s2 = dashboardStore.getState();
  console.log('Emergency active after resume:', s2.isEmergencyStopActive);
  console.log('Latest audit action:', s2.auditEvents[0].action);

  // 5. Resolve approval
  const targetAppr = s2.approvals[0];
  console.log('Resolving approval:', targetAppr.id, 'taskId:', targetAppr.taskId);
  await dashboardStore.resolveApproval(targetAppr.id, 'approved', 'Authorized by test');
  const s3 = dashboardStore.getState();
  const resolved = s3.approvals.find(a => a.id === targetAppr.id);
  const resolvedTask = s3.tasks.find(t => t.id === targetAppr.taskId);
  console.log('Approval status:', resolved?.status, 'decidedBy:', resolved?.decidedBy);
  console.log('Associated task status:', resolvedTask?.status);
  console.log('Latest audit action:', s3.auditEvents[0].action);

  // 6. Dispatch task
  const newTask = await dashboardStore.dispatchTask({ deviceId: 'srv-us-east-412', tool: 'system.ping' });
  const s4 = dashboardStore.getState();
  console.log('New task created:', newTask.id, 'tool:', newTask.tool);
  console.log('Task exists in store:', s4.tasks.some(t => t.id === newTask.id));
  console.log('Total notifications:', notified);

  unsubscribe();
}

verifyReactivity().catch(console.error);
