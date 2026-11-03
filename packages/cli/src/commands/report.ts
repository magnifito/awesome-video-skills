import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type {
  ProjectBrief,
  RenderRequest,
  RenderResult,
  ReviewRecord
} from '../../../contracts/src/index.js';
import { CostTracker } from '../../../media/src/cost.js';
import type { ValidationReport } from './validate.js';
import { inspectMedia, measureAudioLoudness } from '../../../media/src/inspector.js';

export interface DeliveryReport {
  project_id: string;
  project_name: string;
  generated_at: string;
  run_id: string;
  deliverables: {
    video_path: string;
    file_size_bytes: number;
    sha256: string;
    resolution: string;
    duration_seconds: number;
    fps: number;
    video_codec: string;
    audio_codec: string;
    /** Null when loudness could not be measured. */
    audio_lufs: number | null;
    audio_true_peak_db: number | null;
  };
  compliance: {
    safe_zones_pass: boolean;
    claims_verified: boolean;
    zero_media_budget_verified: boolean;
    all_validations_pass: boolean;
  };
  governance: {
    /** Where the review record was read from, or null when no review exists yet. */
    review_record_path: string | null;
    reviewer: string;
    decision: 'approved' | 'changes_requested' | 'rejected' | 'pending';
    roles: {
      technical_maintainer: string;
      producer: string;
      account_owner: string;
    };
    export_checks: {
      factual_accuracy_verified: boolean;
      visual_layout_clean: boolean;
      audio_sync_and_loudness_verified: boolean;
      rights_cleared: boolean;
    };
    review_date: string | null;
  };
  financials: {
    external_media_budget_usd: number;
    external_media_spent_usd: number;
    zero_budget_compliant: boolean;
    /** Estimated by CostTracker; null when it cannot be computed. */
    total_compute_cost_usd: number | null;
  };
  provenance: {
    render_engine: string;
    upstream_commit: string;
    licenses: string[];
  };
}

export async function generateDeliveryReport(projectDir: string, runId?: string): Promise<{
  report: DeliveryReport;
  markdownPath: string;
  jsonPath: string;
}> {
  const briefPath = path.join(projectDir, 'brief.json');
  if (!fs.existsSync(briefPath)) {
    throw new Error(`Project brief not found at ${briefPath}`);
  }
  const brief: ProjectBrief = JSON.parse(fs.readFileSync(briefPath, 'utf8'));

  const runsDir = path.join(projectDir, 'runs');
  let targetRunDir: string;

  if (runId) {
    targetRunDir = path.isAbsolute(runId) ? runId : path.join(runsDir, runId);
  } else {
    // Pick latest run
    const runs = fs.readdirSync(runsDir).filter(f => f.startsWith('run-')).sort();
    if (runs.length === 0) {
      throw new Error(`No runs found in ${runsDir}`);
    }
    targetRunDir = path.join(runsDir, runs[runs.length - 1]);
  }

  const resultPath = path.join(targetRunDir, 'render-result.json');
  if (!fs.existsSync(resultPath)) {
    throw new Error(`Render result not found at ${resultPath}`);
  }
  const renderResult: RenderResult = JSON.parse(fs.readFileSync(resultPath, 'utf8'));

  const validationPath = path.join(targetRunDir, 'validation-report.json');
  let validation: ValidationReport | null = null;
  if (fs.existsSync(validationPath)) {
    validation = JSON.parse(fs.readFileSync(validationPath, 'utf8'));
  }

  const requestPath = path.join(targetRunDir, 'render-request.json');
  const renderRequest: RenderRequest | null = fs.existsSync(requestPath)
    ? JSON.parse(fs.readFileSync(requestPath, 'utf8'))
    : null;

  // `mgvideo package` copies the approved review into delivery/<run_id>/. A record in the
  // project root is a review that has not been packaged yet.
  const reviewCandidates = [
    path.join(projectDir, 'delivery', renderResult.run_id, 'review-record.json'),
    path.join(projectDir, 'review-record.json')
  ];
  let reviewRecord: ReviewRecord | null = null;
  let reviewRecordPath: string | null = null;
  for (const candidate of reviewCandidates) {
    if (fs.existsSync(candidate)) {
      reviewRecord = JSON.parse(fs.readFileSync(candidate, 'utf8'));
      reviewRecordPath = candidate;
      break;
    }
  }
  // A review only counts for this run when it approves this exact cut.
  const reviewMatchesCut = reviewRecord?.approval_scope?.final_cut_hash === renderResult.output_files[0]?.hash;

  const primaryOutputFile = renderResult.output_files[0];
  const videoPath = primaryOutputFile?.path || path.join(targetRunDir, 'master.mp4');
  const fileBytes = fs.existsSync(videoPath) ? fs.statSync(videoPath).size : (primaryOutputFile?.size_bytes || 0);
  const sha256 = fs.existsSync(videoPath)
    ? crypto.createHash('sha256').update(fs.readFileSync(videoPath)).digest('hex')
    : (primaryOutputFile?.hash || renderResult.request_hash);

  const probe = fs.existsSync(videoPath) ? await inspectMedia(videoPath) : null;
  let loudness: { lufs: number | null; true_peak_db: number | null } = { lufs: null, true_peak_db: null };
  if (fs.existsSync(videoPath) && probe?.has_audio) {
    try {
      loudness = await measureAudioLoudness(videoPath);
    } catch {
      loudness = { lufs: null, true_peak_db: null };
    }
  }

  let computeCost: number | null = null;
  try {
    computeCost = CostTracker.calculateRunCost(brief, renderResult, false).items.render_compute_usd;
  } catch {
    computeCost = null;
  }

  const report: DeliveryReport = {
    project_id: brief.project_id,
    project_name: brief.objective || brief.project_id,
    generated_at: new Date().toISOString(),
    run_id: renderResult.run_id,
    deliverables: {
      video_path: videoPath,
      file_size_bytes: fileBytes,
      sha256,
      resolution: `${renderResult.measurements.width}x${renderResult.measurements.height}`,
      duration_seconds: renderResult.measurements.duration_seconds,
      fps: renderResult.measurements.fps,
      video_codec: probe?.video_codec || 'unknown',
      audio_codec: probe?.audio_codec || 'none',
      audio_lufs: loudness.lufs,
      audio_true_peak_db: loudness.true_peak_db
    },
    compliance: {
      // Without a validation report nothing has been verified, so every flag is false.
      safe_zones_pass: !!validation && validation.items.every(c => !/safe zone/i.test(c.check) || c.passed),
      claims_verified: !!validation && validation.items.some(c => /claim/i.test(c.check)) &&
        validation.items.every(c => !/claim/i.test(c.check) || c.passed),
      zero_media_budget_verified: brief.budgets.media_budget_usd === 0,
      all_validations_pass: validation ? validation.passed : false
    },
    governance: {
      review_record_path: reviewRecordPath,
      reviewer: reviewRecord?.reviewer || 'Pending',
      decision: reviewRecord && reviewMatchesCut ? reviewRecord.decision : 'pending',
      roles: {
        technical_maintainer: reviewRecord?.roles?.technical_maintainer || 'Pending',
        producer: reviewRecord?.roles?.producer || 'Pending',
        account_owner: reviewRecord?.roles?.account_owner || 'Pending'
      },
      export_checks: {
        factual_accuracy_verified: reviewMatchesCut && reviewRecord?.export_checks.factual_accuracy_verified === true,
        visual_layout_clean: reviewMatchesCut && reviewRecord?.export_checks.visual_layout_clean === true,
        audio_sync_and_loudness_verified: reviewMatchesCut && reviewRecord?.export_checks.audio_sync_and_loudness_verified === true,
        rights_cleared: reviewMatchesCut && reviewRecord?.export_checks.rights_cleared === true
      },
      review_date: reviewRecord?.timestamp ?? null
    },
    financials: {
      external_media_budget_usd: brief.budgets.media_budget_usd,
      // No external media APIs are integrated, so nothing can be spent on them.
      external_media_spent_usd: 0.00,
      zero_budget_compliant: brief.budgets.media_budget_usd === 0,
      total_compute_cost_usd: computeCost
    },
    provenance: {
      render_engine: renderRequest?.adapter ?? 'unknown',
      upstream_commit: renderRequest?.approved_source_lock ?? 'unknown',
      licenses: ['Apache-2.0', 'OFL-1.1 (Geist)', 'ISC (Lucide Icons)']
    }
  };

  const decisionLabel = {
    approved: '✅ Approved',
    changes_requested: '✏️ Changes requested',
    rejected: '❌ Rejected',
    pending: '⏳ Pending'
  }[report.governance.decision];
  const { width: rw, height: rh } = renderResult.measurements;
  const aspectLabel = rw > rh ? 'Landscape' : rw < rh ? 'Vertical' : 'Square';
  const fmtNum = (v: number | null, unit: string): string => (v === null ? 'not measured' : `${v} ${unit}`);

  const mdContent = `# Magnifito Executive Delivery Report: ${report.project_name}

**Project ID**: \`${report.project_id}\`  
**Generated At**: ${report.generated_at}  
**Run Hash**: \`${report.run_id}\`  

---

## 1. Deliverable Specifications
- **Master Video File**: \`${path.basename(report.deliverables.video_path)}\`
- **Resolution**: ${report.deliverables.resolution} (${aspectLabel})
- **Duration**: ${report.deliverables.duration_seconds}s @ ${report.deliverables.fps} fps
- **Video / Audio Codecs**: \`${report.deliverables.video_codec}\` / \`${report.deliverables.audio_codec}\`
- **Audio Loudness**: ${fmtNum(report.deliverables.audio_lufs, 'LUFS')} (Target: -14 to -16 LUFS, True Peak: ${fmtNum(report.deliverables.audio_true_peak_db, 'dBTP')})
- **File Size**: ${(report.deliverables.file_size_bytes / 1024).toFixed(1)} KB
- **SHA-256 Checksum**: \`${report.deliverables.sha256}\`

---

## 2. Governance & Multi-Role Sign-offs
| Role | Reviewer | Decision | Date |
|---|---|:---:|---|
| **Technical Maintainer** | ${report.governance.roles.technical_maintainer} | ${decisionLabel} | ${report.governance.review_date ? report.governance.review_date.slice(0, 10) : '—'} |
| **Producer** | ${report.governance.roles.producer} | ${decisionLabel} | ${report.governance.review_date ? report.governance.review_date.slice(0, 10) : '—'} |
| **Account Owner** | ${report.governance.roles.account_owner} | ${decisionLabel} | ${report.governance.review_date ? report.governance.review_date.slice(0, 10) : '—'} |

### Export Checks
- **Factual Accuracy Verified**: ${report.governance.export_checks.factual_accuracy_verified ? '✅ Yes' : '❌ No'}
- **Visual Layout Clean**: ${report.governance.export_checks.visual_layout_clean ? '✅ Yes' : '❌ No'}
- **Audio Sync & Loudness Verified**: ${report.governance.export_checks.audio_sync_and_loudness_verified ? '✅ Yes' : '❌ No'}
- **Rights Cleared**: ${report.governance.export_checks.rights_cleared ? '✅ Yes' : '❌ No'}

---

## 3. Financial & Zero-Budget Audit
- **Authorized External Media Budget**: $${report.financials.external_media_budget_usd.toFixed(2)}
- **Actual External Media Spent**: $${report.financials.external_media_spent_usd.toFixed(2)}
- **Policy Compliance**: ${report.financials.zero_budget_compliant ? '✅ 100% Policy Compliant ($0 External Spend)' : '⚠️ Warning'}
- **Total Local Compute Cost**: $${report.financials.total_compute_cost_usd === null ? 'unknown' : report.financials.total_compute_cost_usd.toFixed(2)}

---

## 4. Upstream Provenance & Attribution
- **Renderer**: ${report.provenance.render_engine}
- **Audited Commit SHA**: \`${report.provenance.upstream_commit}\`
- **Licenses**: ${report.provenance.licenses.join(', ')}
`;

  const markdownPath = path.join(targetRunDir, 'DELIVERY_REPORT.md');
  const jsonPath = path.join(targetRunDir, 'delivery_report.json');

  fs.writeFileSync(markdownPath, mdContent, 'utf8');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');

  return { report, markdownPath, jsonPath };
}
