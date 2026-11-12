import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { SuiteContext } from '../run-suites.js';
import { CLOCK_EPOCH_MS, fontFallbacks, launchBrowser, motionAvailability, openClip, renderFrame } from '../../packages/motion/src/capture.js';
import { brandFontWarnings } from '../../adapters/hyperframes/index.js';
import type { ProjectContext } from '../../adapters/interface.js';

/**
 * A clip page that draws from Math.random and the clock, so only a pinned page renders the same
 * twice. No text: a system fallback font loads lazily and can change the first frame, which is
 * what the font-fallback warning is for (see BROKEN).
 */
const NOISY = `<!doctype html><html><head><style>
  html,body{margin:0;background:#000} #stage{position:relative;width:320px;height:180px;overflow:hidden}
  #box{position:absolute;width:60px;height:60px} #t{position:absolute;left:8px;bottom:8px;color:#fff;font:16px serif}
</style></head><body><div id="stage"><div id="box"></div></div>
<script>
  window.DURATION = 1;
  window.seek = t => {
    const box = document.getElementById('box');
    box.style.left = Math.round(Math.random() * 260) + 'px';
    box.style.top = Math.round(Math.random() * 120) + 'px';
    box.style.background = 'hsl(' + (Date.now() % 360) + ',80%,50%)';
    window.__seen = { now: Date.now(), perf: performance.now(), date: new Date().getTime() };
  };
  window.__motionReady = true;
</script></body></html>`;

/** A page with text no embedded font covers and an image that does not exist. */
const BROKEN = NOISY.replace('<div id="box"></div>', '<div id="box"></div><div id="t">漢字 text</div><img src="missing.png" alt="">');

const sha = (f: string) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

/** Pinned clock and random numbers in browser capture, and renderer warnings. */
export async function run(t: SuiteContext): Promise<void> {
  // HyperFrames: brand fonts fontconfig cannot resolve.
  const ctx = (family: string) => ({ brand: { fonts: [{ family, weight: '400', rights_evidence: 'x' }] } }) as unknown as ProjectContext;
  const missing = await brandFontWarnings(ctx('NoSuchFontXyz'), undefined);
  if (missing === undefined) {
    t.skip('fc-match not installed: HyperFrames font check not measured');
  } else {
    t.assert(missing.length === 1 && missing[0].startsWith('font fallback: brand font "NoSuchFontXyz"'), 'a brand font fontconfig cannot find is a font-fallback warning', missing.join(';'));
    t.assert((await brandFontWarnings(ctx('-apple-system, sans-serif'), undefined))?.length === 0, 'a stack of only generic or vendor keywords is not checked');
  }

  const avail = motionAvailability();
  if (!avail.ok) {
    t.skip(`browser capture not available: ${avail.errors.join(' ')}`);
    return;
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mgvideo-determinism-'));
  const browser = await launchBrowser();
  try {
    const page = path.join(tmp, 'noisy.html');
    fs.writeFileSync(page, NOISY);
    const a = await renderFrame(page, 0.5, path.join(tmp, 'a.png'), browser);
    const b = await renderFrame(page, 0.5, path.join(tmp, 'b.png'), browser);
    const c = await renderFrame(page, 0.6, path.join(tmp, 'c.png'), browser);
    t.assert(sha(a) === sha(b), 'a page using Math.random and Date.now renders the same pixels for the same time');
    t.assert(sha(a) !== sha(c), 'a different time still draws a different frame');

    const broken = path.join(tmp, 'broken.html');
    fs.writeFileSync(broken, BROKEN);
    const clip = await openClip(browser, broken);
    try {
      await clip.page.evaluate('window.__mgClock(1.25); window.seek(1.25)');
      const seen = await clip.page.evaluate('window.__seen') as { now: number; perf: number; date: number };
      t.assert(seen.now === CLOCK_EPOCH_MS + 1250 && seen.date === seen.now && seen.perf === 1250,
        'Date.now, new Date() and performance.now read the seek time', JSON.stringify(seen));
      const typeofDate = await clip.page.evaluate('typeof Date() === "string" && new Date(0).getTime() === 0 && new Date() instanceof Date');
      t.assert(typeofDate === true, 'Date() as a function, Date with arguments and instanceof still behave');
      t.assert(clip.warnings.some(w => w.startsWith('failed to load') && w.includes('missing.png')), 'a missing image is a warning', clip.warnings.join('; '));
      const fallbacks = await fontFallbacks(clip);
      t.assert(fallbacks.length > 0 && fallbacks.some(f => f.includes('漢字')), 'text drawn in a system font is reported as font fallback', fallbacks.join('; '));
    } finally {
      await clip.page.close();
    }
  } finally {
    await browser.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
