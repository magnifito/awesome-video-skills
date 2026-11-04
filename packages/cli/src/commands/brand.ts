import fs from 'node:fs';
import path from 'node:path';
import { BrandProfileSchema } from '../../../contracts/src/index.js';
import { contrast } from '../../../motion/src/recipes/common.js';
import { FontAuditor } from '../../../media/src/font_auditor.js';
import { runTool } from '../../../media/src/proc.js';

/** "error" fails the brand check; "warning" is reported for review but does not fail it. */
export type BrandCheckLevel = 'error' | 'warning';

export interface BrandCheckItem {
  check: string;
  level: BrandCheckLevel;
  passed: boolean;
  details: string;
  [extra: string]: unknown;
}

export interface BrandCheckReport {
  brand_id: string;
  name: string;
  brand_file: string;
  passed: boolean;
  passed_checks: number;
  total_checks: number;
  /** Names of failed warning-level checks. */
  warnings: string[];
  checks: BrandCheckItem[];
}

/** Bulgarian sample used for the Cyrillic glyph audit; FontAuditor adds its full Cyrillic sample. */
const CYRILLIC_PROBE = 'Тестов надпис за верификация';

/** Accepts a brand.json path or a project directory that contains brand.json. */
export function resolveBrandFile(target: string): string {
  const full = path.resolve(process.cwd(), target);
  return fs.existsSync(full) && fs.statSync(full).isDirectory() ? path.join(full, 'brand.json') : full;
}

/**
 * Checks a brand profile before it is used for a render: schema, WCAG contrast of the colour
 * pairs the HyperFrames brand-title card draws, font files, rights, licence text and Cyrillic
 * coverage, and logo files. Paths inside brand.json resolve against the brand.json directory.
 */
export function runBrandCheck(target: string): BrandCheckReport {
  const brandFile = resolveBrandFile(target);
  if (!fs.existsSync(brandFile)) throw new Error(`brand.json not found: ${brandFile}`);
  const baseDir = path.dirname(brandFile);
  const checks: BrandCheckItem[] = [];
  const add = (check: string, passed: boolean, details: string, level: BrandCheckLevel = 'error', extra: Record<string, unknown> = {}) =>
    checks.push({ check, level, passed, details, ...extra });

  const raw = JSON.parse(fs.readFileSync(brandFile, 'utf8'));
  const parsed = BrandProfileSchema.safeParse(raw);
  add('brand.json matches BrandProfileSchema', parsed.success,
    parsed.success ? 'valid' : parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '));
  const brand = parsed.success ? parsed.data : raw;

  // WCAG 2.x: 4.5:1 for body text, 3:1 for large text and graphics. The accent only draws small
  // decorative highlights, so a low ratio there is a warning. The secondary fallback matches the
  // brand-title card gradient in adapters/hyperframes (secondary, else background).
  const c = brand.colors ?? {};
  const pairs: Array<[string, string, string, number, BrandCheckLevel]> = [
    ['text_primary on background (headlines and body)', c.text_primary, c.background, 4.5, 'error'],
    ['text_primary on secondary (gradient end of the brand-title card)', c.text_primary, c.secondary ?? c.background, 4.5, 'error'],
    ['primary on background (marks, icons, large text)', c.primary, c.background, 3, 'error'],
    ['accent on background (highlights; keep it off text and information)', c.accent ?? c.primary, c.background, 3, 'warning']
  ];
  for (const [name, fg, bg, minimum, level] of pairs) {
    try {
      const ratio = Math.round(contrast(fg, bg) * 100) / 100;
      add(`Contrast: ${name}`, ratio >= minimum, `${ratio}:1 (minimum ${minimum}:1)`, level, { foreground: fg, background: bg, ratio, minimum });
    } catch (err) {
      add(`Contrast: ${name}`, false, (err as Error).message, level);
    }
  }

  for (const f of (brand.fonts ?? []) as Array<{ family: string; file_path?: string; rights_evidence?: string; supports_cyrillic?: boolean }>) {
    const declaredCyrillic = Boolean(f.supports_cyrillic);
    add(`Font rights evidence: ${f.family}`, Boolean(f.rights_evidence?.trim()), f.rights_evidence?.trim() || 'missing');

    if (!f.file_path) {
      // A system font stack is valid, but nothing proves the render machine has it.
      add(`Font file: ${f.family}`, false, 'no file_path; the renderer uses whatever system font matches the family', 'warning');
      const audit = FontAuditor.auditFontCoverage(CYRILLIC_PROBE, f.family);
      add(`Cyrillic coverage as declared: ${f.family}`, !declaredCyrillic || audit.supported,
        audit.coverage_source === 'unverified' ? 'unverified (no font file; family not on the known list)' : `${audit.supported ? 'covered' : 'not covered'} (${audit.coverage_source})`,
        audit.coverage_source === 'unverified' ? 'warning' : 'error',
        { source: `FontAuditor (${audit.coverage_source})`, declared: declaredCyrillic, covers_bulgarian: audit.supported });
      continue;
    }

    const file = path.resolve(baseDir, f.file_path);
    const exists = fs.existsSync(file);
    add(`Font file: ${f.family}`, exists, exists ? `${f.file_path} (${fs.statSync(file).size} bytes)` : `${f.file_path} not found`, 'error', { file: f.file_path });
    if (!exists) continue;
    const licenceFile = fs.readdirSync(path.dirname(file)).find(n => /^(OFL|LICENSE)/i.test(n));
    add(`Font licence text shipped: ${f.family}`, Boolean(licenceFile), licenceFile ?? 'no OFL*/LICENSE* file next to the font');

    if (/\.woff2?$/i.test(file)) {
      // FontAuditor reads only TrueType/OpenType; fontconfig (which also feeds the HyperFrames
      // rasterizer) reports family and language coverage for WOFF/WOFF2.
      let scan: string;
      try {
        scan = runTool('fc-scan', ['--format', '%{family}\t%{style}\t%{lang}\n', file]).trim().split('\n')[0] ?? '';
      } catch (err) {
        add(`Font family name in file: ${f.family}`, false, `fc-scan unavailable, WOFF font not inspected: ${(err as Error).message}`, 'warning');
        continue;
      }
      const [family = '', style = '', langs = ''] = scan.split('\t');
      add(`Font family name in file: ${f.family}`, family.split(',').map(s => s.trim()).includes(f.family), family || 'no family name',
        'error', { source: 'fc-scan', file_family: family, style });
      const covers = langs.split('|').includes('bg');
      add(`Cyrillic coverage as declared: ${f.family}`, !declaredCyrillic || covers, covers ? 'covers Bulgarian' : 'does not cover Bulgarian',
        'error', { source: 'fc-scan', declared: declaredCyrillic, covers_bulgarian: covers });
    } else {
      const audit = FontAuditor.auditFontCoverage(CYRILLIC_PROBE, f.family, file);
      add(`Font licence record: ${f.family}`, audit.license_status !== 'unverified', audit.license_status, 'error', { source: 'FontAuditor' });
      add(`Cyrillic coverage as declared: ${f.family}`, !declaredCyrillic || audit.supported, audit.supported ? 'covers Bulgarian' : 'does not cover Bulgarian',
        'error', { source: `FontAuditor (${audit.coverage_source})`, declared: declaredCyrillic, covers_bulgarian: audit.supported, warnings: audit.warnings });
    }
  }

  for (const [role, rel] of Object.entries((brand.logos ?? {}) as Record<string, string | undefined>)) {
    if (!rel) continue;
    const ok = fs.existsSync(path.resolve(baseDir, rel));
    add(`Logo file exists: ${role}`, ok, ok ? rel : `${rel} not found`, 'error', { file: rel });
  }
  if (!brand.logos?.primary) add('Logo file exists: primary', false, 'no primary logo declared');

  return {
    brand_id: brand.brand_id ?? '',
    name: brand.name ?? '',
    brand_file: brandFile,
    passed: checks.every(x => x.passed || x.level === 'warning'),
    passed_checks: checks.filter(x => x.passed).length,
    total_checks: checks.length,
    warnings: checks.filter(x => !x.passed && x.level === 'warning').map(x => x.check),
    checks
  };
}

/** Human-readable report, as printed by `mgvideo brand check`. */
export function formatBrandCheck(report: BrandCheckReport): string {
  const lines = [
    `Brand check: ${report.name || report.brand_file} (${report.brand_id || 'no brand_id'})`,
    `Overall Result: ${report.passed ? 'PASSED' : 'FAILED'} (${report.passed_checks}/${report.total_checks} checks passed, ${report.warnings.length} warnings)`,
    ''
  ];
  for (const it of report.checks) {
    const mark = it.passed ? '✅' : it.level === 'warning' ? '⚠️ ' : '❌';
    lines.push(` ${mark} ${it.check}: ${it.details}`);
  }
  return lines.join('\n');
}
