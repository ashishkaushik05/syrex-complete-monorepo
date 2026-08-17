#!/usr/bin/env bun
/**
 * test-ratio — measures test:code LOC, backend-wide and per top-level src dir.
 *
 * code  = LOC of src/**\/*.ts excluding *.test.ts and the __testkit__ harness
 * tests = LOC of src/**\/*.test.ts
 * ratio = tests / code   (north star = 4.0, see plan/testing/PHASED_PLAN.md)
 *
 * Usage:
 *   bun run test:ratio            # report only
 *   bun run test:ratio --min 0.30 # exit 1 if total ratio < threshold (CI gate)
 */
import { Glob } from "bun";

const ROOT = new URL("../src/", import.meta.url).pathname;

function isTest(path: string) {
  return path.endsWith(".test.ts");
}
function isHarness(path: string) {
  return path.includes("/__testkit__/");
}
function topDir(path: string) {
  // path is relative to src/, e.g. "trpc/routes/foo.ts" -> "trpc"
  const seg = path.split("/")[0];
  return seg ?? "(root)";
}

async function lineCount(absPath: string): Promise<number> {
  const text = await Bun.file(absPath).text();
  if (text.length === 0) return 0;
  // count newlines + 1 if the file does not end in a newline
  let lines = 0;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) lines++;
  return text.endsWith("\n") ? lines : lines + 1;
}

type Bucket = { code: number; tests: number };

async function main() {
  const glob = new Glob("**/*.ts");
  const perDir = new Map<string, Bucket>();
  let totalCode = 0;
  let totalTests = 0;

  for await (const rel of glob.scan(ROOT)) {
    if (isHarness(rel)) continue; // harness is neither product code nor a spec
    const loc = await lineCount(ROOT + rel);
    const dir = topDir(rel);
    const bucket = perDir.get(dir) ?? { code: 0, tests: 0 };
    if (isTest(rel)) {
      bucket.tests += loc;
      totalTests += loc;
    } else {
      bucket.code += loc;
      totalCode += loc;
    }
    perDir.set(dir, bucket);
  }

  const ratio = (t: number, c: number) => (c === 0 ? "—" : (t / c).toFixed(2));

  const rows = [...perDir.entries()]
    .sort((a, b) => b[1].code - a[1].code)
    .map(([dir, b]) => ({
      module: dir,
      code: b.code,
      tests: b.tests,
      ratio: ratio(b.tests, b.code),
    }));

  console.log("\nTest : Code LOC ratio (target 4.00)\n");
  console.log("module".padEnd(16) + "code".padStart(10) + "tests".padStart(10) + "ratio".padStart(9));
  console.log("-".repeat(45));
  for (const r of rows) {
    console.log(
      r.module.padEnd(16) +
        String(r.code).padStart(10) +
        String(r.tests).padStart(10) +
        r.ratio.padStart(9),
    );
  }
  console.log("-".repeat(45));
  const totalRatio = totalCode === 0 ? 0 : totalTests / totalCode;
  console.log(
    "TOTAL".padEnd(16) +
      String(totalCode).padStart(10) +
      String(totalTests).padStart(10) +
      totalRatio.toFixed(2).padStart(9),
  );
  console.log("");

  const minArgIdx = process.argv.indexOf("--min");
  if (minArgIdx !== -1) {
    const min = Number(process.argv[minArgIdx + 1]);
    if (Number.isFinite(min) && totalRatio < min) {
      console.error(`FAIL: total ratio ${totalRatio.toFixed(2)} < required ${min}`);
      process.exit(1);
    }
    console.log(`OK: total ratio ${totalRatio.toFixed(2)} >= required ${min}`);
  }
}

main();
