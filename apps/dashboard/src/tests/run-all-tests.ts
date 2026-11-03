/**
 * Master Test Runner for AI Bridge Enterprise Dashboard
 * 
 * Aggregates and executes:
 * - Requirement R1 Suite: Strict Tech Stack & Zero Custom UI Components
 * - Requirement R2 & R3 Suite: Anti-AI Aesthetics & Typography/Iconography
 * - Requirement R4 Suite: Complete Dashboard Reconstruction (All 15 screens)
 * - Requirement R5 Suite: Functional Accuracy, State, and Purposeful Motion
 * - Tier 1 Suite: Feature Coverage (F1 to F31, >= 5 tests each)
 * - Tier 2 Suite: Boundary & Corner Cases (F1 to F31, >= 5 tests each)
 * - Tier 3 Suite: Cross-Feature Combinations & Pairwise Interactions
 * - Tier 4 Suite: Real-World Application Scenarios
 */

import { printSummary, getResults, resetResults } from './harness.js';
import { runR1Tests } from './r1-tech-stack.test.js';
import { runR2R3Tests } from './r2-r3-anti-ai.test.js';
import { runR4Tests } from './r4-reconstruction.test.js';
import { runR5Tests } from './r5-functional-state.test.js';
import { runTier1Tests } from './tier1-feature-coverage.test.js';
import { runTier2Tests } from './tier2-boundary-corner.test.js';
import { runTier3Tests } from './tier3-combinations.test.js';
import { runTier4Tests } from './tier4-scenarios.test.js';

async function main() {
  const startTime = performance.now();
  resetResults();

  console.log('\x1b[1m\x1b[36m%s\x1b[0m', '>>> INITIALIZING AI BRIDGE E2E OPAQUE-BOX TEST RUNNER <<<');
  console.log('Testing Environment: Node.js', process.version);
  console.log('Target Architecture: apps/dashboard (31 Features, 4 Tiers, R1-R5 Requirements)\n');

  try {
    // 1. Requirements Suites
    console.log('\x1b[33m[1/8] Running Requirement R1 Suite (Strict Tech Stack & Zero Custom UI)...\x1b[0m');
    await runR1Tests();

    console.log('\x1b[33m[2/8] Running Requirement R2 & R3 Suite (Anti-AI Aesthetics & Typography)...\x1b[0m');
    await runR2R3Tests();

    console.log('\x1b[33m[3/8] Running Requirement R4 Suite (Complete Dashboard Reconstruction)...\x1b[0m');
    await runR4Tests();

    console.log('\x1b[33m[4/8] Running Requirement R5 Suite (Functional Accuracy & State Store)...\x1b[0m');
    await runR5Tests();

    // 2. 4-Tier Test Suites
    console.log('\x1b[33m[5/8] Running Tier 1 Suite (Feature Coverage F1-F31)...\x1b[0m');
    await runTier1Tests();

    console.log('\x1b[33m[6/8] Running Tier 2 Suite (Boundary & Corner Cases F1-F31)...\x1b[0m');
    await runTier2Tests();

    console.log('\x1b[33m[7/8] Running Tier 3 Suite (Cross-Feature Combinations)...\x1b[0m');
    await runTier3Tests();

    console.log('\x1b[33m[8/8] Running Tier 4 Suite (Real-World Application Scenarios)...\x1b[0m');
    await runTier4Tests();

  } catch (fatalErr) {
    console.error('\x1b[31mFatal unhandled error during test suite execution:\x1b[0m', fatalErr);
  }

  const durationSec = ((performance.now() - startTime) / 1000).toFixed(2);
  const summary = printSummary(`Complete Master Suite (${durationSec}s)`);

  // Opaque-box report: Return non-zero if tests fail, but during milestone staging,
  // we exit with code 0 if all runnable tests passed or report defects.
  // We exit with code 1 if failures exist so CI/automation catches defects.
  if (summary.failed > 0) {
    console.log(`\n\x1b[31m[!] Test run finished with ${summary.failed} failing assertion(s).\x1b[0m`);
    console.log('    These failures identify specific architectural violations in the legacy codebase');
    console.log('    to be resolved during milestone implementation (M1 through M5).\n');
    process.exit(1);
  } else {
    console.log(`\n\x1b[32m[✓] All ${summary.total} test cases executed cleanly and passed!\x1b[0m\n`);
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Master runner exited with unexpected error:', err);
  process.exit(1);
});
