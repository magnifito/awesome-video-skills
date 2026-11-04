# Motion engine reference

Adapted from `skills/motion-broll/reference/engine-api.md` in Barty-Bart's motion-graphics
skills (MIT, Barty-Bart), vendored at
`vendor/barty-motion-graphics/3d83d987d658601d8a1269eb691622bdcd427335/`. The engine itself
(`engine/motion.js`, `engine/base.css`, Geist fonts) is read from that directory unchanged.

## How a scene becomes video

1. Each scene's `visual_recipe` (`motion-*`) is a TypeScript recipe in
   `packages/motion/src/recipes/`. It turns the scene's `copy_text`, claims, logo asset, brand
   colours and fonts into a clip **fragment** (the upstream format below).
2. `packages/motion/src/engine.ts` (port of `build.py`) wraps the fragment with the engine,
   base CSS, brand fonts (base64, from `fonts[].file_path`; Geist when absent) and the cursor
   into one self-contained HTML page with `window.seek(t)`.
3. `packages/motion/src/capture.ts` (port of `render.js`) opens the page in system Chrome
   (playwright-core, never a downloaded browser), captures 4 sub-frames per output frame with a
   180° shutter and blends them with ffmpeg `tmix`: real motion blur. Opaque clips encode to
   H.264 yuv420p; clips with `bg:null` (transparent output) encode to ProRes 4444 with alpha.
4. `adapters/motion` joins clips in plan order. Every recipe opens from and closes on the same
   centred brand-colour dot, so the cut between clips is hidden by the shape.

Every style is a pure function of `t`: no CSS transitions, timers or state carried between
frames. The same `t` always draws the same pixels; that is what makes sub-frame blur possible.

## Fragment skeleton

```html
<title>04 Master prompt</title>
<style>/* clip-specific CSS */</style>
<div data-slot="world"> <!-- optional: elements beside the shape --> </div><!--/world-->
<div data-slot="shape">
  <!-- one layer per state; .L layers are anchored inside the shape -->
  <div class="L" id="Lnotes"> … </div>
  <div class="L" id="Ldoc"> … </div>
</div><!--/shape-->
<script>
M.scene({
  W:1920, H:1080, T:10,     // frame size and clip length in seconds
  bg:'#E9E7E2',             // canvas colour; null = transparent (renders to .mov)
  center:[960,540],         // screen point the camera centres on
  intro:0.15,               // shape pops in at this time; null = already on screen
  SH:{                      // states the one shape morphs through
    notes:{w:780,h:560,r:36,bg:'#FFFFFF',cam:1.3},
    doc:{w:600,h:720,r:28,bg:'#FFFFFF',cam:1.2},
  },
  start:'notes', SEQ:[[5.1,'doc']],   // [clip-local time, state]
  layers:[
    {el:'Lnotes', tin:0.15, tout:5.1, anchor:'t'},  // 'c' centre (default), 't' top, 'l' left
    {el:'Ldoc', tin:5.1, tout:null, anchor:'t', update:(t,g)=>{ /* per-frame content */ }},
  ],
  cursor:{size:44, clicks:[2.3], keys:[[0,760,460],[1.2,760,460],[1.9,330,250]]},
  geom:(t,g)=>g,            // optional: move the shape (g.cx, g.cy) or camera focus (g.fx, g.fy)
  extra:(t,g)=>{},          // optional: per-frame work outside layers
});
</script>
```

In the toolkit, recipes never interpolate user text into markup: all scene data reaches the
page as one JSON object (`const D = …`, escaped for `<script>`) and is written with
`textContent`.

Coordinates are **world pixels**. The shape is centred at world (0,0) unless `geom` moves it.
The camera draws world to screen as `center + cam × (world − focus)`. Pick `cam` per state so
the state fills the frame: roughly 1.2–1.6 for cards, 1.8–2.2 for pills.

## Engine API (`window.M`)

| Call | What it does |
|---|---|
| `M.track(v0, [[t, value, spring?], …])` | A value that changes target many times: one closed-form spring per change. Returns `t => value`. |
| `M.ctrack('#hex', [[t,'#hex'], …])` | Same for colours. Returns `t => 'rgb(...)'`. |
| `M.MORPH`, `M.FAST`, `M.SLOW`, `M.SOFT`, `M.CAM`, `M.INSTANT` | Spring presets `[stiffness ω, damping ζ]`. FAST/SLOW for leading/trailing edges. |
| `M.vis(t, tin, tout, {din, lin, lout, blur})` | Content swap: exit blurs out fast, enter waits `din` then blurs in over `lin`. |
| `M.apply(el, v)` | Applies a `vis` result to an element. |
| `M.path([[t,x,y], …])` | Cursor or point path, eased with a slight human arc. |
| `M.icon(name, size, colour, strokeW?)` | Icon from `M.IC`: arrow, check, x, plus, folder, terminal, file, pencil, coin, clock, chip, sparkle, castle, search. |
| `M.setText(el, s)` | Sets text only when it changed. |
| `M.eo`, `M.eio`, `M.clamp`, `M.lerp`, `M.S` | Easing and spring helpers. |

## Patterns used by the toolkit recipes

| Recipe | Upstream pattern |
|---|---|
| `motion-kinetic-type` | Liquid indicator: the highlight's edges are two tracks, leading edge on a fast spring, trailing on a slow one; inverted word copies are masked inside the shape. |
| `motion-card-morph` | Pill to card to control: SH states plus layers with `tin`/`tout`, rows land on a stagger, cursor click turns the arrow into a check. |
| `motion-bars-chart` | Bars appearing in sequence: per-row `M.vis` plus a width spring; numbers count up and settle on the exact approved wording. |
| `motion-logo-reveal` | A dot sparks into a line; the logo rises from behind it (masked), with a ring pulse and the tagline. |

## Writing copy for motion recipes

- `motion-kinetic-type`: one phrase, up to 24 words. Short words land best.
- `motion-card-morph`: `Headline | row 1 | row 2 | row 3 | row 4` (up to 4 rows).
- `motion-bars-chart`: `Title | Label: 180 min | Label: 45 min`. Link every number to a claim
  in `claims_refs`; approved wording from those claims is used first.
- `motion-logo-reveal`: the tagline. Reference the logo (SVG, PNG or JPEG) in `asset_refs`;
  without one the brand name is set in the heading font.
