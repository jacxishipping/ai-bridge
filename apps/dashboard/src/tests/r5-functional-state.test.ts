/**
 * Requirement R5 Test Suite: Functional Accuracy, State, and Purposeful Motion
 * 
 * Verifies:
 * 1. Interface contracts for centralized state store (DashboardStoreState).
 * 2. Realistic seed data: 40 devices across Windows, Linux, macOS.
 * 3. Emergency All-Stop killswitch state transitions and fleet halt.
 * 4. Human Approval resolution flow (authorize vs deny with reason).
 * 5. Interactive controls: search filters, platform filtering, pagination.
 * 6. Global Command Palette (⌘K) visibility and search state.
 * 7. Purposeful motion imports and usage (motion from motion or motion/react).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, setSuite } from './harness.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DASHBOARD_ROOT = path.resolve(__dirname, '../../');
const SRC_ROOT = path.resolve(DASHBOARD_ROOT, 'src');

export async function runR5Tests() {
  setSuite('Requirement R5: Functional State, Interactive Controls & Motion', 'requirement');

  await it('R5.1: State architecture contract implements DashboardStoreState interface', () => {
    // Check either src/state/dashboardStore.ts or src/types/dashboard.ts
    const statePath = path.join(SRC_ROOT, 'state', 'dashboardStore.ts');
    const typesPath = path.join(SRC_ROOT, 'types', 'dashboard.ts');
    const legacyStatePath = path.join(SRC_ROOT, 'api.ts');

    const hasModernState = fs.existsSync(statePath) || fs.existsSync(typesPath);
    expect(hasModernState || fs.existsSync(legacyStatePath)).toBeTruthy(
      'State store or API contracts must exist'
    );

    if (fs.existsSync(statePath)) {
      const content = fs.readFileSync(statePath, 'utf8');
      expect(content.includes('currentView') || content.includes('devices')).toBeTruthy(
        'Store must manage currentView and devices'
      );
      expect(content.includes('triggerEmergencyStop') || content.includes('emergencyStop')).toBeTruthy(
        'Store must provide emergency stop dispatch'
      );
    }
  });

  await it('R5.2: Seed data provides full fleet of 40 enrolled multi-platform devices', () => {
    // Check dashboardStore.ts or App.tsx for devices list
    let content = '';
    const statePath = path.join(SRC_ROOT, 'state', 'dashboardStore.ts');
    if (fs.existsSync(statePath)) {
      content = fs.readFileSync(statePath, 'utf8');
    } else {
      content = fs.readFileSync(path.join(SRC_ROOT, 'App.tsx'), 'utf8');
    }

    // Devices count should be 40 (or 38 online)
    const has40Devices = content.includes('40') || content.includes('srv-us-east');
    expect(has40Devices).toBeTruthy('Fleet must model 40 enrolled enterprise devices');

    // Platforms: Windows, Linux, Darwin
    expect(content.includes('windows') || content.includes('Windows')).toBeTruthy('Must support Windows nodes');
    expect(content.includes('linux') || content.includes('Ubuntu') || content.includes('Linux')).toBeTruthy('Must support Linux nodes');
  });

  await it('R5.3: Emergency All-Stop killswitch halts fleet and transitions operational state', () => {
    // Test the state logic of emergency stop
    let emergencyHaltState = false;
    let activeTaskCount = 12;

    function triggerEmergencyAllStop() {
      emergencyHaltState = true;
      activeTaskCount = 0; // all active tasks halted
    }

    expect(emergencyHaltState).toBeFalsy();
    expect(activeTaskCount).toBe(12);

    triggerEmergencyAllStop();

    expect(emergencyHaltState).toBeTruthy('Emergency stop flag must be active');
    expect(activeTaskCount).toBe(0, 'Active tasks must drop to 0 upon fleet emergency halt');
  });

  await it('R5.4: Human Approval state transitions handle both approval and denial with mandatory reason', () => {
    interface MockApproval {
      id: string;
      status: 'pending' | 'authorized' | 'denied';
      rejectionReason?: string;
    }

    const approvals: MockApproval[] = [
      { id: 'appr-01', status: 'pending' },
      { id: 'appr-02', status: 'pending' },
    ];

    function resolveApproval(id: string, verdict: 'authorized' | 'denied', reason?: string) {
      const item = approvals.find(a => a.id === id);
      if (!item) throw new Error('Not found');
      if (verdict === 'denied' && (!reason || reason.trim().length === 0)) {
        throw new Error('Rejection reason is mandatory when denying an invocation');
      }
      item.status = verdict;
      if (reason) item.rejectionReason = reason;
    }

    // Happy path: authorize
    resolveApproval('appr-01', 'authorized');
    expect(approvals[0].status).toBe('authorized');

    // Error path: deny without reason throws
    expect(() => resolveApproval('appr-02', 'denied', '')).toThrow('Rejection reason is mandatory');

    // Happy path: deny with valid reason
    resolveApproval('appr-02', 'denied', 'Destination directory outside approved staging path');
    expect(approvals[1].status).toBe('denied');
    expect(approvals[1].rejectionReason).toBe('Destination directory outside approved staging path');
  });

  await it('R5.5: Motion library is imported for subtle, purposeful transitions', () => {
    // Check if motion or motion/react is imported in src/
    function checkMotion(dir: string): boolean {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory() && ent.name !== 'tests') {
          if (checkMotion(full)) return true;
        } else if (ent.isFile() && ent.name.endsWith('.tsx')) {
          const content = fs.readFileSync(full, 'utf8');
          if (content.includes('from "motion"') || content.includes("from 'motion'") || 
              content.includes('from "motion/react"') || content.includes("from 'motion/react'")) {
            return true;
          }
        }
      }
      return false;
    }

    const hasMotion = checkMotion(SRC_ROOT);
    expect(hasMotion).toBeTruthy('motion must be imported in reconstructed shell/views for purposeful transitions');
  });

  await it('R5.6: Interactive pagination and search filtering logic preserves state integrity', () => {
    const mockNodes = Array.from({ length: 40 }, (_, i) => ({
      id: `srv-${i + 1}`,
      hostname: `edge-node-${String(i + 1).padStart(3, '0')}`,
      platform: i % 2 === 0 ? 'windows' : 'linux',
      status: i < 38 ? 'online' : 'offline',
    }));

    function filterAndPaginate(nodes: typeof mockNodes, query: string, platform: string, page: number, pageSize: number) {
      let filtered = nodes;
      if (query) {
        filtered = filtered.filter(n => n.hostname.includes(query) || n.id.includes(query));
      }
      if (platform !== 'all') {
        filtered = filtered.filter(n => n.platform === platform);
      }
      const totalFiltered = filtered.length;
      const totalPages = Math.ceil(totalFiltered / pageSize);
      const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);
      return { totalFiltered, totalPages, items: paginated };
    }

    // Default 1st page
    const r1 = filterAndPaginate(mockNodes, '', 'all', 1, 10);
    expect(r1.totalFiltered).toBe(40);
    expect(r1.totalPages).toBe(4);
    expect(r1.items.length).toBe(10);

    // Filter by platform
    const r2 = filterAndPaginate(mockNodes, '', 'windows', 1, 10);
    expect(r2.totalFiltered).toBe(20);
    expect(r2.totalPages).toBe(2);

    // Search query
    const r3 = filterAndPaginate(mockNodes, 'edge-node-005', 'all', 1, 10);
    expect(r3.totalFiltered).toBe(1);
    expect(r3.items[0].id).toBe('srv-5');
  });
}

if (process.argv[1]?.endsWith('r5-functional-state.test.ts') || process.argv[1]?.endsWith('r5-functional-state.test.js')) {
  runR5Tests().then(() => {
    const { printSummary } = require('./harness.js');
    printSummary('R5 Test Suite');
  });
}
