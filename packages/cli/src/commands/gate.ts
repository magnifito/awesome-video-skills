import path from 'node:path';
import fs from 'node:fs';
import { inspectMedia } from '../../../media/src/inspector.js';
import { FontAuditor } from '../../../media/src/font_auditor.js';
import { PolicyChecker } from '../../../media/src/policy.js';

export interface GateCheckItem {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
}

export interface QualityGateResult {
  projectDir: string;
  passed: boolean;
  timestamp: string;
  checks: GateCheckItem[];
}

export async function runQualityGate(projectDir: string): Promise<QualityGateResult> {
  const fullProjDir = path.resolve(process.cwd(), projectDir);
  if (!fs.existsSync(fullProjDir)) {
    throw new Error(`Project directory not found: ${fullProjDir}`);
  }

  const checks: GateCheckItem[] = [];
  let allPassed = true;

  // 1. Brief & Contracts check
  const briefPath = path.join(fullProjDir, 'brief.json');
  let briefData: any = null;
  if (!fs.existsSync(briefPath)) {
    checks.push({ name: 'Brief Contract', status: 'fail', message: 'Missing brief.json' });
    allPassed = false;
  } else {
    try {
      briefData = JSON.parse(fs.readFileSync(briefPath, 'utf8'));
      checks.push({ name: 'Brief Contract', status: 'pass', message: `Valid brief for "${briefData.project_id}"` });
    } catch {
      checks.push({ name: 'Brief Contract', status: 'fail', message: 'Malformed JSON in brief.json' });
      allPassed = false;
    }
  }

  // 2. Financial Policy Check ($0.00 media budget)
  if (briefData) {
    const budgetViolations = PolicyChecker.checkExternalMediaBudget(briefData, 0.0);
    if (briefData.budgets && briefData.budgets.media_budget_usd === 0 && budgetViolations.length === 0) {
      checks.push({ name: 'Zero Media Budget', status: 'pass', message: 'Zero external media API spend ($0.00) strictly enforced' });
    } else {
      checks.push({ name: 'Zero Media Budget', status: 'fail', message: 'Media budget exceeds zero-spend policy limit' });
      allPassed = false;
    }
  }

  // 3. Cyrillic font clearance if Bulgarian
  if (briefData && briefData.language === 'bg') {
    const brandPath = path.join(fullProjDir, 'brand.json');
    if (fs.existsSync(brandPath)) {
      const brandData = JSON.parse(fs.readFileSync(brandPath, 'utf8'));
      const font = brandData.fonts && brandData.fonts[0] ? brandData.fonts[0].family : 'Inter';
      const fontAudit = FontAuditor.auditFontCoverage('Тестов надпис за верификация', font);
      if (fontAudit.supported) {
        checks.push({ name: 'Cyrillic Clearance', status: 'pass', message: `Font "${font}" cleared for Cyrillic (U+0400-U+04FF)` });
      } else {
        checks.push({ name: 'Cyrillic Clearance', status: 'fail', message: `Font "${font}" lacks Cyrillic glyphs` });
        allPassed = false;
      }
    }
  }

  // 4. Rendered Master Probe
  const runsDir = path.join(fullProjDir, 'runs');
  let masterVideo: string | null = null;
  if (fs.existsSync(runsDir)) {
    const sub = fs.readdirSync(runsDir);
    for (const s of sub) {
      const candidate = path.join(runsDir, s, `final_output_${s}.mp4`);
      if (fs.existsSync(candidate)) {
        masterVideo = candidate;
        break;
      }
    }
  }

  if (masterVideo) {
    try {
      const probe = await inspectMedia(masterVideo);
      if (probe.has_audio && probe.duration_seconds > 0) {
        checks.push({
          name: 'Media Specifications',
          status: 'pass',
          message: `Master video verified: ${probe.width}x${probe.height} @ ${probe.fps}fps (${probe.duration_seconds.toFixed(1)}s)`
        });
      } else {
        checks.push({ name: 'Media Specifications', status: 'fail', message: 'Video stream or audio stream missing' });
        allPassed = false;
      }
    } catch (err: any) {
      checks.push({ name: 'Media Specifications', status: 'fail', message: `ffprobe inspection failed: ${err.message}` });
      allPassed = false;
    }
  } else {
    checks.push({ name: 'Media Specifications', status: 'warn', message: 'No rendered run found to inspect' });
  }

  return {
    projectDir: fullProjDir,
    passed: allPassed,
    timestamp: new Date().toISOString(),
    checks
  };
}
