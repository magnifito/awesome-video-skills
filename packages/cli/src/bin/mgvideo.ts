#!/usr/bin/env node
import { Command } from 'commander';
import path from 'node:path';
import { runDoctor } from '../commands/doctor.js';
import { runCatalog } from '../commands/catalog.js';
import { runInit } from '../commands/init.js';
import { runPlan } from '../commands/plan.js';
import { runRender } from '../commands/render.js';
import { runValidate } from '../commands/validate.js';
import { runPackage } from '../commands/package.js';
import { runBatchCommerce } from '../commands/batch.js';
import { runUpstreamCheck, runUpstreamPropose } from '../commands/upstream.js';

const program = new Command();

program
  .name('mgvideo')
  .description('Magnifito Super Video CLI - maintained video production toolkit')
  .version('0.1.0');

// mgvideo doctor
program
  .command('doctor')
  .description('Check the selected worker, pinned tools, fonts, and required provider configuration')
  .action(async () => {
    try {
      const res = await runDoctor();
      console.log('\n🔍 Magnifito Video Worker Diagnostic:');
      for (const item of res.items) {
        const icon = item.status === 'ok' ? '✅' : item.status === 'warning' ? '⚠️' : '❌';
        console.log(` ${icon} ${item.component.padEnd(32)} [${item.status.toUpperCase()}] ${item.version ? `(${item.version}) ` : ''}- ${item.details}`);
      }
      console.log(`\nOverall Status: ${res.passed ? 'READY FOR PRODUCTION' : 'CONFIGURATION NEEDED'}\n`);
      if (!res.passed) process.exit(1);
    } catch (err) {
      console.error('Doctor command failed:', err);
      process.exit(1);
    }
  });

// mgvideo catalog
program
  .command('catalog')
  .description('Show capabilities, source provenance, observed versions, and approved versions')
  .action(async () => {
    try {
      const workspaceRoot = process.cwd();
      const res = await runCatalog(workspaceRoot);
      console.log('\n📚 Magnifito Super Video Production Catalog');
      console.log(`Tracked Upstream Repositories: ${res.tracked_upstreams_count}`);
      console.log('--------------------------------------------------------------------------------');
      console.log('ID'.padEnd(30) + 'OBSERVED'.padEnd(14) + 'APPROVED'.padEnd(16) + 'LICENSE');
      console.log('--------------------------------------------------------------------------------');
      for (const r of (res.repositories as Array<Record<string, string>>)) {
        console.log(`${r.id.padEnd(30)}${r.observed_commit.padEnd(14)}${r.approved_commit.padEnd(16)}${r.license}`);
      }
      console.log('--------------------------------------------------------------------------------');
      console.log(`\nCanonical Skills (${(res.canonical_skills as Array<unknown>).length}):`);
      for (const s of (res.canonical_skills as Array<Record<string, string>>)) {
        console.log(` • ${s.id.padEnd(26)} - ${s.responsibility}`);
      }
      console.log(`\nRegistered Adapters (${(res.adapters as Array<unknown>).length}):`);
      for (const a of (res.adapters as Array<Record<string, string>>)) {
        console.log(` • ${a.id.padEnd(16)} [Tier: ${a.tier.padEnd(12)} Status: ${a.status}] - ${a.name}`);
      }
      console.log('');
    } catch (err) {
      console.error('Catalog command failed:', err);
      process.exit(1);
    }
  });

// mgvideo init <project>
program
  .command('init <project>')
  .description('Create a private job workspace with versioned brief, brand, asset, and toolkit locks')
  .option('-w, --workflow <type>', 'Workflow type', 'branded-promo')
  .option('-l, --language <lang>', 'Primary language', 'bg')
  .option('-d, --duration <seconds>', 'Target duration in seconds', '15')
  .action(async (projectPath, opts) => {
    try {
      const targetDir = path.resolve(process.cwd(), projectPath);
      const res = await runInit(targetDir, {
        workflow: opts.workflow,
        language: opts.language,
        duration: parseFloat(opts.duration)
      });
      console.log(`\n✨ Initialized Magnifito video workspace at: ${res.projectDir}`);
      console.log('Created contracts:');
      for (const f of res.filesCreated) {
        console.log(` • ${f}`);
      }
      console.log('\nNext step: run `mgvideo plan ' + projectPath + '`\n');
    } catch (err) {
      console.error('Init command failed:', err);
      process.exit(1);
    }
  });

// mgvideo plan <project>
program
  .command('plan <project>')
  .description('Produce the claims-linked scene plan and select its renderer and timing authority')
  .action(async (projectPath) => {
    try {
      const targetDir = path.resolve(process.cwd(), projectPath);
      const plan = await runPlan(targetDir);
      console.log(`\n📋 Generated scene plan with ${plan.scenes.length} scenes:`);
      for (const sc of plan.scenes) {
        console.log(` • [${sc.scene_id}] ${sc.duration_seconds}s (${sc.visual_recipe})`);
        console.log(`   Copy: "${sc.copy_text}"`);
        if (sc.claims_refs.length > 0) {
          console.log(`   Linked Claims: ${sc.claims_refs.join(', ')}`);
        }
      }
      console.log('\nScene plan written to scene-plan.json');
      console.log('Next step: run `mgvideo render ' + projectPath + '`\n');
    } catch (err) {
      console.error('Plan command failed:', err);
      process.exit(1);
    }
  });

// mgvideo render <project>
program
  .command('render <project>')
  .description('Execute a frozen render request and write a separately identified run result')
  .option('-f, --format <format>', 'Aspect ratio format (9:16, 16:9, 1:1)', '9:16')
  .option('--force', 'Bypass cache and force re-rendering', false)
  .action(async (projectPath, opts) => {
    try {
      const targetDir = path.resolve(process.cwd(), projectPath);
      console.log(`\n🎬 Starting render for ${projectPath}...`);
      const result = await runRender(targetDir, {
        format: opts.format,
        force: opts.force
      });
      console.log(`\nRender status: ${result.status.toUpperCase()}`);
      console.log(`Run ID: ${result.run_id}`);
      console.log(`Request Hash: ${result.request_hash}`);
      console.log(`Output: ${result.output_files[0]?.path}`);
      console.log(`Dimensions: ${result.measurements.width}x${result.measurements.height} @ ${result.measurements.fps}fps`);
      console.log(`Duration: ${result.measurements.duration_seconds}s | Audio: ${result.measurements.has_audio ? 'Yes' : 'No'}`);
      console.log('\nNext step: run `mgvideo validate ' + result.run_id + '`\n');
    } catch (err) {
      console.error('Render command failed:', err);
      process.exit(1);
    }
  });

// mgvideo validate <run>
program
  .command('validate <run>')
  .description('Check files, facts, timing, layout evidence, and export specifications; record unresolved review items')
  .option('-p, --project <project>', 'Project directory (optional if run is relative or absolute)')
  .action(async (runPath, opts) => {
    try {
      const report = await runValidate(runPath, opts.project);
      console.log(`\n🔎 Validation Report for Run: ${report.run_id}`);
      console.log(`Overall Result: ${report.passed ? 'PASSED ✅' : 'FAILED ❌'} (${report.passed_checks}/${report.total_checks} checks passed)\n`);
      for (const it of report.items) {
        console.log(` ${it.passed ? '✅' : '❌'} ${it.check.padEnd(35)}: ${it.details}`);
      }
      if (report.unresolved_review_items.length > 0) {
        console.log('\nUnresolved Review Items:');
        for (const un of report.unresolved_review_items) {
          console.log(` • ⚠️ ${un}`);
        }
      }
      console.log('');
      if (!report.passed) process.exit(1);
    } catch (err) {
      console.error('Validate command failed:', err);
      process.exit(1);
    }
  });

// mgvideo package <run>
program
  .command('package <run>')
  .description('Verify version-bound approvals and rights, then assemble the permitted client delivery')
  .option('-p, --project <project>', 'Project directory')
  .option('-r, --reviewer <name>', 'Reviewer name', 'Kiril Kirov')
  .action(async (runPath, opts) => {
    try {
      const pkg = await runPackage(runPath, opts.project, opts.reviewer);
      console.log(`\n📦 Assembled Client Delivery Package:`);
      console.log(`Destination: ${pkg.delivery_dir}`);
      console.log(`Package Hash: ${pkg.package_hash}`);
      console.log(`Reviewer: ${pkg.review_record.reviewer} (Status: ${pkg.review_record.decision.toUpperCase()})`);
      console.log('\nDelivered artifacts:');
      for (const f of pkg.files) {
        console.log(` • ${f}`);
      }
      console.log('\nDelivery complete and cryptographically bound to approved scope.\n');
    } catch (err) {
      console.error('Package command failed:', err);
      process.exit(1);
    }
  });

// mgvideo batch <catalog>
program
  .command('batch <catalog>')
  .description('Render a multi-SKU commerce batch with retry manifests and per-product status')
  .option('--force', 'Force re-render of cached SKUs', false)
  .action(async (catalogPath, opts) => {
    try {
      console.log(`\n🛍️ Processing Commerce Batch: ${catalogPath}...`);
      const rep = await runBatchCommerce(catalogPath, { force: opts.force });
      console.log(`\nBatch: ${rep.batch_id}`);
      console.log(`Total: ${rep.total_items} | Rendered: ${rep.rendered} | Cached: ${rep.cached} | Skipped: ${rep.skipped} | Failed: ${rep.failed}\n`);
      for (const it of rep.items) {
        const icon = it.status === 'rendered' || it.status === 'cached' ? '✅' : it.status === 'skipped_out_of_stock' ? '⏭️' : '❌';
        console.log(` ${icon} [${it.sku}] ${it.status.toUpperCase()} - "${it.title.slice(0, 40)}..."`);
        if (it.error) console.log(`    Error: ${it.error}`);
      }
      console.log('');
      if (rep.failed > 0) process.exit(1);
    } catch (err) {
      console.error('Batch command failed:', err);
      process.exit(1);
    }
  });

// mgvideo upstream check
// mgvideo upstream propose <source>
const upstream = program.command('upstream').description('Track and propose upstream changes');

upstream
  .command('check')
  .description('Detect source changes and produce a report without executing or promoting candidate code')
  .action(async () => {
    try {
      const workspaceRoot = process.cwd();
      const report = await runUpstreamCheck(workspaceRoot);
      console.log(`\n🛰️  Magnifito Upstream Tracking Report (${report.checked_at}):`);
      console.log(`Tracked repositories: ${report.total_tracked} | Candidates pending review: ${report.candidates_pending}\n`);
      for (const r of report.repositories) {
        const badge = r.change_status === 'up_to_date' ? '✅ UP TO DATE' : '⏳ CANDIDATE';
        console.log(` • ${r.repository_id.padEnd(28)} [${badge}] - ${r.notes}`);
      }
      console.log('\nStatic review gate enforced: Discovery does not execute untrusted code.\n');
    } catch (err) {
      console.error('Upstream check failed:', err);
      process.exit(1);
    }
  });

upstream
  .command('propose <source>')
  .description('Create or update the source candidate branch and record the exact proposed commit')
  .action(async (sourceId) => {
    try {
      const workspaceRoot = process.cwd();
      const prop = await runUpstreamPropose(workspaceRoot, sourceId);
      console.log(`\n📝 Upstream Proposal for: ${prop.source_id}`);
      console.log(`Candidate Branch: ${prop.candidate_branch}`);
      console.log(`Frozen Commit SHA: ${prop.frozen_commit}`);
      console.log(`Affected Canonical Skills: ${prop.affected_skills.join(', ')}`);
      console.log(`License Status: ${prop.license_status}`);
      console.log(`Execution Policy: ${prop.execution_policy}`);
      console.log(`Rollback Command: ${prop.rollback_command}\n`);
    } catch (err) {
      console.error('Upstream propose failed:', err);
      process.exit(1);
    }
  });

program.parse(process.argv);

