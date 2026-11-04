#!/usr/bin/env node
import { Argument, Command, Option } from 'commander';
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
import { resolveRunDir, resolveProjectDir, findWorkspaceRoot } from '../commands/_shared.js';
import { RENDER_FORMATS, RENDER_CODECS } from '../commands/render.js';
import { PIPELINE_EVENTS } from '../../../media/src/notifications.js';
import { safeColor } from '../../../media/src/proc.js';
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
import { FrameRateConverter } from '../../../media/src/framerate.js';
import { DeinterlaceEngine } from '../../../media/src/deinterlace.js';
import { AudioEqualizerEngine } from '../../../media/src/equalizer.js';
import { MontageGenerator } from '../../../media/src/montage.js';
import { MaskEngine } from '../../../media/src/mask.js';
import { AudioChannelMapper } from '../../../media/src/channel_map.js';
import { BitrateOptimizer } from '../../../media/src/bitrate.js';
import { MerkleManifest } from '../../../media/src/merkle.js';
import { AudioResampler } from '../../../media/src/resampler.js';
import { VideoReverseEngine } from '../../../media/src/reverse.js';
import { MatteEngine } from '../../../media/src/matte.js';
import { SfxSynthesizer, type SfxType } from '../../../media/src/sfx.js';
import { MetadataSanitizer } from '../../../media/src/sanitizer.js';
import { ChromaKeyEngine } from '../../../media/src/chromakey.js';
import { TitleBurner } from '../../../media/src/title_burner.js';
import { NoiseGateEngine } from '../../../media/src/noise_gate.js';
import { SmartCropEngine } from '../../../media/src/smart_crop.js';
import { AudioPanner } from '../../../media/src/panner.js';
import { GlitchEngine } from '../../../media/src/glitch.js';
import { MultiCamEngine } from '../../../media/src/multicam.js';
import { AudioCompressor } from '../../../media/src/compressor.js';
import { PipEngine } from '../../../media/src/pip.js';
import { VignetteEngine } from '../../../media/src/vignette.js';
import { DeClickerEngine } from '../../../media/src/declick.js';
import { runSetupSfx, runSfxPassCommand } from '../commands/sound_pass.js';
import { runBrollCheck, runBrollCompose, runBrollRender, runBrollWords } from '../commands/broll.js';
import { InvalidArgumentError } from 'commander';
import {
  estimateSeconds, parseFrameNumber, parsePoint, readSeparateMarker, separateVideo, setupSeparate,
  SEPARATE_MODELS, type CutoutFormat, type SeparateModelSize, type SeparatePoint,
} from '../../../media/src/separate.js';






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
      const workspaceRoot = findWorkspaceRoot();
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
  .option('--force', 'Overwrite existing brief, brand, claims, assets and lock files', false)
  .action(async (projectPath, opts) => {
    try {
      const targetDir = path.resolve(process.cwd(), projectPath);
      const res = await runInit(targetDir, {
        workflow: opts.workflow,
        language: opts.language,
        duration: parseFloat(opts.duration),
        force: opts.force
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
  .addOption(new Option('-f, --format <format>', 'Aspect ratio format (defaults to the first format in brief.json)').choices([...RENDER_FORMATS]))
  .addOption(new Option('-c, --codec <codec>', 'Output container codec').choices([...RENDER_CODECS]))
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
      console.log(`\nNext step: run \`mgvideo validate ${result.run_id} -p ${projectPath}\`\n`);
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
  .option('-r, --review <path>', 'Human review record to verify (default: <project>/review-record.json)')
  .action(async (runPath, opts) => {
    try {
      const pkg = await runPackage(runPath, opts.project, { reviewRecordPath: opts.review });
      console.log(`\n📦 Assembled Client Delivery Package:`);
      console.log(`Destination: ${pkg.delivery_dir}`);
      console.log(`Package Hash: ${pkg.package_hash}`);
      console.log(`Reviewer: ${pkg.review_record.reviewer} (Status: ${pkg.review_record.decision.toUpperCase()})`);
      console.log('\nDelivered artifacts:');
      for (const f of pkg.files) {
        console.log(` • ${f}`);
      }
      console.log(
        pkg.signed
          ? '\nDelivery complete. SHA256SUMS.txt is signed (SHA256SUMS.sig) and bound to the approved cut.\n'
          : '\nDelivery complete but UNSIGNED: set MGVIDEO_SIGNING_KEY to sign SHA256SUMS.txt.\n'
      );
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
      const runDir = resolveRunDir(runPath, opts.project);
      const projDir = resolveProjectDir(runDir, opts.project);

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
      const workspaceRoot = findWorkspaceRoot();
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
  .description('Print a review proposal for the observed upstream commit (advisory only: no branch is created)')
  .action(async (sourceId) => {
    try {
      const workspaceRoot = findWorkspaceRoot();
      const prop = await runUpstreamPropose(workspaceRoot, sourceId);
      console.log(`\n📝 Upstream Proposal for: ${prop.source_id}`);
      console.log(`Suggested Branch (not created): ${prop.candidate_branch}`);
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
  .description('Roll back an approved baseline in approved.lock.json to a previously approved commit (default: the most recent one)')
  .action(async (sourceId, commit) => {
    try {
      const workspaceRoot = findWorkspaceRoot();
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
      console.log(
        report.deliverables.audio_lufs === null
          ? 'Loudness: not measured'
          : `Loudness: ${report.deliverables.audio_lufs} LUFS (True Peak: ${report.deliverables.audio_true_peak_db} dBTP)`
      );
      console.log(`Review: ${report.governance.decision.toUpperCase()} (${report.governance.reviewer})`);
      console.log(
        `External Media Spent: $${report.financials.external_media_spent_usd.toFixed(2)} USD (${report.financials.zero_budget_compliant ? 'zero-budget brief' : 'brief allows media spend'})`
      );
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
  .option('--keep-latest', 'Delete every run except the newest one', false)
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
  .option('-H, --height <pixels>', 'Target height in pixels')
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
        padColor: safeColor(opts.color),
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
  .option('-H, --height <pixels>', 'Waveform height', '240')
  .option('-c, --color <hex>', 'Waveform stroke color', '#2563EB')
  .option('-o, --out <path>', 'Output image path')
  .action(async (media, opts) => {
    try {
      const res = await runWaveform(media, {
        width: parseInt(opts.width, 10),
        height: parseInt(opts.height, 10),
        color: safeColor(opts.color),
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
  .description('Print a webhook notification payload for CI/CD integrations (does not send it)')
  .addOption(new Option('-e, --event <event>', 'Event type').choices([...PIPELINE_EVENTS]).makeOptionMandatory())
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
      console.log(`  Doctor Health Check    : ${res.doctorPassed ? 'PASS (no errors; run `mgvideo doctor` for warnings)' : 'FAIL'}`);
      console.log(`  Tracked Repositories   : ${res.trackedReposCount} pinned repos in quarantine catalog`);
      console.log(
        `  Financial Compliance   : ${res.mediaBudgetZeroEnforced ? 'All fixture briefs declare a $0.00 media budget' : 'WARNING: a fixture brief allows non-zero media spend'}`
      );
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
  .description('Verify SHA256 checksums, the HMAC signature (MGVIDEO_SIGNING_KEY) and the approved review record inside a production bundle')
  .option('--allow-unsigned', 'Accept the bundle when no signing key is configured to check its signature', false)
  .action(async (bundlePath, opts) => {
    try {
      const res = await runVerifyBundle(bundlePath, { allowUnsigned: opts.allowUnsigned });
      console.log(`\n🔍 Bundle Verification Result:`);
      console.log(`Bundle: ${res.bundlePath}`);
      console.log(`Status: ${res.valid ? 'VALID' : 'FAILED'}`);
      console.log(`Signature: ${res.signatureStatus.toUpperCase()}`);
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
  .option('-H, --height <pixels>', 'Target height', '1080')
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

// mgvideo framerate <video>
program
  .command('framerate <video>')
  .description('Convert video to target broadcast or social framerate (24, 25, 30, 60 fps)')
  .option('-r, --fps <number>', 'Target framerate in frames per second', '30')
  .option('-o, --out <path>', 'Custom output video path')
  .action((video, opts) => {
    try {
      const fullVideo = path.resolve(process.cwd(), video);
      const res = FrameRateConverter.convertFps(fullVideo, {
        targetFps: parseInt(opts.fps, 10),
        outputPath: opts.out ? path.resolve(process.cwd(), opts.out) : undefined
      });
      console.log(`\n🎞️ Framerate Converted!`);
      console.log(`Framerate: ${res.originalFps}fps -> ${res.targetFps}fps`);
      console.log(`Output: ${res.outputPath}\n`);
    } catch (err) {
      console.error('Framerate conversion failed:', err);
      process.exit(1);
    }
  });

// mgvideo deinterlace <video>
program
  .command('deinterlace <video>')
  .description('Normalize interlaced footage to clean progressive scan frames via yadif')
  .option('-o, --out <path>', 'Custom output video path')
  .action((video, opts) => {
    try {
      const fullVideo = path.resolve(process.cwd(), video);
      const res = DeinterlaceEngine.deinterlace(fullVideo, {
        outputPath: opts.out ? path.resolve(process.cwd(), opts.out) : undefined
      });
      console.log(`\n📺 Deinterlaced Successfully!`);
      console.log(`Filter: ${res.filterApplied}`);
      console.log(`Output: ${res.outputPath}\n`);
    } catch (err) {
      console.error('Deinterlace failed:', err);
      process.exit(1);
    }
  });

// mgvideo eq <audio>
program
  .command('eq <audio>')
  .description('Apply audio equalization and vocal frequency sweetening')
  .option('-p, --preset <name>', 'EQ Preset (voice-presence, rumble-reduction, warm-broadcast, de-ess)', 'voice-presence')
  .option('-o, --out <path>', 'Custom output audio path')
  .action((audio, opts) => {
    try {
      const fullAudio = path.resolve(process.cwd(), audio);
      const res = AudioEqualizerEngine.applyEq(fullAudio, {
        preset: opts.preset,
        outputPath: opts.out ? path.resolve(process.cwd(), opts.out) : undefined
      });
      console.log(`\n🎛️ Audio Equalizer Applied!`);
      console.log(`Preset: ${res.preset}`);
      console.log(`Filters: ${res.filters.join(', ')}`);
      console.log(`Output: ${res.outputPath}\n`);
    } catch (err) {
      console.error('Equalizer command failed:', err);
      process.exit(1);
    }
  });

// mgvideo montage <images...>
program
  .command('montage <images...>')
  .description('Stitch storyboard styleframes into an animated review animatic video')
  .option('-s, --seconds <seconds>', 'Seconds per slide', '2.0')
  .option('-w, --width <pixels>', 'Video width', '1920')
  .option('-H, --height <pixels>', 'Video height', '1080')
  .option('-o, --out <path>', 'Custom output video path')
  .action((images, opts) => {
    try {
      const resolved = images.map((i: string) => path.resolve(process.cwd(), i));
      const res = MontageGenerator.createAnimatic(resolved, {
        secondsPerSlide: parseFloat(opts.seconds),
        width: parseInt(opts.width, 10),
        height: parseInt(opts.height, 10),
        outputPath: opts.out ? path.resolve(process.cwd(), opts.out) : undefined
      });
      console.log(`\n🖼️ Animatic Montage Generated!`);
      console.log(`Slides: ${res.imageCount} (${res.durationSeconds.toFixed(1)}s total)`);
      console.log(`Resolution: ${res.width}x${res.height}`);
      console.log(`Output: ${res.outputPath}\n`);
    } catch (err) {
      console.error('Montage command failed:', err);
      process.exit(1);
    }
  });

// mgvideo mask <video>
program
  .command('mask <video>')
  .description('Redact sensitive on-screen client credentials, API keys, or PII')
  .requiredOption('-b, --box <coords>', 'Bounding box "x,y,width,height"')
  .option('-m, --mode <mode>', 'Redaction mode: blur or solid', 'blur')
  .option('-o, --out <path>', 'Custom output video path')
  .action((video, opts) => {
    try {
      const fullVideo = path.resolve(process.cwd(), video);
      const parts = opts.box.split(',').map(Number);
      if (parts.length !== 4 || parts.some(isNaN)) {
        throw new Error('Bounding box must be "x,y,width,height" with numeric values');
      }
      const res = MaskEngine.applyRedaction(fullVideo, {
        x: parts[0],
        y: parts[1],
        width: parts[2],
        height: parts[3],
        mode: opts.mode
      }, {
        outputPath: opts.out ? path.resolve(process.cwd(), opts.out) : undefined
      });
      console.log(`\n🛡️ Redaction Mask Applied!`);
      console.log(`Region: [${res.box.x}, ${res.box.y}, ${res.box.width}x${res.box.height}] Mode: ${res.mode}`);
      console.log(`Output: ${res.outputPath}\n`);
    } catch (err) {
      console.error('Mask command failed:', err);
      process.exit(1);
    }
  });

// mgvideo channel-map <audio>
program
  .command('channel-map <audio>')
  .description('Remap audio channel layouts (mono-to-stereo, stereo-to-mono, left-only-to-stereo)')
  .option('-m, --mode <mode>', 'Remap mode: mono-to-stereo, stereo-to-mono, left-only-to-stereo', 'mono-to-stereo')
  .option('-o, --out <path>', 'Custom output audio path')
  .action((audio, opts) => {
    try {
      const fullAudio = path.resolve(process.cwd(), audio);
      const res = AudioChannelMapper.remap(fullAudio, {
        mode: opts.mode,
        outputPath: opts.out ? path.resolve(process.cwd(), opts.out) : undefined
      });
      console.log(`\n🎧 Channel Layout Remapped!`);
      console.log(`Mode: ${res.mode}`);
      console.log(`Output: ${res.outputPath}\n`);
    } catch (err) {
      console.error('Channel map command failed:', err);
      process.exit(1);
    }
  });

// mgvideo optimize <video>
program
  .command('optimize <video>')
  .description('Constrain video bitrate to meet file size limits (e.g. Discord 25MB, WhatsApp 16MB)')
  .option('-s, --size <mb>', 'Target maximum size in Megabytes', '10.0')
  .option('-o, --out <path>', 'Custom output video path')
  .action((video, opts) => {
    try {
      const fullVideo = path.resolve(process.cwd(), video);
      const res = BitrateOptimizer.optimizeToSize(fullVideo, {
        targetSizeMb: parseFloat(opts.size),
        outputPath: opts.out ? path.resolve(process.cwd(), opts.out) : undefined
      });
      console.log(`\n📉 Bitrate Optimized!`);
      console.log(`Size: ${(res.originalSizeBytes / 1024 / 1024).toFixed(2)}MB -> ${(res.optimizedSizeBytes / 1024 / 1024).toFixed(2)}MB (Target: ${res.targetSizeMb}MB)`);
      console.log(`Bitrate: ${res.videoBitrateKbps} kbps video + ${res.audioBitrateKbps} kbps audio`);
      console.log(`Output: ${res.outputPath}\n`);
    } catch (err) {
      console.error('Optimize command failed:', err);
      process.exit(1);
    }
  });

// mgvideo merkle <dir>
program
  .command('merkle <dir>')
  .description('Compute cryptographic Merkle tree root hash of deliverable directory')
  .action((dir) => {
    try {
      const fullDir = path.resolve(process.cwd(), dir);
      const res = MerkleManifest.computeTree(fullDir);
      console.log(`\n🌳 Cryptographic Merkle Root:`);
      console.log(`Directory: ${fullDir}`);
      console.log(`Root Hash: ${res.rootHash}`);
      console.log(`Leaves: ${res.leafCount} audited files across ${res.treeLevels} tree levels\n`);
    } catch (err) {
      console.error('Merkle command failed:', err);
      process.exit(1);
    }
  });

// mgvideo resample <audio>
program
  .command('resample <audio>')
  .description('Resample audio to broadcast standards (48000 Hz) or custom rate')
  .option('-r, --rate <hz>', 'Target sample rate in Hz', '48000')
  .option('-o, --out <path>', 'Custom output audio path')
  .action((audio, opts) => {
    try {
      const fullAudio = path.resolve(process.cwd(), audio);
      const res = AudioResampler.resample(fullAudio, {
        sampleRate: parseInt(opts.rate, 10),
        outputPath: opts.out ? path.resolve(process.cwd(), opts.out) : undefined
      });
      console.log(`\n🔊 Audio Resampled!`);
      console.log(`Sample Rate: ${res.originalSampleRate}Hz -> ${res.targetSampleRate}Hz`);
      console.log(`Output: ${res.outputPath}\n`);
    } catch (err) {
      console.error('Resample command failed:', err);
      process.exit(1);
    }
  });

// mgvideo reverse <video>
program
  .command('reverse <video>')
  .description('Reverse video and audio playback for rewind transitions or boomerang loops')
  .option('-o, --out <path>', 'Custom output video path')
  .action((video, opts) => {
    try {
      const fullVideo = path.resolve(process.cwd(), video);
      const res = VideoReverseEngine.reverse(fullVideo, {
        outputPath: opts.out ? path.resolve(process.cwd(), opts.out) : undefined
      });
      console.log(`\n⏪ Playback Reversed!`);
      console.log(`Duration: ${res.durationSeconds.toFixed(1)}s (Audio reversed: ${res.reversedAudio})`);
      console.log(`Output: ${res.outputPath}\n`);
    } catch (err) {
      console.error('Reverse command failed:', err);
      process.exit(1);
    }
  });

// mgvideo matte <video>
program
  .command('matte <video>')
  .description('Overlay cinematic letterbox or pillarbox matte bars (2.39:1, 1.85:1, 4:3)')
  .option('-p, --preset <preset>', 'Matte preset (2.39:1, 1.85:1, 4:3, custom)', '2.39:1')
  .option('-b, --bars <pixels>', 'Custom bar height in pixels')
  .option('-c, --color <color>', 'Bar color', 'black')
  .option('-o, --out <path>', 'Custom output video path')
  .action((video, opts) => {
    try {
      const fullVideo = path.resolve(process.cwd(), video);
      const res = MatteEngine.applyMatte(fullVideo, {
        preset: opts.preset,
        barHeightPixels: opts.bars ? parseInt(opts.bars, 10) : undefined,
        barColor: safeColor(opts.color),
        outputPath: opts.out ? path.resolve(process.cwd(), opts.out) : undefined
      });
      console.log(`\n🎬 Cinematic Matte Applied!`);
      console.log(`Preset: ${res.preset} (Bar size: ${res.barHeight}px)`);
      console.log(`Output: ${res.outputPath}\n`);
    } catch (err) {
      console.error('Matte command failed:', err);
      process.exit(1);
    }
  });

// mgvideo sfx <type>               procedural effect (whoosh, thud, pop, chime)
// mgvideo sfx <video> --cues ...    measured sound pass with the vendored CC0 library
program
  .command('sfx')
  .description('Synthesize a procedural effect (sfx <whoosh|thud|pop|chime>), or run the measured sound pass on a video (sfx <video> --cues cues.json --out dir)')
  .argument('<target>', 'Effect type (whoosh, thud, pop, chime) or, with --cues, the input video')
  .option('-d, --duration <seconds>', 'Procedural effect: sound duration in seconds')
  .option('-o, --out <path>', 'Procedural effect: output audio path. Sound pass: output directory')
  .option('--cues <file>', 'Sound pass: cues JSON ([{"t": 2.0, "type": "scene_cut", "desc": "..."}])')
  .option('--music <track>', 'Sound pass: music bed (beat grid analysed with librosa; needs `mgvideo setup sfx`)')
  .option('--music-db <db>', 'Sound pass: music gain relative to the track', '-12')
  .option('--music-source <text>', 'Sound pass: track, artist and link, written to CREDITS.txt')
  .option('--music-license <text>', 'Sound pass: the music licence the user confirmed')
  .option('--use-case <text>', 'Sound pass: where the video will be published (checked against known licence limits)')
  .option('--seed <n>', 'Sound pass: seed for picking takes from the library', '7')
  .option('--swaps <file>', 'Sound pass: swaps.json downloaded from report.html')
  .option('--snap-window <seconds>', 'Sound pass: max distance a cue with "snap": true moves to the beat', '0.12')
  .option('--no-proof', 'Sound pass: skip per-cue proof frames and waveforms')
  .action((target, opts) => {
    if (opts.cues) {
      try {
        if (!opts.out) throw new Error('--out <dir> is required for the sound pass');
        runSfxPassCommand(path.resolve(process.cwd(), target), opts);
      } catch (err) {
        console.error(`Sound pass failed: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
      return;
    }
    if (!SfxSynthesizer.TYPES.includes(target as SfxType)) {
      console.error(`Unknown effect type "${target}" (choices: ${SfxSynthesizer.TYPES.join(', ')}). For a sound pass on a video, pass --cues <file> --out <dir>.`);
      process.exit(1);
    }
    try {
      const res = SfxSynthesizer.synthesize(target as SfxType, {
        durationSeconds: opts.duration ? parseFloat(opts.duration) : undefined,
        outputPath: opts.out ? path.resolve(process.cwd(), opts.out) : undefined
      });
      console.log(`\n🎶 SFX Synthesized!`);
      console.log(`Type: ${res.type} (${res.durationSeconds.toFixed(2)}s @ ${res.sampleRate}Hz)`);
      console.log(`Output: ${res.outputPath}\n`);
    } catch (err) {
      console.error('SFX command failed:', err);
      process.exit(1);
    }
  });

// mgvideo sanitize <media>
program
  .command('sanitize <media>')
  .description('Strip sensitive camera metadata, geolocation, author tags, and local paths')
  .option('-o, --out <path>', 'Custom output media path')
  .action((media, opts) => {
    try {
      const fullMedia = path.resolve(process.cwd(), media);
      const res = MetadataSanitizer.sanitize(fullMedia, {
        outputPath: opts.out ? path.resolve(process.cwd(), opts.out) : undefined
      });
      console.log(`\n🧹 Metadata Sanitized!`);
      console.log(`Status: Metadata stripped & chapters cleared`);
      console.log(`Output: ${res.outputPath}\n`);
    } catch (err) {
      console.error('Sanitize command failed:', err);
      process.exit(1);
    }
  });

// mgvideo chromakey <video>
program
  .command('chromakey <video>')
  .description('Key out green or blue screen background and composite over background plate')
  .option('-k, --key <color>', 'Chroma key color (default: 0x00FF00)', '0x00FF00')
  .option('-s, --similarity <value>', 'Color similarity threshold (0.01 to 1.0)', '0.25')
  .option('-b, --bg <path>', 'Optional background image or video path')
  .option('-o, --out <path>', 'Custom output video path')
  .action((video, opts) => {
    try {
      const fullVideo = path.resolve(process.cwd(), video);
      const res = ChromaKeyEngine.composite(fullVideo, {
        keyColor: safeColor(opts.key),
        similarity: parseFloat(opts.similarity),
        backgroundPath: opts.bg ? path.resolve(process.cwd(), opts.bg) : undefined,
        outputPath: opts.out ? path.resolve(process.cwd(), opts.out) : undefined
      });
      console.log(`\n🟩 Chroma Key Composited!`);
      console.log(`Key Color: ${res.keyColor} (Similarity: ${res.similarity})`);
      console.log(`Output: ${res.outputPath}\n`);
    } catch (err) {
      console.error('Chromakey command failed:', err);
      process.exit(1);
    }
  });

// mgvideo title <video>
program
  .command('title <video>')
  .description('Burn high-resolution typographic title card into video frames')
  .requiredOption('-t, --title <text>', 'Main title text')
  .option('-s, --subtitle <text>', 'Optional subtitle text')
  .option('-p, --position <pos>', 'Position: top, center, bottom', 'center')
  .option('-o, --out <path>', 'Custom output video path')
  .action((video, opts) => {
    try {
      const fullVideo = path.resolve(process.cwd(), video);
      const res = TitleBurner.burnTitle(fullVideo, {
        titleText: opts.title,
        subtitleText: opts.subtitle,
        position: opts.position,
        outputPath: opts.out ? path.resolve(process.cwd(), opts.out) : undefined
      });
      console.log(`\n🔤 Title Card Burned!`);
      console.log(`Title: "${res.titleText}" Position: ${res.position}`);
      console.log(`Output: ${res.outputPath}\n`);
    } catch (err) {
      console.error('Title burn command failed:', err);
      process.exit(1);
    }
  });

// mgvideo noise-gate <audio>
program
  .command('noise-gate <audio>')
  .description('Mute background noise floor and ambient hum during speech pauses')
  .option('-t, --threshold <db>', 'Threshold in dB (e.g. -40)', '-40')
  .option('-r, --ratio <ratio>', 'Expansion ratio', '4.0')
  .option('-o, --out <path>', 'Custom output audio path')
  .action((audio, opts) => {
    try {
      const fullAudio = path.resolve(process.cwd(), audio);
      const res = NoiseGateEngine.applyGate(fullAudio, {
        thresholdDb: parseFloat(opts.threshold),
        ratio: parseFloat(opts.ratio),
        outputPath: opts.out ? path.resolve(process.cwd(), opts.out) : undefined
      });
      console.log(`\n🚪 Noise Gate Applied!`);
      console.log(`Threshold: ${res.thresholdDb}dB Ratio: ${res.ratio}:1`);
      console.log(`Filter: ${res.filterApplied}`);
      console.log(`Output: ${res.outputPath}\n`);
    } catch (err) {
      console.error('Noise gate command failed:', err);
      process.exit(1);
    }
  });

// mgvideo smart-crop <video>
program
  .command('smart-crop <video>')
  .description('Reframe video into target aspect ratio with focal point bias (9:16, 1:1, 4:5, 16:9)')
  .option('-r, --ratio <ratio>', 'Target aspect ratio (9:16, 1:1, 4:5, 16:9)', '9:16')
  .option('-f, --focus <focus>', 'Focal point bias (center, top, bottom, left, right)', 'center')
  .option('-o, --out <path>', 'Custom output video path')
  .action((video, opts) => {
    try {
      const fullVideo = path.resolve(process.cwd(), video);
      const res = SmartCropEngine.crop(fullVideo, {
        targetAspectRatio: opts.ratio,
        focus: opts.focus,
        outputPath: opts.out ? path.resolve(process.cwd(), opts.out) : undefined
      });
      console.log(`\n✂️ Smart Crop Applied!`);
      console.log(`Target: ${res.targetAspectRatio} (Focus: ${res.focus}) -> ${res.outputWidth}x${res.outputHeight}`);
      console.log(`Output: ${res.outputPath}\n`);
    } catch (err) {
      console.error('Smart crop command failed:', err);
      process.exit(1);
    }
  });

// mgvideo pan <audio>
program
  .command('pan <audio>')
  .description('Adjust stereo pan position (-1.0 left to +1.0 right) and stereo width')
  .option('-p, --pan <value>', 'Pan position (-1.0 to 1.0)', '0.0')
  .option('-w, --width <factor>', 'Stereo width factor (0.0 mono to 2.0 wide)', '1.0')
  .option('-o, --out <path>', 'Custom output audio path')
  .action((audio, opts) => {
    try {
      const fullAudio = path.resolve(process.cwd(), audio);
      const res = AudioPanner.pan(fullAudio, {
        pan: parseFloat(opts.pan),
        stereoWidth: parseFloat(opts.width),
        outputPath: opts.out ? path.resolve(process.cwd(), opts.out) : undefined
      });
      console.log(`\n🎧 Stereo Panner Applied!`);
      console.log(`Pan: ${res.pan} | Width: ${res.stereoWidth}`);
      console.log(`Output: ${res.outputPath}\n`);
    } catch (err) {
      console.error('Pan command failed:', err);
      process.exit(1);
    }
  });

// mgvideo glitch <video>
program
  .command('glitch <video>')
  .description('Apply stylized chromatic aberration and digital glitch artifacts')
  .option('-i, --intensity <factor>', 'Glitch intensity (0.1 to 1.0)', '0.5')
  .option('-s, --shift <pixels>', 'Chromatic shift in pixels')
  .option('-o, --out <path>', 'Custom output video path')
  .action((video, opts) => {
    try {
      const fullVideo = path.resolve(process.cwd(), video);
      const res = GlitchEngine.applyGlitch(fullVideo, {
        intensity: parseFloat(opts.intensity),
        chromaticShiftPixels: opts.shift ? parseInt(opts.shift, 10) : undefined,
        outputPath: opts.out ? path.resolve(process.cwd(), opts.out) : undefined
      });
      console.log(`\n⚡ Glitch Artifacts Applied!`);
      console.log(`Intensity: ${res.intensity} (Shift: ${res.chromaticShift}px, Noise: ${res.noiseAmount})`);
      console.log(`Output: ${res.outputPath}\n`);
    } catch (err) {
      console.error('Glitch command failed:', err);
      process.exit(1);
    }
  });

// mgvideo multicam <videos...>
program
  .command('multicam <videos...>')
  .description('Tile multiple synchronized camera angles into a split-screen layout (side-by-side, top-bottom, quad-2x2)')
  .option('-l, --layout <layout>', 'Split layout: side-by-side, top-bottom, quad-2x2', 'side-by-side')
  .option('-o, --out <path>', 'Custom output video path')
  .action((videos, opts) => {
    try {
      const resolved = videos.map((v: string) => path.resolve(process.cwd(), v));
      const res = MultiCamEngine.composeSplitScreen(resolved, {
        layout: opts.layout,
        outputPath: opts.out ? path.resolve(process.cwd(), opts.out) : undefined
      });
      console.log(`\n🎥 MultiCam Layout Generated!`);
      console.log(`Layout: ${res.layout} (${res.inputVideos.length} cameras) -> ${res.width}x${res.height}`);
      console.log(`Output: ${res.outputPath}\n`);
    } catch (err) {
      console.error('MultiCam command failed:', err);
      process.exit(1);
    }
  });

// mgvideo compress-audio <audio>
program
  .command('compress-audio <audio>')
  .description('Apply professional broadcast dynamics compression and makeup gain')
  .option('-p, --preset <preset>', 'Compressor preset: broadcast-master, vocal-leveler, punchy-bass', 'broadcast-master')
  .option('-t, --threshold <db>', 'Threshold in dB')
  .option('-o, --out <path>', 'Custom output audio path')
  .action((audio, opts) => {
    try {
      const fullAudio = path.resolve(process.cwd(), audio);
      const res = AudioCompressor.compress(fullAudio, {
        preset: opts.preset,
        thresholdDb: opts.threshold ? parseFloat(opts.threshold) : undefined,
        outputPath: opts.out ? path.resolve(process.cwd(), opts.out) : undefined
      });
      console.log(`\n🎚️ Audio Compressor Applied!`);
      console.log(`Preset: ${res.preset} (Threshold: ${res.thresholdDb}dB, Ratio: ${res.ratio}:1, Makeup: +${res.makeupGainDb}dB)`);
      console.log(`Output: ${res.outputPath}\n`);
    } catch (err) {
      console.error('Compress audio command failed:', err);
      process.exit(1);
    }
  });

// mgvideo pip <mainVideo> <overlayVideo>
program
  .command('pip <mainVideo> <overlayVideo>')
  .description('Insert picture-in-picture overlay in screen corner (bottom_right, top_right, bottom_left, top_left)')
  .option('-c, --corner <corner>', 'PiP corner position', 'bottom_right')
  .option('-w, --width <pixels>', 'PiP window width in pixels', '480')
  .option('-o, --out <path>', 'Custom output video path')
  .action((mainVideo, overlayVideo, opts) => {
    try {
      const fullMain = path.resolve(process.cwd(), mainVideo);
      const fullOverlay = path.resolve(process.cwd(), overlayVideo);
      const res = PipEngine.composePip(fullMain, fullOverlay, {
        corner: opts.corner,
        pipWidth: parseInt(opts.width, 10),
        outputPath: opts.out ? path.resolve(process.cwd(), opts.out) : undefined
      });
      console.log(`\n🔲 Picture-in-Picture Composited!`);
      console.log(`Corner: ${res.corner} (Width: ${res.pipWidth}px)`);
      console.log(`Output: ${res.outputPath}\n`);
    } catch (err) {
      console.error('PiP command failed:', err);
      process.exit(1);
    }
  });

// mgvideo vignette <video>
program
  .command('vignette <video>')
  .description('Apply subtle cinematic lens edge darkening')
  .option('-a, --angle <radians>', 'Vignette angle in radians', '0.5')
  .option('-o, --out <path>', 'Custom output video path')
  .action((video, opts) => {
    try {
      const fullVideo = path.resolve(process.cwd(), video);
      const res = VignetteEngine.applyVignette(fullVideo, {
        angleRadians: parseFloat(opts.angle),
        outputPath: opts.out ? path.resolve(process.cwd(), opts.out) : undefined
      });
      console.log(`\n🌑 Lens Vignette Applied!`);
      console.log(`Angle: ${res.angleRadians} rad`);
      console.log(`Output: ${res.outputPath}\n`);
    } catch (err) {
      console.error('Vignette command failed:', err);
      process.exit(1);
    }
  });

// mgvideo declick <audio>
program
  .command('declick <audio>')
  .description('Eliminate mouth clicks, lip-smacks, and electrical pops from dialogue')
  .option('-o, --out <path>', 'Custom output audio path')
  .action((audio, opts) => {
    try {
      const fullAudio = path.resolve(process.cwd(), audio);
      const res = DeClickerEngine.declick(fullAudio, {
        outputPath: opts.out ? path.resolve(process.cwd(), opts.out) : undefined
      });
      console.log(`\n✨ Audio De-Clicker Applied!`);
      console.log(`Filter: ${res.filterApplied}`);
      console.log(`Output: ${res.outputPath}\n`);
    } catch (err) {
      console.error('Declick command failed:', err);
      process.exit(1);
    }
  });

// mgvideo setup <component>: managed optional toolchains. Other subcommands (e.g. `setup sfx`)
// attach to the same group; reuse it if it was already created above.
const setupCommand =
  program.commands.find(c => c.name() === 'setup') ??
  program.command('setup').description('Install optional managed toolchains into the user cache (never into the repo)');

// mgvideo setup separate
setupCommand
  .command('separate')
  .description('Create the Python venv for object separation (SAM 2.1: torch, transformers, opencv) in the user cache')
  .option('--force', 'Delete and recreate the venv')
  .action(opts => {
    try {
      const res = setupSeparate({ force: !!opts.force, log: msg => console.log(`  ${msg}`) });
      const s = res.marker.scan;
      console.log(`\n✂️  Object separation ${res.status === 'exists' ? 'already set up' : 'ready'}`);
      console.log(`Venv: ${res.venvDir} (Python ${res.marker.pythonVersion})`);
      console.log(`Device: ${s.device}${s.gpu ? ` (${s.gpu}${s.vram_gb ? `, ${s.vram_gb} GB` : ''})` : ''} | default model: ${s.model}`);
      console.log('Model weights download into the Hugging Face cache on the first `mgvideo separate` run.\n');
    } catch (err) {
      console.error(`Setup separate failed: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });

// mgvideo setup sfx
setupCommand
  .command('sfx')
  .description('Create the pinned Python venv for the sound pass (librosa, soundfile, numpy, scipy) in the user cache')
  .option('--python <bin>', 'Base interpreter to build the venv from (Python 3.10-3.13)')
  .option('--force', 'Delete and recreate the venv')
  .action(opts => {
    try {
      runSetupSfx({ python: opts.python, force: !!opts.force });
    } catch (err) {
      console.error(`Setup sfx failed: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });

// mgvideo separate <video>
program
  .command('separate <video>')
  .description('Separate a subject from the background with SAM 2.1 from click points; writes masks, a green preview and an alpha cut-out')
  .requiredOption('-p, --point <x,y[,label]>', 'Click point in source pixels on the start frame; label 1 = subject (default), 0 = exclude. Repeatable', (v: string, prev: SeparatePoint[] = []) => {
    try {
      return [...prev, parsePoint(v)];
    } catch (err) {
      throw new InvalidArgumentError(err instanceof Error ? err.message : String(err));
    }
  })
  .option('--start <frame>', 'First frame (0-based, default 0); points are picked on this frame')
  .option('--end <frame>', 'Last frame, inclusive (default: last frame)')
  .addOption(new Option('--model <size>', 'Override the hardware-based model choice').choices(Object.keys(SEPARATE_MODELS)))
  .addOption(new Option('--format <fmt>', 'Alpha cut-out container').choices(['mov', 'webm', 'both']).default('mov'))
  .option('--keep-frames', 'Keep the extracted input frames in <out>/frames')
  .requiredOption('-o, --out <dir>', 'Output directory')
  .action((video, opts) => {
    try {
      const marker = readSeparateMarker();
      if (!marker) {
        console.error('Object separation is not set up. Run `mgvideo setup separate` first (installs torch + transformers into the user cache).');
        process.exit(1);
      }
      const start = parseFrameNumber(opts.start, '--start');
      const end = parseFrameNumber(opts.end, '--end');
      const formats: CutoutFormat[] = opts.format === 'both' ? ['mov', 'webm'] : [opts.format as CutoutFormat];
      const device = marker.scan.device;
      const model = opts.model ? SEPARATE_MODELS[opts.model as SeparateModelSize] : marker.scan.model;
      const res = separateVideo({
        video: path.resolve(process.cwd(), video),
        points: opts.point as SeparatePoint[],
        start, end,
        model: opts.model as SeparateModelSize | undefined,
        outDir: path.resolve(process.cwd(), opts.out),
        formats,
        keepFrames: !!opts.keepFrames,
        log: msg => {
          console.log(`  ${msg}`);
        },
        onPlan: plan => {
          const secs = estimateSeconds(device, plan.frames);
          console.log(`\nSeparating frames ${plan.start}..${plan.end} (${plan.frames} frames) on ${device} with ${model}`);
          console.log(`Estimated time: ~${secs}s (${device === 'cpu' ? '~5 s/frame on CPU' : device}) plus a one-time model download`);
          if (device === 'cpu' && secs > 120) {
            console.warn(`⚠️  This is a long CPU job (~${Math.round(secs / 60)} min). Use --start/--end to separate only the part you need.`);
          }
        },
      });
      const h = res.helper as { device?: string; model?: string; timings?: Record<string, number> };
      console.log(`\n✂️  Subject separated (${h.device}, ${h.model}, ${h.timings?.total_s ?? '?'}s)`);
      console.log(`Masks: ${res.masksDir}`);
      console.log(`Preview: ${res.preview}`);
      for (const c of res.cutouts) console.log(`Cut-out: ${c}`);
      console.log(`Summary: ${res.summaryPath}\n`);
    } catch (err) {
      console.error(`Separate command failed: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });

// mgvideo broll <words|check|render|compose>: motion B-roll laid over footage
const broll = program
  .command('broll')
  .description('Motion B-roll on footage: caption words, plan check, clip render (full = opaque MP4, panel = transparent ProRes 4444) and compose');

const brollFail = (label: string) => (err: unknown) => {
  console.error(`B-roll ${label} failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
};

broll
  .command('words <captions>')
  .description('Estimate word times from an SRT or VTT file (spread across each cue, about ±0.2 s); no speech recognition')
  .option('-o, --out <file>', 'Write a Transcript contract JSON')
  .option('--txt <file>', 'Write upstream words.txt (one line per cue, start:word)')
  .option('--video <file>', 'Source video to hash into source_audio_hash (default: hash of the captions)')
  .option('--language <code>', 'Transcript language', 'en')
  .action((captions, opts) => {
    try {
      runBrollWords(path.resolve(process.cwd(), captions), {
        out: opts.out ? path.resolve(process.cwd(), opts.out) : undefined,
        txt: opts.txt ? path.resolve(process.cwd(), opts.txt) : undefined,
        video: opts.video ? path.resolve(process.cwd(), opts.video) : undefined,
        language: opts.language
      });
    } catch (err) {
      brollFail('words')(err);
    }
  });

broll
  .command('check <plan>')
  .description('Validate plan.json: in < out, inside the source, no overlaps, paths confined to the plan directory')
  .action(plan => {
    try {
      runBrollCheck(path.resolve(process.cwd(), plan));
    } catch (err) {
      brollFail('check')(err);
    }
  });

broll
  .command('render <plan>')
  .description('Render every plan clip with the motion engine at the source resolution and fps')
  .option('--only <ids>', 'Comma-separated clip ids to render')
  .option('--pages <dir>', 'Preview page folder, relative to the plan folder (default: dist)')
  .action((plan, opts) => {
    runBrollRender(path.resolve(process.cwd(), plan), { only: opts.only, pages: opts.pages }).catch(brollFail('render'));
  });

broll
  .command('compose <plan> <out>')
  .description('Lay the rendered clips over the source at in/out (holds last frame, alpha for .mov, original audio as AAC, H.264 faststart)')
  .option('--sheet <png>', 'Also write a contact sheet of the composite around every clip window')
  .action((plan, out, opts) => {
    try {
      runBrollCompose(path.resolve(process.cwd(), plan), path.resolve(process.cwd(), out), { sheet: opts.sheet });
    } catch (err) {
      brollFail('compose')(err);
    }
  });

program.parse(process.argv);








