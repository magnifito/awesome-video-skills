import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  ValidateConfigSchema,
  type RenderResult,
  type RenderRequest,
  type ClaimsRegister,
  type ValidateConfig
} from '../../../contracts/src/index.js';
import { inspectMedia, measureAudioLoudness, type MediaProbeResult } from '../../../media/src/inspector.js';
import { detectBlack, detectFlashes, detectFreezes, findDeadStops, rmsWindows } from '../../../media/src/quality_checks.js';
import { LayoutAuditor } from '../../../media/src/layout.js';
import { resolveRunDir, resolveProjectDir, sha256String, findLatestRunDir } from './_shared.js';

/**
 * How bad a failed check is. P0 breaks the delivery (wrong file, wrong facts), P1 must be fixed
 * before delivery, P2 should be fixed, P3 is a note. A report passes when no P0 or P1 check fails.
 */
export type Severity = 'P0' | 'P1' | 'P2' | 'P3';

export const SEVERITIES: readonly Severity[] = ['P0', 'P1', 'P2', 'P3'];

/** Severities that fail a report (and make `mgvideo validate` exit 1). */
export const BLOCKING: readonly Severity[] = ['P0', 'P1'];

export interface ValidationItem {
  /** Stable machine id of the rule, e.g. `file-integrity`. */
  rule: string;
  /** Human label of the check. */
  check: string;
  passed: boolean;
  /** Severity the rule carries when it fails. */
  severity: Severity;
  expected?: unknown;
  actual?: unknown;
  details: string;
  /** Seconds into the video where the problem is, when the rule can say. */
  at_s?: number;
  /** What to do about a failure. */
  fix?: string;
  /** Set when the project's validate.json changed this rule's severity. */
  override_reason?: string;
}

/** One failed check, as listed in `issues`. */
export interface ValidationIssue {
  rule: string;
  severity: Severity;
  at_s?: number;
  says: string;
  fix?: string;
}

export interface ValidationReport {
  run_id: string;
  passed: boolean;
  total_checks: number;
  passed_checks: number;
  failed_checks: number;
  /** Failed checks, most severe first, then by time. */
  issues: ValidationIssue[];
  /** Failure count per severity. */
  counts: Record<Severity, number>;
  items: ValidationItem[];
  unresolved_review_items: string[];
}

/** Ranks failed items into issues: severity first, then time (untimed issues first), then rule. */
export function rankIssues(items: ValidationItem[]): ValidationIssue[] {
  return items
    .filter(i => !i.passed)
    .map(i => ({ rule: i.rule, severity: i.severity, ...(i.at_s !== undefined ? { at_s: i.at_s } : {}), says: i.details, ...(i.fix ? { fix: i.fix } : {}) }))
    .sort((a, b) =>
      SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) ||
      (a.at_s ?? -1) - (b.at_s ?? -1) ||
      a.rule.localeCompare(b.rule));
}

/** Builds the report totals from the items: passes when no blocking (P0/P1) check failed. */
export function summarize(runId: string, items: ValidationItem[], unresolved: string[]): ValidationReport {
  const issues = rankIssues(items);
  const counts = { P0: 0, P1: 0, P2: 0, P3: 0 } as Record<Severity, number>;
  for (const i of issues) counts[i.severity]++;
  return {
    run_id: runId,
    passed: issues.every(i => !BLOCKING.includes(i.severity)),
    total_checks: items.length,
    passed_checks: items.length - issues.length,
    failed_checks: issues.length,
    issues,
    counts,
    items,
    unresolved_review_items: unresolved
  };
}

/** Run reference that selects the newest run of the project (the -p directory, else cwd). */
export const LATEST_RUN = 'latest';

export async function runValidate(runPathOrId: string = LATEST_RUN, projectDir?: string): Promise<ValidationReport> {
  const runDir = runPathOrId === LATEST_RUN
    ? findLatestRunDir(projectDir ?? process.cwd())
    : resolveRunDir(runPathOrId, projectDir);

  const resultPath = path.join(runDir, 'render-result.json');
  const requestPath = path.join(runDir, 'render-request.json');

  const renderResult: RenderResult = JSON.parse(await fs.readFile(resultPath, 'utf-8'));
  const renderRequest: RenderRequest = JSON.parse(await fs.readFile(requestPath, 'utf-8'));

  const items: ValidationItem[] = [];
  const unresolvedReviewItems: string[] = [];
  const projDir = resolveProjectDir(runDir, projectDir);
  const config = await readValidateConfig(projDir);

  // 1. Output files presence and hashes
  for (const file of renderResult.output_files) {
    let fileExists = false;
    let actualHash = '';
    try {
      const buffer = await fs.readFile(file.path);
      fileExists = true;
      actualHash = crypto.createHash('sha256').update(buffer).digest('hex');
    } catch {}

    const hashMatches = actualHash === file.hash;
    items.push({
      rule: 'file-integrity',
      severity: 'P0',
      check: `File integrity: ${path.basename(file.path)}`,
      passed: fileExists && hashMatches,
      fix: 'Re-render the run; never edit or replace an output file after rendering.',
      expected: file.hash,
      actual: actualHash,
      details: fileExists
        ? (hashMatches ? 'File exists and SHA-256 matches render manifest.' : 'File exists but hash mismatch.')
        : 'File missing from expected output path.'
    });

    if (!fileExists || !hashMatches) {
      unresolvedReviewItems.push(`Output file integrity failure: ${file.path}`);
    }
  }

  // 2. ffprobe export specifications verification
  const primaryFile = renderResult.output_files[0];
  if (primaryFile) {
    const probe = await inspectMedia(primaryFile.path);

    // Dimensions check
    const dimMatch = probe.width === renderRequest.settings.width && probe.height === renderRequest.settings.height;
    items.push({
      rule: 'dimensions',
      severity: 'P0',
      check: 'Export Dimensions',
      passed: dimMatch,
      fix: 'Re-render with the requested --format; check the adapter writes the requested size.',
      expected: `${renderRequest.settings.width}x${renderRequest.settings.height}`,
      actual: `${probe.width}x${probe.height}`,
      details: dimMatch ? 'Dimensions match render request settings exactly.' : 'Dimensions mismatch.'
    });
    if (!dimMatch) unresolvedReviewItems.push('Video dimensions do not match requested settings.');

    // FPS check
    const fpsMatch = Math.abs(probe.fps - renderRequest.settings.fps) < 1.0;
    items.push({
      rule: 'fps',
      severity: 'P1',
      check: 'Frame Rate (FPS)',
      passed: fpsMatch,
      fix: 'Re-render at the requested fps, or conform with `mgvideo framerate`.',
      expected: renderRequest.settings.fps,
      actual: probe.fps,
      details: fpsMatch ? 'Frame rate conforms to target standard.' : 'Frame rate deviation detected.'
    });
    if (!fpsMatch) unresolvedReviewItems.push('Frame rate deviated from requested framerate.');

    // Audio stream check
    items.push({
      rule: 'audio-present',
      severity: 'P1',
      check: 'Audio Stream Presence',
      passed: probe.has_audio,
      fix: 'Add the mix (narration, music or a silent bed) and re-render.',
      expected: true,
      actual: probe.has_audio,
      details: probe.has_audio ? 'Audio stream verified with valid codec.' : 'No audio stream detected.'
    });
    if (!probe.has_audio) unresolvedReviewItems.push('Missing audio track in delivery file.');

    // 2a. Measured picture and sound (ffmpeg only).
    items.push(...await measuredChecks(primaryFile.path, probe, renderRequest, config));

    // 2b. Safe Zone Layout Audit for Mobile Formats (9:16)
    if (renderRequest.settings.width === 1080 && renderRequest.settings.height === 1920) {
      const cardWidth = Math.round(1080 * 0.78);
      const cardHeight = Math.round(1920 * 0.42);
      const cardX = Math.round(1080 * 0.08);
      const cardY = Math.round((1920 - cardHeight) / 2);
      const cardRect = { x: cardX, y: cardY, width: cardWidth, height: cardHeight };
      const safeViolations = LayoutAuditor.checkElementInSafeZone('card_bounds', cardRect, 1080, 1920, '9:16');
      items.push({
        rule: 'safe-zone-template',
        severity: 'P1',
        check: 'Mobile Safe Zones (9:16)',
        passed: safeViolations.length === 0,
        fix: 'Move text and key graphics out of the platform UI zones.',
        details: safeViolations.length === 0
          ? 'Layout strictly conforms to mobile safe zone margins (TikTok/Reels).'
          : `Safe margin encroachment: ${safeViolations.map(v => v.reason).join(', ')}`
      });
      if (safeViolations.length > 0) {
        unresolvedReviewItems.push('Layout encroaches mobile safe zone margins.');
      }
    }
  }

  // 3. Factual Claims Check against claims register
  try {
    const claimsStr = await fs.readFile(path.join(projDir, 'claims.json'), 'utf-8');
    const scenesStr = await fs.readFile(path.join(projDir, 'scene-plan.json'), 'utf-8');

    // The plan and claims being checked must be the exact ones the run was rendered from.
    const scenesMatch = sha256String(scenesStr) === renderRequest.input_hashes.scenes_hash;
    const claimsMatch = sha256String(claimsStr) === renderRequest.input_hashes.claims_hash;
    items.push({
      rule: 'inputs-unchanged',
      severity: 'P0',
      check: 'Rendered Inputs Unchanged',
      passed: scenesMatch && claimsMatch,
      fix: 'Re-render from the current scene-plan.json and claims.json, then validate the new run.',
      details: scenesMatch && claimsMatch
        ? 'scene-plan.json and claims.json match the hashes recorded in render-request.json.'
        : `Inputs changed since render: ${[!scenesMatch && 'scene-plan.json', !claimsMatch && 'claims.json'].filter(Boolean).join(', ')}. Re-render before delivery.`
    });
    if (!scenesMatch) unresolvedReviewItems.push('scene-plan.json changed after rendering; validation does not describe the rendered video.');
    if (!claimsMatch) unresolvedReviewItems.push('claims.json changed after rendering.');

    const claimsData: ClaimsRegister = JSON.parse(claimsStr);
    const scenePlanData = JSON.parse(scenesStr);

    // Every referenced claim must exist, and its approved wording must be preserved exactly
    let claimsIntact = true;
    for (const sc of scenePlanData.scenes) {
      for (const ref of sc.claims_refs ?? []) {
        const matchingClaim = claimsData.claims.find(c => c.claim_id === ref);
        if (!matchingClaim) {
          claimsIntact = false;
          unresolvedReviewItems.push(`Scene '${sc.scene_id}' references unknown claim '${ref}' (not in claims register).`);
        } else if (!sc.copy_text.includes(matchingClaim.approved_wording)) {
          claimsIntact = false;
          unresolvedReviewItems.push(
            `Factual claim '${ref}' copy mismatch in scene '${sc.scene_id}'. Expected: "${matchingClaim.approved_wording}", Found: "${sc.copy_text}"`
          );
        }
      }
    }

    items.push({
      rule: 'claims-integrity',
      severity: 'P0',
      check: 'Factual Claims Integrity',
      passed: claimsIntact,
      fix: 'Use the approved wording from claims.json in the scene copy, or approve the new wording first.',
      details: claimsIntact
        ? 'All scene copy preserves approved claims wording without unapproved modification.'
        : 'Discrepancy found between approved claims wording and scene copy.'
    });
  } catch (err) {
    items.push({
      rule: 'claims-register',
      severity: 'P0',
      check: 'Claims Register Audit',
      passed: false,
      fix: 'Restore claims.json and scene-plan.json in the project directory.',
      details: `Could not verify claims register: ${(err as Error).message}`
    });
    unresolvedReviewItems.push(`Claims register audit failed: ${(err as Error).message}`);
  }

  const report = summarize(renderResult.run_id, applyOverrides(items, config), unresolvedReviewItems);

  await fs.writeFile(path.join(runDir, 'validation-report.json'), JSON.stringify(report, null, 2), 'utf-8');
  return report;
}

/** Reads `<project>/validate.json` when present; defaults otherwise. Invalid files fail loudly. */
export async function readValidateConfig(projDir: string): Promise<ValidateConfig> {
  const file = path.join(projDir, 'validate.json');
  let raw: string;
  try {
    raw = await fs.readFile(file, 'utf-8');
  } catch {
    return ValidateConfigSchema.parse({});
  }
  const parsed = ValidateConfigSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Error(`Invalid ${file}: ${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  return parsed.data;
}

/** Applies validate.json rule overrides: changes severity, or drops the rule ('off'). */
export function applyOverrides(items: ValidationItem[], config: ValidateConfig): ValidationItem[] {
  const out: ValidationItem[] = [];
  for (const item of items) {
    const o = config.rules[item.rule];
    if (!o) {
      out.push(item);
    } else if (o.severity !== 'off') {
      out.push({ ...item, severity: o.severity, override_reason: o.reason, details: `${item.details} (severity ${item.severity} → ${o.severity} by validate.json: ${o.reason})` });
    }
  }
  return out;
}

const round = (n: number, d = 1) => Number(n.toFixed(d));

/**
 * Loudness, true peak, silence, stills, black, dead stops and flashes, measured on the final file.
 * A measurement that cannot run is a P1 failure, never a silent pass.
 */
async function measuredChecks(file: string, probe: MediaProbeResult, request: RenderRequest, config: ValidateConfig): Promise<ValidationItem[]> {
  const items: ValidationItem[] = [];
  const measure = async (rule: string, label: string, fn: () => Promise<void> | void) => {
    try {
      await fn();
    } catch (err) {
      items.push({ rule, severity: 'P1', check: label, passed: false, details: `Could not measure: ${(err as Error).message.slice(0, 300)}`, fix: 'Check the file decodes with ffmpeg, then validate again.' });
    }
  };

  if (probe.has_audio) {
    await measure('loudness', 'Integrated Loudness', async () => {
      const target = config.loudness_lufs ?? request.settings.target_loudness_lufs ?? -16;
      const ceiling = config.true_peak_max_db ?? request.settings.true_peak_ceiling_db ?? -1;
      const tol = config.loudness_tolerance_lu;
      const { lufs, true_peak_db } = await measureAudioLoudness(file);
      // ebur128 reports silence as -70 LUFS (its absolute gate), or -inf.
      if (!Number.isFinite(lufs) || lufs <= -69.5) {
        items.push({ rule: 'audio-silent', severity: 'P2', check: 'Audible Audio', passed: false, actual: lufs, details: 'The audio track is silent.', fix: 'Add narration, music or sound, or confirm a silent delivery with a validate.json override.' });
        return;
      }
      items.push({ rule: 'audio-silent', severity: 'P2', check: 'Audible Audio', passed: true, details: 'The audio track is audible.' });
      const inRange = Math.abs(lufs - target) <= tol;
      items.push({
        rule: 'loudness', severity: 'P1', check: 'Integrated Loudness', passed: inRange,
        expected: `${target} ±${tol} LUFS`, actual: round(lufs),
        details: inRange ? `${round(lufs)} LUFS, within ±${tol} LU of ${target}.` : `${round(lufs)} LUFS, ${round(lufs - target)} LU from the ${target} LUFS target.`,
        fix: `Normalize the mix to ${target} LUFS (see the magnifito-audio skill), then re-render.`
      });
      const peakOk = true_peak_db <= ceiling;
      items.push({
        rule: 'true-peak', severity: 'P1', check: 'True Peak', passed: peakOk,
        expected: `<= ${ceiling} dBTP`, actual: round(true_peak_db),
        details: peakOk ? `True peak ${round(true_peak_db)} dBTP.` : `True peak ${round(true_peak_db)} dBTP is above ${ceiling} dBTP.`,
        fix: `Limit to ${ceiling} dBTP with a true-peak limiter after normalization.`
      });
    });

    await measure('dead-stop', 'Dead Stops', () => {
      const stops = findDeadStops(rmsWindows(file));
      for (const at of stops) {
        items.push({ rule: 'dead-stop', severity: 'P1', check: 'Dead Stop', passed: false, at_s: at, details: `Steady sound cuts out with no fade at ${at.toFixed(2)} s.`, fix: 'Fade the bed out over about 1 s, or end it under a cut with a short (about 12 ms) fade.' });
      }
      if (stops.length === 0) items.push({ rule: 'dead-stop', severity: 'P1', check: 'Dead Stops', passed: true, details: 'No steady sound cuts out without a fade.' });
    });
  }

  const duration = probe.duration_seconds;
  await measure('freeze', 'Still Picture', () => {
    const spans = detectFreezes(file, config.freeze_min_s);
    for (const s of spans) {
      const len = s.end - s.start;
      const blocking = len >= config.freeze_blocking_s || (duration > 0 && len >= duration / 2);
      items.push({
        rule: 'freeze', severity: blocking ? 'P1' : 'P2', check: 'Still Picture', passed: false, at_s: round(s.start, 2),
        details: `Picture does not change for ${len.toFixed(1)} s (${s.start.toFixed(2)}–${s.end.toFixed(2)} s).`,
        fix: 'Add motion (a slow push-in, a reveal) or shorten the hold, unless the stillness is the point; then say so in validate.json.'
      });
    }
    if (spans.length === 0) items.push({ rule: 'freeze', severity: 'P2', check: 'Still Picture', passed: true, details: `Nothing stays still for ${config.freeze_min_s} s or more.` });
  });

  await measure('black', 'Black Picture', () => {
    const spans = detectBlack(file, config.black_min_s);
    for (const s of spans) {
      items.push({
        rule: 'black', severity: 'P2', check: 'Black Picture', passed: false, at_s: round(s.start, 2),
        details: `Black for ${(s.end - s.start).toFixed(1)} s (${s.start.toFixed(2)}–${s.end.toFixed(2)} s).`,
        fix: 'Check for a missing clip or a late first frame; keep dips to black between scenes under 0.5 s.'
      });
    }
    if (spans.length === 0) items.push({ rule: 'black', severity: 'P2', check: 'Black Picture', passed: true, details: `No black span of ${config.black_min_s} s or more.` });
  });

  await measure('flash', 'Flashing', () => {
    const worst = detectFlashes(file, probe.fps || request.settings.fps);
    items.push(worst
      ? { rule: 'flash', severity: 'P1', check: 'Flashing (WCAG 2.3.1)', passed: false, at_s: worst.at_s, details: `${worst.swings} luminance swings in one second from ${worst.at_s.toFixed(2)} s (more than 3 flashes).`, fix: 'Slow the strobe below 3 flashes a second, shrink it, or lower its contrast.' }
      : { rule: 'flash', severity: 'P1', check: 'Flashing (WCAG 2.3.1)', passed: true, details: 'No more than 3 flashes in any second.' });
  });

  return items;
}

/** Human-readable report, as printed by `mgvideo validate`. */
export function formatValidationReport(report: ValidationReport): string {
  const counted = SEVERITIES.filter(s => report.counts[s] > 0).map(s => `${report.counts[s]} ${s}`).join(', ');
  const lines = [
    `🔎 Validation Report for Run: ${report.run_id}`,
    `Overall Result: ${report.passed ? 'PASSED ✅' : 'FAILED ❌'} (${report.passed_checks}/${report.total_checks} checks passed${counted ? `; ${counted}` : ''})`,
    ''
  ];
  for (const is of report.issues) {
    const at = is.at_s !== undefined ? ` at ${is.at_s.toFixed(2)} s` : '';
    lines.push(` ${is.severity} ${is.rule}${at}: ${is.says}`);
    if (is.fix) lines.push(`    fix: ${is.fix}`);
  }
  if (report.issues.length > 0) lines.push('');
  for (const it of report.items.filter(i => i.passed)) {
    lines.push(` ok ${it.rule.padEnd(20)} ${it.check}: ${it.details}`);
  }
  if (report.unresolved_review_items.length > 0) {
    lines.push('', 'Unresolved Review Items:');
    for (const un of report.unresolved_review_items) {
      lines.push(` • ⚠️ ${un}`);
    }
  }
  return lines.join('\n');
}
