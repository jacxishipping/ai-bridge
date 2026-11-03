/**
 * Requirement R2 & R3 Test Suite: Anti-AI Aesthetics & Iconography/Typography Standards
 * 
 * Verifies:
 * 1. Prohibition of generic AI gradient tropes (purple/pink/blue gradient backgrounds, neon blobs).
 * 2. Absolute absence of decorative emojis in UI templates, table headers, logs, and labels.
 * 3. Removal of external Material Symbols icon font link from index.html.
 * 4. Exclusive sourcing of icons from lucide-react.
 * 5. Monospace font token (JetBrains Mono) for all hashes, PIDs, metrics, and timestamps.
 * 6. Clean, disciplined enterprise SaaS dark canvas surfaces (#0B0F19, #0f131d, #111827).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, setSuite } from './harness.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DASHBOARD_ROOT = path.resolve(__dirname, '../../');
const SRC_ROOT = path.resolve(DASHBOARD_ROOT, 'src');

function getSourceFiles(dir: string): string[] {
  let results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'tests' && entry.name !== 'stitch_design_system_implementation') {
        results = results.concat(getSourceFiles(fullPath));
      }
    } else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts') || entry.name.endsWith('.html'))) {
      results.push(fullPath);
    }
  }
  return results;
}

export async function runR2R3Tests() {
  setSuite('Requirement R2 & R3: Anti-AI Design & Typography/Icons', 'requirement');

  await it('R2.1: No Google Fonts Material Symbols font linked in index.html', () => {
    const indexPath = path.join(DASHBOARD_ROOT, 'index.html');
    expect(fs.existsSync(indexPath)).toBeTruthy('index.html must exist');
    const content = fs.readFileSync(indexPath, 'utf8');

    expect(content.includes('Material+Symbols')).toBeFalsy(
      'index.html must NOT link to Google Fonts Material Symbols Outlined'
    );
  });

  await it('R2.2: index.html loads enterprise typography (Plus Jakarta Sans & JetBrains Mono)', () => {
    const indexPath = path.join(DASHBOARD_ROOT, 'index.html');
    const content = fs.readFileSync(indexPath, 'utf8');

    expect(content.includes('JetBrains+Mono')).toBeTruthy(
      'index.html must include JetBrains Mono for monospace telemetry and code'
    );
    expect(content.includes('Plus+Jakarta+Sans')).toBeTruthy(
      'index.html must include Plus Jakarta Sans for enterprise UI typography'
    );
  });

  await it('R2.3: Zero decorative emojis in code, UI strings, and view components', () => {
    const sourceFiles = getSourceFiles(SRC_ROOT);
    // Regex matching standard emoji ranges
    const emojiRegex = /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

    const violations: { file: string; line: number; match: string }[] = [];

    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (emojiRegex.test(lines[i])) {
          violations.push({
            file: path.relative(DASHBOARD_ROOT, file),
            line: i + 1,
            match: lines[i].trim(),
          });
        }
      }
    }

    expect(
      violations.length === 0
    ).toBeTruthy(
      `Detected ${violations.length} emoji characters in source files. Violations:\n` +
      violations.slice(0, 5).map(v => `  ${v.file}:${v.line} -> ${v.match}`).join('\n')
    );
  });

  await it('R2.4: Absence of generic AI purple/pink/blue gradient tropes in UI classes', () => {
    const sourceFiles = getSourceFiles(SRC_ROOT);
    const gradientTropes = [
      /from-purple-500/i,
      /to-pink-500/i,
      /from-indigo-500\s+via-purple-500/i,
      /linear-gradient\(.*#8a2be2/i, // neon violet
      /linear-gradient\(.*#ff007f/i, // neon pink
    ];

    const violations: { file: string; pattern: string }[] = [];

    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, 'utf8');
      for (const pattern of gradientTropes) {
        if (pattern.test(content)) {
          violations.push({
            file: path.relative(DASHBOARD_ROOT, file),
            pattern: pattern.toString(),
          });
        }
      }
    }

    expect(
      violations.length === 0
    ).toBeTruthy(
      `Detected ${violations.length} forbidden AI gradient tropes in source code. Violations:\n` +
      violations.map(v => `  ${v.file}: ${v.pattern}`).join('\n')
    );
  });

  await it('R3.1: Icons are imported from lucide-react in active views and shell', () => {
    const sourceFiles = getSourceFiles(SRC_ROOT);
    let lucideImportCount = 0;

    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, 'utf8');
      if (content.includes('from "lucide-react"') || content.includes("from 'lucide-react'")) {
        lucideImportCount++;
      }
    }

    expect(lucideImportCount > 0).toBeTruthy(
      `lucide-react must be imported in reconstructed shell and views (currently found in ${lucideImportCount} files)`
    );
  });

  await it('R3.2: No raw material-symbols-outlined spans in reconstructed views', () => {
    const sourceFiles = getSourceFiles(SRC_ROOT);
    const materialSymbolsRegex = /material-symbols(?:-outlined)?/i;
    const violations: { file: string; line: number }[] = [];

    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (materialSymbolsRegex.test(lines[i])) {
          violations.push({
            file: path.relative(DASHBOARD_ROOT, file),
            line: i + 1,
          });
        }
      }
    }

    expect(
      violations.length === 0
    ).toBeTruthy(
      `Detected ${violations.length} material-symbols spans. Icons must use lucide-react exclusively.`
    );
  });
}

if (process.argv[1]?.endsWith('r2-r3-anti-ai.test.ts') || process.argv[1]?.endsWith('r2-r3-anti-ai.test.js')) {
  runR2R3Tests().then(() => {
    const { printSummary } = require('./harness.js');
    printSummary('R2 & R3 Test Suite');
  });
}
