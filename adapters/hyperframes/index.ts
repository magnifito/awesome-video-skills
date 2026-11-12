import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { scenePlanFps } from '../../packages/contracts/src/index.js';
import type { RenderSettings, TextManifest } from '../../packages/contracts/src/index.js';
import { rasterizeSvg, rasterizeSvgAsync, concatListLine, safeCssColor, safeJoin } from '../../packages/media/src/proc.js';
import type {
  VideoRendererAdapter,
  AdapterCapabilities,
  ProjectContext,
  RenderOptions,
  AdapterRenderOutput
} from '../interface.js';
import { inspectMedia, measureAudioLoudness, MediaProbeResult } from '../../packages/media/src/inspector.js';
import { loadSceneImages, renderRecipeSvg, type SceneImage } from './recipes.js';
import { renderStyleRecipeSvg } from './style-recipes.js';
import { composeFrame, frameState, motionProfile, splitSvg } from './animate.js';
import { buildTextManifest } from './text_manifest.js';

/** Frames rasterized at the same time. */
const PARALLEL_FRAMES = 8;

const execFileAsync = promisify(execFile);

export class HyperFramesAdapter implements VideoRendererAdapter {
  readonly id: string = 'hyperframes';
  // Each scene is a recipe SVG card animated frame by frame (staggered entrance, optional
  // camera drift, fade before the cut; see animate.ts). The seekable composition.html is
  // emitted as a contract artifact but is not frame-captured.
  readonly name: string = 'HyperFrames Animated Card Renderer';
  readonly capabilities: AdapterCapabilities = {
    formats: ['mp4', 'webm', 'mov_prores'],
    transparency: true,
    audioMixing: true,
    dynamicInput: true,
    headlessBrowser: false,
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
    for (const [k, v] of Object.entries(context.brand.colors)) {
      if (v === undefined) continue;
      try { safeCssColor(v); } catch { errors.push(`HyperFrames: brand color ${k} is not a valid CSS color.`); }
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

    const scenesJson = jsonForScript(scenePlan.scenes);
    const brandJson = jsonForScript(brand);
    const fps = scenePlanFps(scenePlan);
    const fontFamily = cssFontFamily(brand.fonts[0]?.family);
    const c = {
      background: safeCssColor(brand.colors.background),
      text: safeCssColor(brand.colors.text_primary),
      primary: safeCssColor(brand.colors.primary),
    };

    return `<!DOCTYPE html>
<html lang="${escapeHtml(brief.language)}">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(brief.objective)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: ${width}px;
      height: ${height}px;
      overflow: hidden;
      background-color: ${c.background};
      color: ${c.text};
      font-family: ${fontFamily}, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
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
      color: ${c.text};
    }
    .highlight {
      color: ${c.primary};
    }
    .badge {
      display: inline-block;
      padding: 8px 16px;
      border-radius: ${brand.motion_preferences.border_radius}px;
      background-color: ${c.primary};
      color: ${c.background};
      font-size: ${Number(brand.type_scale.caption || 16)}px;
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
      <div id="scene-${escapeHtml(s.scene_id)}" class="scene ${idx === 0 ? 'active' : ''}" data-duration="${s.duration_seconds}">
        <div class="card">
          <div class="badge">${escapeHtml(brand.name)} • ${escapeHtml(s.visual_recipe)}</div>
          <h1 class="headline">${escapeHtml(s.copy_text)}</h1>
        </div>
      </div>
    `).join('')}
  </div>

  <script>
    window.__videoMeta = {
      fps: ${fps},
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
    transparent = false,
    assetSource?: Pick<ProjectContext, 'projectDir' | 'assets'>
  ): string {
    if (scene.visual_recipe === 'brand-title') {
      return this.generateBrandTitleSvg(scene, brand, width, height, transparent, assetSource);
    }
    const images = assetSource ? loadSceneImages(scene, assetSource, false) : [];
    const recipeSvg = renderRecipeSvg(scene, brand, width, height, transparent, images)
      ?? renderStyleRecipeSvg(scene, brand, width, height, transparent, images);
    if (recipeSvg) return recipeSvg;
    // Fallback review card for recipes without a layout of their own.
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
    const bg = safeCssColor(brand.colors.background);
    const primary = safeCssColor(brand.colors.primary);
    const textColor = safeCssColor(brand.colors.text_primary);

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${bg}"/>
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
        fill="url(#cardGrad)" stroke="${primary}" stroke-width="2"/>

  <!-- Brand Badge -->
  <rect x="${cardX + 40}" y="${cardY + 40}" width="180" height="36" rx="8" ry="8" fill="${primary}"/>
  <text x="${cardX + 130}" y="${cardY + 63}" font-family="-apple-system, BlinkMacSystemFont, Arial, sans-serif" font-size="14" font-weight="bold" fill="${bg}" text-anchor="middle">
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
          fill="${textColor}" text-anchor="middle">
      ${escapeHtml(line)}
    </text>
  `).join('')}

  <!-- Footer claim indicator -->
  <text x="${width / 2}" y="${cardY + cardHeight - 35}"
        font-family="-apple-system, BlinkMacSystemFont, Arial, sans-serif"
        font-size="${subSize}" fill="${primary}" text-anchor="middle">
    ${scene.claims_refs.length > 0 ? `✓ ${escapeHtml(scene.claims_refs.join(', '))}` : ''}
  </text>
</svg>`;
  }

  /**
   * Recipe "brand-title": full-bleed brand gradient, one centred headline in the brand heading
   * font, and the first raster/vector logo referenced by the scene. No review labels.
   */
  generateBrandTitleSvg(
    scene: ProjectContext['scenePlan']['scenes'][0],
    brand: ProjectContext['brand'],
    width: number,
    height: number,
    transparent: boolean,
    assetSource?: Pick<ProjectContext, 'projectDir' | 'assets'>
  ): string {
    const bg = safeCssColor(brand.colors.background);
    const bgEnd = safeCssColor(brand.colors.secondary ?? brand.colors.background);
    const textColor = safeCssColor(brand.colors.text_primary);
    const headingFont = cssFontFamily(brand.fonts[0]?.family);
    const weight = /^[1-9]00$/.test(brand.fonts[0]?.weight ?? '') ? brand.fonts[0].weight : '700';
    const scale = Math.min(width, height) / 1080;
    const fontSize = Math.round(brand.type_scale.h1 * scale);
    const lineHeight = Math.round(fontSize * 1.18);

    const logo = assetSource ? this.loadSceneLogo(scene, assetSource) : null;
    // 32% of the width suits landscape; in portrait that leaves the image at a fifth of the frame
    // height, so portrait frames give it 72% of the width.
    const logoW = logo ? Math.round(width * (height > width ? 0.72 : 0.32)) : 0;
    const logoH = logo ? Math.round(logoW * logo.aspect) : 0;

    const maxChars = Math.max(12, Math.floor((width * 0.84) / (fontSize * 0.55)));
    const lines = wrapWords(scene.copy_text, maxChars);
    const gap = logo && lines.length ? Math.round(24 * scale) : 0;
    const blockH = logoH + gap + lines.length * lineHeight;
    const top = Math.round((height - blockH) / 2);

    const logoEl = logo
      ? `<image x="${Math.round((width - logoW) / 2)}" y="${top}" width="${logoW}" height="${logoH}" preserveAspectRatio="xMidYMid meet" href="${logo.dataUri}"/>`
      : '';
    const textTop = top + logoH + gap;
    const textEls = lines
      .map(
        (line, i) =>
          `<text x="${width / 2}" y="${textTop + i * lineHeight + Math.round(fontSize * 0.86)}" font-family="${escapeHtml(headingFont)}" font-size="${fontSize}" font-weight="${weight}" fill="${textColor}" text-anchor="middle">${escapeHtml(line)}</text>`
      )
      .join('\n  ');

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${bg}"/>
      <stop offset="100%" stop-color="${bgEnd}"/>
    </linearGradient>
  </defs>
  ${transparent ? '' : '<rect width="100%" height="100%" fill="url(#bgGrad)"/>'}
  ${logoEl}
  ${textEls}
</svg>`;
  }

  /** Loads the first SVG/PNG/JPEG asset referenced by the scene as a data URI. */
  private loadSceneLogo(
    scene: ProjectContext['scenePlan']['scenes'][0],
    source: Pick<ProjectContext, 'projectDir' | 'assets'>
  ): SceneImage | null {
    return loadSceneImages(scene, source)[0] ?? null;
  }

  /**
   * When brand fonts ship files, returns an environment whose fontconfig also scans those
   * font directories, so rasterizers render the real brand typeface.
   */
  private async fontEnv(context: ProjectContext, outputDir: string): Promise<NodeJS.ProcessEnv | undefined> {
    const dirs = new Set<string>();
    for (const f of context.brand.fonts) {
      if (!f.file_path) continue;
      const file = safeJoin(context.projectDir, f.file_path);
      if (!existsSync(file)) throw new Error(`Brand font file not found: ${f.file_path}`);
      dirs.add(path.dirname(file));
    }
    if (dirs.size === 0) return undefined;
    const confPath = path.join(outputDir, 'fonts.conf');
    const includes = [process.env.FONTCONFIG_FILE, '/opt/homebrew/etc/fonts/fonts.conf', '/usr/local/etc/fonts/fonts.conf', '/etc/fonts/fonts.conf']
      .filter((p): p is string => !!p)
      .map(p => `  <include ignore_missing="yes">${escapeHtml(p)}</include>`)
      .join('\n');
    const dirEls = [...dirs].map(d => `  <dir>${escapeHtml(d)}</dir>`).join('\n');
    await fs.writeFile(
      confPath,
      `<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig>\n${includes}\n${dirEls}\n  <cachedir>${escapeHtml(path.join(os.tmpdir(), 'mgvideo-fontcache'))}</cachedir>\n</fontconfig>\n`,
      'utf-8'
    );
    // Pango on macOS defaults to CoreText and ignores fontconfig; force the fontconfig backend.
    return { ...process.env, FONTCONFIG_FILE: confPath, PANGOCAIRO_BACKEND: 'fc' };
  }

  async renderStill(context: ProjectContext, frameNumber: number, options: RenderOptions): Promise<string> {
    const { settings, outputDir } = options;
    const stillPath = path.join(outputDir, `still_frame_${frameNumber}.png`);
    await fs.mkdir(outputDir, { recursive: true });

    // Pick active scene at frameNumber
    const seconds = frameNumber / settings.fps;
    const scenes = context.scenePlan.scenes;
    let accumulated = 0;
    let index = scenes.length - 1;
    for (let i = 0; i < scenes.length; i++) {
      if (seconds < accumulated + scenes[i].duration_seconds) { index = i; break; }
      if (i < scenes.length - 1) accumulated += scenes[i].duration_seconds;
    }
    const targetScene = scenes[index];
    const local = Math.min(Math.max(0, seconds - accumulated), targetScene.duration_seconds);
    const baseSvg = this.generateSceneSvg(targetScene, context.brand, settings.width, settings.height, false, context);
    const parts = splitSvg(baseSvg, settings.width, settings.height);
    const profile = motionProfile(targetScene, context.brand, index === scenes.length - 1);
    const svgContent = composeFrame(parts, frameState(parts, profile, local, targetScene.duration_seconds, settings.height), settings.width, settings.height);
    const svgPath = path.join(outputDir, `temp_still_${frameNumber}.svg`);
    await fs.writeFile(svgPath, svgContent, 'utf-8');
    try {
      rasterizeSvg(svgPath, stillPath, settings.width, settings.height, await this.fontEnv(context, outputDir));
    } finally {
      await fs.rm(svgPath, { force: true });
    }
    return stillPath;
  }

  async textManifest(context: ProjectContext, settings: RenderSettings, workDir: string): Promise<TextManifest> {
    await fs.mkdir(workDir, { recursive: true });
    return this.buildManifest(context, settings, path.join(workDir, 'text_probe'), await this.fontEnv(context, workDir));
  }

  private buildManifest(context: ProjectContext, settings: RenderSettings, probeDir: string, env: NodeJS.ProcessEnv | undefined): Promise<TextManifest> {
    return buildTextManifest(
      context,
      i => this.generateSceneSvg(context.scenePlan.scenes[i], context.brand, settings.width, settings.height, settings.transparent, context),
      settings.width,
      settings.height,
      probeDir,
      env
    );
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
    const tempDirs: string[] = [];

    if (settings.transparent && settings.format === 'mp4') {
      throw new Error('HyperFrames: transparent output requires webm or mov_prores; H.264 mp4 cannot carry alpha.');
    }
    const isProRes = settings.format === 'mov_prores';
    const isWebM = settings.format === 'webm';
    const isTransparent = settings.transparent;
    const fileExt = isProRes ? 'mov' : isWebM ? 'webm' : 'mp4';
    const fps = settings.fps;
    const planFps = scenePlanFps(context.scenePlan);
    if (planFps !== fps) {
      logs.push(`[HyperFrames] Note: scene plan is authored at ${planFps}fps; encoding at requested ${fps}fps.`);
    }

    const audioIn = ['-f', 'lavfi', '-i', `anullsrc=r=${settings.audio_sample_rate}:cl=stereo`];
    const finalOutputPath = path.join(outputDir, `final_output_${runId}.${fileExt}`);
    const textManifestPath = path.join(outputDir, 'text-manifest.json');
    const renderFontEnv = await this.fontEnv(context, outputDir);

    try {
      for (let i = 0; i < context.scenePlan.scenes.length; i++) {
        const scene = context.scenePlan.scenes[i];
        logs.push(`[HyperFrames] Rendering scene ${i + 1}/${context.scenePlan.scenes.length}: ${scene.scene_id} (${scene.duration_seconds}s)`);

        const segPath = path.join(outputDir, `segment_${i}.${fileExt}`);
        const frameDir = path.join(outputDir, `scene_${i}_frames`);
        tempDirs.push(frameDir);
        const frames = await this.renderSceneFrames(context, i, settings.width, settings.height, fps, isTransparent, frameDir, renderFontEnv);
        logs.push(`[HyperFrames]   ${frames.total} frames, ${frames.unique} distinct`);

        const common = ['-y', '-framerate', String(fps), '-i', path.join(frameDir, 'frame_%05d.png'), ...audioIn, '-t', scene.duration_seconds.toString()];
        const scale = `scale=${settings.width}:${settings.height}`;
        let segArgs: string[];
        if (isProRes) {
          segArgs = [
            ...common,
            '-vf', `${scale},format=${isTransparent ? 'yuva444p10le' : 'yuv422p10le'}`,
            '-c:v', 'prores_ks',
            '-profile:v', isTransparent ? '4' : '3', // 4 = ProRes 4444 (alpha), 3 = ProRes 422 HQ
            '-r', String(fps),
            '-c:a', 'pcm_s16le',
            segPath
          ];
        } else if (isWebM) {
          // WebM always uses VP9 + Opus; alpha plane only when transparency is requested.
          segArgs = [
            ...common,
            '-vf', `${scale},format=${isTransparent ? 'yuva420p' : 'yuv420p'}`,
            '-c:v', 'libvpx-vp9',
            '-b:v', '0', '-crf', '32',
            '-r', String(fps),
            '-c:a', 'libopus',
            '-b:a', '128k',
            segPath
          ];
        } else {
          segArgs = [
            ...common,
            // Convert with the BT.709 matrix and tag the frames explicitly; without setparams
            // ffmpeg drops the transfer tag for sRGB PNG input.
            '-vf', `${scale}:out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv`,
            '-c:v', 'libx264',
            '-colorspace', 'bt709',
            '-color_primaries', 'bt709',
            '-color_trc', 'bt709',
            '-color_range', 'tv',
            '-r', String(fps),
            '-c:a', 'aac',
            '-b:a', '192k',
            segPath
          ];
        }

        tempFiles.push(segPath);
        await execFileAsync('ffmpeg', segArgs, { maxBuffer: 64 * 1024 * 1024 });
        segmentPaths.push(segPath);
      }

      // 3. Concatenate segments
      const concatListPath = path.join(outputDir, 'concat_list.txt');
      tempFiles.push(concatListPath);
      await fs.writeFile(concatListPath, segmentPaths.map(concatListLine).join('\n'), 'utf-8');

      await execFileAsync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', concatListPath, '-c', 'copy', finalOutputPath], { maxBuffer: 64 * 1024 * 1024 });
      logs.push(`[HyperFrames] Successfully assembled final video: ${finalOutputPath}`);

      // 4. Record where every text element is on screen, for `mgvideo validate`.
      const manifest = await this.buildManifest(context, settings, path.join(outputDir, 'text_probe'), renderFontEnv);
      await fs.writeFile(textManifestPath, JSON.stringify(manifest, null, 1), 'utf-8');
      logs.push(`[HyperFrames] Text manifest: ${manifest.texts.length} text elements`);
    } finally {
      // Always clean up intermediate files, also when a scene fails.
      await Promise.all([...tempFiles, ...tempDirs].map(f => fs.rm(f, { force: true, recursive: true })));
    }

    // 5. Measure output and calculate hash
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
      logs,
      warnings: await brandFontWarnings(context, renderFontEnv),
      textManifestPath
    };
  }

  /**
   * Renders every frame of one scene into `frameDir` as frame_00001.png, frame_00002.png, ...
   * Frames with the same animated state (the hold) are hard links to one rendered image.
   */
  private async renderSceneFrames(
    context: ProjectContext,
    index: number,
    width: number,
    height: number,
    fps: number,
    transparent: boolean,
    frameDir: string,
    env: NodeJS.ProcessEnv | undefined
  ): Promise<{ total: number; unique: number }> {
    const scenes = context.scenePlan.scenes;
    const scene = scenes[index];
    await fs.mkdir(frameDir, { recursive: true });
    const parts = splitSvg(this.generateSceneSvg(scene, context.brand, width, height, transparent, context), width, height);
    const profile = motionProfile(scene, context.brand, index === scenes.length - 1);
    const total = Math.max(1, Math.round(scene.duration_seconds * fps));

    const byState = new Map<string, string>();
    const jobs: { svg: string; png: string }[] = [];
    const frameSource: string[] = [];
    for (let f = 0; f < total; f++) {
      const state = frameState(parts, profile, f / fps, scene.duration_seconds, height);
      const key = JSON.stringify(state);
      let png = byState.get(key);
      if (!png) {
        png = path.join(frameDir, `state_${byState.size}.png`);
        byState.set(key, png);
        jobs.push({ svg: composeFrame(parts, state, width, height), png });
      }
      frameSource.push(png);
    }

    let next = 0;
    const worker = async () => {
      for (;;) {
        const j = next++;
        if (j >= jobs.length) return;
        const svgPath = jobs[j].png.replace(/\.png$/, '.svg');
        await fs.writeFile(svgPath, jobs[j].svg, 'utf-8');
        await rasterizeSvgAsync(svgPath, jobs[j].png, width, height, env);
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL_FRAMES, jobs.length) }, worker));
    for (let f = 0; f < total; f++) {
      await fs.link(frameSource[f], path.join(frameDir, `frame_${String(f + 1).padStart(5, '0')}.png`));
    }
    return { total, unique: jobs.length };
  }

  async inspectOutput(outputPath: string): Promise<MediaProbeResult> {
    return inspectMedia(outputPath);
  }
}

/** Serializes a value for safe embedding inside an inline <script> block. */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** Produces a quoted CSS font-family value from an untrusted family name. */
/** Greedy word wrap to at most `maxChars` characters per line. */
function wrapWords(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (current && (current + ' ' + word).length > maxChars) {
      lines.push(current);
      current = word;
    } else {
      current = current ? current + ' ' + word : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function cssFontFamily(family: string | undefined): string {
  if (!family) return 'system-ui';
  const cleaned = family.replace(/[^\p{L}\p{N} _-]/gu, '').trim();
  return cleaned ? `"${cleaned}"` : 'system-ui';
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const GENERIC_FAMILIES = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-sans-serif', 'ui-serif', 'ui-monospace', 'blinkmacsystemfont']);

/**
 * Brand fonts fontconfig cannot find, so rsvg-convert silently drew the text in another face.
 * A font shipped as a file must resolve by its own family; a stack without a file passes when any
 * named family in it resolves (the rest of the stack is a deliberate fallback). Without fc-match
 * the check is skipped.
 */
export async function brandFontWarnings(context: ProjectContext, env: NodeJS.ProcessEnv | undefined): Promise<string[] | undefined> {
  const resolves = async (family: string): Promise<string | null> => {
    const { stdout } = await execFileAsync('fc-match', ['-f', '%{family}', family], { env: env ?? process.env });
    return stdout.split(',').some(f => f.trim().toLowerCase() === family.toLowerCase()) ? null : stdout.split(',')[0].trim();
  };
  const warnings: string[] = [];
  try {
    for (const font of context.brand.fonts) {
      const named = font.family.split(',').map(f => f.trim().replace(/^["']|["']$/g, ''))
        .filter(f => f && !f.startsWith('-') && !GENERIC_FAMILIES.has(f.toLowerCase()));
      if (named.length === 0) continue;
      const candidates = font.file_path ? named.slice(0, 1) : named;
      let drawnIn: string | null = null;
      let found = false;
      for (const fam of candidates) {
        const miss = await resolves(fam);
        if (miss === null) { found = true; break; }
        drawnIn ??= miss;
      }
      if (!found) {
        warnings.push(`font fallback: brand font "${candidates.join(', ')}"${font.file_path ? ` (${font.file_path})` : ''} is not available to rsvg-convert; text is drawn in "${drawnIn}" instead.`);
      }
    }
  } catch {
    return undefined; // fc-match missing: nothing measured
  }
  return warnings;
}
