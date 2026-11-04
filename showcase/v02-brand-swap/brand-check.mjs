// Brand check for one project folder: validates brand.json against the toolkit's
// BrandProfileSchema, measures WCAG contrast for the colour pairs the brand-title recipe draws,
// and audits every brand font file (licence record and Cyrillic coverage) with the toolkit's
// FontAuditor. mgvideo has no command that checks brand.json, so this script calls the same
// library code from the built toolkit (dist/) and writes the result as JSON.
// WOFF/WOFF2 files are outside FontAuditor's reader; for those, fc-scan (fontconfig, which also
// feeds the HyperFrames rasterizer) reports the family and language coverage instead.
// Usage: node brand-check.mjs <project-dir> <output.json>
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = rel => pathToFileURL(path.resolve(here, '../../dist', rel)).href;
const { BrandProfileSchema } = await import(dist('packages/contracts/src/index.js'));
const { contrast } = await import(dist('packages/motion/src/recipes/common.js'));
const { FontAuditor } = await import(dist('packages/media/src/font_auditor.js'));

const [projectDir, output] = process.argv.slice(2);
if (!projectDir || !output) {
  console.error('Usage: node brand-check.mjs <project-dir> <output.json>');
  process.exit(2);
}

const checks = [];
// level "error" blocks the brand; "warning" is reported for review but does not block.
const add = (check, passed, details, level = 'error') => checks.push({ check, level, passed, ...details });

const raw = JSON.parse(fs.readFileSync(path.join(projectDir, 'brand.json'), 'utf8'));
const parsed = BrandProfileSchema.safeParse(raw);
add('brand.json matches BrandProfileSchema', parsed.success, {
  details: parsed.success ? 'valid' : parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '),
});
const brand = parsed.success ? parsed.data : raw;
const c = brand.colors;

// WCAG 2.x: 4.5:1 for body text, 3:1 for large text (headlines) and graphics. Text pairs block;
// the accent is used for small decorative highlights, so a low ratio there is a warning.
const pairs = [
  ['text_primary on background (headlines and body)', c.text_primary, c.background, 4.5, 'error'],
  ['text_primary on secondary (gradient end of the brand-title card)', c.text_primary, c.secondary ?? c.background, 4.5, 'error'],
  ['primary on background (marks, icons, large text)', c.primary, c.background, 3, 'error'],
  ['accent on background (highlights; keep it off text and information)', c.accent ?? c.primary, c.background, 3, 'warning'],
];
for (const [name, fg, bg, min, level] of pairs) {
  const ratio = Math.round(contrast(fg, bg) * 100) / 100;
  add(`Contrast: ${name}`, ratio >= min, { foreground: fg, background: bg, ratio, minimum: min }, level);
}

for (const f of brand.fonts) {
  add(`Font rights evidence: ${f.family}`, Boolean(f.rights_evidence?.trim()), { details: f.rights_evidence || 'missing' });
  if (!f.file_path) {
    add(`Font file: ${f.family}`, false, { details: 'no file_path; the renderer would fall back to a system font' });
    continue;
  }
  const file = path.join(projectDir, f.file_path);
  const exists = fs.existsSync(file);
  add(`Font file: ${f.family}`, exists, { file: f.file_path, bytes: exists ? fs.statSync(file).size : 0 });
  if (!exists) continue;
  const licenceFile = fs.readdirSync(path.dirname(file)).find(n => /^(OFL|LICENSE)/i.test(n));
  add(`Font licence text shipped: ${f.family}`, Boolean(licenceFile), { details: licenceFile ?? 'no OFL*/LICENSE* file next to the font' });

  if (/\.woff2?$/i.test(file)) {
    const out = execFileSync('fc-scan', ['--format', '%{family}\t%{style}\t%{lang}\n', file], { encoding: 'utf8' }).trim().split('\n')[0] ?? '';
    const [family = '', style = '', langs = ''] = out.split('\t');
    const familyOk = family.split(',').map(s => s.trim()).includes(f.family);
    add(`Font family name in file: ${f.family}`, familyOk, { source: 'fc-scan', file_family: family, style });
    const cyr = langs.split('|').includes('bg');
    add(`Cyrillic coverage as declared: ${f.family}`, cyr === f.supports_cyrillic || (!f.supports_cyrillic && cyr), {
      source: 'fc-scan', declared: f.supports_cyrillic, covers_bulgarian: cyr,
    });
  } else {
    const audit = FontAuditor.auditFontCoverage('Тестов надпис за верификация', f.family, file);
    add(`Font licence record: ${f.family}`, audit.license_status !== 'unverified', { source: 'FontAuditor', license: audit.license_status });
    add(`Cyrillic coverage as declared: ${f.family}`, audit.supported === f.supports_cyrillic || (!f.supports_cyrillic && audit.supported), {
      source: `FontAuditor (${audit.coverage_source})`, declared: f.supports_cyrillic, covers_bulgarian: audit.supported, warnings: audit.warnings,
    });
  }
}

const logo = brand.logos?.primary;
add('Primary logo file exists', Boolean(logo) && fs.existsSync(path.join(projectDir, logo)), { file: logo });

const report = {
  brand_id: brand.brand_id,
  name: brand.name,
  project: path.basename(path.resolve(projectDir)),
  passed: checks.every(x => x.passed || x.level === 'warning'),
  passed_checks: checks.filter(x => x.passed).length,
  total_checks: checks.length,
  warnings: checks.filter(x => !x.passed && x.level === 'warning').map(x => x.check),
  checks,
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(`${brand.name}: ${report.passed ? 'PASSED' : 'FAILED'} (${report.passed_checks}/${report.total_checks}, ${report.warnings.length} warnings) -> ${output}`);
if (!report.passed) process.exit(1);
