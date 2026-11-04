import { z } from 'zod';

/**
 * B-roll plan contract, modelled on upstream Barty-Bart/motion-graphics `plan.json` (MIT).
 *
 * A plan lays motion clips over one source video. Every path in the plan (`video`, `brand`,
 * clip `file`, `fragment`, `scene.logo`) is relative to the directory holding plan.json and
 * must stay inside it; the runtime resolves them with `safeJoin`.
 *
 * - `kind: "full"` is an opaque full-frame cutaway rendered to H.264 `.mp4`.
 * - `kind: "panel"` is a transparent clip (`bg:null`) rendered to ProRes 4444 `.mov` and
 *   alpha-composited over the footage inside a safe area away from the speaker.
 *
 * A clip is either built from a motion `recipe` plus `scene` data, or from a hand-written
 * clip `fragment` (see skills/magnifito-promo/reference/motion-engine.md).
 */

/** Seconds of slack allowed at the end of the source (one frame at 24 fps, rounded up). */
export const BROLL_END_TOLERANCE = 0.05;

/** Recipes a panel clip may use: they honour the safe area and render on a transparent canvas. */
export const BROLL_PANEL_RECIPES = ['motion-card-morph', 'motion-bars-chart'] as const;

/** Shortest slot each recipe animates cleanly in, in seconds. */
export const BROLL_RECIPE_MIN_SECONDS: Readonly<Record<string, number>> = Object.freeze({
  'motion-kinetic-type': 0.8,
  'motion-logo-reveal': 1.2,
  'motion-bars-chart': 1.6,
  'motion-card-morph': 3.0
});

const relPath = (label: string) =>
  z.string().min(1).refine(p => !p.includes('\0'), { message: `${label} must not contain NUL bytes` });

/** Frame rate written as a number (30) or a rational string ("30000/1001"). */
export const BrollFpsSchema = z.union([
  z.number().positive().max(240),
  z.string().regex(/^\d+(?:\.\d+)?(?:\/\d+)?$/, 'fps must be a number or a rational such as "30000/1001"')
]);

/** Parses a plan or ffprobe frame rate ("30000/1001", "25", 24) to a number. */
export function parseFps(value: number | string): number {
  if (typeof value === 'number') return value;
  const [n, d] = value.split('/').map(Number);
  const fps = d === undefined ? n : n / d;
  if (!Number.isFinite(fps) || fps <= 0) throw new Error(`Invalid frame rate: ${JSON.stringify(value)}`);
  return fps;
}

/** Screen-space rectangle in source pixels. */
export const BrollRectSchema = z.object({
  x: z.number().nonnegative(),
  y: z.number().nonnegative(),
  w: z.number().positive(),
  h: z.number().positive()
});

/**
 * Where a panel clip draws. A preset keeps title-safe margins on the side away from the
 * speaker; a rectangle gives the exact empty region (e.g. next to a PiP box).
 */
export const BrollAreaSchema = z.union([z.enum(['right', 'left', 'top', 'bottom']), BrollRectSchema]);

export const BrollSceneSchema = z.object({
  /** Recipe copy: `Headline | row | row` (card-morph), `Title | Label: 12 min | …` (bars-chart). */
  copy: z.string().default(''),
  /** Logo file for motion-logo-reveal (SVG, PNG or JPEG), relative to the plan. */
  logo: relPath('scene.logo').optional()
});

export const BrollClipSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9._-]+$/, 'id may contain letters, digits, dot, dash and underscore only'),
  title: z.string().min(1),
  /** The spoken line the clip covers (for review pages and TIMING notes). */
  line: z.string().default(''),
  in: z.number().nonnegative(),
  out: z.number().positive(),
  kind: z.enum(['full', 'panel']),
  /** Rendered clip, relative to the plan. Defaults to `out/<id>_<in-timecode>.<mp4|mov>`. */
  file: relPath('file').optional(),
  recipe: z.string().min(1).optional(),
  scene: BrollSceneSchema.optional(),
  /** Hand-written clip fragment (upstream motion-broll format), relative to the plan. */
  fragment: relPath('fragment').optional(),
  /** Panel safe area. Defaults to "right". Ignored for full clips. */
  area: BrollAreaSchema.optional()
}).superRefine((c, ctx) => {
  if (!(c.in < c.out)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['out'], message: `clip ${c.id}: in (${c.in}) must be before out (${c.out})` });
  if (!!c.recipe === !!c.fragment) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['recipe'], message: `clip ${c.id}: set exactly one of "recipe" (with "scene") or "fragment"` });
  }
  if (c.recipe && c.kind === 'panel' && !(BROLL_PANEL_RECIPES as readonly string[]).includes(c.recipe)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['recipe'], message: `clip ${c.id}: panel clips support ${BROLL_PANEL_RECIPES.join(', ')} (got ${c.recipe}); use a fragment for anything else` });
  }
  const min = c.recipe ? BROLL_RECIPE_MIN_SECONDS[c.recipe] : undefined;
  if (min !== undefined && c.out - c.in < min - 1e-9) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['out'], message: `clip ${c.id}: ${c.recipe} needs at least ${min}s (slot is ${(c.out - c.in).toFixed(2)}s)` });
  }
  if (c.file) {
    const ext = c.file.toLowerCase().split('.').pop();
    if (c.kind === 'panel' && ext !== 'mov') ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['file'], message: `clip ${c.id}: panel clips carry alpha and must be written to .mov (ProRes 4444)` });
    if (c.kind === 'full' && ext !== 'mp4') ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['file'], message: `clip ${c.id}: full clips are opaque and must be written to .mp4` });
  }
});

export const BrollPlanSchema = z.object({
  schema_version: z.literal('1.0.0').default('1.0.0'),
  title: z.string().default(''),
  /** Source footage, relative to the plan. */
  video: relPath('video'),
  /** Source frame rate. Optional; when given it must match the probed source. */
  fps: BrollFpsSchema.optional(),
  /** Brand profile (brand.json contract), relative to the plan. Defaults to the upstream look. */
  brand: relPath('brand').optional(),
  clips: z.array(BrollClipSchema).min(1),
  notes: z.array(z.string()).default([])
}).superRefine((plan, ctx) => {
  const ids = new Set<string>();
  plan.clips.forEach((c, i) => {
    if (ids.has(c.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['clips', i, 'id'], message: `duplicate clip id ${c.id}` });
    ids.add(c.id);
  });
  for (const msg of brollOverlaps(plan.clips)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['clips'], message: msg });
});

export type BrollRect = z.infer<typeof BrollRectSchema>;
export type BrollArea = z.infer<typeof BrollAreaSchema>;
export type BrollClip = z.infer<typeof BrollClipSchema>;
export type BrollPlan = z.infer<typeof BrollPlanSchema>;

/** Overlapping clip windows (touching is allowed: one clip's out may equal the next one's in). */
export function brollOverlaps(clips: Pick<BrollClip, 'id' | 'in' | 'out'>[]): string[] {
  const sorted = [...clips].sort((a, b) => a.in - b.in);
  const out: string[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    if (b.in < a.out - 1e-9) out.push(`clips ${a.id} (${a.in}-${a.out}s) and ${b.id} (${b.in}-${b.out}s) overlap`);
  }
  return out;
}

/** Checks the plan against the probed source. Returns problems (empty = consistent). */
export function checkBrollAgainstSource(plan: BrollPlan, source: { duration: number; fps: number; width: number; height: number }): string[] {
  const problems: string[] = [];
  for (const c of plan.clips) {
    if (c.out > source.duration + BROLL_END_TOLERANCE) {
      problems.push(`clip ${c.id}: out (${c.out}s) is past the end of the source (${source.duration.toFixed(3)}s)`);
    }
    if (c.kind === 'panel' && c.area && typeof c.area === 'object') {
      const a = c.area;
      if (a.x + a.w > source.width + 0.5 || a.y + a.h > source.height + 0.5) {
        problems.push(`clip ${c.id}: area ${a.x},${a.y} ${a.w}x${a.h} does not fit the ${source.width}x${source.height} frame`);
      }
    }
  }
  if (plan.fps !== undefined && Math.abs(parseFps(plan.fps) - source.fps) > 0.01) {
    problems.push(`plan fps ${plan.fps} does not match the source (${source.fps.toFixed(3)} fps); clips must match the video's fps`);
  }
  return problems;
}

/**
 * Resolves a panel area to a rectangle. Presets keep 5% horizontal / 8% vertical margins and
 * take the 45% of the frame on the named side, leaving the opposite side for the speaker.
 */
export function resolveBrollArea(area: BrollArea | undefined, width: number, height: number): BrollRect {
  if (area && typeof area === 'object') return area;
  const mx = Math.round(width * 0.05);
  const my = Math.round(height * 0.08);
  const sideW = Math.round(width * 0.45);
  const sideH = Math.round(height * 0.42);
  switch (area ?? 'right') {
    case 'left': return { x: mx, y: my, w: sideW, h: height - 2 * my };
    case 'top': return { x: mx, y: my, w: width - 2 * mx, h: sideH };
    case 'bottom': return { x: mx, y: height - my - sideH, w: width - 2 * mx, h: sideH };
    default: return { x: width - mx - sideW, y: my, w: sideW, h: height - 2 * my };
  }
}

/** Upstream-style clip file name: `out/<id>_<m>m<ss>s<cc>.<ext>` (0m06s75 = 0:06.75). */
export function defaultBrollFile(clip: Pick<BrollClip, 'id' | 'in' | 'kind'>): string {
  const cs = Math.round(clip.in * 100);
  const m = Math.floor(cs / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  const tc = `${m}m${String(s).padStart(2, '0')}s${String(c).padStart(2, '0')}`;
  return `out/${clip.id}_${tc}.${clip.kind === 'panel' ? 'mov' : 'mp4'}`;
}
