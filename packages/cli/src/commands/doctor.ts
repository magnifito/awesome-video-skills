import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { CHROME_CANDIDATES, findChrome } from '../../../media/src/proc.js';
import { readSeparateMarker, SEPARATE_PINS, separateVenvDir } from '../../../media/src/separate.js';
import { readTranscribeMarker, TRANSCRIBE_PINS, transcribeVenvDir } from '../../../media/src/transcribe.js';
import { sfxEnvStatus } from '../../../media/src/sfx_env.js';
import { motionAvailability } from '../../../motion/src/capture.js';

const execFileAsync = promisify(execFile);

/** Returns the first binary from the list that is on PATH, or null. */
async function firstOnPath(bins: string[]): Promise<string | null> {
  for (const bin of bins) {
    try {
      await execFileAsync(process.platform === 'win32' ? 'where' : 'which', [bin]);
      return bin;
    } catch {
      // Not on PATH; try the next candidate.
    }
  }
  return null;
}

export interface HealthCheckItem {
  component: string;
  status: 'ok' | 'warning' | 'error';
  version?: string;
  details: string;
}

export async function runDoctor(): Promise<{ passed: boolean; items: HealthCheckItem[] }> {
  const items: HealthCheckItem[] = [];

  // 1. Node.js
  const nodeVersion = process.version;
  const majorNode = parseInt(nodeVersion.replace(/^v/, '').split('.')[0], 10);
  if (majorNode >= 22) {
    items.push({
      component: 'Node.js Runtime',
      status: 'ok',
      version: nodeVersion,
      details: 'Supported Node 22+ runtime detected.'
    });
  } else {
    items.push({
      component: 'Node.js Runtime',
      status: 'error',
      version: nodeVersion,
      details: 'Requires Node.js 22 or newer.'
    });
  }

  // 2. FFmpeg & FFprobe
  try {
    const { stdout: ffmpegOut } = await execFileAsync('ffmpeg', ['-version']);
    const match = ffmpegOut.match(/ffmpeg version ([\w.-]+)/);
    const ver = match ? match[1] : 'unknown';
    items.push({
      component: 'FFmpeg Engine',
      status: 'ok',
      version: ver,
      details: 'FFmpeg is installed and accessible.'
    });
  } catch (err) {
    items.push({
      component: 'FFmpeg Engine',
      status: 'error',
      details: `FFmpeg missing or failed: ${(err as Error).message}`
    });
  }

  try {
    const { stdout: ffprobeOut } = await execFileAsync('ffprobe', ['-version']);
    const match = ffprobeOut.match(/ffprobe version ([\w.-]+)/);
    const ver = match ? match[1] : 'unknown';
    items.push({
      component: 'FFprobe Metadata Inspector',
      status: 'ok',
      version: ver,
      details: 'FFprobe is installed and accessible.'
    });
  } catch (err) {
    items.push({
      component: 'FFprobe Metadata Inspector',
      status: 'error',
      details: `FFprobe missing or failed: ${(err as Error).message}`
    });
  }

  // 3. Headless Chrome (same lookup the renderers use)
  const chromePath = findChrome();
  if (chromePath) {
    try {
      const { stdout: chromeOut } = await execFileAsync(chromePath, ['--version']);
      items.push({
        component: 'Headless Browser (Chrome)',
        status: 'ok',
        version: chromeOut.trim(),
        details: `Available at: ${chromePath}`
      });
    } catch (err) {
      items.push({
        component: 'Headless Browser (Chrome)',
        status: 'warning',
        details: `Found ${chromePath} but it failed to run: ${(err as Error).message}`
      });
    }
  } else {
    items.push({
      component: 'Headless Browser (Chrome)',
      status: 'warning',
      details: `Chrome not found (checked: ${CHROME_CANDIDATES.join(', ')}). Set CHROME_PATH to override.`
    });
  }

  // 3b. Motion engine: playwright-core driving system Chrome (no browser download)
  const motion = motionAvailability();
  items.push({
    component: 'Motion Engine (playwright-core + Chrome)',
    status: motion.ok ? 'ok' : 'warning',
    version: motion.playwrightVersion ? `playwright-core ${motion.playwrightVersion}` : undefined,
    details: motion.ok
      ? `engine "motion" can render with ${motion.chromePath}.`
      : `engine "motion" unavailable: ${motion.errors.join(' ')}`
  });

  // 4. SVG rasterizer (needed for title cards, lower thirds, overlays and renders)
  const rasterizers = ['rsvg-convert', 'resvg', 'magick', 'convert', ...(process.platform === 'darwin' ? ['sips'] : [])];
  const foundRasterizer = await firstOnPath(rasterizers);
  items.push(
    foundRasterizer || chromePath
      ? {
          component: 'SVG Rasterizer',
          status: 'ok',
          details: `Using ${foundRasterizer ?? `headless Chrome (${chromePath})`}.`
        }
      : {
          component: 'SVG Rasterizer',
          status: 'error',
          details: 'No SVG rasterizer found. Install librsvg (rsvg-convert), resvg, ImageMagick, or Chrome.'
        }
  );

  // 5. Cyrillic font coverage, checked with fontconfig when available
  try {
    const { stdout } = await execFileAsync('fc-list', [':lang=bg', 'family']);
    const families = [...new Set(stdout.split('\n').map(l => l.split(',')[0].trim()).filter(Boolean))];
    items.push(
      families.length > 0
        ? {
            component: 'Cyrillic Typography Subsystem',
            status: 'ok',
            details: `${families.length} installed font families cover Bulgarian (e.g. ${families.slice(0, 3).join(', ')}).`
          }
        : {
            component: 'Cyrillic Typography Subsystem',
            status: 'warning',
            details: 'fontconfig reports no installed fonts covering Bulgarian (fc-list :lang=bg).'
          }
    );
  } catch {
    items.push({
      component: 'Cyrillic Typography Subsystem',
      status: 'warning',
      details: 'Not verified: fontconfig (fc-list) is not installed, so Cyrillic font coverage could not be checked.'
    });
  }

  // 6. Budget policy: informational only. Enforcement happens per project in `mgvideo gate`.
  items.push({
    component: 'Cost & Media Policy Guard',
    status: 'ok',
    details: 'Informational: no external media APIs are integrated; per-project budgets are enforced by `mgvideo gate`.'
  });

  // Sound-pass venv (optional). Checks the setup marker only, so it stays instant.
  const sfxEnv = sfxEnvStatus();
  items.push(
    sfxEnv.ready
      ? {
          component: 'Sound Pass (librosa venv)',
          status: 'ok',
          version: sfxEnv.pythonVersion ? `Python ${sfxEnv.pythonVersion}` : undefined,
          details: `Ready at ${sfxEnv.venvDir}.`
        }
      : {
          component: 'Sound Pass (librosa venv)',
          status: 'warning',
          details: `Optional; not set up (${sfxEnv.reason}). Run \`mgvideo setup sfx\` to enable \`mgvideo sfx <video> --music\`.`
        }
  );

  // Object separation venv (optional). Reads the marker written by `mgvideo setup separate`
  // instead of importing torch, so the check stays instant.
  const separateMarker = readSeparateMarker();
  if (!separateMarker) {
    items.push({
      component: 'Object Separation (SAM 2.1)',
      status: 'warning',
      details: `Optional; not set up (${separateVenvDir()}). Run \`mgvideo setup separate\` to enable \`mgvideo separate\`.`
    });
  } else {
    const s = separateMarker.scan;
    const stale = JSON.stringify(separateMarker.pins) !== JSON.stringify(SEPARATE_PINS);
    items.push({
      component: 'Object Separation (SAM 2.1)',
      status: stale ? 'warning' : 'ok',
      version: `Python ${separateMarker.pythonVersion}${s.torch ? `, torch ${s.torch}` : ''}`,
      details: `Device ${s.device}${s.gpu ? ` (${s.gpu})` : ''}, default model ${s.model}.${stale ? ' Pins changed since setup; re-run `mgvideo setup separate`.' : ''}`
    });
  }

  // Speech recognition venv (optional), from the marker written by `mgvideo setup transcribe`.
  const transcribeMarker = readTranscribeMarker();
  if (!transcribeMarker) {
    items.push({
      component: 'Speech Recognition (faster-whisper)',
      status: 'warning',
      details: `Optional; not set up (${transcribeVenvDir()}). Run \`mgvideo setup transcribe\` to enable \`mgvideo transcribe\`, caption timing and name checks.`
    });
  } else {
    const stale = JSON.stringify(transcribeMarker.pins) !== JSON.stringify(TRANSCRIBE_PINS);
    items.push({
      component: 'Speech Recognition (faster-whisper)',
      status: stale ? 'warning' : 'ok',
      version: `Python ${transcribeMarker.pythonVersion}`,
      details: `${transcribeMarker.pins.join(', ')}.${stale ? ' Pins changed since setup; re-run `mgvideo setup transcribe`.' : ''}`
    });
  }

  const passed = items.every(i => i.status !== 'error');
  return { passed, items };
}

