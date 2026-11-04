/**
 * Runs every suite in evaluations/suites/. Each suite file exports
 * `export async function run(t: SuiteContext): Promise<void>`.
 *
 * A suite that cannot run (missing Chrome, Python, model weights) calls `t.skip(reason)`.
 * Skips are printed and counted separately; they never count as passes.
 * Exit code is 1 when any assertion fails or a suite throws.
 *
 * Usage: tsx evaluations/run-suites.ts [name-filter]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export interface SuiteContext {
  assert(condition: boolean, name: string, detail?: string): void;
  skip(reason: string): void;
  log(message: string): void;
}

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'suites');
const filter = process.argv[2];
const files = fs.existsSync(dir)
  ? fs.readdirSync(dir).filter(f => f.endsWith('.ts') && (!filter || f.includes(filter))).sort()
  : [];

let pass = 0;
let fail = 0;
let skip = 0;

for (const file of files) {
  console.log(`\n▶ ${file}`);
  const ctx: SuiteContext = {
    assert(condition, name, detail) {
      if (condition) {
        pass++;
        console.log(` ✅ PASS: ${name}`);
      } else {
        fail++;
        console.error(` ❌ FAIL: ${name}${detail ? ` (${detail})` : ''}`);
      }
    },
    skip(reason) {
      skip++;
      console.log(` ⏭  SKIP: ${reason}`);
    },
    log(message) {
      console.log(`    ${message}`);
    },
  };
  try {
    const mod = (await import(pathToFileURL(path.join(dir, file)).href)) as { run?: (t: SuiteContext) => Promise<void> };
    if (typeof mod.run !== 'function') throw new Error('suite does not export run()');
    await mod.run(ctx);
  } catch (err) {
    fail++;
    console.error(` ❌ FAIL: ${file} threw: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  }
}

console.log(`\nSUITES SUMMARY: ${pass} Passed, ${fail} Failed, ${skip} Skipped (${files.length} suites)`);
process.exit(fail > 0 ? 1 : 0);
