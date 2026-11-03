import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const srcDir = path.resolve("apps/dashboard/src");

function getAllFiles(dir: string): string[] {
  let res: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "tests" && entry.name !== "legacy_reference") {
        res = res.concat(getAllFiles(full));
      }
    } else {
      res.push(full);
    }
  }
  return res;
}

const files = getAllFiles(srcDir);
console.log(`Auditing ${files.length} production source files in ${srcDir}...`);

let errors: string[] = [];

for (const file of files) {
  const rel = path.relative(srcDir, file);
  const content = fs.readFileSync(file, "utf8");

  // 1. Inline styles
  if (file.endsWith(".tsx") || file.endsWith(".ts")) {
    const lines = content.split("\n");
    lines.forEach((line, idx) => {
      if (/style\s*=\s*\{\s*\{/.test(line)) {
        errors.push(`Inline style found in ${rel}:${idx + 1} -> ${line.trim()}`);
      }
    });
  }

  // 2. Custom CSS files
  if (file.endsWith(".css") && rel !== "tailwind.css") {
    errors.push(`Disallowed CSS file found: ${rel}`);
  }
  if (file.endsWith(".scss") || file.endsWith(".sass") || file.endsWith(".less")) {
    errors.push(`Disallowed preprocessor file found: ${rel}`);
  }

  // 3. Emojis
  const emojiRegex = /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/u;
  if (file.endsWith(".tsx") || file.endsWith(".ts")) {
    const lines = content.split("\n");
    lines.forEach((line, idx) => {
      if (emojiRegex.test(line)) {
        errors.push(`Emoji found in ${rel}:${idx + 1} -> ${line.trim()}`);
      }
    });
  }

  // 4. Prohibited generic AI gradient tropes
  if (file.endsWith(".tsx") || file.endsWith(".ts")) {
    const lines = content.split("\n");
    lines.forEach((line, idx) => {
      if (/(from-purple|to-pink|from-pink|to-purple|from-indigo.*via-purple|bg-gradient-to-(r|l|t|b|br|tr|bl|tl))/i.test(line)) {
        errors.push(`Prohibited AI gradient trope in ${rel}:${idx + 1} -> ${line.trim()}`);
      }
    });
  }

  // 5. Prohibited wrapper components references
  if (file.endsWith(".tsx") || file.endsWith(".ts")) {
    if (content.includes("ConfirmDialog") || content.includes("ViewLoadingSkeleton") || (content.includes("Pager") && !content.includes("PagerDuty"))) {
      errors.push(`Prohibited wrapper reference in ${rel}`);
    }
  }
}

if (errors.length > 0) {
  console.error("FAILED AUDIT CHECKS:");
  errors.forEach(e => console.error(" - " + e));
  process.exit(1);
} else {
  console.log("ALL FORENSIC AUDIT CHECKS PASSED WITH ZERO VIOLATIONS!");
}
