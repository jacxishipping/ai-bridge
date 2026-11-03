/**
 * AI Bridge E2E Testing Harness
 * 
 * Lightweight, zero-dependency, high-performance testing framework
 * compatible with tsx, Node.js test runner, and strict TypeScript.
 */

import assert from 'node:assert/strict';

export interface TestCaseResult {
  name: string;
  suite: string;
  tier?: 'tier1' | 'tier2' | 'tier3' | 'tier4' | 'requirement';
  featureId?: string;
  passed: boolean;
  error?: Error | unknown;
  durationMs: number;
}

export interface SuiteSummary {
  name: string;
  total: number;
  passed: number;
  failed: number;
  results: TestCaseResult[];
}

export interface TestRunnerState {
  currentSuite: string;
  currentTier?: 'tier1' | 'tier2' | 'tier3' | 'tier4' | 'requirement';
  currentFeatureId?: string;
  results: TestCaseResult[];
  beforeAllHooks: Array<() => Promise<void> | void>;
  afterAllHooks: Array<() => Promise<void> | void>;
}

const runnerState: TestRunnerState = {
  currentSuite: 'Default',
  results: [],
  beforeAllHooks: [],
  afterAllHooks: [],
};

export function setSuite(name: string, tier?: 'tier1' | 'tier2' | 'tier3' | 'tier4' | 'requirement', featureId?: string) {
  runnerState.currentSuite = name;
  runnerState.currentTier = tier;
  runnerState.currentFeatureId = featureId;
}

export function beforeAll(fn: () => Promise<void> | void) {
  runnerState.beforeAllHooks.push(fn);
}

export function afterAll(fn: () => Promise<void> | void) {
  runnerState.afterAllHooks.push(fn);
}

export async function it(
  name: string,
  fn: () => Promise<void> | void,
  meta?: { tier?: 'tier1' | 'tier2' | 'tier3' | 'tier4' | 'requirement'; featureId?: string }
): Promise<TestCaseResult> {
  const start = performance.now();
  const suite = runnerState.currentSuite;
  const tier = meta?.tier || runnerState.currentTier;
  const featureId = meta?.featureId || runnerState.currentFeatureId;

  try {
    await fn();
    const durationMs = Number((performance.now() - start).toFixed(2));
    const result: TestCaseResult = {
      name,
      suite,
      tier,
      featureId,
      passed: true,
      durationMs,
    };
    runnerState.results.push(result);
    return result;
  } catch (err) {
    const durationMs = Number((performance.now() - start).toFixed(2));
    const result: TestCaseResult = {
      name,
      suite,
      tier,
      featureId,
      passed: false,
      error: err,
      durationMs,
    };
    runnerState.results.push(result);
    return result;
  }
}

export const test = it;

export function describe(
  suiteName: string,
  fn: () => void,
  meta?: { tier?: 'tier1' | 'tier2' | 'tier3' | 'tier4' | 'requirement'; featureId?: string }
) {
  const prevSuite = runnerState.currentSuite;
  const prevTier = runnerState.currentTier;
  const prevFeature = runnerState.currentFeatureId;

  runnerState.currentSuite = suiteName;
  if (meta?.tier) runnerState.currentTier = meta.tier;
  if (meta?.featureId) runnerState.currentFeatureId = meta.featureId;

  try {
    fn();
  } finally {
    runnerState.currentSuite = prevSuite;
    runnerState.currentTier = prevTier;
    runnerState.currentFeatureId = prevFeature;
  }
}

/**
 * Fluent Assertion wrapper around node:assert/strict
 */
export function expect<T>(actual: T) {
  return {
    toBe(expected: T, msg?: string) {
      if (msg) assert.strictEqual(actual, expected, msg);
      else assert.strictEqual(actual, expected);
    },
    toEqual(expected: any, msg?: string) {
      if (msg) assert.deepStrictEqual(actual, expected, msg);
      else assert.deepStrictEqual(actual, expected);
    },
    toBeTruthy(msg?: string) {
      assert.ok(actual, msg || `Expected truthy, got ${actual}`);
    },
    toBeFalsy(msg?: string) {
      assert.ok(!actual, msg || `Expected falsy, got ${actual}`);
    },
    toContain(expectedSub: any, msg?: string) {
      if (typeof actual === 'string') {
        assert.ok(actual.includes(expectedSub), msg || `Expected "${actual}" to contain "${expectedSub}"`);
      } else if (Array.isArray(actual)) {
        assert.ok(actual.includes(expectedSub), msg || `Expected array to contain item`);
      } else if (actual && typeof actual === 'object') {
        assert.ok(expectedSub in (actual as any), msg || `Expected object to contain property "${expectedSub}"`);
      } else {
        throw new Error(`toContain not supported on type ${typeof actual}`);
      }
    },
    not: {
      toBe(expected: T, msg?: string) {
        if (msg) assert.notStrictEqual(actual, expected, msg);
        else assert.notStrictEqual(actual, expected);
      },
      toContain(expectedSub: any, msg?: string) {
        if (typeof actual === 'string') {
          assert.ok(!actual.includes(expectedSub), msg || `Expected "${actual}" NOT to contain "${expectedSub}"`);
        } else if (Array.isArray(actual)) {
          assert.ok(!actual.includes(expectedSub), msg || `Expected array NOT to contain item`);
        } else {
          assert.ok(!(expectedSub in (actual as any)), msg || `Expected object NOT to have property "${expectedSub}"`);
        }
      },
      toBeNull(msg?: string) {
        if (msg) assert.notStrictEqual(actual, null, msg);
        else assert.notStrictEqual(actual, null);
      },
      toBeUndefined(msg?: string) {
        if (msg) assert.notStrictEqual(actual, undefined, msg);
        else assert.notStrictEqual(actual, undefined);
      },
    },
    toBeGreaterThan(expected: number, msg?: string) {
      assert.ok((actual as any) > expected, msg || `Expected ${actual} > ${expected}`);
    },
    toBeGreaterThanOrEqual(expected: number, msg?: string) {
      assert.ok((actual as any) >= expected, msg || `Expected ${actual} >= ${expected}`);
    },
    toBeLessThan(expected: number, msg?: string) {
      assert.ok((actual as any) < expected, msg || `Expected ${actual} < ${expected}`);
    },
    toBeLessThanOrEqual(expected: number, msg?: string) {
      assert.ok((actual as any) <= expected, msg || `Expected ${actual} <= ${expected}`);
    },
    toBeNull(msg?: string) {
      if (msg) assert.strictEqual(actual, null, msg);
      else assert.strictEqual(actual, null);
    },
    toBeUndefined(msg?: string) {
      if (msg) assert.strictEqual(actual, undefined, msg);
      else assert.strictEqual(actual, undefined);
    },
    toBeDefined(msg?: string) {
      assert.notStrictEqual(actual, undefined, msg || `Expected defined value`);
    },
    toMatch(regex: RegExp, msg?: string) {
      assert.ok(regex.test(String(actual)), msg || `Expected ${actual} to match ${regex}`);
    },
    toThrow(expectedErrorSnippet?: string | RegExp) {
      if (typeof actual !== 'function') {
        throw new Error('toThrow requires a function');
      }
      let threw = false;
      let errorThrown: any;
      try {
        (actual as any)();
      } catch (e) {
        threw = true;
        errorThrown = e;
      }
      assert.ok(threw, 'Expected function to throw, but it did not');
      if (expectedErrorSnippet) {
        const message = errorThrown?.message || String(errorThrown);
        if (typeof expectedErrorSnippet === 'string') {
          assert.ok(message.includes(expectedErrorSnippet), `Expected error to include "${expectedErrorSnippet}", got "${message}"`);
        } else {
          assert.ok(expectedErrorSnippet.test(message), `Expected error to match ${expectedErrorSnippet}, got "${message}"`);
        }
      }
    },
  };
}

/**
 * Summarize and display test execution results
 */
export function getResults(): TestCaseResult[] {
  return [...runnerState.results];
}

export function resetResults() {
  runnerState.results = [];
}

export function printSummary(title: string = 'Test Run Summary'): { total: number; passed: number; failed: number } {
  const results = runnerState.results;
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log('\n' + '='.repeat(80));
  console.log(`  AI BRIDGE E2E TEST EXECUTION REPORT — ${title.toUpperCase()}`);
  console.log('='.repeat(80));

  // Breakdown by Tier
  const tiers = ['requirement', 'tier1', 'tier2', 'tier3', 'tier4'] as const;
  const tierLabels = {
    requirement: 'Requirements (R1-R5)',
    tier1: 'Tier 1: Feature Coverage (F1-F31)',
    tier2: 'Tier 2: Boundary & Corner Cases (F1-F31)',
    tier3: 'Tier 3: Cross-Feature Combinations',
    tier4: 'Tier 4: Real-World Scenarios',
  };

  for (const t of tiers) {
    const tierResults = results.filter(r => r.tier === t);
    if (tierResults.length > 0) {
      const tPassed = tierResults.filter(r => r.passed).length;
      const tFailed = tierResults.filter(r => !r.passed).length;
      const statusColor = tFailed === 0 ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
      console.log(`  ${tierLabels[t].padEnd(46)} : ${String(tPassed).padStart(3)} passed / ${String(tierResults.length).padStart(3)} total [${statusColor}]`);
    }
  }

  console.log('-'.repeat(80));
  console.log(`  TOTAL TEST CASES : ${total}`);
  console.log(`  PASSED           : \x1b[32m${passed}\x1b[0m`);
  console.log(`  FAILED           : ${failed > 0 ? '\x1b[31m' + failed + '\x1b[0m' : '0'}`);
  console.log('='.repeat(80));

  if (failed > 0) {
    console.log('\n--- FAILED TEST DEFECTS LOG ---');
    for (const r of results.filter(r => !r.passed)) {
      const featureTag = r.featureId ? ` [${r.featureId}]` : '';
      console.log(`\n\x1b[31mFAIL\x1b[0m ${r.suite} -> ${r.name}${featureTag}`);
      if (r.error instanceof Error) {
        console.log(`  Error: ${r.error.message}`);
      } else if (r.error) {
        console.log(`  Error: ${String(r.error)}`);
      }
    }
    console.log('\n-------------------------------');
  }

  return { total, passed, failed };
}
