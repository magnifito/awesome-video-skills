import path from 'node:path';
import fs from 'node:fs/promises';
import nodeFs from 'node:fs';
import { execSync } from 'node:child_process';
import { runRender } from '../packages/cli/src/commands/render.js';
import { runValidate } from '../packages/cli/src/commands/validate.js';
import { runPackage } from '../packages/cli/src/commands/package.js';
import { runDoctor } from '../packages/cli/src/commands/doctor.js';
import { runUpstreamCheck, runUpstreamPropose } from '../packages/cli/src/commands/upstream.js';
import { packageSkills } from '../tools/packaging/packager.js';
import { TimelineMapper } from '../packages/media/src/timeline.js';
import { PolicyChecker } from '../packages/media/src/policy.js';
import type { ClaimsRegister, AssetManifest, ProjectBrief } from '../packages/contracts/src/index.js';

async function runAllEvaluations() {
  console.log('🧪 Starting Magnifito Super Video Evaluation Suite...\n');
  let passCount = 0;
  let failCount = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(` ✅ PASS: ${testName}`);
      passCount++;
    } else {
      console.error(` ❌ FAIL: ${testName}`);
      failCount++;
    }
  }

  const workspaceRoot = process.cwd();

  // Test 1: Worker Doctor Diagnostics
  console.log('\n--- Test Suite 1: Worker Diagnostics & Tooling ---');
  const doctorRes = await runDoctor();
  assert(doctorRes.passed, 'mgvideo doctor passes all required environment checks');

  // Test 2: Upstream Tracking & Catalog
  console.log('\n--- Test Suite 2: Upstream Catalog & Tracking ---');
  const upstreamRep = await runUpstreamCheck(workspaceRoot);
  assert(upstreamRep.total_tracked === 12, 'Catalog tracks exactly 12 upstream repositories');
  const proposal = await runUpstreamPropose(workspaceRoot, 'hyperframes');
  assert(proposal.frozen_commit === '5c5794287bd0dc2c94f238ca89f4752ecaa045a2', 'Upstream proposal freezes exact audited commit SHA');

  // Test 3: Packaging Allowlist Integrity
  console.log('\n--- Test Suite 3: Skill Packaging Allowlist ---');
  const packRes = await packageSkills('antigravity', './dist/test-packaged-skills');
  assert(packRes.verifiedAllowlist, 'Packager exclusively packages the 10 canonical skills without vendor leaks');

  // Test 4: Timeline & EDL Mapping (Dual-timeline preservation)
  console.log('\n--- Test Suite 4: Timeline & EDL Math ---');
  const mapper = new TimelineMapper({ numerator: 30, denominator: 1 }, 48000);
  assert(mapper.secondsToFrames(2.0) === 60, 'TimelineMapper converts 2.0s to 60 frames at 30fps');
  assert(mapper.framesToSamples(30) === 48000, 'TimelineMapper converts 30 frames (1s) to 48000 audio samples');

  const cuts = [
    { source_start_us: 1000000, source_end_us: 4000000, output_start_frame: 0, output_end_frame: 90, speed_factor: 1.0 }
  ];
  const mappedFrame = mapper.mapSourceUsToOutputFrame(2000000, cuts);
  assert(mappedFrame === 30, 'mapSourceUsToOutputFrame correctly maps source 2.0s into output frame 30');

  // Test 5: Media & Budget Policy Guards
  console.log('\n--- Test Suite 5: Policy Guards ---');
  const testBrief: ProjectBrief = {
    schema_version: '1.0.0',
    project_id: 'test',
    client_id: 'test-client',
    workflow: 'branded-promo',
    objective: 'Test',
    audience: 'Audience',
    language: 'bg',
    duration_seconds: 15,
    formats: ['9:16'],
    engine: 'hyperframes',
    timing_authority: 'speech',
    budgets: { agent_budget_usd: 10, compute_budget_usd: 5, media_budget_usd: 0, max_retries: 3 }
  };
  const budgetViolations = PolicyChecker.checkExternalMediaBudget(testBrief, 2.50);
  assert(budgetViolations.length === 1 && budgetViolations[0].code === 'MEDIA_BUDGET_ZERO_VIOLATION', 'Zero media budget blocks paid API call');

  // Test 6: End-to-End Render of Bulgarian 15s Promo Fixture
  console.log('\n--- Test Suite 6: End-to-End Render of Bulgarian 15s Promo ---');
  const promoFixtureDir = path.join(workspaceRoot, 'fixtures', 'promo-bulgarian-15s');
  const initialRender = await runRender(promoFixtureDir, { format: '9:16', force: true });
  assert(initialRender.status === 'success', 'Initial Bulgarian promo render succeeds');
  assert(initialRender.measurements.width === 1080 && initialRender.measurements.height === 1920, 'Rendered video matches vertical 9:16 (1080x1920)');
  assert(
    Math.abs(initialRender.measurements.duration_seconds - 15.0) < 0.1,
    'Rendered video duration is approximately 15.0 seconds (within container audio packet margin)'
  );
  assert(initialRender.measurements.has_audio, 'Rendered video contains valid audio stream');

  // Test 7: Validation Command on Render Run
  console.log('\n--- Test Suite 7: Validation Command ---');
  const validationRep = await runValidate(initialRender.run_id, promoFixtureDir);
  assert(validationRep.passed, 'Validation command passes all integrity and spec assertions');

  // Test 8: Reproducibility & Cache Hit
  console.log('\n--- Test Suite 8: Deterministic Reproducibility ---');
  const cachedRender = await runRender(promoFixtureDir, { format: '9:16', force: false });
  assert(cachedRender.status === 'cached', 'Re-rendering frozen request returns cached result with identical request hash');
  assert(cachedRender.request_hash === initialRender.request_hash, 'Cached request hash matches frozen request hash');

  // Test 9: Client Packaging & Delivery Signing
  console.log('\n--- Test Suite 9: Packaging & Review Signing ---');
  const pkgRes = await runPackage(initialRender.run_id, promoFixtureDir, 'Kiril Kirov');
  assert(pkgRes.review_record.decision === 'approved', 'Package review record is approved and signed');
  assert(pkgRes.files.includes('NOTICES.txt'), 'Delivery package bundles third-party notices and attribution');
  assert(pkgRes.files.includes('review-record.json'), 'Delivery package bundles signed review record');

  // Test 10: Factual Copy Revision Invalidation Gate
  console.log('\n--- Test Suite 10: Factual Copy Revision Invalidation ---');
  const claimsPath = path.join(promoFixtureDir, 'claims.json');
  const originalClaimsContent = await fs.readFile(claimsPath, 'utf-8');
  const claimsData: ClaimsRegister = JSON.parse(originalClaimsContent);

  // Mutate claim wording to simulate factual update
  claimsData.claims[0].approved_wording = 'Изцяло нова променена формулировка на курса 2026';
  claimsData.revision = 'rev-bg-2';
  await fs.writeFile(claimsPath, JSON.stringify(claimsData, null, 2), 'utf-8');

  // Validate run against updated claims register: should detect factual discrepancy!
  const postRevisionValidation = await runValidate(initialRender.run_id, promoFixtureDir);
  assert(!postRevisionValidation.passed, 'Validation detects that scene copy does not match updated claims register');
  assert(
    postRevisionValidation.unresolved_review_items.some(it => it.includes('mismatch')),
    'Unresolved review items record copy discrepancy preventing unverified packaging'
  );

  // Restore original claims
  await fs.writeFile(claimsPath, originalClaimsContent, 'utf-8');
  const restoredValidation = await runValidate(initialRender.run_id, promoFixtureDir);
  assert(restoredValidation.passed, 'Restoring approved claims restores valid status');

  // Test 11: SaaS Product Demo Workflow
  console.log('\n--- Test Suite 11: SaaS Product Demo Workflow ---');
  const demoFixtureDir = path.join(workspaceRoot, 'fixtures', 'product-demo-saas');
  const demoRender = await runRender(demoFixtureDir, { format: '16:9', force: false });
  assert(demoRender.measurements.width === 1920 && demoRender.measurements.height === 1080, 'SaaS demo renders 16:9 1080p');
  const demoValidation = await runValidate(demoRender.run_id, demoFixtureDir);
  assert(demoValidation.passed, 'SaaS demo validation passes all checks');

  // Test 12: Talking-Head Edit & Dual-Timeline Workflow
  console.log('\n--- Test Suite 12: Talking-Head Edit & Timeline Alignment ---');
  const interviewFixtureDir = path.join(workspaceRoot, 'fixtures', 'talking-head-edit');
  const interviewRender = await runRender(interviewFixtureDir, { format: '16:9', force: false });
  assert(interviewRender.measurements.duration_seconds > 14.5, 'Interview clip duration aligns with EDL output frame range');
  const interviewValidation = await runValidate(interviewRender.run_id, interviewFixtureDir);
  assert(interviewValidation.passed, 'Interview cut validation passes claims integrity');

  // Test 13: Multi-SKU Commerce Batch Processing
  console.log('\n--- Test Suite 13: Multi-SKU Commerce Batch ---');
  const { runBatchCommerce } = await import('../packages/cli/src/commands/batch.js');
  const catalogPath = path.join(workspaceRoot, 'fixtures', 'commerce-batch', 'catalog.json');
  const batchReport = await runBatchCommerce(catalogPath, { force: false });
  assert(batchReport.total_items === 3, 'Batch processes exactly 3 SKU records');
  assert(batchReport.skipped === 1, 'Batch skips out-of-stock SKU cleanly');
  assert(batchReport.failed === 0, 'Batch experiences zero render failures across diverse titles and offers');

  // Test 14: Cost & Operational Accounting
  console.log('\n--- Test Suite 14: Cost & Operational Accounting ---');
  const { CostTracker } = await import('../packages/media/src/cost.js');
  const costReport = CostTracker.calculateRunCost(testBrief, initialRender, false);
  assert(costReport.within_budget, 'Cost accounting validates run within approved budgets');
  assert(costReport.items.external_media_usd === 0.0, 'Zero external media cost is strictly enforced');
  assert(costReport.total_cost_usd > 0, 'Total deliverable cost accounts for compute and agent operations');

  // Test 15: Upstream Maintenance & Change Classification
  console.log('\n--- Test Suite 15: Upstream Maintenance & Rollback ---');
  const { classifyFileChange } = await import('../tools/upstreams/diff_classifier.js');
  const docClass = classifyFileChange('docs/guide.md', 'modified');
  assert(docClass.category === 'Documentation only', 'Classifier categorizes docs/guide.md as Documentation only');
  const licenseClass = classifyFileChange('LICENSE', 'modified');
  assert(licenseClass.category === 'License or notice', 'Classifier categorizes LICENSE as License or notice');
  const depClass = classifyFileChange('package.json', 'modified');
  assert(depClass.category === 'Dependency or runtime', 'Classifier categorizes package.json as Dependency or runtime');

  const { runUpstreamRollback } = await import('../packages/cli/src/commands/upstream.js');
  const rollbackRes = await runUpstreamRollback(workspaceRoot, 'hyperframes', '5c5794287bd0dc2c94f238ca89f4752ecaa045a2');
  assert(rollbackRes.rolled_back_to === '5c5794287bd0dc2c94f238ca89f4752ecaa045a2', 'Rollback restores approved baseline');

  // Test 16: Transparent Video & Alpha Channel Export (ProRes 4444)
  console.log('\n--- Test Suite 16: Transparent ProRes Alpha Export ---');
  const alphaRender = await runRender(interviewFixtureDir, { codec: 'mov_prores', transparent: true, force: true });
  assert(alphaRender.measurements.has_alpha, 'ProRes 4444 render produces verified alpha channel');
  assert(Boolean(alphaRender.measurements.pixel_format?.includes('yuva')), 'ProRes pixel format conforms to yuva alpha format');

  // Test 17: Closed Captions & Subtitles (SRT & VTT)
  console.log('\n--- Test Suite 17: Subtitle & Caption Generation ---');
  const { SubtitleGenerator } = await import('../packages/media/src/subtitles.js');
  const srtOutput = SubtitleGenerator.toSrt([
    { index: 1, start_ms: 0, end_ms: 3000, text: 'Български субтитри за видео' }
  ]);
  assert(srtOutput.includes('00:00:00,000 --> 00:00:03,000'), 'SRT timestamps formatted accurately');
  assert(srtOutput.includes('Български субтитри'), 'SRT preserves Cyrillic characters');

  // Test 18: Mobile Safe Zone Layout Audit
  console.log('\n--- Test Suite 18: Mobile Safe Zone Layout Analysis ---');
  const { LayoutAuditor } = await import('../packages/media/src/layout.js');
  const safeRect = { x: 86, y: 550, width: 842, height: 800 };
  const safeCheck = LayoutAuditor.checkElementInSafeZone('card', safeRect, 1080, 1920, '9:16');
  assert(safeCheck.length === 0, 'Centered mobile card respects 9:16 platform safe margins');
  const encroachingRect = { x: 50, y: 1800, width: 900, height: 100 };
  const encroachCheck = LayoutAuditor.checkElementInSafeZone('bottom_btn', encroachingRect, 1080, 1920, '9:16');
  assert(encroachCheck.length > 0, 'Layout auditor flags element encroaching mobile bottom UI ticker zone');

  // Test 19: Audio Mixer with Sidechain Ducking
  console.log('\n--- Test Suite 19: Audio Mixer & Ducking ---');
  const { AudioMixer } = await import('../packages/media/src/audio_mixer.js');
  const mixedAudioPath = path.join(workspaceRoot, 'fixtures', 'talking-head-edit', 'mixed_test.aac');
  await AudioMixer.mixWithDucking({ outputPath: mixedAudioPath });
  const mixedAudioStat = await fs.stat(mixedAudioPath);
  assert(mixedAudioStat.size > 0, 'Audio mixer synthesizes normalized AAC audio stream');
  try { await fs.unlink(mixedAudioPath); } catch {}

  // Test 20: Watchlist Framework Qualification
  console.log('\n--- Test Suite 20: Watchlist Framework Qualification ---');
  const { WatchlistQualifier } = await import('../tools/watchers/qualifier.js');
  const mcQual = await WatchlistQualifier.qualifyFramework(workspaceRoot, 'motion-canvas');
  assert(mcQual.license_classification.exporter_license === 'GPL-3.0 (@motion-canvas/ffmpeg)', 'Qualifier flags Motion Canvas exporter GPL-3.0 license');
  const revQual = await WatchlistQualifier.qualifyFramework(workspaceRoot, 'revideo');
  assert(revQual.readiness_tier === 'watchlist', 'Revideo categorized under batch watchlist');

  // Test 21: Visual Regression & Pixel Diff
  console.log('\n--- Test Suite 21: Visual Regression & Drift Detection ---');
  const { VisualDiffComparator } = await import('../packages/media/src/visual_diff.js');
  const still1 = await initialRender.output_files[0]?.path;
  if (still1) {
    const selfDiff = await VisualDiffComparator.compareFrames(still1, still1);
    assert(selfDiff.identical_hashes, 'Visual comparator verifies identical frame hashes');
    assert(selfDiff.perceptual_similarity === 1.0, 'Identical frames yield 1.0 perceptual similarity');
  }

  // Test 22: Brand Lexicon & Pronunciation Normalization
  console.log('\n--- Test Suite 22: Brand Pronunciation Lexicon ---');
  const { BrandLexicon } = await import('../packages/media/src/lexicon.js');
  const normalizedEn = BrandLexicon.normalizePronunciation('Check the SKU inventory', 'en');
  assert(normalizedEn.includes('S-K-U'), 'Lexicon expands acronym SKU to S-K-U for narration');
  const bgGuides = BrandLexicon.getPronunciationGuide('Курс по разработка на софтуер', 'bg');
  assert(bgGuides.some(g => g.stress_marked === 'софтуе́р'), 'Lexicon provides Bulgarian loanword stress accent guide');

  // Test 23: Interactive Preview Server
  console.log('\n--- Test Suite 23: Interactive Live Preview Server ---');
  const { startPreviewServer } = await import('../packages/cli/src/commands/preview.js');
  const previewServer = await startPreviewServer(promoFixtureDir, 3999);
  assert(previewServer.url === 'http://localhost:3999', 'Preview server starts on requested port');
  await previewServer.close();
  assert(true, 'Preview server closes cleanly');

  // Test 24: Upstream Candidate PR Generator
  console.log('\n--- Test Suite 24: Upstream Candidate PR Engine ---');
  const { CandidatePrGenerator } = await import('../tools/upstreams/candidate_pr.js');
  const prPayload = await CandidatePrGenerator.generatePrPayload(workspaceRoot, 'hyperframes', [
    { path: 'package.json', changeType: 'modified' },
    { path: 'docs/README.md', changeType: 'modified' }
  ]);
  assert(prPayload.body_markdown.includes('Candidate Review'), 'Candidate PR generator includes review header');
  assert(prPayload.body_markdown.includes('mgvideo upstream rollback'), 'Candidate PR includes automated rollback command');

  // Test 25: Campaign Reference Timer (Frozen Clock Isolation)
  console.log('\n--- Test Suite 25: Campaign Reference Timer ---');
  const { CampaignTimer } = await import('../packages/media/src/campaign_timer.js');
  const countdown = CampaignTimer.calculateRemaining(
    '2026-11-02T12:00:00Z',
    '2026-11-04T12:00:00Z',
    30.0,
    'bg'
  );
  assert(countdown.days === 1, 'Countdown days matches frozen reference timeline');
  assert(countdown.hours === 23, 'Countdown hours matches frozen reference timeline');
  assert(countdown.minutes === 59, 'Countdown minutes matches frozen reference timeline');
  assert(countdown.seconds === 30, 'Countdown seconds accurately accounts for elapsed scene duration');
  assert(countdown.formattedText === 'Остават 1 дни и 23 ч.', 'Countdown formats Cyrillic Bulgarian locale text correctly');

  // Test 26: Upstream Selective Snapshot & Hash Integrity
  console.log('\n--- Test Suite 26: Upstream Selective Snapshot & Integrity ---');
  const { SnapshotManager } = await import('../tools/upstreams/snapshot.js');
  const snapshotMgr = new SnapshotManager(workspaceRoot);
  const testCommit = '5c5794287bd0dc2c94f238ca89f4752ecaa045a2';
  const manifest = snapshotMgr.createSnapshot('hyperframes-test', testCommit, 'Apache-2.0', [
    { relativePath: 'src/core.js', content: 'export const hyperframes = "0.1.0";' },
    { relativePath: 'LICENSE', content: 'Apache License Version 2.0' }
  ]);
  assert(manifest.files.length === 2, 'Snapshot manager records exact file entries');
  const verifyValid = snapshotMgr.verifySnapshot('hyperframes-test', testCommit);
  assert(verifyValid.valid === true, 'Snapshot cryptographic checksum verification passes for authentic tree');
  
  // Test tampering detection
  const tamperedPath = path.join(snapshotMgr.getSnapshotDir('hyperframes-test', testCommit), 'src/core.js');
  nodeFs.writeFileSync(tamperedPath, 'malicious payload modification');
  const verifyTampered = snapshotMgr.verifySnapshot('hyperframes-test', testCommit);
  assert(verifyTampered.valid === false, 'Snapshot integrity verification flags tampered vendored code');
  // Clean up test snapshot
  nodeFs.rmSync(path.join(workspaceRoot, 'vendor', 'hyperframes-test'), { recursive: true, force: true });

  // Test 27: Objective Video Quality Metrics (SSIM & PSNR)
  console.log('\n--- Test Suite 27: Objective Video Quality (SSIM & PSNR) ---');
  const { measureVideoQuality } = await import('../packages/media/src/inspector.js');
  const masterPromoPath = path.join(promoFixtureDir, 'runs', initialRender.run_id, `final_output_${initialRender.run_id}.mp4`);
  const quality = await measureVideoQuality(masterPromoPath, masterPromoPath);
  assert(quality.ssim_all >= 0.999, 'Self-comparison video yields perfect SSIM structural similarity >= 0.999');
  assert(quality.psnr_average === 'inf' || quality.psnr_average > 50, 'Self-comparison video yields infinite or near-infinite PSNR');

  // Test 28: Agency Executive Delivery Report Generator
  console.log('\n--- Test Suite 28: Executive Delivery Report Generator ---');
  const { generateDeliveryReport } = await import('../packages/cli/src/commands/report.js');
  const deliveryRep = await generateDeliveryReport(promoFixtureDir);
  assert(nodeFs.existsSync(deliveryRep.markdownPath), 'Executive report generates DELIVERY_REPORT.md');
  assert(nodeFs.existsSync(deliveryRep.jsonPath), 'Executive report generates delivery_report.json');
  assert(deliveryRep.report.financials.zero_budget_compliant === true, 'Executive report certifies zero-budget API spend');
  assert(deliveryRep.report.governance.reviewer.length > 0, 'Executive report documents reviewer governance sign-off');

  // Test 29: Contract Schema Migration Engine
  console.log('\n--- Test Suite 29: Contract Schema Migration Engine ---');
  const { ContractMigrator } = await import('../packages/contracts/src/migrate.js');
  const tempMigrateDir = path.join(workspaceRoot, 'tmp-migrate-test');
  nodeFs.mkdirSync(tempMigrateDir, { recursive: true });
  nodeFs.writeFileSync(
    path.join(tempMigrateDir, 'brief.json'),
    JSON.stringify({
      schema_version: '0.9.0',
      project_id: 'legacy-project',
      client_id: 'legacy-client',
      workflow: 'branded-promo',
      objective: 'Upgrade legacy project',
      audience: 'Global',
      duration_seconds: 15,
      formats: ['16:9'],
      engine: 'hyperframes'
    }, null, 2)
  );
  const migSummary = ContractMigrator.migrateProject(tempMigrateDir);
  assert(migSummary.success === true, 'Migration engine executes cleanly on legacy contract');
  assert(migSummary.target_version === '1.0.0', 'Migration engine upgrades schema version to 1.0.0');
  const migratedBrief = JSON.parse(nodeFs.readFileSync(path.join(tempMigrateDir, 'brief.json'), 'utf8'));
  assert(migratedBrief.budgets.media_budget_usd === 0.0, 'Migration engine injects default zero-budget media policy');
  nodeFs.rmSync(tempMigrateDir, { recursive: true, force: true });

  // Test 30: Visual Diff & Drift Comparison
  console.log('\n--- Test Suite 30: Visual Diff Engine ---');
  const { compareRenderOutputs } = await import('../packages/cli/src/commands/diff.js');
  const diffRes = await compareRenderOutputs(masterPromoPath, masterPromoPath);
  assert(diffRes.passed === true, 'Visual diff passes for identical video streams');
  assert(diffRes.video_metrics?.ssim_all !== undefined, 'Visual diff returns verified SSIM metric data');

  // Test 31: Audio Normalization & True-Peak Protection
  console.log('\n--- Test Suite 31: Audio Normalization & True-Peak ---');
  const { AudioNormalizer } = await import('../packages/media/src/audio_normalizer.js');
  const normalizedOutPath = path.join(promoFixtureDir, 'runs', initialRender.run_id, 'normalized_audio.m4a');
  const normResult = await AudioNormalizer.normalize(masterPromoPath, normalizedOutPath, {
    targetLufs: -16.0,
    truePeakDb: -1.0
  });
  assert(nodeFs.existsSync(normalizedOutPath), 'Audio normalizer outputs normalized audio file');
  assert(normResult.appliedTargetLufs === -16.0, 'Audio normalizer adheres to -16 LUFS streaming/online target');
  assert(normResult.appliedTruePeakDb === -1.0, 'Audio normalizer sets true peak ceiling at -1.0 dBTP');

  // Test 32: Broadcast Color Space (Rec.709 Compliance)
  console.log('\n--- Test Suite 32: Broadcast Color Space Compliance ---');
  const { ColorSpaceConfigurator } = await import('../packages/media/src/colorspace.js');
  const rec709Flags = ColorSpaceConfigurator.getRec709Flags();
  assert(rec709Flags.includes('bt709'), 'Color space configurator outputs bt709 parameters');
  const colorMeta = await ColorSpaceConfigurator.inspectColorMetadata(masterPromoPath);
  assert(colorMeta.is_rec709_compliant === true, 'Rendered master video satisfies Rec.709 color specification');

  // Test 33: Shot Recipe Registry & Dynamic Binding
  console.log('\n--- Test Suite 33: Shot Recipe Registry & Token Binding ---');
  const { ShotRecipeRegistry } = await import('../styles/recipes/registry.js');
  const recipeRegistry = new ShotRecipeRegistry();
  assert(recipeRegistry.count() === 12, 'Recipe registry loads all 12 core shot recipes');
  const boundRecipe = recipeRegistry.bindRecipe('cinematic-title', {
    colors: { primary: '#FFD700', accent: '#00FFFF' },
    typography: { primary_font: 'Cinzel, serif' }
  }, 4.5);
  assert(boundRecipe.recipe_id === 'cinematic-title', 'Bound recipe references correct recipe ID');
  assert(boundRecipe.duration_seconds === 4.5, 'Bound recipe preserves requested duration within recipe limits');
  assert(boundRecipe.resolved_styles.font_family === 'Cinzel, serif', 'Bound recipe binds brand typography');

  // Test 34: Upstream Tracking Status & Catalog Coherence
  console.log('\n--- Test Suite 34: Upstream Tracking Coherence ---');
  const freshUpstreamStatus = await runUpstreamCheck(workspaceRoot);
  assert(freshUpstreamStatus.total_tracked === 12, 'Upstream check monitors all 12 tracked repositories');
  assert(freshUpstreamStatus.repositories.length === 12, 'Upstream check lists all 12 tracked repositories');

  // Test 35: Asset Manifest & Cryptographic Checksum Auditor
  console.log('\n--- Test Suite 35: Asset Manifest & Integrity Hash Auditor ---');
  const { AssetAuditor } = await import('../packages/media/src/asset_auditor.js');
  const assetTestDir = path.join(workspaceRoot, 'tmp-asset-test');
  nodeFs.mkdirSync(assetTestDir, { recursive: true });
  const sampleAssetFile = path.join(assetTestDir, 'logo.svg');
  nodeFs.writeFileSync(sampleAssetFile, '<svg id="logo"></svg>');
  const sampleHash = AssetAuditor.computeSha256(sampleAssetFile);

  const testManifest = {
    schema_version: '1.0.0' as const,
    assets: [
      {
        asset_id: 'sample-logo',
        content_hash: sampleHash,
        local_path: 'logo.svg',
        source: 'brand-kit',
        rights_evidence: 'Internal client logo asset',
        consent_obtained: true,
        permitted: {
          client: 'sofia-code-academy',
          channels: ['all'],
          territories: ['worldwide']
        },
        attribution_required: false,
        status: 'approved' as const
      }
    ]
  };

  const validAudit = AssetAuditor.auditManifest(assetTestDir, testManifest);
  assert(validAudit.valid === true, 'Asset auditor validates authentic assets matching sha256 checksum');
  assert(validAudit.verified_assets === 1, 'Asset auditor records verified asset count');

  // Corrupt the file and test tampering detection
  nodeFs.writeFileSync(sampleAssetFile, '<svg id="tampered"></svg>');
  const tamperedAudit = AssetAuditor.auditManifest(assetTestDir, testManifest);
  assert(tamperedAudit.valid === false, 'Asset auditor flags checksum mismatch when asset content is modified');
  nodeFs.rmSync(assetTestDir, { recursive: true, force: true });

  // Test 36: Cyrillic & Font Glyph Clearance Auditor
  console.log('\n--- Test Suite 36: Cyrillic & Font Glyph Clearance ---');
  const { FontAuditor } = await import('../packages/media/src/font_auditor.js');
  assert(FontAuditor.containsCyrillic('Здравейте на новия курс!') === true, 'Font auditor detects Cyrillic unicode block');
  assert(FontAuditor.containsCyrillic('Hello World') === false, 'Font auditor detects pure Latin copy');
  const safeFontAudit = FontAuditor.auditFontCoverage('Курс по софтуер', 'Inter');
  assert(safeFontAudit.supported === true, 'Inter font is verified safe for Cyrillic copy');
  const unsafeFontAudit = FontAuditor.auditFontCoverage('Курс по софтуер', 'Cinzel');
  assert(unsafeFontAudit.supported === false, 'Latin-only Cinzel font is flagged to prevent tofu glyph rendering');
  assert(unsafeFontAudit.recommended_fallback.includes('Geist'), 'Font auditor recommends Geist OFL-1.1 fallback');

  // Test 37: Royalty-Free Audio Catalog & Dynamic Ducking Envelope
  console.log('\n--- Test Suite 37: Royalty-Free Audio Catalog & Ducking Envelope ---');
  const { AudioCatalogManager } = await import('../packages/media/src/audio_catalog.js');
  const allTracks = AudioCatalogManager.listTracks('music');
  assert(allTracks.length > 0, 'Audio catalog lists curated royalty-free tracks');
  assert(allTracks.every(t => t.license === 'CC0-1.0'), 'All curated audio tracks are strictly CC0-1.0 licensed');
  const techTrack = AudioCatalogManager.findTrackForScene(15.0, 'tech');
  assert(techTrack.mood === 'tech', 'Audio catalog selects appropriate mood track');
  const duckingEnvelope = AudioCatalogManager.generateDuckingEnvelope(2.0, 5.0, -18);
  assert(duckingEnvelope.length === 4, 'Ducking envelope generates 4-point volume automation curve');
  assert(duckingEnvelope[1].volume_factor < 0.2, 'Ducking attenuates background music during active voiceover');

  // Test 38: Direct Programmatic SDK Engine
  console.log('\n--- Test Suite 38: Programmatic SDK Facade ---');
  const { MagnifitoVideoEngine } = await import('../packages/sdk/src/index.js');
  const engine = new MagnifitoVideoEngine(workspaceRoot);
  const fontCheck = engine.auditFont('Тест', 'Geist');
  assert(fontCheck.supported === true, 'SDK facade exposes font auditing');
  const tracks = engine.listAudioTracks('music');
  assert(tracks.length >= 3, 'SDK facade exposes royalty-free audio catalog');
  const migRes = engine.migrate(promoFixtureDir);
  assert(migRes.success === true, 'SDK facade executes contract migration cleanly');

  // Test 39: Media Inspection & Probe Specifications
  console.log('\n--- Test Suite 39: Media Inspector Spec Verification ---');
  const { inspectMedia: probeMediaFile } = await import('../packages/media/src/inspector.js');
  const probedPromo = await probeMediaFile(masterPromoPath);
  assert(probedPromo.width === 1080 && probedPromo.height === 1920, 'Probed video conforms to 1080x1920 vertical canvas');
  assert(probedPromo.fps === 30, 'Probed video conforms to 30fps timing');
  assert(probedPromo.has_audio === true, 'Probed video contains valid audio stream');

  // Test 40: Shot Recipe Exploration & Schema Integrity
  console.log('\n--- Test Suite 40: Shot Recipe Schema Integrity ---');
  const { ShotRecipeRegistry: ShotRegistry } = await import('../styles/recipes/registry.js');
  const reg = new ShotRegistry();
  const saasRecipe = reg.getRecipe('saas-interface-tour');
  assert(saasRecipe !== undefined, 'SaaS interface tour recipe exists in catalog');
  assert(saasRecipe?.recommended_duration_seconds[0] === 5.0, 'Recipe duration lower bound is 5.0s');
  assert(saasRecipe?.recommended_duration_seconds[1] === 10.0, 'Recipe duration upper bound is 10.0s');
  assert(saasRecipe?.motion !== undefined, 'Recipe defines motion parameters');

  // Test 41: Multilingual Explainer Workflow & Rendering
  console.log('\n--- Test Suite 41: Multilingual Explainer Workflow ---');
  const multilingualFixtureDir = path.join(workspaceRoot, 'fixtures', 'multilingual-explainer');
  const multiRender = await runRender(multilingualFixtureDir, { format: '16:9', force: true });
  assert(multiRender.status === 'success', 'Multilingual explainer render succeeds');
  assert(multiRender.measurements.width === 1920 && multiRender.measurements.height === 1080, 'Multilingual explainer renders 16:9 landscape');
  assert(Math.abs(multiRender.measurements.duration_seconds - 15.0) < 0.1, 'Multilingual explainer duration conforms to 15.0s timeline');
  const multiValidate = await runValidate(multiRender.run_id, multilingualFixtureDir);
  assert(multiValidate.passed === true, 'Multilingual explainer validation passes all claims and specs');

  // Test 42: Localization Synchronizer & Speech Expansion
  console.log('\n--- Test Suite 42: Localization Synchronizer & Pacing ---');
  const { LocalizationSynchronizer } = await import('../packages/media/src/localization.js');
  const enText = 'Sub-100ms ultra-low latency video streaming across 40 regions worldwide';
  const bgText = 'Ултраниска латентност под 100ms за видеострийминг в 40 региона по целия свят';
  const syncReport = LocalizationSynchronizer.synchronizeScenes(enText, bgText, 5.0, 'en', 'bg');
  assert(syncReport.source_language === 'en' && syncReport.target_language === 'bg', 'Synchronizer records language pair');
  assert(syncReport.expansion_ratio >= 1.0, 'Synchronizer calculates speech expansion ratio');
  assert(syncReport.source_pacing.fits_within_target_duration === true, 'English copy comfortably fits 5s duration');

  // Test 43: Dynamic Typography Fitter & Line Wrapping
  console.log('\n--- Test Suite 43: Typography Layout & Text Fitting ---');
  const { TypographyFitter } = await import('../packages/media/src/typography.js');
  const longCopy = 'Enterprise 99.99% uptime SLA backed by distributed edge fallbacks and automated regional rerouting for zero downtime';
  const fitResult = TypographyFitter.fitText(longCopy, {
    cardWidth: 840,
    cardHeight: 400,
    baseFontSize: 48,
    minFontSize: 24,
    maxLines: 4
  });
  assert(fitResult.lines.length <= 4, 'Fitter wraps text within max line ceiling');
  assert(fitResult.fontSize <= 48, 'Fitter adjusts font size dynamically to fit card bounds');
  assert(fitResult.fits === true, 'Fitted text satisfies bounding container constraints');

  // Test 44: Deliverable Archiver & SHA256SUMS Manifest
  console.log('\n--- Test Suite 44: Deliverable Archiver & SHA256SUMS ---');
  const { DeliverableArchiver } = await import('../packages/media/src/archiver.js');
  const promoDeliveryDir = pkgRes.delivery_dir;
  const sumsResult = DeliverableArchiver.generateChecksumManifest(promoDeliveryDir);
  assert(nodeFs.existsSync(sumsResult.manifest_path), 'Archiver generates SHA256SUMS.txt');
  assert(sumsResult.total_files > 0, 'Archiver records checksum entries for all deliverables');
  const verifySums = DeliverableArchiver.verifyChecksumManifest(sumsResult.manifest_path);
  assert(verifySums.valid === true, 'Deliverable checksum verification passes 100%');


  // Test 45: Webhook & Event Notification Dispatcher
  console.log('\n--- Test Suite 45: Notification & Webhook Dispatcher ---');
  const { NotificationDispatcher } = await import('../packages/media/src/notifications.js');
  const completedEvent = NotificationDispatcher.formatEvent('render.completed', 'multilingual-explainer', {
    resolution: '1920x1080',
    durationSeconds: 15.0
  });
  assert(completedEvent.event === 'render.completed', 'Dispatcher records event type');
  assert(completedEvent.color_hex === '#10B981', 'Completed event assigns green status badge');
  const failedEvent = NotificationDispatcher.formatEvent('validation.failed', 'multilingual-explainer', {
    error: 'Claims discrepancy'
  });
  assert(failedEvent.color_hex === '#EF4444', 'Failed validation event assigns red warning badge');

  // Test 46: Performance & Scalability Benchmark
  console.log('\n--- Test Suite 46: Performance & Scalability Benchmark ---');
  const { BenchmarkRunner } = await import('./benchmark.js');
  const benchMetrics = BenchmarkRunner.run();
  assert(benchMetrics.timeline_ops_per_sec > 10000, 'Timeline math achieves high-throughput > 10k ops/sec');
  assert(benchMetrics.typography_fits_per_sec > 1000, 'Typography layout engine processes > 1k fits/sec');
  assert(benchMetrics.localization_analyses_per_sec > 1000, 'Localization synchronizer processes > 1k analyses/sec');

  // Test 47: Storyboard Contact Sheet Generator
  console.log('\n--- Test Suite 47: Storyboard Contact Sheet ---');
  const { generateStoryboardContactSheet } = await import('../packages/cli/src/commands/storyboard.js');
  const sbResult = await generateStoryboardContactSheet(promoFixtureDir, { format: '9:16' });
  assert(nodeFs.existsSync(sbResult.htmlPath), 'Storyboard contact sheet generates storyboard.html');
  assert(sbResult.framesCount === 3, 'Storyboard produces styleframes for all 3 scenes');
  assert(sbResult.framePaths.length === 3, 'Storyboard exports image preview paths');

  // Test 48: Project Workspace Clean & Purge Engine
  console.log('\n--- Test Suite 48: Workspace Hygiene & Clean Engine ---');
  const { runClean } = await import('../packages/cli/src/commands/clean.js');
  const cleanTestDir = path.join(workspaceRoot, 'tmp-clean-test');
  nodeFs.mkdirSync(path.join(cleanTestDir, 'runs', 'cache'), { recursive: true });
  nodeFs.mkdirSync(path.join(cleanTestDir, 'runs', 'run-old'), { recursive: true });
  nodeFs.mkdirSync(path.join(cleanTestDir, 'runs', 'run-new'), { recursive: true });
  nodeFs.writeFileSync(path.join(cleanTestDir, 'runs', 'cache', 'temp.txt'), 'cached data');
  nodeFs.writeFileSync(path.join(cleanTestDir, 'runs', 'run-old', 'temp.mp4'), 'old data');
  nodeFs.writeFileSync(path.join(cleanTestDir, 'runs', 'run-new', 'temp.mp4'), 'new data');
  const past = new Date(Date.now() - 60000);
  nodeFs.utimesSync(path.join(cleanTestDir, 'runs', 'run-old'), past, past);

  const cleanRes = await runClean(cleanTestDir, { keepLatest: true });
  assert(!nodeFs.existsSync(path.join(cleanTestDir, 'runs', 'cache')), 'Clean command purges cache directory');
  assert(!nodeFs.existsSync(path.join(cleanTestDir, 'runs', 'run-old')), 'Clean command purges older run directory');
  assert(nodeFs.existsSync(path.join(cleanTestDir, 'runs', 'run-new')), 'Clean command preserves latest run directory');
  assert(cleanRes.freedBytes > 0, 'Clean command accurately calculates freed space');
  nodeFs.rmSync(cleanTestDir, { recursive: true, force: true });

  // Test 49: Developer Documentation & Spec Completeness
  console.log('\n--- Test Suite 49: Platform Documentation Integrity ---');
  const archDoc = nodeFs.readFileSync(path.join(workspaceRoot, 'docs', 'ARCHITECTURE.md'), 'utf8');
  assert(archDoc.includes('HyperFrames'), 'Architecture documentation covers HyperFrames adapter');
  assert(archDoc.includes('Quarantine'), 'Architecture documentation covers upstream quarantine rules');
  const cliDoc = nodeFs.readFileSync(path.join(workspaceRoot, 'docs', 'CLI_REFERENCE.md'), 'utf8');
  assert(cliDoc.includes('mgvideo storyboard'), 'CLI reference documents storyboard command');
  assert(cliDoc.includes('mgvideo clean'), 'CLI reference documents clean command');
  const workflowsDoc = nodeFs.readFileSync(path.join(workspaceRoot, 'docs', 'WORKFLOWS_GUIDE.md'), 'utf8');
  assert(workflowsDoc.includes('Multilingual Explainer'), 'Workflows guide details all 5 canonical workflows');

  // Test 50: Programmatic SDK Facade Extended Methods
  console.log('\n--- Test Suite 50: Programmatic SDK Extended Coverage ---');
  const sdkSbResult = await engine.storyboard(multilingualFixtureDir, { format: '16:9' });
  assert(nodeFs.existsSync(sdkSbResult.htmlPath), 'SDK storyboard method produces valid review sheet');
  const sdkCleanResult = await engine.clean(multilingualFixtureDir, { cacheOnly: true });
  assert(sdkCleanResult.projectDir === multilingualFixtureDir, 'SDK clean method executes without errors');

  // Test 51: Poster Frame & Thumbnail Generator
  console.log('\n--- Test Suite 51: Poster Frame & Thumbnail Generator ---');
  const { ThumbnailGenerator } = await import('../packages/media/src/thumbnail.js');
  const initialVideoPath = initialRender.output_files[0].path;
  const demoVideoPath = demoRender.output_files[0].path;

  const thumbPng = ThumbnailGenerator.extractThumbnail(initialVideoPath, {
    timeOffsetSeconds: 1.0,
    format: 'png'
  });
  assert(nodeFs.existsSync(thumbPng.outputPath), 'Thumbnail PNG exists on disk');
  assert(thumbPng.width === 1080 && thumbPng.height === 1920, 'Thumbnail dimensions match 1080x1920 canvas');
  const thumbJpg = ThumbnailGenerator.extractThumbnail(initialVideoPath, {
    timeOffsetSeconds: 2.0,
    format: 'jpg',
    width: 540,
    height: 960
  });
  assert(nodeFs.existsSync(thumbJpg.outputPath), 'Thumbnail JPG exists on disk');
  assert(thumbJpg.width === 540 && thumbJpg.height === 960, 'Scaled JPG thumbnail dimensions match 540x960');
  nodeFs.rmSync(thumbPng.outputPath, { force: true });
  nodeFs.rmSync(thumbJpg.outputPath, { force: true });

  // Test 52: Multi-Format Aspect Ratio Re-framer
  console.log('\n--- Test Suite 52: Multi-Format Aspect Ratio Re-framer ---');
  const { AspectReframeEngine } = await import('../packages/media/src/reframe.js');
  const reframedVertical = AspectReframeEngine.reframe(demoVideoPath, {
    targetRatio: '9:16',
    strategy: 'fit'
  });
  assert(nodeFs.existsSync(reframedVertical.outputPath), 'Reframed vertical video exists');
  assert(reframedVertical.width === 1080 && reframedVertical.height === 1920, 'Reframed vertical conforms to 1080x1920');

  const reframedSquare = AspectReframeEngine.reframe(demoVideoPath, {
    targetRatio: '1:1',
    strategy: 'crop'
  });
  assert(nodeFs.existsSync(reframedSquare.outputPath), 'Reframed square video exists');
  assert(reframedSquare.width === 1080 && reframedSquare.height === 1080, 'Reframed square conforms to 1080x1080');
  nodeFs.rmSync(reframedVertical.outputPath, { force: true });
  nodeFs.rmSync(reframedSquare.outputPath, { force: true });

  // Test 53: Subtitle Stream Embedder
  console.log('\n--- Test Suite 53: Subtitle Stream Embedder ---');
  const { SubtitleEmbedder } = await import('../packages/media/src/subtitles_embedder.js');
  const tmpSrt = path.join(workspaceRoot, 'tmp-sub.srt');
  nodeFs.writeFileSync(tmpSrt, '1\n00:00:01,000 --> 00:00:03,000\nЗапочнете сега безплатно!\n');
  const subbedResult = SubtitleEmbedder.embed(initialVideoPath, [
    { file: tmpSrt, language: 'bg', title: 'Bulgarian Cyrillic', isDefault: true }
  ]);
  assert(nodeFs.existsSync(subbedResult.outputPath), 'Subbed MP4 deliverable generated');
  assert(subbedResult.tracksCount === 1, 'Embedded 1 subtitle track');
  assert(subbedResult.languages[0] === 'bg', 'Embedded subtitle track tagged with bg language');
  nodeFs.rmSync(tmpSrt, { force: true });
  nodeFs.rmSync(subbedResult.outputPath, { force: true });

  // Test 54: Cinematic Color Grading Presets
  console.log('\n--- Test Suite 54: Cinematic Color Grading Presets ---');
  const { ColorPresetEngine } = await import('../packages/media/src/color_presets.js');
  const presetsList = ColorPresetEngine.listPresets();
  assert(presetsList.length >= 5, 'Color preset engine lists 5 production looks');
  const coolGraded = ColorPresetEngine.applyGrade(demoVideoPath, 'cool-tech');
  assert(nodeFs.existsSync(coolGraded.outputPath), 'Cool-tech color graded video exists on disk');
  assert(coolGraded.preset.name === 'cool-tech', 'Applied preset reflects cool-tech spec');
  nodeFs.rmSync(coolGraded.outputPath, { force: true });

  // Test 55: Audio Waveform Visualizer
  console.log('\n--- Test Suite 55: Audio Waveform Visualizer ---');
  const { AudioWaveformVisualizer } = await import('../packages/media/src/waveform.js');
  const waveRes = AudioWaveformVisualizer.generateWaveform(initialVideoPath, {
    width: 800,
    height: 160,
    colorHex: '#10B981'
  });
  assert(nodeFs.existsSync(waveRes.outputPath), 'Waveform visualizer image generated');
  assert(waveRes.width === 800 && waveRes.height === 160, 'Waveform dimensions match requested 800x160');
  assert(waveRes.fileSizeBytes > 100, 'Waveform PNG file size is valid');
  nodeFs.rmSync(waveRes.outputPath, { force: true });

  // Test 56: Broadcast Audio Stems Exporter
  console.log('\n--- Test Suite 56: Broadcast Audio Stems Exporter ---');
  const { StemExporter } = await import('../packages/media/src/stems.js');
  const stemOutputDir = path.join(workspaceRoot, 'tmp-stems-test');
  const tmpStemAudio = path.join(workspaceRoot, 'tmp-stem-source.wav');
  execSync(`ffmpeg -y -i "${initialVideoPath}" -vn -c:a pcm_s16le -t 3 "${tmpStemAudio}"`, { stdio: 'pipe' });
  const stemRep = StemExporter.exportStems([
    { name: 'dialogue', filePath: tmpStemAudio },
    { name: 'music', filePath: tmpStemAudio }
  ], stemOutputDir);
  assert(nodeFs.existsSync(stemRep.manifestPath), 'Stems manifest JSON generated');
  assert(stemRep.stems.length === 2, 'Exported 2 discrete audio stems');
  assert(stemRep.stems[0].sampleRateHz === 48000, 'Stems resampled to broadcast standard 48kHz');
  nodeFs.rmSync(tmpStemAudio, { force: true });
  nodeFs.rmSync(stemOutputDir, { recursive: true, force: true });

  // Test 57: Production Delivery Bundle Exporter
  console.log('\n--- Test Suite 57: Production Delivery Bundle Exporter ---');
  const { ProductionBundleExporter } = await import('../packages/media/src/bundle.js');
  const bundleTestDir = path.join(workspaceRoot, 'tmp-bundle-test');
  nodeFs.mkdirSync(bundleTestDir, { recursive: true });
  nodeFs.writeFileSync(path.join(bundleTestDir, 'master.mp4'), 'test master video bytes');
  nodeFs.writeFileSync(path.join(bundleTestDir, 'SHA256SUMS.txt'), 'test checksum manifest');
  const bundleSummary = ProductionBundleExporter.createBundle(bundleTestDir);
  assert(nodeFs.existsSync(bundleSummary.bundlePath), 'Production tarball bundle created');
  assert(bundleSummary.bundleSha256.length === 64, 'Bundle generates valid SHA256 hex checksum');
  assert(bundleSummary.bundledFiles.includes('master.mp4'), 'Bundle package includes master video');
  nodeFs.rmSync(bundleTestDir, { recursive: true, force: true });

  // Test 58: Notification Event Dispatch CLI Runner
  console.log('\n--- Test Suite 58: Notification Event Dispatch CLI ---');
  const { runNotify } = await import('../packages/cli/src/commands/notify.js');
  const notifMsg = await runNotify('package.approved', 'promo-bulgarian-15s', {
    durationSeconds: 15.0,
    reviewer: 'Kiril Kirov'
  });
  assert(notifMsg.event === 'package.approved', 'Notification records package.approved event');
  assert(notifMsg.project_id === 'promo-bulgarian-15s', 'Notification records project identifier');
  assert(notifMsg.color_hex === '#8B5CF6', 'Package approved event mapped to purple badge');

  // Test 59: Programmatic SDK Extended Capabilities
  console.log('\n--- Test Suite 59: Programmatic SDK Extended Capabilities ---');
  const sdkThumb = engine.thumbnail(demoVideoPath, { timeOffsetSeconds: 0.5, format: 'png' });
  assert(nodeFs.existsSync(sdkThumb.outputPath), 'SDK thumbnail method produced valid image');
  const sdkWave = engine.waveform(demoVideoPath, { width: 400, height: 100 });
  assert(nodeFs.existsSync(sdkWave.outputPath), 'SDK waveform method produced visualizer image');
  nodeFs.rmSync(sdkThumb.outputPath, { force: true });
  nodeFs.rmSync(sdkWave.outputPath, { force: true });

  // Test 60: End-to-End Delivery Package Verification
  console.log('\n--- Test Suite 60: End-to-End Delivery Package Integrity ---');
  assert(nodeFs.existsSync(promoDeliveryDir), 'Promo delivery directory exists on disk');
  const promoSums = path.join(promoDeliveryDir, 'SHA256SUMS.txt');
  assert(nodeFs.existsSync(promoSums), 'SHA256SUMS.txt exists in delivery directory');
  const sumsText = nodeFs.readFileSync(promoSums, 'utf8');
  assert(sumsText.includes('_final.mp4'), 'SHA256SUMS tracks master final mp4 deliverable');
  assert(sumsText.includes('review-record.json'), 'SHA256SUMS tracks review-record.json');







  console.log(`\n========================================`);
  console.log(`EVALUATION SUMMARY: ${passCount} Passed, ${failCount} Failed`);
  console.log(`========================================\n`);

  if (failCount > 0) {
    process.exit(1);
  }
}

runAllEvaluations().catch(err => {
  console.error('Evaluation run error:', err);
  process.exit(1);
});
