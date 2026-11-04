---
title: Magnifito Super Video SDK Reference
kind: reference
status: reference
updated: 2026-11-03
---
# Magnifito Super Video SDK Reference

The `@magnifito/sdk` package provides a high-level programmatic TypeScript API via the `MagnifitoVideoEngine` facade class.

```typescript
import { MagnifitoVideoEngine } from '@magnifito/sdk';

const engine = new MagnifitoVideoEngine(process.cwd());
```

---

## SDK Methods

### Core Production Lifecycle

#### `engine.plan(projectDir: string)`
Compiles a scene plan linking factual copy to verified claims.
```typescript
const plan = await engine.plan('./projects/promo-bg');
```

#### `engine.render(projectDir: string, options?: EngineRenderOptions)`
Executes frozen render request and produces deterministic deliverables.
```typescript
const result = await engine.render('./projects/promo-bg', {
  format: '9:16',
  codec: 'mp4',
  force: false
});
```

#### `engine.validate(runDirOrId: string, projectDir?: string)`
Validates run outputs, duration, audio streams, platform safe zones, and claims integrity.
```typescript
const report = await engine.validate('run-20261102-140000', './projects/promo-bg');
console.log('Passed:', report.passed);
```

#### `engine.package(runDirOrId: string, projectDir?: string, reviewer?: string)`
Creates client deliverable package with signed review record, notices, and checksum manifest.
```typescript
const pkg = await engine.package('run-20261102-140000', './projects/promo-bg', 'Kiril Kirov');
console.log('Delivery directory:', pkg.delivery_dir);
```

#### `engine.gate(projectDir: string)`
Runs automated pre-delivery quality gate and compliance audit.
```typescript
const gateResult = await engine.gate('./projects/promo-bg');
if (!gateResult.passed) {
  throw new Error('Quality gate failed');
}
```

---

### Video Engineering Methods

#### `engine.smartCrop(videoPath: string, options?: SmartCropOptions)`
Reframes video with focal point bias (`top` for talking heads, `center`, `left`, `right`).
```typescript
const cropped = engine.smartCrop('input.mp4', {
  targetAspectRatio: '9:16',
  focus: 'top'
});
```

#### `engine.reframe(videoPath: string, options: ReframeOptions)`
Adapts aspect ratio via letterbox pad or center crop.
```typescript
const reframed = engine.reframe('input.mp4', {
  aspectRatio: '16:9',
  strategy: 'fit',
  padColor: 'black'
});
```

#### `engine.grade(videoPath: string, preset: ColorPresetName)`
Applies curated cinematic color grade preset with Rec.709 metadata.
```typescript
const graded = engine.grade('input.mp4', 'cool-tech');
```

#### `engine.pip(mainVideo: string, overlayVideo: string, options?: PipOptions)`
Composites picture-in-picture window in a screen corner.
```typescript
const pipResult = engine.pip('screencast.mp4', 'webcam.mp4', {
  corner: 'bottom_right',
  pipWidth: 480
});
```

#### `engine.chromakey(videoPath: string, options?: ChromaKeyOptions)`
Keys out green screen and composites over background plate.
```typescript
const keyed = engine.chromakey('green.mp4', {
  keyColor: '0x00FF00',
  similarity: 0.65, // share of the key-to-neutral chroma distance; blend 0.15, despill on by default
  backgroundPath: 'background.mp4'
});
```

#### `engine.matte(videoPath: string, options?: MatteOptions)`
Applies cinematic letterbox (2.39:1 scope) or pillarbox (4:3) bars.
```typescript
const matted = engine.matte('input.mp4', { preset: '2.39:1' });
```

#### `engine.freeze(videoPath: string, options?: FreezeOptions)`
Holds the start or final frame using native `tpad` filter cloning.
```typescript
const frozen = engine.freeze('input.mp4', {
  position: 'end',
  holdDurationSeconds: 2.0
});
```

#### `engine.blurBg(verticalVideoPath: string, options?: BlurBgOptions)`
Places 9:16 vertical video over full-screen blurred 16:9 backdrop.
```typescript
const blurred = engine.blurBg('vertical.mp4');
```

#### `engine.vignette(videoPath: string, options?: VignetteOptions)`
Applies subtle optical lens edge darkening.
```typescript
const vignetted = engine.vignette('input.mp4', { angleRadians: 0.5 });
```

#### `engine.glitch(videoPath: string, options?: GlitchOptions)`
Applies stylized RGB chromatic aberration and analog film grain noise.
```typescript
const glitched = engine.glitch('input.mp4', { intensity: 0.6 });
```

#### `engine.multiCam(videoPaths: string[], options?: MultiCamOptions)`
Tiles multiple camera angles into a split-screen layout.
```typescript
const split = engine.multiCam(['camA.mp4', 'camB.mp4'], {
  layout: 'side-by-side'
});
```

#### `engine.reverse(videoPath: string, options?: ReverseOptions)`
Reverses video and audio playback in synchrony.
```typescript
const reversed = engine.reverse('input.mp4');
```

#### `engine.framerate(videoPath: string, options?: FrameRateOptions)`
Converts video to standard framerates (24, 25, 30, 60 fps).
```typescript
const fpsConverted = engine.framerate('input.mp4', { targetFps: 24 });
```

#### `engine.deinterlace(videoPath: string, options?: DeinterlaceOptions)`
Normalizes interlaced footage to progressive frames via `yadif`.
```typescript
const progressive = engine.deinterlace('archival.mp4');
```

#### `engine.mask(videoPath: string, box: MaskBox | MaskBox[], options?: MaskOptions)`
Redacts on-screen confidential credentials or PII. Pass several boxes, each with an optional
`start`/`end` window in seconds, to cover a field that moves.
```typescript
const redacted = engine.mask('demo.mp4', {
  x: 100, y: 150, width: 300, height: 60, mode: 'blur'
});
const followed = engine.mask('demo.mp4', [
  { x: 100, y: 150, width: 300, height: 60, end: 2 },
  { x: 140, y: 130, width: 300, height: 60, start: 2 }
]);
```

#### `engine.optimizeBitrate(videoPath: string, options?: BitrateOptimizeOptions)`
Encodes video to conform to strict maximum file size limits.
```typescript
const optimized = engine.optimizeBitrate('input.mp4', { targetSizeMb: 15.0 });
```

---

### Audio Engineering Methods

#### `engine.resample(audioPath: string, options?: ResampleOptions)`
Resamples audio to standard broadcast rate (48000 Hz).
```typescript
const resampled = engine.resample('podcast.wav', { sampleRate: 48000 });
```

#### `engine.pan(audioPath: string, options?: PannerOptions)`
Adjusts stereo pan position and stereo field width.
```typescript
const panned = engine.pan('voice.wav', { pan: 0.3, stereoWidth: 1.2 });
```

#### `engine.compressAudio(audioPath: string, options?: CompressorOptions)`
Applies broadcast dynamics compression and makeup gain.
```typescript
const compressed = engine.compressAudio('voice.wav', { preset: 'broadcast-master' });
```

#### `engine.eq(audioPath: string, options?: EqOptions)`
Applies frequency sweetening and rumble cut.
```typescript
const equalized = engine.eq('voice.wav', { preset: 'voice-presence' });
```

#### `engine.noiseGate(audioPath: string, options?: NoiseGateOptions)`
Mutes ambient room hum during speech pauses.
```typescript
const gated = engine.noiseGate('voice.wav', { thresholdDb: -40 });
```

#### `engine.declick(audioPath: string, options?: DeClickOptions)`
Eliminates mouth clicks and electrical pops.
```typescript
const declicked = engine.declick('voice.wav');
```

#### `engine.silence(audioPath: string, options?: SilenceRemoveOptions)`
Trims dead air and pauses from dialogue.
```typescript
const desilenced = engine.silence('dialogue.wav', { thresholdDb: -38 });
```

#### `engine.sidechain(voicePath: string, musicPath: string, options?: SidechainOptions)`
Ducks background music under vocal dialogue.
```typescript
const ducked = engine.sidechain('dialogue.wav', 'music.wav');
```

#### `engine.sfx(type: SfxType, options?: SfxOptions)`
Procedurally synthesizes transition sound effects without external spend.
```typescript
const sfx = engine.sfx('whoosh');
```

#### `engine.multitrack(videoPath: string, tracks: AudioTrackInput[])`
Muxes alternate audio tracks with ISO 639-2 language metadata.
```typescript
const muxed = engine.multitrack('master.mp4', [
  { filePath: 'dialogue_en.wav', language: 'eng', title: 'English Dialogue', isDefault: true },
  { filePath: 'dialogue_bg.wav', language: 'bul', title: 'Български дублаж' }
]);
```

---

### Auditing & Security Methods

#### `engine.merkle(dirPath: string)`
Computes hierarchical binary Merkle tree root hash of deliverable files.
```typescript
const merkle = engine.merkle('./deliverables');
console.log('Merkle Root:', merkle.rootHash);
```

#### `engine.sanitize(mediaPath: string, options?: SanitizeOptions)`
Strips metadata, camera tags, geolocation, and chapter markers.
```typescript
const sanitized = engine.sanitize('deliverable.mp4');
```

#### `engine.auditFont(sampleText: string, fontFamily: string)`
Verifies Cyrillic glyph coverage (`U+0400–U+04FF`).
```typescript
const fontAudit = engine.auditFont('Тестов надпис', 'Inter');
console.log('Supported:', fontAudit.supported);
```

