/**
 * Motion recipe registry and the scene -> recipe context binding.
 */
import fs from 'node:fs';
import path from 'node:path';
import { safeJoin } from '../../../media/src/proc.js';
import type { AssetManifest, BrandProfile, ClaimsRegister, ScenePlan, ScenePlanItem } from '../../../contracts/src/index.js';
import type { EmbeddedFont } from '../engine.js';
import { buildFonts, buildPalette, type MotionLogo, type MotionRecipe, type RecipeContext } from './common.js';
import { kineticType } from './kinetic-type.js';
import { cardMorph } from './card-morph.js';
import { barsChart } from './bars-chart.js';
import { logoReveal } from './logo-reveal.js';

export * from './common.js';

export const MOTION_RECIPES: Readonly<Record<string, MotionRecipe>> = Object.freeze({
  'motion-kinetic-type': kineticType,
  'motion-card-morph': cardMorph,
  'motion-bars-chart': barsChart,
  'motion-logo-reveal': logoReveal
});

export function isMotionRecipe(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(MOTION_RECIPES, id);
}

export interface SceneBindingInput {
  projectDir: string;
  brand: BrandProfile;
  claims: ClaimsRegister;
  assets: AssetManifest;
  scenePlan: ScenePlan;
  width: number;
  height: number;
  fps: number;
  transparent: boolean;
  fonts: EmbeddedFont[];
}

/** Loads the first SVG/PNG/JPEG asset referenced by the scene as a data URI. */
export function loadSceneLogo(scene: ScenePlanItem, projectDir: string, assets: AssetManifest): MotionLogo | null {
  for (const ref of scene.asset_refs) {
    const asset = assets.assets.find(a => a.asset_id === ref);
    if (!asset?.local_path) continue;
    const file = safeJoin(projectDir, asset.local_path);
    if (!fs.existsSync(file)) throw new Error(`Asset ${ref} not found at ${asset.local_path}`);
    const logo = loadLogoFile(file);
    if (logo) return logo;
  }
  return null;
}

/** Reads an SVG/PNG/JPEG file as a data URI with its aspect ratio. Returns null for other types. */
export function loadLogoFile(file: string): MotionLogo | null {
  const ext = path.extname(file).toLowerCase();
  const mime = ext === '.svg' ? 'image/svg+xml' : ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : null;
  if (!mime) return null;
  const buf = fs.readFileSync(file);
  let aspect = 1;
  if (ext === '.svg') {
    const vb = /viewBox="\s*[-\d.]+[ ,]+[-\d.]+[ ,]+([\d.]+)[ ,]+([\d.]+)\s*"/.exec(buf.toString('utf8'));
    if (vb && Number(vb[1]) > 0) aspect = Number(vb[2]) / Number(vb[1]);
  } else if (ext === '.png' && buf.length > 24) {
    aspect = buf.readUInt32BE(20) / buf.readUInt32BE(16);
  } else if (mime === 'image/jpeg') {
    // Walk JPEG markers to the first SOFn segment for the frame size.
    for (let i = 2; i + 9 < buf.length; ) {
      if (buf[i] !== 0xff) break;
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        aspect = buf.readUInt16BE(i + 5) / buf.readUInt16BE(i + 7);
        break;
      }
      i += 2 + len;
    }
  }
  if (!(aspect > 0 && Number.isFinite(aspect))) aspect = 1;
  return { dataUri: `data:${mime};base64,${buf.toString('base64')}`, aspect };
}

/** Builds the recipe context for scene `index` of the plan. */
export function bindScene(index: number, input: SceneBindingInput): RecipeContext {
  const scene = input.scenePlan.scenes[index];
  const offset = input.scenePlan.scenes.slice(0, index).reduce((a, s) => a + s.duration_seconds, 0);
  return {
    width: input.width,
    height: input.height,
    fps: input.fps,
    duration: scene.duration_seconds,
    transparent: input.transparent,
    sceneIndex: index,
    sceneCount: input.scenePlan.scenes.length,
    timelineOffset: offset,
    brandName: input.brand.name,
    palette: buildPalette(input.brand.colors),
    fonts: buildFonts(input.brand, input.fonts),
    claims: scene.claims_refs
      .map(ref => input.claims.claims.find(c => c.claim_id === ref))
      .filter((c): c is NonNullable<typeof c> => !!c),
    logo: loadSceneLogo(scene, input.projectDir, input.assets)
  };
}

/** Returns the clip fragment for one scene. Throws for a non-motion recipe. */
export function sceneFragment(index: number, input: SceneBindingInput): string {
  const scene = input.scenePlan.scenes[index];
  const recipe = MOTION_RECIPES[scene.visual_recipe];
  if (!recipe || !isMotionRecipe(scene.visual_recipe)) {
    throw new Error(`Scene ${scene.scene_id} uses recipe '${scene.visual_recipe}', which the motion engine does not implement (${Object.keys(MOTION_RECIPES).join(', ')}).`);
  }
  return recipe(scene, bindScene(index, input));
}
