import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  VideoRendererAdapter,
  AdapterCapabilities,
  ProjectContext,
  RenderOptions,
  AdapterRenderOutput
} from '../interface.js';
import { inspectMedia, measureAudioLoudness, MediaProbeResult } from '../../packages/media/src/inspector.js';

const execFileAsync = promisify(execFile);

export class HyperFramesAdapter implements VideoRendererAdapter {
  readonly id: string = 'hyperframes';
  readonly name: string = 'HyperFrames HTML Video Engine';
  readonly capabilities: AdapterCapabilities = {
    formats: ['mp4', 'webm', 'mov_prores', 'png_sequence'],
    transparency: true,
    audioMixing: true,
    dynamicInput: true,
    headlessBrowser: true,
    preview: true
  };

  /**
   * Validate that project context satisfies HyperFrames requirements.
   */
  async validate(context: ProjectContext): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    if (!context.scenePlan || context.scenePlan.scenes.length === 0) {
      errors.push('HyperFrames: Scene plan is missing or contains zero scenes.');
    }
    if (!context.brand.fonts || context.brand.fonts.length === 0) {
      errors.push('HyperFrames: At least one font definition with rights evidence is required.');
    }
    if (context.brief.language === 'bg') {
      const cyrillicFont = context.brand.fonts.find(f => f.supports_cyrillic);
      if (!cyrillicFont) {
        errors.push("HyperFrames: Brief requests Bulgarian ('bg'), but brand has no verified Cyrillic-supporting font.");
      }
    }
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Generates seekable HTML composition document matching the HyperFrames contract.
   */
  generateCompositionHtml(context: ProjectContext, width: number, height: number): string {
    const { brand, scenePlan, brief } = context;
    const totalDurationSeconds = scenePlan.scenes.reduce((acc, s) => acc + s.duration_seconds, 0);

    const scenesJson = JSON.stringify(scenePlan.scenes);
    const brandJson = JSON.stringify(brand);

    return `<!DOCTYPE html>
<html lang="${brief.language}">
<head>
  <meta charset="UTF-8">
  <title>${brief.objective}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: ${width}px;
      height: ${height}px;
      overflow: hidden;
      background-color: ${brand.colors.background};
      color: ${brand.colors.text_primary};
      font-family: ${brand.fonts[0]?.family || 'system-ui'}, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      position: relative;
    }
    .scene {
      position: absolute;
      top: 0; left: 0;
      width: 100%; height: 100%;
      display: none;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      padding: 60px;
      text-align: center;
    }
    .scene.active { display: flex; }
    .logo-container {
      margin-bottom: 30px;
    }
    .headline {
      font-size: ${Math.round(brand.type_scale.h1 * (width > 1200 ? 1 : 0.8))}px;
      font-weight: 700;
      line-height: 1.2;
      margin-bottom: 24px;
      color: ${brand.colors.text_primary};
    }
    .highlight {
      color: ${brand.colors.primary};
    }
    .badge {
      display: inline-block;
      padding: 8px 16px;
      border-radius: ${brand.motion_preferences.border_radius}px;
      background-color: ${brand.colors.primary};
      color: ${brand.colors.background};
      font-size: ${brand.type_scale.caption || 16}px;
      font-weight: 600;
      margin-bottom: 20px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .card {
      background: ${brand.motion_preferences.glassmorphism ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.04)'};
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: ${brand.motion_preferences.border_radius * 2}px;
      padding: 40px;
      max-width: 80%;
      box-shadow: 0 20px 40px rgba(0,0,0,0.3);
    }
  </style>
</head>
<body>
  <div id="composition" data-total-duration="${totalDurationSeconds}">
    ${scenePlan.scenes.map((s, idx) => `
      <div id="scene-${s.scene_id}" class="scene ${idx === 0 ? 'active' : ''}" data-duration="${s.duration_seconds}">
        <div class="card">
          <div class="badge">${brand.name} • ${s.visual_recipe}</div>
          <h1 class="headline">${escapeHtml(s.copy_text)}</h1>
        </div>
      </div>
    `).join('')}
  </div>

  <script>
    window.__videoMeta = {
      fps: 30,
      duration: ${totalDurationSeconds},
      width: ${width},
      height: ${height},
      scenes: ${scenesJson},
      brand: ${brandJson}
    };

    window.__currentTime = 0;
    window.seek = function(seconds) {
      window.__currentTime = seconds;
      let accumulated = 0;
      const scenes = window.__videoMeta.scenes;
      for (let i = 0; i < scenes.length; i++) {
        const sc = scenes[i];
        const elem = document.getElementById('scene-' + sc.scene_id);
        if (!elem) continue;
        if (seconds >= accumulated && seconds < (accumulated + sc.duration_seconds)) {
          elem.classList.add('active');
        } else {
          elem.classList.remove('active');
        }
        accumulated += sc.duration_seconds;
      }
    };
    window.__seek = window.seek;
  </script>
</body>
</html>`;
  }

  /**
   * Generates SVG for an individual scene card to render frames without external font latency.
   */
  generateSceneSvg(
    scene: ProjectContext['scenePlan']['scenes'][0],
    brand: ProjectContext['brand'],
    width: number,
    height: number,
    transparent = false
  ): string {
    const fontSize = Math.round(width > 1200 ? 54 : 40);
    const subSize = Math.round(fontSize * 0.45);
    const isVertical = height > width;
    const cardWidth = Math.round(width * (isVertical ? 0.78 : 0.82));
    const cardHeight = Math.round(height * (isVertical ? 0.42 : 0.45));
    const cardX = Math.round(width * (isVertical ? 0.08 : (1 - 0.82) / 2));
    const cardY = Math.round((height - cardHeight) / 2);

    // Break lines for text
    const words = scene.copy_text.split(' ');
    const lines: string[] = [];
    let currentLine = '';
    for (const w of words) {
      if ((currentLine + ' ' + w).trim().length > 28) {
        lines.push(currentLine.trim());
        currentLine = w;
      } else {
        currentLine += ' ' + w;
      }
    }
    if (currentLine.trim()) lines.push(currentLine.trim());

    const textYStart = cardY + 140;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${brand.colors.background}"/>
      <stop offset="100%" stop-color="#020617"/>
    </linearGradient>
    <linearGradient id="cardGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e293b" stop-opacity="${transparent ? '0.85' : '0.95'}"/>
      <stop offset="100%" stop-color="#0f172a" stop-opacity="${transparent ? '0.85' : '0.95'}"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  ${transparent ? '' : '<rect width="100%" height="100%" fill="url(#bgGrad)"/>'}

  <!-- Card Backdrop -->
  <rect x="${cardX}" y="${cardY}" width="${cardWidth}" height="${cardHeight}" rx="24" ry="24"
        fill="url(#cardGrad)" stroke="${brand.colors.primary}" stroke-width="2"/>

  <!-- Brand Badge -->
  <rect x="${cardX + 40}" y="${cardY + 40}" width="180" height="36" rx="8" ry="8" fill="${brand.colors.primary}"/>
  <text x="${cardX + 130}" y="${cardY + 63}" font-family="-apple-system, BlinkMacSystemFont, Arial, sans-serif" font-size="14" font-weight="bold" fill="${brand.colors.background}" text-anchor="middle">
    ${escapeHtml(brand.name.toUpperCase())}
  </text>

  <!-- Recipe Tag -->
  <text x="${cardX + cardWidth - 40}" y="${cardY + 63}" font-family="-apple-system, BlinkMacSystemFont, Arial, sans-serif" font-size="13" fill="#94a3b8" text-anchor="end">
    ${escapeHtml(scene.visual_recipe)}
  </text>

  <!-- Copy Text Lines -->
  ${lines.map((line, i) => `
    <text x="${width / 2}" y="${textYStart + (i * (fontSize + 12))}"
          font-family="-apple-system, BlinkMacSystemFont, Arial, Helvetica, sans-serif"
          font-size="${fontSize}" font-weight="700"
          fill="${brand.colors.text_primary}" text-anchor="middle">
      ${escapeHtml(line)}
    </text>
  `).join('')}

  <!-- Footer claim indicator -->
  <text x="${width / 2}" y="${cardY + cardHeight - 35}"
        font-family="-apple-system, BlinkMacSystemFont, Arial, sans-serif"
        font-size="${subSize}" fill="${brand.colors.primary}" text-anchor="middle">
    ${scene.claims_refs.length > 0 ? `✓ ${scene.claims_refs.join(', ')}` : ''}
  </text>
</svg>`;
  }

  async renderStill(context: ProjectContext, frameNumber: number, options: RenderOptions): Promise<string> {
    const { settings, outputDir } = options;
    const stillPath = path.join(outputDir, `still_frame_${frameNumber}.png`);
    await fs.mkdir(outputDir, { recursive: true });

    // Pick active scene at frameNumber
    const seconds = frameNumber / settings.fps;
    let accumulated = 0;
    let targetScene = context.scenePlan.scenes[0];
    for (const sc of context.scenePlan.scenes) {
      if (seconds >= accumulated && seconds < (accumulated + sc.duration_seconds)) {
        targetScene = sc;
        break;
      }
      accumulated += sc.duration_seconds;
    }

    const svgContent = this.generateSceneSvg(targetScene, context.brand, settings.width, settings.height);
    const svgPath = path.join(outputDir, `temp_still_${frameNumber}.svg`);
    await fs.writeFile(svgPath, svgContent, 'utf-8');

    // Use sips or Chrome to render SVG to PNG
    try {
      await execFileAsync('sips', ['-s', 'format', 'png', svgPath, '--out', stillPath]);
    } catch {
      // Fallback using Chrome headless
      await execFileAsync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
        '--headless=new',
        `--screenshot=${stillPath}`,
        `--window-size=${settings.width},${settings.height}`,
        svgPath
      ]);
    }

    try { await fs.unlink(svgPath); } catch {}
    return stillPath;
  }

  async renderVideo(context: ProjectContext, options: RenderOptions): Promise<AdapterRenderOutput> {
    const { settings, outputDir, runId, requestHash } = options;
    const logs: string[] = [];
    logs.push(`[HyperFrames] Initializing render run: ${runId}`);
    logs.push(`[HyperFrames] Request Hash: ${requestHash}`);
    logs.push(`[HyperFrames] Dimensions: ${settings.width}x${settings.height} @ ${settings.fps}fps`);

    await fs.mkdir(outputDir, { recursive: true });

    // 1. Write the HyperFrames HTML composition
    const compHtml = this.generateCompositionHtml(context, settings.width, settings.height);
    const compPath = path.join(outputDir, 'composition.html');
    await fs.writeFile(compPath, compHtml, 'utf-8');
    logs.push(`[HyperFrames] Wrote composition contract to ${compPath}`);

    // 2. Render each scene into a video segment
    const segmentPaths: string[] = [];
    const tempFiles: string[] = [];

    const isTransparent = settings.transparent || settings.format === 'mov_prores';
    const isProRes = settings.format === 'mov_prores';
    const isWebM = settings.format === 'webm';
    const fileExt = isProRes ? 'mov' : isWebM ? 'webm' : 'mp4';

    for (let i = 0; i < context.scenePlan.scenes.length; i++) {
      const scene = context.scenePlan.scenes[i];
      logs.push(`[HyperFrames] Rendering scene ${i + 1}/${context.scenePlan.scenes.length}: ${scene.scene_id} (${scene.duration_seconds}s)`);

      const svgContent = this.generateSceneSvg(scene, context.brand, settings.width, settings.height, isTransparent);
      const svgPath = path.join(outputDir, `scene_${i}.svg`);
      const pngPath = path.join(outputDir, `scene_${i}.png`);
      const segPath = path.join(outputDir, `segment_${i}.${fileExt}`);

      await fs.writeFile(svgPath, svgContent, 'utf-8');
      tempFiles.push(svgPath);

      // Render SVG to PNG
      try {
        await execFileAsync('sips', ['-s', 'format', 'png', svgPath, '--out', pngPath]);
      } catch {
        await execFileAsync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
          '--headless=new',
          `--screenshot=${pngPath}`,
          `--window-size=${settings.width},${settings.height}`,
          svgPath
        ]);
      }
      tempFiles.push(pngPath);

      // Encode segment using ffmpeg based on target format and alpha capability
      let segArgs: string[];
      if (isProRes) {
        segArgs = [
          '-y',
          '-loop', '1',
          '-i', pngPath,
          '-f', 'lavfi',
          '-i', `anullsrc=r=${settings.audio_sample_rate}:cl=stereo`,
          '-t', scene.duration_seconds.toString(),
          '-c:v', 'prores_ks',
          '-profile:v', '4', // ProRes 4444
          '-pix_fmt', 'yuva444p10le',
          '-r', settings.fps.toString(),
          '-c:a', 'pcm_s16le',
          segPath
        ];
      } else if (isWebM && isTransparent) {
        segArgs = [
          '-y',
          '-loop', '1',
          '-i', pngPath,
          '-f', 'lavfi',
          '-i', `anullsrc=r=${settings.audio_sample_rate}:cl=stereo`,
          '-t', scene.duration_seconds.toString(),
          '-c:v', 'libvpx-vp9',
          '-pix_fmt', 'yuva420p',
          '-r', settings.fps.toString(),
          '-c:a', 'libopus',
          segPath
        ];
      } else {
        segArgs = [
          '-y',
          '-loop', '1',
          '-i', pngPath,
          '-f', 'lavfi',
          '-i', `anullsrc=r=${settings.audio_sample_rate}:cl=stereo`,
          '-t', scene.duration_seconds.toString(),
          '-vf', `scale=${settings.width}:${settings.height},format=yuv420p`,
          '-c:v', 'libx264',
          '-colorspace', 'bt709',
          '-color_primaries', 'bt709',
          '-color_trc', 'bt709',
          '-color_range', 'tv',
          '-r', settings.fps.toString(),
          '-c:a', 'aac',
          '-b:a', '192k',
          segPath
        ];
      }

      await execFileAsync('ffmpeg', segArgs);
      segmentPaths.push(segPath);
      tempFiles.push(segPath);
    }

    // 3. Concatenate segments
    const concatListPath = path.join(outputDir, 'concat_list.txt');
    const concatContent = segmentPaths.map(p => `file '${path.resolve(p)}'`).join('\n');
    await fs.writeFile(concatListPath, concatContent, 'utf-8');
    tempFiles.push(concatListPath);

    const finalOutputPath = path.join(outputDir, `final_output_${runId}.${fileExt}`);

    const concatArgs = [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', concatListPath,
      '-c', 'copy',
      finalOutputPath
    ];

    await execFileAsync('ffmpeg', concatArgs);
    logs.push(`[HyperFrames] Successfully assembled final video: ${finalOutputPath}`);

    // Clean up temporary segment files
    for (const f of tempFiles) {
      try { await fs.unlink(f); } catch {}
    }

    // 4. Measure output and calculate hash
    const probe = await inspectMedia(finalOutputPath);
    const loudness = await measureAudioLoudness(finalOutputPath);
    const fileBuffer = await fs.readFile(finalOutputPath);
    const outputHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    logs.push(`[HyperFrames] Measured duration: ${probe.duration_seconds}s, FPS: ${probe.fps}, Hash: ${outputHash.slice(0, 16)}...`);

    return {
      outputPath: finalOutputPath,
      format: settings.format,
      fileSizeBytes: fileBuffer.length,
      outputHash,
      measurements: {
        ...probe,
        measured_loudness_lufs: loudness.lufs,
        measured_true_peak_db: loudness.true_peak_db
      },
      logs
    };
  }

  async inspectOutput(outputPath: string): Promise<MediaProbeResult> {
    return inspectMedia(outputPath);
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
