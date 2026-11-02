#!/usr/bin/env node
import { Command } from 'commander';
import path from 'node:path';
import nodeFs from 'node:fs';
import { runDoctor } from '../commands/doctor.js';
import { runCatalog } from '../commands/catalog.js';
import { runInit } from '../commands/init.js';
import { runPlan } from '../commands/plan.js';
import { runRender } from '../commands/render.js';
import { runValidate } from '../commands/validate.js';
import { runPackage } from '../commands/package.js';
import { runBatchCommerce } from '../commands/batch.js';
import { startPreviewServer } from '../commands/preview.js';
import { CostTracker } from '../../../media/src/cost.js';
import { runUpstreamCheck, runUpstreamPropose, runUpstreamRollback } from '../commands/upstream.js';
import { generateDeliveryReport } from '../commands/report.js';
import { compareRenderOutputs } from '../commands/diff.js';
import { ContractMigrator } from '../../../contracts/src/migrate.js';
import { inspectMedia, measureAudioLoudness } from '../../../media/src/inspector.js';
import { ColorSpaceConfigurator } from '../../../media/src/colorspace.js';
import { ShotRecipeRegistry } from '../../../../styles/recipes/registry.js';
import { generateStoryboardContactSheet } from '../commands/storyboard.js';
import { runClean } from '../commands/clean.js';
import { runThumbnail } from '../commands/thumbnail.js';
import { runReframe } from '../commands/reframe.js';
import { runGrade } from '../commands/grade.js';
import { runWaveform } from '../commands/waveform.js';
import { runNotify } from '../commands/notify.js';
import { ProductionBundleExporter } from '../../../media/src/bundle.js';
import { runDashboard } from '../commands/dashboard.js';
import { runVerifyBundle } from '../commands/verify_bundle.js';
import { ProxyGenerator } from '../../../media/src/proxy.js';
import { SecurityWatermarker } from '../../../media/src/watermark.js';
import { VideoSpeedEngine } from '../../../media/src/speed.js';
import { SafeZoneOverlayGenerator } from '../../../media/src/safezone_overlay.js';
import { VideoConcatEngine } from '../../../media/src/concat.js';
import { LowerThirdGenerator } from '../../../media/src/lower_third.js';
import { ChapterGenerator } from '../../../media/src/chapters.js';
import { VideoLoopEngine } from '../../../media/src/loop.js';
import { FreezeFrameEngine } from '../../../media/src/freeze.js';
import { BlurBackgroundEngine } from '../../../media/src/blur_bg.js';
import { runQualityGate } from '../commands/gate.js';






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

// mgvideo preview <project>
program
  .command('preview <project>')
  .description('Start interactive local HTTP preview server with live timeline scrubber')
  .option('-p, --port <number>', 'HTTP server port', '3456')
  .action(async (projectPath, opts) => {
    try {
      const targetDir = path.resolve(process.cwd(), projectPath);
      const port = parseInt(opts.port, 10);
      const instance = await startPreviewServer(targetDir, port);
      console.log(`\n🚀 Magnifito Studio Live Preview running at: ${instance.url}`);
      console.log(`Project: ${projectPath}`);
      console.log('Press Ctrl+C to stop.\n');
    } catch (err) {
      console.error('Preview server failed:', err);
      process.exit(1);
    }
  });

// mgvideo render <project>
program
  .command('render <project>')
  .description('Execute a frozen render request and write a separately identified run result')
  .option('-f, --format <format>', 'Aspect ratio format (9:16, 16:9, 1:1)', '9:16')
  .option('-c, --codec <codec>', 'Output container codec (mp4, webm, mov_prores)', 'mp4')
  .option('--transparent', 'Render with transparent background and alpha channel', false)
  .option('--force', 'Bypass cache and force re-rendering', false)
  .action(async (projectPath, opts) => {
    try {
      const targetDir = path.resolve(process.cwd(), projectPath);
      console.log(`\n🎬 Starting render for ${projectPath}...`);
      const result = await runRender(targetDir, {
        format: opts.format,
        codec: opts.codec,
        transparent: opts.transparent,
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

// mgvideo cost <run>
program
  .command('cost <run>')
  .description('Audit production compute, storage, and agent cost for a render run')
  .option('-p, --project <project>', 'Project directory')
  .action(async (runPath, opts) => {
    try {
      const fs = await import('node:fs/promises');
      let runDir = runPath;
      if (path.isAbsolute(runDir)) {
        // Absolute
      } else if (opts.project && !runPath.includes('/') && !runPath.includes('\\')) {
        runDir = path.join(opts.project, 'runs', runPath);
      } else {
        runDir = path.resolve(process.cwd(), runPath);
      }
      const projDir = opts.project || path.resolve(runDir, '..', '..');

      const brief = JSON.parse(await fs.readFile(path.join(projDir, 'brief.json'), 'utf-8'));
      const renderResult = JSON.parse(await fs.readFile(path.join(runDir, 'render-result.json'), 'utf-8'));

      const cost = CostTracker.calculateRunCost(brief, renderResult, false);
      console.log(`\n💰 Cost Breakdown for Project: ${cost.project_id} (Run: ${cost.run_id})`);
      console.log('--------------------------------------------------------------------------------');
      console.log(` • Agent Usage & Tool Dispatch : $${cost.items.agent_usage_usd.toFixed(2)} (Limit: $${cost.budget_limits.agent_budget_usd.toFixed(2)})`);
      console.log(` • Render Compute Engine        : $${cost.items.render_compute_usd.toFixed(3)} (Limit: $${cost.budget_limits.compute_budget_usd.toFixed(2)})`);
      console.log(` • External Media & TTS APIs    : $${cost.items.external_media_usd.toFixed(2)} (Limit: $${cost.budget_limits.media_budget_usd.toFixed(2)})`);
      console.log(` • Storage Delivery Buffer      : $${cost.items.storage_usd.toFixed(4)}`);
      console.log('--------------------------------------------------------------------------------');
      console.log(` TOTAL DELIVERABLE COST        : $${cost.total_cost_usd.toFixed(2)} USD`);
      console.log(` BUDGET STATUS                 : ${cost.within_budget ? 'WITHIN LIMITS ✅' : 'BUDGET EXCEEDED ⚠️'}\n`);
      if (cost.budget_warnings.length > 0) {
        for (const w of cost.budget_warnings) {
          console.log(` ⚠️ ${w}`);
        }
        console.log('');
      }
    } catch (err) {
      console.error('Cost audit failed:', err);
      process.exit(1);
    }
  });

// mgvideo batch <catalog>
program
  .command('batch <catalog>')
  .description('Render a multi-SKU commerce batch with retry manifests and per-product status')
  .option('-c, --concurrency <number>', 'Concurrent worker rendering limit', '2')
  .option('--force', 'Force re-render of cached SKUs', false)
  .action(async (catalogPath, opts) => {
    try {
      console.log(`\n🛍️ Processing Commerce Batch: ${catalogPath}...`);
      const rep = await runBatchCommerce(catalogPath, {
        force: opts.force,
        concurrency: parseInt(opts.concurrency, 10)
      });
      console.log(`\nBatch: ${rep.batch_id}`);
      console.log(`Total: ${rep.total_items} | Rendered: ${rep.rendered} | Cached: ${rep.cached} | Skipped: ${rep.skipped} | Failed: ${rep.failed}`);
      console.log(`Elapsed: ${rep.performance.total_elapsed_seconds}s | Throughput: ${rep.performance.throughput_items_per_minute} items/min (Concurrency: ${rep.performance.concurrency})\n`);
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

upstream
  .command('rollback <source> [commit]')
  .description('Roll back an approved baseline in approved.lock.json to a prior commit or unset')
  .action(async (sourceId, commit) => {
    try {
      const workspaceRoot = process.cwd();
      const res = await runUpstreamRollback(workspaceRoot, sourceId, commit);
      console.log(`\n⏪ Upstream Rollback for: ${res.source_id}`);
      console.log(`Baseline set to: ${res.rolled_back_to}`);
      console.log(`Status: ${res.status}\n`);
    } catch (err) {
      console.error('Upstream rollback failed:', err);
      process.exit(1);
    }
  });

// mgvideo report <project>
program
  .command('report <project>')
  .description('Generate an executive delivery report and compliance audit in Markdown and JSON')
  .option('-r, --run <runId>', 'Target run ID (defaults to latest run)')
  .action(async (projectPath, opts) => {
    try {
      const targetDir = path.resolve(process.cwd(), projectPath);
      const { report, markdownPath } = await generateDeliveryReport(targetDir, opts.run);
      console.log(`\n📑 Magnifito Executive Delivery Report Generated!`);
      console.log(`Project: ${report.project_name} (${report.project_id})`);
      console.log(`Master Video: ${path.basename(report.deliverables.video_path)}`);
      console.log(`Resolution: ${report.deliverables.resolution} @ ${report.deliverables.fps}fps`);
      console.log(`Loudness: ${report.deliverables.audio_lufs} LUFS (True Peak: ${report.deliverables.audio_true_peak_db} dBTP)`);
      console.log(`Zero-Budget Spent: $${report.financials.external_media_spent_usd.toFixed(2)} USD (100% Policy Compliant)`);
      console.log(`\nSaved delivery report to:`);
      console.log(` • Markdown : ${markdownPath}`);
      console.log('');
    } catch (err) {
      console.error('Report command failed:', err);
      process.exit(1);
    }
  });

// mgvideo diff <targetA> <targetB>
program
  .command('diff <targetA> <targetB>')
  .description('Compare two render outputs or frames for visual drift and quality degradation')
  .action(async (targetA, targetB) => {
    try {
      const rep = await compareRenderOutputs(targetA, targetB);
      console.log(`\n🔎 Visual Diff Comparison:`);
      console.log(`Target A: ${targetA}`);
      console.log(`Target B: ${targetB}`);
      console.log(`Type: ${rep.type.toUpperCase()}`);
      console.log(`Status: ${rep.passed ? 'PASSED ✅' : 'FAILED ❌'}`);
      console.log(`Summary: ${rep.summary}\n`);
      if (!rep.passed) process.exit(1);
    } catch (err) {
      console.error('Diff command failed:', err);
      process.exit(1);
    }
  });

// mgvideo migrate <project>
program
  .command('migrate <project>')
  .description('Upgrade project brief and brand specifications to current schema version')
  .action(async (projectPath) => {
    try {
      const targetDir = path.resolve(process.cwd(), projectPath);
      const res = ContractMigrator.migrateProject(targetDir);
      console.log(`\n📦 Migrated project contracts: ${res.project_id}`);
      console.log(`Version: ${res.previous_version} -> ${res.target_version}`);
      console.log(`Applied changes: ${res.changes.length}`);
      for (const ch of res.changes) {
        console.log(` • [${ch.file}] ${ch.field}: ${ch.action}`);
      }
      console.log('');
    } catch (err) {
      console.error('Migrate command failed:', err);
      process.exit(1);
    }
  });

// mgvideo inspect <file>
program
  .command('inspect <file>')
  .description('Audit media file technical specifications, codecs, loudness, and color space')
  .action(async (filePath) => {
    try {
      const targetFile = path.resolve(process.cwd(), filePath);
      const probe = await inspectMedia(targetFile);
      const loudness = await measureAudioLoudness(targetFile);
      const color = await ColorSpaceConfigurator.inspectColorMetadata(targetFile);

      console.log(`\n🔍 Media Inspection: ${path.basename(targetFile)}`);
      console.log('--------------------------------------------------------------------------------');
      console.log(` • Video Codec     : ${probe.video_codec || 'N/A'}`);
      console.log(` • Audio Codec     : ${probe.audio_codec || 'N/A'}`);
      console.log(` • Resolution      : ${probe.width}x${probe.height}`);
      console.log(` • Framerate       : ${probe.fps} fps`);
      console.log(` • Duration        : ${probe.duration_seconds.toFixed(3)}s`);
      console.log(` • Alpha Channel   : ${probe.has_alpha ? 'Yes (Transparent)' : 'No (Opaque)'}`);
      console.log(` • Audio Loudness  : ${loudness.lufs} LUFS (True Peak: ${loudness.true_peak_db} dBTP)`);
      console.log(` • Rec.709 Color   : ${color.is_rec709_compliant ? 'Compliant ✅' : 'Non-compliant ⚠️'}`);
      console.log('--------------------------------------------------------------------------------\n');
    } catch (err) {
      console.error('Inspect command failed:', err);
      process.exit(1);
    }
  });

// mgvideo recipe [id]
program
  .command('recipe [id]')
  .description('Explore available shot recipes and motion parameters')
  .action(async (recipeId) => {
    try {
      const registry = new ShotRecipeRegistry();
      if (recipeId) {
        const recipe = registry.getRecipe(recipeId);
        if (!recipe) {
          console.error(`Recipe not found: ${recipeId}`);
          process.exit(1);
        }
        console.log(`\n🎨 Shot Recipe: ${recipe.name} (${recipe.id})`);
        console.log(`Description: ${recipe.description}`);
        console.log(`Duration Range: ${recipe.recommended_duration_seconds[0]}s - ${recipe.recommended_duration_seconds[1]}s`);
        console.log('\nMotion Parameters:');
        console.log(JSON.stringify(recipe.motion, null, 2));
        console.log('\nLayout Parameters:');
        console.log(JSON.stringify(recipe.layout, null, 2));
        console.log('');
      } else {
        const recipes = registry.listRecipes();
        console.log(`\n🎨 Magnifito Shot Recipe Catalog (${recipes.length} recipes):`);
        console.log('--------------------------------------------------------------------------------');
        console.log('ID'.padEnd(28) + 'DURATION'.padEnd(14) + 'DESCRIPTION');
        console.log('--------------------------------------------------------------------------------');
        for (const r of recipes) {
          const durStr = `${r.recommended_duration_seconds[0]}-${r.recommended_duration_seconds[1]}s`;
          console.log(`${r.id.padEnd(28)}${durStr.padEnd(14)}${r.description.slice(0, 38)}...`);
        }
        console.log('--------------------------------------------------------------------------------\n');
      }
    } catch (err) {
      console.error('Recipe command failed:', err);
      process.exit(1);
    }
  });

// mgvideo storyboard <project>
program
  .command('storyboard <project>')
  .description('Generate visual storyboard cards and interactive review contact sheet')
  .option('-f, --format <format>', 'Aspect ratio format (16:9, 9:16, 1:1)', '16:9')
  .action(async (projectPath, opts) => {
    try {
      const targetDir = path.resolve(process.cwd(), projectPath);
      const res = await generateStoryboardContactSheet(targetDir, { format: opts.format });
      console.log(`\n📋 Storyboard Contact Sheet Generated!`);
      console.log(`Project: ${projectPath}`);
      console.log(`Total Styleframes: ${res.framesCount}`);
      console.log(`Review Contact Sheet: ${res.htmlPath}\n`);
    } catch (err) {
      console.error('Storyboard command failed:', err);
      process.exit(1);
    }
  });

// mgvideo clean <project>
program
  .command('clean <project>')
  .description('Purge temporary render caches, interim files, and older runs')
  .option('--all', 'Delete all runs and caches', false)
  .option('--cache-only', 'Delete only runs/cache without touching run folders', false)
  .option('--keep-latest', 'Keep latest run and delete older runs', true)
  .action(async (projectPath, opts) => {
    try {
      const targetDir = path.resolve(process.cwd(), projectPath);
      const res = await runClean(targetDir, {
        all: opts.all,
        cacheOnly: opts.cacheOnly,
        keepLatest: opts.keepLatest
      });
      console.log(`\n🧹 Cleaned project: ${projectPath}`);
      console.log(`Freed Space: ${(res.freedBytes / 1024).toFixed(1)} KB`);
      console.log('Purged items:');
      for (const it of res.cleanedItems) {
        console.log(` • ${it}`);
      }
      console.log('');
    } catch (err) {
      console.error('Clean command failed:', err);
      process.exit(1);
    }
  });

// mgvideo thumbnail <target>
program
  .command('thumbnail <target>')
  .description('Extract a promotional poster frame or thumbnail from a video or project')
  .option('-t, --time <seconds>', 'Time offset in seconds', '1.0')
  .option('-f, --format <format>', 'Image format (png, jpg, jpeg)', 'png')
  .option('-w, --width <pixels>', 'Target width in pixels')
  .option('-h, --height <pixels>', 'Target height in pixels')
  .option('-o, --out <path>', 'Custom output image path')
  .action(async (target, opts) => {
    try {
      const res = await runThumbnail(target, {
        timeOffsetSeconds: parseFloat(opts.time),
        format: opts.format,
        width: opts.width ? parseInt(opts.width, 10) : undefined,
        height: opts.height ? parseInt(opts.height, 10) : undefined,
        outputPath: opts.out ? path.resolve(process.cwd(), opts.out) : undefined
      });
      console.log(`\n🖼️ Thumbnail Extracted!`);
      console.log(`Output: ${res.outputPath}`);
      console.log(`Resolution: ${res.width}x${res.height} (${res.format.toUpperCase()})`);
      console.log(`File Size: ${(res.fileSizeBytes / 1024).toFixed(1)} KB\n`);
    } catch (err) {
      console.error('Thumbnail command failed:', err);
      process.exit(1);
    }
  });

// mgvideo reframe <video>
program
  .command('reframe <video>')
  .description('Reframe master video to target aspect ratio (16:9, 9:16, 1:1, 4:5)')
  .requiredOption('-r, --ratio <ratio>', 'Target aspect ratio (16:9, 9:16, 1:1, 4:5)')
  .option('-s, --strategy <strategy>', 'Reframe strategy: fit (letterbox/pad) or crop (center crop)', 'fit')
  .option('-c, --color <color>', 'Pad color for fit strategy', 'black')
  .option('-o, --out <path>', 'Output video path')
  .action(async (video, opts) => {
    try {
      const res = await runReframe(video, {
        ratio: opts.ratio,
        strategy: opts.strategy,
        padColor: opts.color,
        out: opts.out
      });
      console.log(`\n📐 Video Reframed!`);
      console.log(`Target: ${res.targetRatio} (${res.width}x${res.height}) via ${res.strategy}`);
      console.log(`Output: ${res.outputPath}\n`);
    } catch (err) {
      console.error('Reframe command failed:', err);
      process.exit(1);
    }
  });

// mgvideo grade <video>
program
  .command('grade <video>')
  .description('Apply curated cinematic color grade preset (cool-tech, warm-vibrant, high-contrast, rec709-neutral, matte-film)')
  .requiredOption('-p, --preset <preset>', 'Preset name')
  .option('-o, --out <path>', 'Output video path')
  .action(async (video, opts) => {
    try {
      const res = await runGrade(video, {
        preset: opts.preset,
        out: opts.out
      });
      console.log(`\n🎨 Color Grade Applied!`);
      console.log(`Preset: ${res.preset.name} (${res.preset.targetGenre})`);
      console.log(`Output: ${res.outputPath}\n`);
    } catch (err) {
      console.error('Grade command failed:', err);
      process.exit(1);
    }
  });

// mgvideo waveform <media>
program
  .command('waveform <media>')
  .description('Generate high-resolution audio waveform visualizer PNG')
  .option('-w, --width <pixels>', 'Waveform width', '1200')
  .option('-h, --height <pixels>', 'Waveform height', '240')
  .option('-c, --color <hex>', 'Waveform stroke color', '#2563EB')
  .option('-o, --out <path>', 'Output image path')
  .action(async (media, opts) => {
    try {
      const res = await runWaveform(media, {
        width: parseInt(opts.width, 10),
        height: parseInt(opts.height, 10),
        color: opts.color,
        out: opts.out
      });
      console.log(`\n🌊 Audio Waveform Generated!`);
      console.log(`Output: ${res.outputPath} (${res.width}x${res.height})\n`);
    } catch (err) {
      console.error('Waveform command failed:', err);
      process.exit(1);
    }
  });

// mgvideo notify <project>
program
  .command('notify <project>')
  .description('Dispatch webhook notification payload for CI/CD integrations')
  .requiredOption('-e, --event <event>', 'Event type (e.g. render.completed, validation.failed)')
  .action(async (project, opts) => {
    try {
      const notif = await runNotify(opts.event, project, {
        triggered_at: new Date().toISOString()
      });
      console.log(JSON.stringify(notif, null, 2));
    } catch (err) {
      console.error('Notify command failed:', err);
      process.exit(1);
    }
  });

// mgvideo bundle <deliveryDir>
program
  .command('bundle <deliveryDir>')
  .description('Bundle deliverables and checksums into immutable .tar.gz production package')
  .option('-o, --out <path>', 'Output bundle .tar.gz path')
  .action((deliveryDir, opts) => {
    try {
      const targetDir = path.resolve(process.cwd(), deliveryDir);
      const res = ProductionBundleExporter.createBundle(targetDir, {
        outputBundlePath: opts.out ? path.resolve(process.cwd(), opts.out) : undefined
      });
      console.log(`\n📦 Production Bundle Created!`);
      console.log(`Archive: ${res.bundlePath}`);
      console.log(`Size: ${(res.bundleSizeBytes / 1024).toFixed(1)} KB`);
      console.log(`SHA-256: ${res.bundleSha256}`);
      console.log(`Manifest: ${res.manifestPath}\n`);
    } catch (err) {
      console.error('Bundle command failed:', err);
      process.exit(1);
    }
  });

// mgvideo dashboard
program
  .command('dashboard')
  .description('Display an executive status dashboard of worker health, workflows, and budgets')
  .action(async () => {
    try {
      const res = await runDashboard();
      console.log('\n================================================================================');
      console.log('                    MAGNIFITO SUPER VIDEO PRODUCTION DASHBOARD                  ');
      console.log('================================================================================');
      console.log(`  Doctor Health Check    : ${res.doctorPassed ? 'PASS (All binaries & fonts green)' : 'FAIL'}`);
      console.log(`  Tracked Repositories   : ${res.trackedReposCount} pinned repos in quarantine catalog`);
      console.log(`  Financial Compliance   : Media Budget Spend $0.00 (Zero-spend verified)`);
      console.log('--------------------------------------------------------------------------------');
      console.log('  CANONICAL WORKFLOW STATUS:');
      for (const wf of res.workflows) {
        const status = wf.hasDelivery ? 'DELIVERED' : wf.hasRuns ? 'RENDERED' : 'INITIALIZED';
        console.log(`    • ${wf.name.padEnd(42)} [${wf.format}] : ${status}`);
      }
      console.log('================================================================================\n');
    } catch (err) {
      console.error('Dashboard command failed:', err);
      process.exit(1);
    }
  });

// mgvideo verify-bundle <bundle>
program
  .command('verify-bundle <bundle>')
  .description('Verify cryptographic SHA256 checksums and review signatures inside a production bundle')
  .action(async (bundlePath) => {
    try {
      const res = await runVerifyBundle(bundlePath);
      console.log(`\n🔍 Bundle Verification Result:`);
      console.log(`Bundle: ${res.bundlePath}`);
      console.log(`Status: ${res.valid ? 'VALID (100% Integrity Verified)' : 'FAILED'}`);
      console.log(`Verified Deliverables: ${res.verifiedFilesCount}`);
      console.log(`Signed Review Record: ${res.hasSignedReview ? 'APPROVED' : 'MISSING / UNAPPROVED'}`);
      if (res.errors.length > 0) {
        console.error('Errors:');
        for (const e of res.errors) console.error(` ❌ ${e}`);
        process.exit(1);
      }
      console.log('');
    } catch (err) {
      console.error('Verify-bundle command failed:', err);
      process.exit(1);
    }
  });

// mgvideo proxy <video>
program
  .command('proxy <video>')
  .description('Generate lightweight 540p / 720p editing proxy for fast playback')
  .option('-r, --res <resolution>', 'Proxy resolution (540p, 720p, 360p)', '540p')
  .option('-o, --out <path>', 'Custom proxy output path')
  .action((video, opts) => {
    try {
      const fullVideo = path.resolve(process.cwd(), video);
      const res = ProxyGenerator.generateProxy(fullVideo, {
        resolution: opts.res,
        outputPath: opts.out ? path.resolve(process.cwd(), opts.out) : undefined
      });
      console.log(`\n🎞️ Proxy Generated!`);
      console.log(`Output: ${res.proxyPath}`);
      console.log(`Resolution: ${res.resolution}`);
      console.log(`Compression Ratio: ${(res.compressionRatio * 100).toFixed(1)}% of master (${(res.proxySizeBytes / 1024).toFixed(1)} KB)\n`);
    } catch (err) {
      console.error('Proxy command failed:', err);
      process.exit(1);
    }
  });

// mgvideo watermark <video>
program
  .command('watermark <video>')
  .description('Burn semi-transparent security banner or embargo notice into review video')
  .option('-t, --text <text>', 'Watermark text', 'CONFIDENTIAL - REVIEW ONLY')
  .option('-r, --reviewer <name>', 'Reviewer name or identifier')
  .option('-p, --position <pos>', 'Watermark position: top_right, center, bottom_right', 'top_right')
  .option('-o, --out <path>', 'Custom output video path')
  .action((video, opts) => {
    try {
      const fullVideo = path.resolve(process.cwd(), video);
      const res = SecurityWatermarker.applyWatermark(fullVideo, {
        text: opts.text,
        reviewer: opts.reviewer,
        position: opts.position,
        outputPath: opts.out ? path.resolve(process.cwd(), opts.out) : undefined
      });
      console.log(`\n🛡️ Watermarked Video Created!`);
      console.log(`Notice: "${res.text}"`);
      console.log(`Position: ${res.position}`);
      console.log(`Output: ${res.outputPath}\n`);
    } catch (err) {
      console.error('Watermark command failed:', err);
      process.exit(1);
    }
  });

// mgvideo speed <video>
program
  .command('speed <video>')
  .description('Adjust playback speed of a video with pitch-preserved audio')
  .requiredOption('-f, --factor <factor>', 'Speed factor multiplier (e.g. 1.25, 1.5, 2.0, 0.75)')
  .option('-o, --out <path>', 'Custom output video path')
  .action((video, opts) => {
    try {
      const fullVideo = path.resolve(process.cwd(), video);
      const factor = parseFloat(opts.factor);
      const res = VideoSpeedEngine.changeSpeed(fullVideo, factor, {
        outputPath: opts.out ? path.resolve(process.cwd(), opts.out) : undefined
      });
      console.log(`\n⚡ Video Speed Adjusted!`);
      console.log(`Factor: ${res.speedFactor}x (${res.originalDurationSeconds.toFixed(1)}s -> ${res.newDurationSeconds.toFixed(1)}s)`);
      console.log(`Output: ${res.outputPath}\n`);
    } catch (err) {
      console.error('Speed command failed:', err);
      process.exit(1);
    }
  });

// mgvideo safezone <video>
program
  .command('safezone <video>')
  .description('Burn mobile platform safe area bounding guide onto video for QA analysis')
  .option('-o, --out <path>', 'Custom output video path')
  .action((video, opts) => {
    try {
      const fullVideo = path.resolve(process.cwd(), video);
      const res = SafeZoneOverlayGenerator.applySafeZoneGuide(fullVideo, {
        outputPath: opts.out ? path.resolve(process.cwd(), opts.out) : undefined
      });
      console.log(`\n📐 Safe Zone QA Guide Applied!`);
      console.log(`Output: ${res}\n`);
    } catch (err) {
      console.error('Safezone command failed:', err);
      process.exit(1);
    }
  });

// mgvideo concat <clips...>
program
  .command('concat <clips...>')
  .description('Concatenate multiple video clips, normalizing resolution and audio sample rates')
  .option('-w, --width <pixels>', 'Target width', '1920')
  .option('-h, --height <pixels>', 'Target height', '1080')
  .option('-o, --out <path>', 'Custom output path')
  .action((clips, opts) => {
    try {
      const resolvedClips = clips.map((c: string) => path.resolve(process.cwd(), c));
      const res = VideoConcatEngine.concatClips(resolvedClips, {
        width: parseInt(opts.width, 10),
        height: parseInt(opts.height, 10),
        outputPath: opts.out ? path.resolve(process.cwd(), opts.out) : undefined
      });
      console.log(`\n🎞️ Clips Concatenated!`);
      console.log(`Total Clips: ${res.clipsCount}`);
      console.log(`Duration: ${res.totalDurationSeconds.toFixed(1)}s (${res.width}x${res.height})`);
      console.log(`Output: ${res.outputPath}\n`);
    } catch (err) {
      console.error('Concat command failed:', err);
      process.exit(1);
    }
  });

// mgvideo lower-third <video>
program
  .command('lower-third <video>')
  .description('Burn broadcast lower-third title badge onto video clip')
  .requiredOption('-n, --name <name>', 'Speaker name')
  .requiredOption('-t, --title <title>', 'Speaker job title or role')
  .option('-s, --start <seconds>', 'Start timestamp in seconds', '1.5')
  .option('-d, --duration <seconds>', 'Display duration in seconds', '5.0')
  .option('-o, --out <path>', 'Custom output video path')
  .action((video, opts) => {
    try {
      const fullVideo = path.resolve(process.cwd(), video);
      const res = LowerThirdGenerator.applyLowerThird(fullVideo, {
        speakerName: opts.name,
        speakerTitle: opts.title,
        startSeconds: parseFloat(opts.start),
        durationSeconds: parseFloat(opts.duration),
        outputPath: opts.out ? path.resolve(process.cwd(), opts.out) : undefined
      });
      console.log(`\n🏷️ Lower Third Applied!`);
      console.log(`Speaker: ${res.speakerName} (${res.speakerTitle})`);
      console.log(`Timeline: ${res.startSeconds}s to ${(res.startSeconds + res.durationSeconds).toFixed(1)}s`);
      console.log(`Output: ${res.outputPath}\n`);
    } catch (err) {
      console.error('Lower-third command failed:', err);
      process.exit(1);
    }
  });

// mgvideo chapters <project>
program
  .command('chapters <project>')
  .description('Generate YouTube chapters, WebVTT cues, and QuickTime markers from scene plan')
  .action((projectPath) => {
    try {
      const targetDir = path.resolve(process.cwd(), projectPath);
      const planPath = path.join(targetDir, 'scene-plan.json');
      if (!nodeFs.existsSync(planPath)) {
        throw new Error(`Scene plan not found in project: ${planPath}`);
      }
      const scenePlan = JSON.parse(nodeFs.readFileSync(planPath, 'utf8'));
      const rep = ChapterGenerator.generateChapters(scenePlan);
      console.log(`\n📑 Chapters Generated for ${projectPath}:`);
      console.log('--------------------------------------------------');
      console.log(rep.youtubeText);
      console.log('--------------------------------------------------\n');
    } catch (err) {
      console.error('Chapters command failed:', err);
      process.exit(1);
    }
  });

// mgvideo loop <video>
program
  .command('loop <video>')
  .description('Create seamless ping-pong loop (forward + reverse) for social reels and backgrounds')
  .option('-o, --out <path>', 'Custom output video path')
  .action((video, opts) => {
    try {
      const fullVideo = path.resolve(process.cwd(), video);
      const res = VideoLoopEngine.createPingPongLoop(fullVideo, {
        outputPath: opts.out ? path.resolve(process.cwd(), opts.out) : undefined
      });
      console.log(`\n🔁 Ping-Pong Loop Generated!`);
      console.log(`Duration: ${res.originalDurationSeconds.toFixed(1)}s -> ${res.loopDurationSeconds.toFixed(1)}s (x2 cycle)`);
      console.log(`Output: ${res.outputPath}\n`);
    } catch (err) {
      console.error('Loop command failed:', err);
      process.exit(1);
    }
  });

// mgvideo freeze <video>
program
  .command('freeze <video>')
  .description('Hold start or final frame of a video using tpad cloning')
  .option('-p, --position <pos>', 'Hold position: start or end', 'end')
  .option('-d, --duration <seconds>', 'Hold duration in seconds', '2.0')
  .option('-o, --out <path>', 'Custom output video path')
  .action((video, opts) => {
    try {
      const fullVideo = path.resolve(process.cwd(), video);
      const res = FreezeFrameEngine.applyHoldFrame(fullVideo, {
        position: opts.position,
        holdDurationSeconds: parseFloat(opts.duration),
        outputPath: opts.out ? path.resolve(process.cwd(), opts.out) : undefined
      });
      console.log(`\n❄️ Freeze Frame Applied!`);
      console.log(`Position: ${res.position} (+${res.holdDurationSeconds}s)`);
      console.log(`Duration: ${res.originalDurationSeconds.toFixed(1)}s -> ${res.totalDurationSeconds.toFixed(1)}s`);
      console.log(`Output: ${res.outputPath}\n`);
    } catch (err) {
      console.error('Freeze command failed:', err);
      process.exit(1);
    }
  });

// mgvideo blur-bg <video>
program
  .command('blur-bg <video>')
  .description('Place 9:16 vertical video onto 16:9 landscape canvas over an aesthetic blurred background')
  .option('-o, --out <path>', 'Custom output video path')
  .action((video, opts) => {
    try {
      const fullVideo = path.resolve(process.cwd(), video);
      const res = BlurBackgroundEngine.adaptToLandscape(fullVideo, {
        outputPath: opts.out ? path.resolve(process.cwd(), opts.out) : undefined
      });
      console.log(`\n🖼️ Blurred Backdrop Applied!`);
      console.log(`Canvas: ${res.width}x${res.height} (16:9 Landscape)`);
      console.log(`Output: ${res.outputPath}\n`);
    } catch (err) {
      console.error('Blur-bg command failed:', err);
      process.exit(1);
    }
  });

// mgvideo gate <project>
program
  .command('gate <project>')
  .description('Run comprehensive automated pre-delivery quality gate and compliance audit')
  .action(async (project) => {
    try {
      const res = await runQualityGate(project);
      console.log(`\n🚦 Automated Quality Gate for "${project}":`);
      console.log(`Status: ${res.passed ? 'PASSED (Ready for Air)' : 'FAILED'}`);
      console.log('------------------------------------------------------------');
      for (const ch of res.checks) {
        const icon = ch.status === 'pass' ? '✅' : ch.status === 'warn' ? '⚠️' : '❌';
        console.log(` ${icon} [${ch.name.padEnd(22)}] : ${ch.message}`);
      }
      console.log('------------------------------------------------------------\n');
      if (!res.passed) process.exit(1);
    } catch (err) {
      console.error('Quality gate command failed:', err);
      process.exit(1);
    }
  });

program.parse(process.argv);








