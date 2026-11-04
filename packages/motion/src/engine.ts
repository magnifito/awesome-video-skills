/**
 * Motion engine: TypeScript port of upstream Barty-Bart/motion-graphics `engine/build.py` (MIT).
 *
 * A clip fragment (title, style, data-slot blocks, script) is wrapped with the vendored
 * `motion.js` engine, `base.css`, embedded fonts and a cursor SVG into one self-contained
 * HTML page whose `window.seek(t)` draws the frame at time `t`.
 *
 * Vendored files are read as data by path. Nothing under vendor/ is executed by Node.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { safeJoin, escapeXml } from '../../media/src/proc.js';
import type { BrandProfile } from '../../contracts/src/index.js';

/** Upstream baseline key in registry/approved.lock.json. */
export const MOTION_UPSTREAM = 'barty-motion-graphics';

/** Cursor SVG copied verbatim from upstream build.py. */
const CURSOR =
  '<svg id="cursor" viewBox="0 0 40 56"><path d="M3 3 L3 41 L12.5 32 L19 47 L25.5 44.2 L19.2 29.8 L32 29.8 Z" fill="#0B0B0B" stroke="#fff" stroke-width="2.6" stroke-linejoin="round"/></svg>';

export interface EmbeddedFont {
  /** CSS family name (already sanitised). */
  family: string;
  /** CSS font-weight descriptor, e.g. "700" or "100 900". */
  weight: string;
  style?: 'normal' | 'italic';
  format: 'woff2' | 'woff' | 'truetype' | 'opentype';
  base64: string;
}

export interface VendorPaths {
  root: string;
  commit: string;
  engineDir: string;
  motionJs: string;
  baseCss: string;
  geist: string;
  geistMono: string;
}

/** Walks up from this module until it finds the workspace root (registry/approved.lock.json). */
export function findToolkitRoot(start = path.dirname(fileURLToPath(import.meta.url))): string {
  let dir = start;
  for (;;) {
    if (fs.existsSync(path.join(dir, 'registry', 'approved.lock.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error('Motion engine: cannot locate toolkit root (registry/approved.lock.json).');
    dir = parent;
  }
}

let cachedVendor: VendorPaths | null = null;

/** Resolves the vendored upstream engine files through the approved lock. */
export function vendorPaths(): VendorPaths {
  if (cachedVendor) return cachedVendor;
  const root = findToolkitRoot();
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'registry', 'approved.lock.json'), 'utf8')) as {
    approved_baselines: Record<string, { approved_commit?: string; vendored_path?: string }>;
  };
  const base = lock.approved_baselines[MOTION_UPSTREAM];
  if (!base?.vendored_path || !base.approved_commit) {
    throw new Error(`Motion engine: no approved ${MOTION_UPSTREAM} baseline with vendored_path in registry/approved.lock.json.`);
  }
  const vendorRoot = safeJoin(root, base.vendored_path);
  const engineDir = path.join(vendorRoot, 'skills', 'motion-broll', 'engine');
  const paths: VendorPaths = {
    root: vendorRoot,
    commit: base.approved_commit,
    engineDir,
    motionJs: path.join(engineDir, 'motion.js'),
    baseCss: path.join(engineDir, 'base.css'),
    geist: path.join(engineDir, 'fonts', 'Geist-Variable.woff2'),
    geistMono: path.join(engineDir, 'fonts', 'GeistMono-Medium.woff2')
  };
  for (const p of [paths.motionJs, paths.baseCss, paths.geist, paths.geistMono]) {
    if (!fs.existsSync(p)) throw new Error(`Motion engine: vendored file missing: ${path.relative(root, p)}`);
  }
  cachedVendor = paths;
  return paths;
}

/** Serialises a value for safe embedding inside an inline <script> block. */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** Reduces an untrusted family name to characters that are safe inside a quoted CSS string. */
export function sanitizeFontFamily(family: string | undefined): string {
  if (!family) return '';
  // Brand files sometimes list a whole stack; the first entry is the family to embed.
  const first = family.split(',')[0];
  return first.replace(/[^\p{L}\p{N} _-]/gu, '').trim();
}

/** A CSS font-family stack that always ends in the embedded Geist fallback. */
export function cssFontStack(family: string | undefined, fallback = "'Geist',system-ui,sans-serif"): string {
  const clean = sanitizeFontFamily(family);
  return clean ? `'${clean}',${fallback}` : fallback;
}

const FONT_FORMATS: Record<string, EmbeddedFont['format']> = {
  '.woff2': 'woff2',
  '.woff': 'woff',
  '.ttf': 'truetype',
  '.otf': 'opentype'
};

/**
 * Embeds every brand font that ships a file. Paths are resolved inside the project directory
 * with safeJoin, so a brand file cannot pull in fonts from elsewhere on disk.
 */
export function loadBrandFonts(brand: Pick<BrandProfile, 'fonts'>, projectDir: string): EmbeddedFont[] {
  const out: EmbeddedFont[] = [];
  for (const f of brand.fonts) {
    if (!f.file_path) continue;
    const file = safeJoin(projectDir, f.file_path);
    if (!fs.existsSync(file)) throw new Error(`Motion engine: brand font file not found: ${f.file_path}`);
    const format = FONT_FORMATS[path.extname(file).toLowerCase()];
    if (!format) throw new Error(`Motion engine: unsupported font file type: ${f.file_path} (use woff2, woff, ttf or otf)`);
    const family = sanitizeFontFamily(f.family);
    if (!family) throw new Error(`Motion engine: brand font family name is empty after sanitising: ${JSON.stringify(f.family)}`);
    const variable = /variable|\[wght|vf\b/i.test(path.basename(file));
    const weight = variable ? '100 900' : /^[1-9]00$/.test(f.weight ?? '') ? f.weight : '400';
    out.push({ family, weight, format, base64: fs.readFileSync(file).toString('base64') });
  }
  return out;
}

function fontFaceCss(f: EmbeddedFont): string {
  return `@font-face{font-family:'${f.family}';src:url(data:font/${f.format === 'truetype' ? 'ttf' : f.format === 'opentype' ? 'otf' : f.format};base64,${f.base64}) format('${f.format}');font-weight:${f.weight};font-style:${f.style ?? 'normal'};font-display:block}`;
}

export interface ParsedFragment {
  title: string;
  css: string;
  slots: { world: string; shape: string; over: string };
  js: string;
}

/** Splits a clip fragment the same way upstream build.py does. */
export function parseFragment(fragment: string, fallbackTitle = 'clip'): ParsedFragment {
  const title = /<title>([\s\S]*?)<\/title>/.exec(fragment)?.[1] ?? fallbackTitle;
  const css = [...fragment.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('');
  const slot = (n: string) => new RegExp(`<div data-slot="${n}">([\\s\\S]*?)</div><!--/${n}-->`).exec(fragment)?.[1] ?? '';
  const js = [...fragment.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('');
  return { title, css, slots: { world: slot('world'), shape: slot('shape'), over: slot('over') }, js };
}

export interface BuildOptions {
  /** Brand fonts to embed in addition to the vendored Geist fallback. */
  fonts?: EmbeddedFont[];
  /** Overrides the fragment <title>. Escaped before interpolation. */
  title?: string;
}

/**
 * Builds one self-contained HTML page from a clip fragment.
 *
 * Differences from build.py: brand fonts are embedded next to Geist, and the fragment script
 * runs only after every declared font face has loaded, so text measured at load time
 * (layout, pill widths) uses the real typeface. `window.__motionReady` flips to true once the
 * scene is set up; load failures are exposed on `window.__motionError`.
 */
export function buildClipHtml(fragment: string, options: BuildOptions = {}): string {
  const v = vendorPaths();
  const frag = parseFragment(fragment);
  const b64 = (p: string) => fs.readFileSync(p).toString('base64');
  const base = fs
    .readFileSync(v.baseCss, 'utf8')
    .replace('__GEIST__', b64(v.geist))
    .replace('__GEISTMONO__', b64(v.geistMono));
  const brandFaces = (options.fonts ?? []).map(fontFaceCss).join('');
  const motionJs = fs.readFileSync(v.motionJs, 'utf8');
  const title = escapeXml(options.title ?? decodeTitle(frag.title));
  // Closing tags inside a script body would end the block early; fragments are authored
  // code, but keep the guarantee for any data a recipe interpolated.
  const scriptSafe = (s: string) => s.replace(/<\/(script)/gi, '<\\/$1');
  const boot = `(async()=>{try{await Promise.all([...document.fonts].map(f=>f.load()));await document.fonts.ready;
const bad=[...document.fonts].filter(f=>f.status!=='loaded').map(f=>f.family);if(bad.length)throw new Error('fonts failed to load: '+bad.join(', '));
${scriptSafe(frag.js)}
;if(typeof window.seek!=='function')throw new Error('clip did not call M.scene or define window.seek');window.__motionReady=true;
}catch(e){window.__motionError=String(e&&e.stack||e);}})();`;
  return (
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${base}${brandFaces}${frag.css}</style></head><body>\n` +
    `<div id="wrap"><div id="stage"><div id="world">${frag.slots.world}<div id="shape">${frag.slots.shape}</div>${frag.slots.over}</div>${CURSOR}</div></div>\n` +
    `<script>${motionJs}</script><script>${boot}</script></body></html>`
  );
}

/** Fragment titles are HTML text; undo the entity escapes so escapeXml does not double them. */
function decodeTitle(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&amp;/g, '&');
}
