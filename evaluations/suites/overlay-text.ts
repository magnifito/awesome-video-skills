import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SuiteContext } from '../run-suites.js';
import { runFfmpeg } from '../../packages/media/src/proc.js';
import { TitleBurner } from '../../packages/media/src/title_burner.js';
import { SecurityWatermarker } from '../../packages/media/src/watermark.js';
import { SafeZoneOverlayGenerator } from '../../packages/media/src/safezone_overlay.js';
import { estimateTextWidth, fontFileEnv } from '../../packages/media/src/overlay_text.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GEIST = path.join(repoRoot, 'showcase/01-branded-promo/fonts/Geist-Variable.ttf');

interface Frame { w: number; h: number; data: Buffer }

/** Renders a 1 s solid-colour clip with silent audio. */
function makeClip(file: string, w: number, h: number, color: string): void {
  runFfmpeg([
    '-f', 'lavfi', '-i', `color=c=${color}:s=${w}x${h}:r=25:d=1`,
    '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo',
    '-t', '1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', file,
  ]);
}

/** Decodes the first frame to RGB24 and, when `png` is given, also writes it for inspection. */
function grab(file: string, w: number, h: number, png?: string): Frame {
  if (png) runFfmpeg(['-i', file, '-frames:v', '1', png]);
  const data = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 64 * 1024 * 1024 });
  return { w, h, data };
}

const rgb = (f: Frame, x: number, y: number): [number, number, number] => {
  const i = (Math.round(y) * f.w + Math.round(x)) * 3;
  return [f.data[i], f.data[i + 1], f.data[i + 2]];
};

/** Horizontal extent [min, max] of pixels in rows y0..y1 that match `pred`, or undefined. */
function extentX(f: Frame, y0: number, y1: number, pred: (p: [number, number, number]) => boolean): [number, number] | undefined {
  let lo = Infinity;
  let hi = -Infinity;
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < f.w; x++) {
      if (pred(rgb(f, x, y))) {
        lo = Math.min(lo, x);
        hi = Math.max(hi, x);
      }
    }
  }
  return lo <= hi ? [lo, hi] : undefined;
}

/** Fraction of differing pixels between two frames inside a box. */
function diffRatio(a: Frame, b: Frame, x0: number, y0: number, x1: number, y1: number): number {
  let diff = 0;
  let total = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const p = rgb(a, x, y);
      const q = rgb(b, x, y);
      total++;
      if (Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]) > 30) diff++;
    }
  }
  return diff / total;
}

const fontSizes = (svg: string) => [...svg.matchAll(/font-size="([\d.]+)"/g)].map(m => parseFloat(m[1]));

const isReddish = (p: [number, number, number]) => p[0] > 150 && p[0] - p[1] > 50;
/** Not the mid-grey source: banner backing or text. */
const notGrey = (p: [number, number, number]) => Math.abs(p[0] - 128) + Math.abs(p[1] - 128) + Math.abs(p[2] - 128) > 24;

export async function run(t: SuiteContext): Promise<void> {
  // --- pure helpers -----------------------------------------------------------------------
  t.assert(estimateTextWidth('WWWW', 20) > estimateTextWidth('iiii', 20), 'width estimate weights wide glyphs over narrow ones');
  t.assert(estimateTextWidth('ABC', 40) === 2 * estimateTextWidth('ABC', 20), 'width estimate scales linearly with font size');

  // --- title SVG geometry ------------------------------------------------------------------
  const svg1080 = TitleBurner.generateTitleSvg(1920, 1080, { titleText: 'Hello', subtitleText: 'World' });
  t.assert(fontSizes(svg1080).join(',') === '36,20', 'title defaults keep 36/20 px at 1080p', fontSizes(svg1080).join(','));
  t.assert(/width="1200" height="160" rx="16"/.test(svg1080), 'title defaults keep the 1200x160 card at 1080p');
  t.assert(/y="460"/.test(svg1080), 'centered card keeps its 1080p position (y = h/2 - 80)');
  const svg720 = TitleBurner.generateTitleSvg(1280, 720, { titleText: 'Hello', subtitleText: 'World' });
  t.assert(fontSizes(svg720).join(',') === '24,13.33', 'title sizes scale with the frame at 720p', fontSizes(svg720).join(','));
  const svgBig = TitleBurner.generateTitleSvg(1920, 1080, { titleText: 'Hello', subtitleText: 'World', titleSize: 60, subtitleSize: 30 });
  t.assert(fontSizes(svgBig).join(',') === '60,30', 'custom title/subtitle sizes apply');
  const big = /height="([\d.]+)" rx="16" fill/.exec(svgBig);
  t.assert(Boolean(big && parseFloat(big[1]) > 160), 'card grows to fit bigger text', big?.[1]);
  const longTitle = TitleBurner.generateTitleSvg(1920, 1080, { titleText: 'A very long title that would never fit in a single twelve hundred pixel wide card at all' });
  t.assert(fontSizes(longTitle)[0] < 36, 'over-long title shrinks instead of overrunning the card', String(fontSizes(longTitle)[0]));
  t.assert(!/<rect[^>]*clip-path/.test(svg1080), 'no accent stripe by default');
  t.assert(/fill="#8acf31" clip-path/.test(TitleBurner.generateTitleSvg(1920, 1080, { titleText: 'x', accentColor: '#8acf31' })), 'accent colour draws a stripe');
  let badColor = false;
  try { TitleBurner.generateTitleSvg(1920, 1080, { titleText: 'x', backgroundColor: 'red" onload="x' }); } catch { badColor = true; }
  t.assert(badColor, 'injected colour is rejected');

  // --- safe-zone SVG geometry --------------------------------------------------------------
  const sz = SafeZoneOverlayGenerator.generateSvgOverlay();
  t.assert(sz.includes('width="1080" height="1920"') && sz.includes('SAFE CONTENT AREA'), 'safe-zone default is a 1080x1920 guide');
  t.assert(sz.includes('fill="#FFFFFF"') && !sz.includes('#FCA5A5'), 'labels are white, not pale pink');
  t.assert((sz.match(/fill="rgba\(0, 0, 0, 0.72\)"/g) ?? []).length === 4, 'every label has a dark backing');
  const sz720 = SafeZoneOverlayGenerator.generateSvgOverlay({}, 720, 1280);
  const ratio = fontSizes(sz720)[0] / fontSizes(sz)[0];
  t.assert(Math.abs(ratio - 2 / 3) < 0.01, 'safe-zone labels scale with the frame (720x1280 = 2/3)', ratio.toFixed(3));
  const szWide = SafeZoneOverlayGenerator.generateSvgOverlay({ platform: 'reels' }, 1920, 1080);
  t.assert(szWide.includes('width="1920" height="1080"'), 'safe-zone guide is drawn at the frame size, not stretched');

  if (!fs.existsSync(GEIST)) {
    t.skip(`Geist font missing at ${GEIST}`);
  } else {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-text-font-'));
    try {
      t.assert(fontFileEnv(GEIST, dir).family === 'Geist', 'font file family is read with fc-scan');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  // --- rendered output ---------------------------------------------------------------------
  const keep = process.env.OVERLAY_TEXT_KEEP;
  const tmp = keep ? fs.mkdtempSync(path.join(keep, 'overlay-text-')) : fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-text-'));
  try {
    const clip1080 = path.join(tmp, 'grey-1080.mp4');
    const clip720 = path.join(tmp, 'grey-720.mp4');
    makeClip(clip1080, 1920, 1080, '0x808080');
    makeClip(clip720, 1280, 720, '0x808080');

    // Watermark: banner follows the text and never clips it.
    const short = SecurityWatermarker.applyWatermark(clip1080, { text: 'REVIEW', outputPath: path.join(tmp, 'wm-short.mp4') });
    const long = SecurityWatermarker.applyWatermark(clip1080, { text: 'CONFIDENTIAL - REVIEW ONLY', reviewer: 'Magnifito client account team', outputPath: path.join(tmp, 'wm-long.mp4') });
    t.assert(long.bannerWidth > short.bannerWidth + 300, 'long watermark text gets a wider banner', `${short.bannerWidth} vs ${long.bannerWidth}`);
    t.assert(long.bannerWidth > 480, 'long watermark is not held to the old fixed 480 px banner', String(long.bannerWidth));
    const fLong = grab(long.outputPath, 1920, 1080, path.join(tmp, 'wm-long.png'));
    const bandY0 = 40;
    const bandY1 = 40 + long.bannerHeight;
    const banner = extentX(fLong, bandY0 + 2, bandY1 - 2, notGrey);
    const text = extentX(fLong, bandY0, bandY1, isReddish);
    t.assert(Boolean(banner && text), 'watermark banner and text are visible', JSON.stringify({ banner, text }));
    if (banner && text) {
      t.assert(text[0] > banner[0] + 4 && text[1] < banner[1] - 4, 'watermark text sits fully inside its banner (not clipped)', JSON.stringify({ banner, text }));
      t.assert(banner[1] <= 1920 - 40 + 1, 'banner keeps its right margin', String(banner[1]));
    }

    const huge = SecurityWatermarker.applyWatermark(clip1080, { text: 'CONFIDENTIAL '.repeat(20).trim(), outputPath: path.join(tmp, 'wm-huge.mp4') });
    t.assert(huge.bannerWidth <= 1920 - 80, 'over-long watermark banner stays inside the frame', String(huge.bannerWidth));
    t.assert(huge.fontSize < 20, 'over-long watermark text shrinks to fit', huge.fontSize.toFixed(2));
    const fHuge = grab(huge.outputPath, 1920, 1080);
    const hugeText = extentX(fHuge, 40, 40 + huge.bannerHeight, isReddish);
    t.assert(Boolean(hugeText && hugeText[0] > 40 && hugeText[1] < 1880), 'over-long watermark text is not cut at the frame edge', JSON.stringify(hugeText));

    const wm720 = SecurityWatermarker.applyWatermark(clip720, { text: 'CONFIDENTIAL - REVIEW ONLY', reviewer: 'Magnifito client account team', outputPath: path.join(tmp, 'wm-720.mp4') });
    t.assert(Math.abs(wm720.fontSize / long.fontSize - 2 / 3) < 0.01, 'watermark text scales with the frame (720p = 2/3 of 1080p)', `${wm720.fontSize} vs ${long.fontSize}`);
    t.assert(Math.abs(wm720.bannerWidth / long.bannerWidth - 2 / 3) < 0.02, 'watermark banner scales with the frame', `${wm720.bannerWidth} vs ${long.bannerWidth}`);

    // Title: options change the rendered pixels.
    const tDefault = TitleBurner.burnTitle(clip1080, { titleText: 'Meet Mira', subtitleText: 'Digital marketing agency', position: 'top', outputPath: path.join(tmp, 'title-default.mp4') });
    const tBrand = TitleBurner.burnTitle(clip1080, {
      titleText: 'Meet Mira', subtitleText: 'Digital marketing agency', position: 'top',
      backgroundColor: '#f0eadf', titleColor: '#2b1c17', subtitleColor: '#7a584c', accentColor: '#8acf31',
      fontFile: fs.existsSync(GEIST) ? GEIST : undefined, titleSize: 48, subtitleSize: 26,
      outputPath: path.join(tmp, 'title-brand.mp4'),
    });
    const fd = grab(tDefault.outputPath, 1920, 1080, path.join(tmp, 'title-default.png'));
    const fb = grab(tBrand.outputPath, 1920, 1080, path.join(tmp, 'title-brand.png'));
    const navy = rgb(fd, 400, 110);
    t.assert(navy[2] > navy[0] && navy[0] < 60, 'default card is dark navy', navy.join(','));
    const cream = rgb(fb, 400, 130);
    t.assert(cream[0] > 220 && cream[1] > 210, 'custom background colour fills the card', cream.join(','));
    const stripe = rgb(fb, 960, 102);
    t.assert(stripe[1] > 170 && stripe[0] < 170, 'accent stripe is drawn in the accent colour', stripe.join(','));
    t.assert(diffRatio(fd, fb, 360, 100, 1560, 300) > 0.5, 'title options change the card pixels');

    if (fs.existsSync(GEIST)) {
      // Same family stack minus the file: Geist only renders when the font file is wired through.
      const tSans = TitleBurner.burnTitle(clip1080, { titleText: 'Meet Mira', position: 'center', fontFamily: 'Geist, sans-serif', outputPath: path.join(tmp, 'title-sans.mp4') });
      const tGeist = TitleBurner.burnTitle(clip1080, { titleText: 'Meet Mira', position: 'center', fontFile: GEIST, outputPath: path.join(tmp, 'title-geist.mp4') });
      const a = grab(tSans.outputPath, 1920, 1080);
      const b = grab(tGeist.outputPath, 1920, 1080, path.join(tmp, 'title-geist.png'));
      t.assert(diffRatio(a, b, 760, 470, 1160, 560) > 0.02, 'font file changes the rendered glyphs');
    }

    const t720 = TitleBurner.burnTitle(clip720, { titleText: 'Meet Mira', subtitleText: 'Digital marketing agency', position: 'top', outputPath: path.join(tmp, 'title-720.mp4') });
    const f720 = grab(t720.outputPath, 1280, 720, path.join(tmp, 'title-720.png'));
    const card720 = extentX(f720, 67 + 50, 67 + 52, p => p[2] > p[0] + 10 && p[0] < 60);
    const card1080 = extentX(fd, 100 + 75, 100 + 77, p => p[2] > p[0] + 10 && p[0] < 60);
    t.assert(Boolean(card720 && card1080 && Math.abs((card720[1] - card720[0]) / (card1080[1] - card1080[0]) - 2 / 3) < 0.02),
      'title card width scales with the frame (720p = 2/3 of 1080p)', JSON.stringify({ card720, card1080 }));

    // Safe zone: labels read on a white frame (worst case for the old pale pink text).
    const white = path.join(tmp, 'white-vertical.mp4');
    makeClip(white, 1080, 1920, 'white');
    const szOut = SafeZoneOverlayGenerator.applySafeZoneGuide(white, { outputPath: path.join(tmp, 'safezone.mp4') });
    const fz = grab(szOut, 1080, 1920, path.join(tmp, 'safezone.png'));
    const backing = rgb(fz, 540, 60);
    const dark = extentX(fz, 59, 61, p => p[0] < 90 && p[1] < 90 && p[2] < 90);
    t.assert(Boolean(dark) && dark![1] - dark![0] > 400, 'top label has a dark backing on a white frame', JSON.stringify({ dark, backing }));
    let whiteInside = 0;
    if (dark) for (let y = 50; y < 70; y++) for (let x = dark[0] + 20; x < dark[1] - 20; x++) { const p = rgb(fz, x, y); if (p[0] > 220 && p[1] > 220 && p[2] > 220) whiteInside++; }
    t.assert(whiteInside > 300, 'white label text is drawn on the dark backing', String(whiteInside));

    const wide = path.join(tmp, 'grey-wide.mp4');
    makeClip(wide, 1280, 720, 'white');
    const szWideOut = SafeZoneOverlayGenerator.applySafeZoneGuide(wide, { platform: 'generic', outputPath: path.join(tmp, 'safezone-wide.mp4') });
    grab(szWideOut, 1280, 720, path.join(tmp, 'safezone-wide.png'));
    t.assert(fs.existsSync(szWideOut), 'safe-zone guide renders on a landscape 720p frame');
  } finally {
    if (keep) t.log(`kept outputs in ${tmp}`);
    else fs.rmSync(tmp, { recursive: true, force: true });
  }
}
