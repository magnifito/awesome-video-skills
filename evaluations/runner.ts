import path from 'node:path';
import fs from 'node:fs/promises';
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
