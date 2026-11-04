import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/**
 * Conservative width estimate for a single line of sans-serif text, in pixels. Uppercase and
 * bold glyphs run wider than lowercase ones, so the per-character advance is weighted by case.
 * It errs on the wide side: a box sized from it leaves a little extra padding rather than
 * clipping the text.
 */
export function estimateTextWidth(text: string, fontSize: number, opts: { bold?: boolean; letterSpacing?: number } = {}): number {
  let em = 0;
  for (const ch of text) {
    if (ch === ' ') em += 0.3;
    else if (/[A-Z0-9]/.test(ch)) em += 0.7;
    else if (/[mwMW@%]/.test(ch)) em += 0.9;
    else if (/[iljI.,:;'|!]/.test(ch)) em += 0.3;
    else em += 0.58;
  }
  if (opts.bold) em *= 1.08;
  return em * fontSize + Math.max(0, [...text].length - 1) * (opts.letterSpacing ?? 0);
}

/**
 * Largest font size, at most `preferred`, whose estimated line width fits in `maxWidth`.
 */
export function fitFontSize(text: string, preferred: number, maxWidth: number, opts: { bold?: boolean; letterSpacing?: number } = {}): number {
  const width = estimateTextWidth(text, preferred, opts);
  if (width <= maxWidth || width <= 0) return preferred;
  return preferred * (maxWidth / width);
}

/**
 * Builds an environment that makes the SVG rasterizer (rsvg-convert via Pango/fontconfig) see
 * one extra font file, and returns the font's family name when fontconfig can read it.
 * The font is copied into `workDir`, which the caller removes afterwards.
 */
export function fontFileEnv(fontFile: string, workDir: string): { env: NodeJS.ProcessEnv; family?: string } {
  if (!fs.existsSync(fontFile)) throw new Error(`Font file not found: ${fontFile}`);
  if (!/\.(ttf|otf|ttc)$/i.test(fontFile)) throw new Error(`Font file must be .ttf, .otf or .ttc: ${fontFile}`);
  const fontDir = path.join(workDir, 'fonts');
  fs.mkdirSync(fontDir, { recursive: true });
  fs.copyFileSync(fontFile, path.join(fontDir, path.basename(fontFile)));

  const includes = ['/opt/homebrew/etc/fonts/fonts.conf', '/usr/local/etc/fonts/fonts.conf', '/etc/fonts/fonts.conf']
    .map(p => `  <include ignore_missing="yes">${p}</include>`)
    .join('\n');
  // Absolute path: fontconfig resolves a relative FONTCONFIG_FILE against its own config dir.
  const conf = path.join(workDir, 'fonts.conf');
  fs.writeFileSync(
    conf,
    `<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig>\n${includes}\n  <dir>${fontDir}</dir>\n  <cachedir>${path.join(os.tmpdir(), 'mgvideo-fontcache')}</cachedir>\n</fontconfig>\n`,
  );

  let family: string | undefined;
  try {
    family = execFileSync('fc-scan', ['--format', '%{family[0]}\n', fontFile], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n')[0].trim() || undefined;
  } catch {
    family = undefined;
  }
  // Pango on macOS defaults to CoreText and ignores fontconfig; force the fontconfig backend.
  return { env: { ...process.env, FONTCONFIG_FILE: conf, PANGOCAIRO_BACKEND: 'fc' }, family };
}
