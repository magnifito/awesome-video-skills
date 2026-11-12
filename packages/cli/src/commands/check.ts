/**
 * `mgvideo check --quick`: the text rules of `mgvideo validate`, run on the project files
 * without encoding a video. The adapter measures every text element from the scene plan (the
 * same text manifest a render records) and draws single frames only where the contrast rule
 * needs pixels. Meant to run after every edit, so it is quiet when nothing is wrong.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readProjectInputs, renderSettingsFor, selectAdapter, RENDER_FORMATS } from './render.js';
import { readValidateConfig, rankIssues, SEVERITIES, type ValidationIssue } from './validate.js';
import { grabFrame, textChecks } from './text_checks.js';
import type { SafeZonePlatform } from '../../../contracts/src/index.js';

export interface QuickCheckOptions {
  /** Delivery format; the brief's first format by default. */
  format?: string;
  /** Platform whose UI zones apply; `validate.json` (or generic) by default. */
  platform?: SafeZonePlatform;
}

export interface QuickCheckResult {
  format: string;
  width: number;
  height: number;
  texts: number;
  /** Failed rules, most severe first. */
  issues: ValidationIssue[];
  /** True when no issue is P0 or P1. */
  passed: boolean;
}

export async function runQuickCheck(projectDir: string, options: QuickCheckOptions = {}): Promise<QuickCheckResult> {
  const { brief, brand, claims, assets, scenePlan } = await readProjectInputs(projectDir);
  const format = options.format ?? brief.formats[0];
  if (!(RENDER_FORMATS as readonly string[]).includes(format)) {
    throw new Error(`Unsupported format '${format}'. Allowed: ${RENDER_FORMATS.join(', ')}`);
  }
  const adapter = selectAdapter(brief.engine);
  if (!adapter.textManifest) {
    throw new Error(`Engine '${brief.engine}' does not record text yet; quick check needs the hyperframes or html engine.`);
  }
  const platform = options.platform ?? (await readValidateConfig(projectDir)).platform;
  const settings = renderSettingsFor(format);
  const context = { projectDir, brief, brand, claims, assets, scenePlan };

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mgvideo-check-'));
  try {
    const manifest = await adapter.textManifest(context, settings, workDir);
    const frameAt = async (t: number) => {
      const still = await adapter.renderStill(context, Math.round(t * settings.fps), {
        settings, outputDir: workDir, runId: 'quick-check', requestHash: 'quick-check'
      });
      return grabFrame(still, 0, settings.width, settings.height);
    };
    const items = await textChecks(manifest, { platform, frameAt });
    const issues = rankIssues(items);
    return {
      format,
      width: settings.width,
      height: settings.height,
      texts: manifest.texts.length,
      issues,
      passed: !issues.some(i => i.severity === 'P0' || i.severity === 'P1'),
    };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

/** Issue lines, or an empty string when there is nothing to say. */
export function formatQuickCheck(result: QuickCheckResult, projectDir: string): string {
  if (result.issues.length === 0) return '';
  const counts = SEVERITIES.map(s => [s, result.issues.filter(i => i.severity === s).length] as const)
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `${n} ${s}`)
    .join(', ');
  const lines = [`mgvideo check --quick ${projectDir} (${result.format}, ${result.texts} texts): ${counts}`];
  for (const is of result.issues) {
    const at = is.at_s !== undefined ? ` at ${is.at_s.toFixed(2)} s` : '';
    lines.push(` ${is.severity} ${is.rule}${at}: ${is.says}`);
    if (is.fix) lines.push(`    fix: ${is.fix}`);
  }
  return lines.join('\n');
}
