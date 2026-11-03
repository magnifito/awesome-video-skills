import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  ProjectBrief,
  BrandProfile,
  ScenePlan,
  ClaimsRegister
} from '../../../contracts/src/index.js';
import { HyperFramesAdapter } from '../../../../adapters/hyperframes/index.js';
import { rasterizeSvg, safeCssColor, safeId } from '../../../media/src/proc.js';
import { escapeHtml } from './_shared.js';


export interface StoryboardResult {
  htmlPath: string;
  framesCount: number;
  framePaths: string[];
}

export async function generateStoryboardContactSheet(
  projectDir: string,
  options: { format?: '16:9' | '9:16' | '1:1'; outDir?: string } = {}
): Promise<StoryboardResult> {
  const briefPath = path.join(projectDir, 'brief.json');
  const brandPath = path.join(projectDir, 'brand.json');
  const scenePlanPath = path.join(projectDir, 'scene-plan.json');
  const claimsPath = path.join(projectDir, 'claims.json');

  const brief: ProjectBrief = JSON.parse(await fs.readFile(briefPath, 'utf8'));
  const brand: BrandProfile = JSON.parse(await fs.readFile(brandPath, 'utf8'));
  const scenePlan: ScenePlan = JSON.parse(await fs.readFile(scenePlanPath, 'utf8'));
  const claims: ClaimsRegister = JSON.parse(await fs.readFile(claimsPath, 'utf8'));

  const targetFormat = options.format || brief.formats[0] || '16:9';
  const width = targetFormat === '9:16' ? 1080 : targetFormat === '1:1' ? 1080 : 1920;
  const height = targetFormat === '9:16' ? 1920 : targetFormat === '1:1' ? 1080 : 1080;

  const storyboardDir = options.outDir || path.join(projectDir, 'storyboard');
  await fs.mkdir(storyboardDir, { recursive: true });

  const adapter = new HyperFramesAdapter();
  const framePaths: string[] = [];

  // Generate still frame images for each scene
  for (let i = 0; i < scenePlan.scenes.length; i++) {
    const scene = scenePlan.scenes[i];
    const svg = (adapter as any).generateSceneSvg(scene, brand, width, height, false);
    // scene_id becomes part of a file name, so reject path separators and other unsafe characters
    safeId(scene.scene_id, 'scene_id');
    const svgPath = path.join(storyboardDir, `frame_${i + 1}_${scene.scene_id}.svg`);
    const pngPath = path.join(storyboardDir, `frame_${i + 1}_${scene.scene_id}.png`);

    await fs.writeFile(svgPath, svg, 'utf8');

    // Portable rasterizer (rsvg-convert, resvg, ImageMagick, sips, or headless Chrome)
    rasterizeSvg(svgPath, pngPath, width, height);

    try { await fs.unlink(svgPath); } catch {}
    framePaths.push(pngPath);
  }

  // Generate responsive HTML review contact sheet
  const htmlContent = `<!DOCTYPE html>
<html lang="${escapeHtml(brief.language)}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Magnifito Storyboard: ${escapeHtml(brief.objective)}</title>
  <style>
    :root {
      --bg: #0B0F19;
      --card-bg: #1E293B;
      --text-main: #F8FAFC;
      --text-muted: #94A3B8;
      --accent: ${safeCssColor(brand.colors.primary || '#3B82F6')};
      --border: #334155;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text-main);
      padding: 40px 24px;
      line-height: 1.5;
    }
    .header {
      max-width: 1400px;
      margin: 0 auto 36px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 24px;
    }
    .header h1 { font-size: 28px; margin-bottom: 8px; color: #FFFFFF; }
    .meta-badges { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 12px; }
    .badge {
      background: var(--card-bg);
      border: 1px solid var(--border);
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 13px;
      color: var(--text-muted);
    }
    .badge.primary { border-color: var(--accent); color: var(--accent); font-weight: 600; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
      gap: 28px;
      max-width: 1400px;
      margin: 0 auto;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .card-img-wrap {
      width: 100%;
      aspect-ratio: ${targetFormat === '9:16' ? '9/16' : '16/9'};
      background: #000;
      position: relative;
    }
    .card-img-wrap img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .card-body {
      padding: 20px;
      display: flex;
      flex-direction: column;
      flex-grow: 1;
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    .scene-title { font-size: 16px; font-weight: 700; color: #FFFFFF; }
    .scene-duration { font-size: 13px; color: var(--accent); font-weight: 600; }
    .scene-copy {
      font-size: 14px;
      color: var(--text-main);
      background: rgba(0,0,0,0.25);
      padding: 12px;
      border-radius: 8px;
      border-left: 3px solid var(--accent);
      margin-bottom: 14px;
      font-style: italic;
    }
    .claims-list { margin-top: auto; font-size: 12px; color: var(--text-muted); }
    .claim-tag { display: inline-block; background: rgba(16, 185, 129, 0.15); color: #34D399; padding: 2px 8px; border-radius: 4px; margin-top: 4px; font-weight: 600; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🎬 Storyboard Contact Sheet: ${escapeHtml(brief.objective)}</h1>
    <div class="meta-badges">
      <span class="badge primary">Project: ${escapeHtml(brief.project_id)}</span>
      <span class="badge">Format: ${targetFormat} (${width}x${height})</span>
      <span class="badge">Total Duration: ${brief.duration_seconds}s</span>
      <span class="badge">Scenes: ${scenePlan.scenes.length}</span>
      <span class="badge">Timing: ${escapeHtml(brief.timing_authority)}</span>
      <span class="badge">Brand: ${escapeHtml(brand.name)}</span>
    </div>
  </div>

  <div class="grid">
    ${scenePlan.scenes.map((scene, i) => {
      const frameFileName = path.basename(framePaths[i]);
      return `
      <div class="card">
        <div class="card-img-wrap">
          <img src="${escapeHtml(frameFileName)}" alt="Scene ${i + 1} Preview" loading="lazy">
        </div>
        <div class="card-body">
          <div class="card-header">
            <span class="scene-title">Scene ${i + 1}: ${escapeHtml(scene.scene_id)}</span>
            <span class="scene-duration">${scene.duration_seconds}s (${scene.duration_frames || (scene.duration_seconds * 30)}f)</span>
          </div>
          <div class="scene-copy">"${escapeHtml(scene.copy_text)}"</div>
          <div class="claims-list">
            <div><strong>Recipe:</strong> ${escapeHtml(scene.visual_recipe)}</div>
            ${scene.claims_refs.length > 0
              ? `<div><strong>Verified Claims:</strong><br>${scene.claims_refs.map(c => `<span class="claim-tag">✓ ${escapeHtml(c)}</span>`).join(' ')}</div>`
              : `<span style="color: #64748B;">No factual claims in this scene</span>`}
          </div>
        </div>
      </div>`;
    }).join('')}
  </div>
</body>
</html>`;

  const htmlPath = path.join(storyboardDir, 'storyboard.html');
  await fs.writeFile(htmlPath, htmlContent, 'utf8');

  return {
    htmlPath,
    framesCount: framePaths.length,
    framePaths
  };
}

