import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Browser } from 'playwright-core';
import { scenePlanFps } from '../../packages/contracts/src/index.js';
import { concatListLine, safeCssColor } from '../../packages/media/src/proc.js';
import { inspectMedia, measureAudioLoudness, type MediaProbeResult } from '../../packages/media/src/inspector.js';
import { buildClipHtml, loadBrandFonts, vendorPaths, MOTION_UPSTREAM } from '../../packages/motion/src/engine.js';
import { launchBrowser, motionAvailability, renderClip, renderFrame, type MotionCodec } from '../../packages/motion/src/capture.js';
import { MOTION_RECIPES, isMotionRecipe, sceneFragment, type SceneBindingInput } from '../../packages/motion/src/recipes/index.js';
import type {
  VideoRendererAdapter,
  AdapterCapabilities,
  ProjectContext,
  RenderOptions,
  AdapterRenderOutput
} from '../interface.js';

const execFileAsync = promisify(execFile);

/** Scenes captured at the same time, one browser page each. */
const PARALLEL_SCENES = 3;

/**
 * Motion renderer: each scene is a spring-driven HTML clip (vendored Barty-Bart motion-graphics
 * engine, MIT) frame-captured in system Chrome with 4-sub-frame motion blur. Clips are joined
 * with hard cuts in plan order; every recipe opens from and closes on the same centred dot, so
 * the carried shape hides the cut. Audio follows the HyperFrames path: a silent stereo bed at
 * the requested sample rate, so outputs always carry an audio stream for later mixing.
 */
export class MotionAdapter implements VideoRendererAdapter {
  readonly id = 'motion';
  readonly name = 'Motion Engine (Barty-Bart motion-graphics, frame-captured)';
  readonly capabilities: AdapterCapabilities = {
    formats: ['mp4', 'webm', 'mov_prores'],
    transparency: true,
    audioMixing: true,
    dynamicInput: true,
    headlessBrowser: true,
    preview: true
  };

  async validate(context: ProjectContext): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    const avail = motionAvailability();
    for (const e of avail.errors) errors.push(`Motion: ${e}`);
    try {
      vendorPaths();
    } catch (err) {
      errors.push(`Motion: ${(err as Error).message}`);
    }
    if (!context.scenePlan || context.scenePlan.scenes.length === 0) {
      errors.push('Motion: Scene plan is missing or contains zero scenes.');
    } else {
      for (const s of context.scenePlan.scenes) {
        if (!isMotionRecipe(s.visual_recipe)) {
          errors.push(
            `Motion: scene '${s.scene_id}' uses recipe '${s.visual_recipe}', which is not a motion recipe. Use one of: ${Object.keys(MOTION_RECIPES).join(', ')}.`
          );
        }
      }
    }
    if (!context.brand.fonts || context.brand.fonts.length === 0) {
      errors.push('Motion: At least one font definition with rights evidence is required.');
    }
    if (context.brief.language === 'bg' && !context.brand.fonts.some(f => f.supports_cyrillic && f.file_path)) {
      errors.push("Motion: Brief requests Bulgarian ('bg'); the embedded Geist fallback has no Cyrillic, so ship a Cyrillic brand font file (fonts[].file_path).");
    }
    for (const [k, v] of Object.entries(context.brand.colors)) {
      if (v === undefined) continue;
      try { safeCssColor(v); } catch { errors.push(`Motion: brand color ${k} is not a valid CSS color.`); }
    }
    try {
      loadBrandFonts(context.brand, context.projectDir);
    } catch (err) {
      errors.push(`Motion: ${(err as Error).message}`);
    }
    return { valid: errors.length === 0, errors };
  }

  private bindingInput(context: ProjectContext, options: RenderOptions): SceneBindingInput {
    return {
      projectDir: context.projectDir,
      brand: context.brand,
      claims: context.claims,
      assets: context.assets,
      scenePlan: context.scenePlan,
      width: options.settings.width,
      height: options.settings.height,
      fps: options.settings.fps,
      transparent: options.settings.transparent,
      fonts: loadBrandFonts(context.brand, context.projectDir)
    };
  }

  /** Writes every scene's self-contained clip page into `<outputDir>/clips/` and returns the paths. */
  async writeClipPages(context: ProjectContext, options: RenderOptions): Promise<string[]> {
    const input = this.bindingInput(context, options);
    const dir = path.join(options.outputDir, 'clips');
    await fs.mkdir(dir, { recursive: true });
    const pages: string[] = [];
    for (let i = 0; i < context.scenePlan.scenes.length; i++) {
      const page = path.join(dir, `scene_${String(i + 1).padStart(2, '0')}.html`);
      await fs.writeFile(page, buildClipHtml(sceneFragment(i, input)), 'utf-8');
      pages.push(page);
    }
    return pages;
  }

  async renderStill(context: ProjectContext, frameNumber: number, options: RenderOptions): Promise<string> {
    const { settings, outputDir } = options;
    await fs.mkdir(outputDir, { recursive: true });
    const stillPath = path.join(outputDir, `still_frame_${frameNumber}.png`);
    const seconds = frameNumber / settings.fps;
    let start = 0;
    let index = context.scenePlan.scenes.length - 1;
    for (let i = 0; i < context.scenePlan.scenes.length; i++) {
      const d = context.scenePlan.scenes[i].duration_seconds;
      if (seconds < start + d) { index = i; break; }
      start += d;
    }
    if (index === context.scenePlan.scenes.length - 1 && seconds >= start) {
      start = context.scenePlan.scenes.slice(0, index).reduce((a, s) => a + s.duration_seconds, 0);
    }
    const input = this.bindingInput(context, options);
    const page = path.join(outputDir, `still_scene_${index + 1}.html`);
    await fs.writeFile(page, buildClipHtml(sceneFragment(index, input)), 'utf-8');
    try {
      const local = Math.min(Math.max(0, seconds - start), context.scenePlan.scenes[index].duration_seconds);
      await renderFrame(page, local, stillPath);
    } finally {
      await fs.rm(page, { force: true });
    }
    return stillPath;
  }

  async renderVideo(context: ProjectContext, options: RenderOptions): Promise<AdapterRenderOutput> {
    const { settings, outputDir, runId, requestHash } = options;
    const logs: string[] = [];
    const vendor = vendorPaths();
    logs.push(`[Motion] Initializing render run: ${runId}`);
    logs.push(`[Motion] Request Hash: ${requestHash}`);
    logs.push(`[Motion] Engine: ${MOTION_UPSTREAM}@${vendor.commit} (vendored, MIT)`);
    logs.push(`[Motion] Dimensions: ${settings.width}x${settings.height} @ ${settings.fps}fps, 4 sub-frames per frame (180° shutter)`);

    if (settings.transparent && settings.format === 'mp4') {
      throw new Error('Motion: transparent output requires webm or mov_prores; H.264 mp4 cannot carry alpha.');
    }
    const planFps = scenePlanFps(context.scenePlan);
    if (planFps !== settings.fps) {
      logs.push(`[Motion] Note: scene plan is authored at ${planFps}fps; capturing at requested ${settings.fps}fps.`);
    }
    await fs.mkdir(outputDir, { recursive: true });

    const pages = await this.writeClipPages(context, options);
    logs.push(`[Motion] Wrote ${pages.length} clip pages to ${path.join(outputDir, 'clips')}`);

    const codec: MotionCodec = settings.format === 'mov_prores' ? 'prores' : settings.format === 'webm' ? 'vp9' : 'h264';
    const ext = settings.format === 'mov_prores' ? 'mov' : settings.format === 'webm' ? 'webm' : 'mp4';
    const segments = pages.map((_, i) => path.join(outputDir, `segment_${i}.${ext}`));
    const finalOutputPath = path.join(outputDir, `final_output_${runId}.${ext}`);
    const concatListPath = path.join(outputDir, 'concat_list.txt');
    const totalSeconds = context.scenePlan.scenes.reduce((a, s) => a + s.duration_seconds, 0);

    let browser: Browser | undefined;
    try {
      browser = await launchBrowser();
      const b = browser;
      let next = 0;
      const worker = async () => {
        for (;;) {
          const i = next++;
          if (i >= pages.length) return;
          const scene = context.scenePlan.scenes[i];
          const t0 = Date.now();
          const res = await renderClip(pages[i], segments[i], { fps: settings.fps, duration: scene.duration_seconds, codec, browser: b });
          if (res.alpha !== settings.transparent) {
            throw new Error(`Motion: scene ${scene.scene_id} rendered alpha=${res.alpha} but settings.transparent=${settings.transparent}.`);
          }
          logs.push(`[Motion] Scene ${i + 1}/${pages.length} ${scene.scene_id} (${scene.visual_recipe}): ${res.frames} frames in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
        }
      };
      await Promise.all(Array.from({ length: Math.min(PARALLEL_SCENES, pages.length) }, worker));

      // Hard cuts in plan order (stream copy keeps the captured frames bit-exact), plus the
      // HyperFrames-style silent stereo bed.
      await fs.writeFile(concatListPath, segments.map(concatListLine).join('\n'), 'utf-8');
      const audioCodec = ext === 'mov' ? ['-c:a', 'pcm_s16le'] : ext === 'webm' ? ['-c:a', 'libopus', '-b:a', '128k'] : ['-c:a', 'aac', '-b:a', '192k'];
      await execFileAsync('ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-f', 'concat', '-safe', '0', '-i', concatListPath,
        '-f', 'lavfi', '-i', `anullsrc=r=${settings.audio_sample_rate}:cl=stereo`,
        '-map', '0:v:0', '-map', '1:a:0',
        '-c:v', 'copy', ...audioCodec,
        '-t', totalSeconds.toFixed(6),
        ...(ext === 'mp4' ? ['-movflags', '+faststart'] : []),
        finalOutputPath
      ], { maxBuffer: 64 * 1024 * 1024 });
      logs.push(`[Motion] Joined ${segments.length} clips with hard cuts: ${finalOutputPath}`);
    } finally {
      await browser?.close();
      await Promise.all([...segments, concatListPath].map(f => fs.rm(f, { force: true })));
    }

    const probe = await inspectMedia(finalOutputPath);
    const loudness = await measureAudioLoudness(finalOutputPath);
    const fileBuffer = await fs.readFile(finalOutputPath);
    const outputHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    logs.push(`[Motion] Measured duration: ${probe.duration_seconds}s, FPS: ${probe.fps}, Hash: ${outputHash.slice(0, 16)}...`);

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
