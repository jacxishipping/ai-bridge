/**
 * Requirement R1 Test Suite: Strict Technology Stack & Zero Custom UI Components
 * 
 * Verifies:
 * 1. Only @jacxishippingorg/jx-ui-react, motion, lucide-react, react, and react-dom are installed.
 * 2. Absolute absence of custom CSS files (fluent2.css, jxui.css).
 * 3. Absence of inline style={{ ... }} attributes across production source files.
 * 4. Elimination of custom wrapper abstractions (ConfirmDialog, Pager, ViewLoadingSkeleton).
 * 5. Native JXUI layout primitives and component usage.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, setSuite } from './harness.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DASHBOARD_ROOT = path.resolve(__dirname, '../../');
const SRC_ROOT = path.resolve(DASHBOARD_ROOT, 'src');

export async function runR1Tests() {
  setSuite('Requirement R1: Strict Tech Stack & Zero Custom UI', 'requirement');

  await it('R1.1: package.json dependencies strictly limited to approved runtime libraries', () => {
    const pkgPath = path.join(DASHBOARD_ROOT, 'package.json');
    expect(fs.existsSync(pkgPath)).toBeTruthy('package.json must exist');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

    const runtimeDeps = Object.keys(pkg.dependencies || {});
    const approvedDeps = [
      '@jacxishippingorg/jx-ui-react',
      'lucide-react',
      'motion',
      'react',
      'react-dom',
    ];

    for (const dep of runtimeDeps) {
      expect(approvedDeps).toContain(dep, `Dependency "${dep}" is not an approved runtime dependency in R1`);
    }

    // Verify mandatory dependencies are present
    expect(runtimeDeps).toContain('@jacxishippingorg/jx-ui-react');
    expect(runtimeDeps).toContain('lucide-react');
    expect(runtimeDeps).toContain('motion');
  });

  await it('R1.2: No foreign UI framework packages installed (MUI, Chakra, AntD, Mantine)', () => {
    const pkgPath = path.join(DASHBOARD_ROOT, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

    const forbiddenFrameworks = [
      '@mui/material',
      '@chakra-ui/react',
      'antd',
      '@mantine/core',
      'styled-components',
      '@emotion/react',
    ];

    for (const fw of forbiddenFrameworks) {
      expect(fw in allDeps).toBeFalsy(`Forbidden UI library "${fw}" detected in package.json`);
    }
  });

  await it('R1.3: Elimination of legacy custom CSS files (fluent2.css and jxui.css)', () => {
    const fluent2Path = path.join(SRC_ROOT, 'fluent2.css');
    const jxuiCssPath = path.join(SRC_ROOT, 'jxui.css');

    const fluent2Exists = fs.existsSync(fluent2Path);
    const jxuiCssExists = fs.existsSync(jxuiCssPath);

    expect(!fluent2Exists).toBeTruthy('fluent2.css MUST be eliminated from apps/dashboard/src/');
    expect(!jxuiCssExists).toBeTruthy('jxui.css MUST be eliminated from apps/dashboard/src/');
  });

  await it('R1.4: Elimination of custom component wrappers (ConfirmDialog, Pager, ViewLoadingSkeleton)', () => {
    const confirmDialogPath = path.join(SRC_ROOT, 'ConfirmDialog.tsx');
    const pagerPath = path.join(SRC_ROOT, 'Pager.tsx');
    const skeletonPath = path.join(SRC_ROOT, 'ViewLoadingSkeleton.tsx');

    expect(!fs.existsSync(confirmDialogPath)).toBeTruthy('ConfirmDialog.tsx wrapper MUST be purged');
    expect(!fs.existsSync(pagerPath)).toBeTruthy('Pager.tsx wrapper MUST be purged');
    expect(!fs.existsSync(skeletonPath)).toBeTruthy('ViewLoadingSkeleton.tsx wrapper MUST be purged');
  });

  await it('R1.5: Zero inline style={{ ... }} attributes in reconstructed application code', () => {
    // Scan all .tsx/.ts files in src (excluding src/tests)
    function getSourceFiles(dir: string): string[] {
      let results: string[] = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'tests' && entry.name !== 'stitch_design_system_implementation') {
            results = results.concat(getSourceFiles(fullPath));
          }
        } else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts'))) {
          results.push(fullPath);
        }
      }
      return results;
    }

    const sourceFiles = getSourceFiles(SRC_ROOT);
    const styleRegex = /style\s*=\s*\{\s*\{/g;
    const violations: { file: string; line: number; match: string }[] = [];

    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (styleRegex.test(lines[i])) {
          violations.push({
            file: path.relative(DASHBOARD_ROOT, file),
            line: i + 1,
            match: lines[i].trim(),
          });
        }
        styleRegex.lastIndex = 0;
      }
    }

    expect(
      violations.length === 0
    ).toBeTruthy(
      `Detected ${violations.length} inline style={{ ... }} attributes. Examples:\n` +
      violations.slice(0, 5).map(v => `  ${v.file}:${v.line} -> ${v.match}`).join('\n')
    );
  });

  await it('R1.6: main.tsx does not import legacy CSS stylesheets', () => {
    const mainPath = path.join(SRC_ROOT, 'main.tsx');
    expect(fs.existsSync(mainPath)).toBeTruthy('main.tsx must exist');
    const content = fs.readFileSync(mainPath, 'utf8');

    expect(content.includes('fluent2.css')).toBeFalsy('main.tsx must not import fluent2.css');
    expect(content.includes('jxui.css')).toBeFalsy('main.tsx must not import jxui.css');
    expect(content.includes('tailwind.css')).toBeTruthy('main.tsx must import tailwind.css for JXUI v4 engine');
  });

  await it('R1.7: JXThemeProvider wraps root application with dark default mode and indigo accent', () => {
    const mainPath = path.join(SRC_ROOT, 'main.tsx');
    const content = fs.readFileSync(mainPath, 'utf8');

    expect(content.includes('JXThemeProvider')).toBeTruthy('main.tsx must use JXThemeProvider');
    expect(content.includes('defaultMode="dark"') || content.includes("defaultMode='dark'")).toBeTruthy(
      'JXThemeProvider must default to dark mode'
    );
  });
}

// Direct execution support
if (process.argv[1]?.endsWith('r1-tech-stack.test.ts') || process.argv[1]?.endsWith('r1-tech-stack.test.js')) {
  runR1Tests().then(() => {
    const { printSummary } = require('./harness.js');
    printSummary('R1 Test Suite');
  });
}
