#!/usr/bin/env bun
/**
 * Runs typecheck + tests + git status, then rewrites the Health Check
 * section of plan/DASHBOARD.md between <!-- health:start --> and <!-- health:end -->.
 *
 * Usage (from repo root):
 *   bun backend/scripts/update-dashboard.ts
 */

import { $ } from "bun";
import { readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(import.meta.dir, "../..");
const BACKEND_DIR = join(REPO_ROOT, "backend");
const DASHBOARD = join(REPO_ROOT, "plan/DASHBOARD.md");

async function runTypecheck(): Promise<{ ok: boolean; detail: string }> {
  const result = await $`bun run typecheck`
    .cwd(BACKEND_DIR)
    .quiet()
    .nothrow();

  if (result.exitCode === 0) {
    return { ok: true, detail: "0 errors" };
  }
  const output = result.stderr.toString() + result.stdout.toString();
  const errorLines = output.split("\n").filter((l) => /error TS\d+/.test(l));
  return {
    ok: false,
    detail: `${errorLines.length || "?"} error(s)`,
  };
}

async function runTests(): Promise<{
  passing: number;
  failing: number;
  total: number;
}> {
  const result = await $`bun test`
    .cwd(BACKEND_DIR)
    .quiet()
    .nothrow();

  const output = result.stdout.toString() + result.stderr.toString();

  // Bun test summary line: "74 pass  24 fail" or "74 pass"
  const passMatch = output.match(/(\d+)\s+pass/i);
  const failMatch = output.match(/(\d+)\s+fail/i);
  const passing = passMatch ? parseInt(passMatch[1], 10) : 0;
  const failing = failMatch ? parseInt(failMatch[1], 10) : 0;
  return { passing, failing, total: passing + failing };
}

async function getGitStatus(): Promise<{ count: number; branch: string }> {
  const [statusResult, branchResult] = await Promise.all([
    $`git status --short`.cwd(REPO_ROOT).quiet().nothrow(),
    $`git rev-parse --abbrev-ref HEAD`.cwd(REPO_ROOT).quiet().nothrow(),
  ]);
  const lines = statusResult.stdout
    .toString()
    .trim()
    .split("\n")
    .filter(Boolean);
  const branch = branchResult.stdout.toString().trim() || "unknown";
  return { count: lines.length, branch };
}

console.log("Running health checks...\n");

const [tc, tests, git] = await Promise.all([
  runTypecheck(),
  runTests(),
  getGitStatus(),
]);

const tcIcon = tc.ok ? "✅" : "❌";
const testIcon =
  tests.failing === 0 ? "✅" : tests.failing < 10 ? "⚠️" : "❌";
const gitIcon = git.count === 0 ? "✅" : "⚠️";

const timestamp =
  new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";

const healthBlock = `<!-- health:start -->
> Last health check: ${timestamp}

| Check | Status | Detail |
|---|---|---|
| TypeCheck | ${tcIcon} ${tc.ok ? "PASS" : "FAIL"} | ${tc.detail} |
| Tests | ${testIcon} ${tests.passing}/${tests.total} passing | ${tests.failing} failing |
| Git | ${gitIcon} ${git.branch} | ${git.count} uncommitted file(s) |
<!-- health:end -->`;

// Read dashboard and replace only between the markers
let content = readFileSync(DASHBOARD, "utf8");
const START = "<!-- health:start -->";
const END = "<!-- health:end -->";
const startIdx = content.indexOf(START);
const endIdx = content.indexOf(END);

if (startIdx === -1 || endIdx === -1) {
  console.error(
    "ERROR: Could not find <!-- health:start --> / <!-- health:end --> markers in plan/DASHBOARD.md"
  );
  process.exit(1);
}

content =
  content.slice(0, startIdx) +
  healthBlock +
  content.slice(endIdx + END.length);

writeFileSync(DASHBOARD, content, "utf8");

// Console output
const reset = "\x1b[0m";
const green = "\x1b[32m";
const red = "\x1b[31m";
const yellow = "\x1b[33m";

const tcColor = tc.ok ? green : red;
const testColor =
  tests.failing === 0 ? green : tests.failing < 10 ? yellow : red;
const gitColor = git.count === 0 ? green : yellow;

console.log(
  `TypeCheck  ${tcColor}${tcIcon}  ${tc.detail}${reset}`
);
console.log(
  `Tests      ${testColor}${testIcon}  ${tests.passing}/${tests.total} passing, ${tests.failing} failing${reset}`
);
console.log(
  `Git        ${gitColor}${gitIcon}  ${git.count} uncommitted file(s) on '${git.branch}'${reset}`
);
console.log(`\nDashboard updated → plan/DASHBOARD.md`);
