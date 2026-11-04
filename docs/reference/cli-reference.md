---
title: Magnifito Super Video CLI Reference
kind: reference
status: reference
updated: 2026-11-03
---
# Magnifito Super Video CLI Reference

The `mgvideo` CLI orchestrates the full lifecycle of video production jobs across the Magnifito platform.

```bash
mgvideo <command> [options]
```

---

## Command Summary

| Command | Usage | Description |
|---|---|---|
| `doctor` | `mgvideo doctor` | Validates host environment, pinned binaries (ffmpeg, ffprobe, sips/chrome), fonts, and directory permissions. |
| `catalog` | `mgvideo catalog` | Displays tracked upstream open-source repositories, observed vs approved commits, and licenses. |
| `init` | `mgvideo init <project>` | Scaffolds a new private video workspace with versioned contracts (`brief.json`, `brand.json`, `claims.json`, `assets.json`). |
| `plan` | `mgvideo plan <project>` | Compiles scene plan linking factual copy to verified claims in `claims.json`. |
| `preview` | `mgvideo preview <project>` | Starts interactive local HTTP server on port 3456 with live timeline scrubber. |
| `storyboard` | `mgvideo storyboard <project>` | Generates high-res visual styleframes and responsive review contact sheet `storyboard.html`. |
| `render` | `mgvideo render <project>` | Executes frozen render request and writes deterministic output file to `runs/<run_id>/`. |
| `validate` | `mgvideo validate [run] [-p project] [--out file] [--json]` | Audits output files, duration, audio streams, platform safe zones, and claims integrity. `latest` (the default) picks the newest run; `--out` also writes the printed report to a file. |
| `brand check` | `mgvideo brand check <brand.json\|project> [--out file] [--json]` | Checks brand.json: schema, WCAG contrast, font files, rights, licences, Cyrillic coverage, logos. Exits 1 on failures; warnings do not fail. |
| `package` | `mgvideo package <run>` | Creates client deliverable folder with signed review record, notices, captions, and `SHA256SUMS.txt`. |
| `report` | `mgvideo report <project>` | Generates executive Markdown (`DELIVERY_REPORT.md`) and JSON delivery summary for client handoff. |
| `diff` | `mgvideo diff <targetA> <targetB>` | Compares two video files or images using SSIM/PSNR and perceptual frame hashes to detect visual drift. |
| `cost` | `mgvideo cost <run>` | Audits compute, agent tokens, and verifies `$0.00` external media API spend compliance. |
| `batch` | `mgvideo batch <catalog.json>` | Renders multi-SKU commerce batches with concurrency control, inventory skipping, and retry tracking. |
| `inspect` | `mgvideo inspect <file>` | Probes media specifications (resolution, fps, duration, codecs, loudness LUFS, Rec.709 compliance). |
| `recipe` | `mgvideo recipe [id]` | Explores available shot recipes (e.g. `cinematic-title`, `saas-interface-tour`) and motion parameters. |
| `migrate` | `mgvideo migrate <project>` | Upgrades project contracts to schema version 1.0.0 and injects zero-budget media defaults. |
| `thumbnail` | `mgvideo thumbnail <target>` | Extracts promotional poster frame or thumbnail image in PNG, JPG, or WebP. |
| `reframe` | `mgvideo reframe <video>` | Adapts master video into secondary aspect ratios (16:9, 9:16, 1:1, 4:5) via fit or crop. |
| `grade` | `mgvideo grade <video>` | Applies curated cinematic color grade preset (cool-tech, warm-vibrant, high-contrast, etc.). |
| `waveform` | `mgvideo waveform <media>` | Generates high-resolution audio waveform visualizer PNG for voiceover and podcasts. |
| `notify` | `mgvideo notify <project>` | Dispatches webhook event payloads for automated CI/CD and production monitoring. |
| `bundle` | `mgvideo bundle <deliveryDir>` | Compresses deliverables, review records, notices, and checksums into an immutable .tar.gz archive. |
| `verify-bundle` | `mgvideo verify-bundle <bundle>` | Cryptographically validates SHA256 checksums and review signatures inside a production tarball. |
| `dashboard` | `mgvideo dashboard` | Displays an executive production status dashboard with binary health, workflows, and budgets. |
| `proxy` | `mgvideo proxy <video>` | Transcodes heavy video assets into lightweight 540p/720p proxies for low-latency editing. |
| `watermark` | `mgvideo watermark <video>` | Burns semi-transparent security banners or embargo notices into client review videos. |
| `speed` | `mgvideo speed <video>` | Adjusts playback speed (0.5x to 8.0x) with pitch-preserved audio synchrony. |
| `safezone` | `mgvideo safezone <video>` | Overlays mobile platform safe margin bounding rectangles onto video for QA analysis. |
| `concat` | `mgvideo concat <clips...>` | Concatenates video clips, normalizing resolution, framerate, and audio sample rates. |
| `lower-third` | `mgvideo lower-third <video>` | Burns broadcast-quality lower-third speaker title badges with custom brand accents. |
| `chapters` | `mgvideo chapters <project> [--format youtube\|vtt\|ffmetadata] [--out file]` | Generates YouTube chapters, WebVTT cue markers, or FFmetadata chapters; `--out` writes the chapters to a file. |
| `loop` | `mgvideo loop <video>` | Creates seamless ping-pong loops (forward + reverse) for social reels and web hero banners. |
| `freeze` | `mgvideo freeze <video>` | Holds start or final frame of video using native tpad clone filter and audio padding. |
| `blur-bg` | `mgvideo blur-bg <video>` | Adapts 9:16 vertical video onto a 16:9 canvas with an aesthetic blurred backdrop. |
| `gate` | `mgvideo gate <project>` | Runs automated pre-delivery compliance audit (contracts, Cyrillic clearance, $0 budget). |
| `framerate` | `mgvideo framerate <video>` | Converts video to standard broadcast or social framerate (24, 25, 30, 60 fps). |
| `deinterlace` | `mgvideo deinterlace <video>` | Normalizes legacy interlaced footage into progressive scan frames via yadif. |
| `eq` | `mgvideo eq <audio>` | Applies frequency equalization presets (voice-presence, rumble-reduction, de-ess). |
| `montage` | `mgvideo montage <images...>` | Stitches storyboard styleframes into an animated animatic review video. |
| `mask` | `mgvideo mask <video>` | Redacts on-screen confidential credentials or PII via blur or solid matte. |
| `channel-map` | `mgvideo channel-map <audio>` | Remaps audio channels (mono-to-stereo, stereo-to-mono, left-only-to-stereo). |
| `optimize` | `mgvideo optimize <video>` | Constrains video bitrate to meet file size limits (Discord 25MB, WhatsApp 16MB). |
| `merkle` | `mgvideo merkle <dir>` | Computes hierarchical cryptographic Merkle tree root hash of deliverable package. |
| `resample` | `mgvideo resample <audio>` | Resamples audio to broadcast standard (48 kHz) or custom sample rate. |
| `reverse` | `mgvideo reverse <video>` | Reverses video and audio playback for rewind transitions or boomerang loops. |
| `matte` | `mgvideo matte <video>` | Overlays cinematic letterbox or pillarbox matte bars (2.39:1, 1.85:1, 4:3). |
| `sfx` | `mgvideo sfx <type>` | Procedurally synthesizes transition sound effects (whoosh, thud, pop, chime). |
| `sanitize` | `mgvideo sanitize <media>` | Strips sensitive camera metadata, geolocation, author tags, and local paths. |
| `chromakey` | `mgvideo chromakey <video>` | Keys out green or blue screen background and composites over background plate. |
| `title` | `mgvideo title <video>` | Burns high-resolution typographic title card into video frames. |
| `noise-gate` | `mgvideo noise-gate <audio>` | Mutes background noise floor and room hum during speech pauses via agate. |
| `smart-crop` | `mgvideo smart-crop <video>` | Reframes video into target aspect ratio with focal point bias. |
| `pan` | `mgvideo pan <audio>` | Adjusts stereo pan position and soundfield width. |
| `glitch` | `mgvideo glitch <video>` | Applies stylized chromatic aberration and digital glitch artifacts. |
| `multicam` | `mgvideo multicam <videos...>` | Tiles multiple synchronized camera angles into a split-screen grid. |
| `compress-audio` | `mgvideo compress-audio <audio>` | Applies dynamics compression with loudness-matched makeup gain. |
| `pip` | `mgvideo pip <main> <overlay>` | Inserts picture-in-picture overlay in screen corner. |
| `vignette` | `mgvideo vignette <video>` | Applies subtle cinematic lens edge darkening. |
| `declick` | `mgvideo declick <audio>` | Eliminates impulsive mouth clicks and electrical pops from dialogue. |
| `clean` | `mgvideo clean <project>` | Purges temporary render caches and older runs to preserve disk hygiene. |
| `upstream` | `mgvideo upstream [check\|propose\|rollback]` | Manages external repository tracking, candidate review branches, and baseline rollbacks. |

---

## Detailed Command Options

### `mgvideo dashboard`
- Renders an executive ASCII overview of system health, quarantined upstreams, workflows status, and zero-spend compliance.

### `mgvideo verify-bundle <bundle.tar.gz>`
- Verifies every unpacked deliverable against `SHA256SUMS.txt`.
- Audits `review-record.json` approvals.

### `mgvideo proxy <video>`
- `-r, --res <resolution>`: Proxy resolution (`540p`, `720p`, `360p`). Defaults to `540p`.
- `-o, --out <path>`: Custom output proxy video path.

### `mgvideo watermark <video>`
- `-t, --text <text>`: Watermark banner text (default: `CONFIDENTIAL - REVIEW ONLY`).
- `-r, --reviewer <name>`: Reviewer identity tag.
- `-p, --position <pos>`: `top_right`, `center`, `bottom_right`. Defaults to `top_right`.

### `mgvideo speed <video>`
- `-f, --factor <factor>`: Speed multiplier (`1.25`, `1.5`, `2.0`, `0.75`). Required.
- Output keeps the source frame rate and lasts exactly source / factor (video and audio), so no extra `-t` trim is needed.

### `mgvideo safezone <video>`
- Generates vertical 9:16 safe area QA overlays depicting TikTok, Reels, and Shorts interaction margins.

### `mgvideo render <project>`
- `-f, --format <format>`: Aspect ratio (`9:16`, `16:9`, `1:1`). Defaults to `9:16`.
- `-c, --codec <codec>`: Output codec container (`mp4`, `webm`, `mov_prores`). Defaults to `mp4`.
- `--transparent`: Render with transparent alpha channel (requires `mov_prores` or `webm`).
- `--force`: Bypass cache and force re-rendering.

### `mgvideo thumbnail <target>`
- `-t, --time <seconds>`: Time offset in seconds (default: `1.0`).
- `-f, --format <format>`: Image format (`png`, `jpg`, `webp`). Defaults to `png`.
- `-w, --width <pixels>`: Optional custom width.
- `-h, --height <pixels>`: Optional custom height.
- `-o, --out <path>`: Custom output image file path.

### `mgvideo reframe <video>`
- `-r, --ratio <ratio>`: Target aspect ratio (`16:9`, `9:16`, `1:1`, `4:5`). Required.
- `-s, --strategy <strategy>`: `fit` (letterbox/pad) or `crop` (center crop). Defaults to `fit`.
- `-c, --color <color>`: Pad color for fit strategy (default: `black`).
- `-o, --out <path>`: Custom output video path.

### `mgvideo grade <video>`
- `-p, --preset <preset>`: Preset name (`cool-tech`, `warm-vibrant`, `high-contrast`, `rec709-neutral`, `matte-film`). Required.
- `-o, --out <path>`: Custom output video path.

### `mgvideo waveform <media>`
- `-w, --width <pixels>`: Waveform width (default: `1200`).
- `-H, --height <pixels>`: Waveform height (default: `240`). The audio is peak-normalised first, so the loudest peak reaches the full height; draw it at the size you need, no oversizing and cropping.
- `-c, --color <hex>`: Waveform stroke color (default: `#2563EB`).
- `--scale <scale>`: Amplitude scale, `lin`, `sqrt`, `cbrt` or `log` (default: `lin`). `sqrt` lifts quiet passages.
- `--no-normalize`: Draw at the recorded level (a quiet file stays small).
- `--split-channels`: Draw each channel in its own band instead of a mono downmix.
- `-o, --out <path>`: Output image path.

### `mgvideo bundle <deliveryDir>`
- `-o, --out <path>`: Custom output `.tar.gz` bundle path.

### `mgvideo batch <catalog>`
- `-c, --concurrency <number>`: Number of concurrent render workers (default: `2`).
- `--force`: Bypass SKU cache and force re-render.

### `mgvideo storyboard <project>`
- `-f, --format <format>`: Target aspect ratio for styleframes (`16:9`, `9:16`, `1:1`).

### `mgvideo clean <project>`
- `--all`: Purge all runs and storyboard frames.
- `--cache-only`: Delete only `runs/cache/` without touching finished run directories.
- `--keep-latest`: Retain the newest run and delete older runs (default: `true`).

### `mgvideo freeze <video>`
- `-p, --position <pos>`: Hold position: `start` or `end` (default: `end`).
- `-d, --duration <seconds>`: Hold duration in seconds (default: `2.0`).
- `-o, --out <path>`: Custom output video path.

### `mgvideo blur-bg <video>`
- `-o, --out <path>`: Custom output video path for the 16:9 canvas with blurred backdrop.

### `mgvideo gate <project>`
- Runs comprehensive automated compliance audit verifying:
  - Schema validity of `brief.json` and contracts
  - Zero external media budget enforcement (`media_budget_usd = 0.0`)
  - Cyrillic font coverage clearance for Bulgarian copy
  - Master media specs (resolution, duration, audio presence) via ffprobe

### `mgvideo framerate <video>`
- `-r, --fps <number>`: Target framerate in frames per second (default: `30`).
- `-o, --out <path>`: Custom output video path.

### `mgvideo deinterlace <video>`
- `-o, --out <path>`: Custom output video path for progressive frames.

### `mgvideo eq <audio>`
- `-p, --preset <name>`: Equalization preset (`voice-presence`, `rumble-reduction`, `warm-broadcast`, `de-ess`).
- `-o, --out <path>`: Custom output audio path.

### `mgvideo montage <images...>`
- `-s, --seconds <seconds>`: Slide hold duration in seconds (default: `2.0`).
- `-w, --width <pixels>`: Video canvas width (default: `1920`).
- `-h, --height <pixels>`: Video canvas height (default: `1080`).

### `mgvideo mask <video>`
- `-b, --box <coords>`: Required bounding box as `x,y,width,height`, or `x,y,width,height,start,end` to limit it to a time window in seconds (`[start, end)`; leave either empty for "from the start" or "to the end", e.g. `10,10,200,40,,3.5`). Repeat `--box` for several regions; to follow a moving field, give consecutive boxes with back-to-back windows.
- `-m, --mode <mode>`: Redaction style: `blur` or `solid` (default: `blur`), applied to every box.

### `mgvideo channel-map <audio>`
- `-m, --mode <mode>`: Channel mapping mode (`mono-to-stereo`, `stereo-to-mono`, `left-only-to-stereo`, `right-only-to-stereo`).

### `mgvideo optimize <video>`
- `-s, --size <mb>`: Target maximum size in MB (default: `10.0`).

### `mgvideo merkle <dir>`
- Computes SHA256 hashes of all leaves and builds a binary Merkle tree root hash for client handoff integrity.

### `mgvideo resample <audio>`
- `-r, --rate <hz>`: Target sample rate in Hz (default: `48000`).
- `-o, --out <path>`: Custom output audio path.

### `mgvideo reverse <video>`
- `-o, --out <path>`: Custom output video path.

### `mgvideo matte <video>`
- `-p, --preset <preset>`: Matte preset (`2.39:1`, `1.85:1`, `4:3`, `custom`). Defaults to `2.39:1`.
- `-b, --bars <pixels>`: Custom matte bar thickness in pixels.
- `-c, --color <color>`: Bar color (default: `black`).

### `mgvideo sfx <type>`
- Procedural sound effect synthesizer (`whoosh`, `thud`, `pop`, `chime`).
- `-d, --duration <seconds>`: Custom duration.

### `mgvideo sanitize <media>`
- `-o, --out <path>`: Custom output media path with all metadata and chapter headers stripped.

### `mgvideo chromakey <video>`
- `-k, --key <color>`: Key color (default: `0x00FF00`).
- `-s, --similarity <val>`: How far toward neutral the key reaches, as a share of the key colour's own chroma (default: `0.65`). Keying uses chroma only (ffmpeg `chromakey`), so brightness does not matter: dark browns, hair and shadows stay opaque, and the same value works for `0x00FF00` and for a colour sampled off the screen.
- `--blend <val>`: Soft-edge width above the similarity, same scale (default: `0.15`).
- `--no-despill`: Keep green/blue spill on the foreground (despill is on by default).
- `-b, --bg <path>`: Background image or video plate path.

### `mgvideo title <video>`
- `-t, --title <text>`: Required title text.
- `-s, --subtitle <text>`: Optional secondary subtitle text.
- `-p, --position <pos>`: `top`, `center`, `bottom` (default: `center`).

### `mgvideo noise-gate <audio>`
- `-t, --threshold <db>`: Gate threshold in dBFS (default: `-35`). Set it about 5 dB above the noise floor in the pauses; a threshold at the noise level does nothing.
- `-r, --ratio <ratio>`: Expansion ratio (default: `8`).
- Uses `agate` with peak detection and at most 24 dB of attenuation. Hiss at -40 dBFS RMS drops by about 19 dB with the defaults; speech above about -32 dBFS RMS is unchanged.

### `mgvideo smart-crop <video>`
- `-r, --ratio <ratio>`: Target aspect ratio (`9:16`, `1:1`, `4:5`, `16:9`).
- `-f, --focus <focus>`: Focal point bias (`center`, `top`, `bottom`, `left`, `right`).

### `mgvideo pan <audio>`
- `-p, --pan <val>`: Stereo pan position (`-1.0` left to `+1.0` right).
- `-w, --width <factor>`: Stereo width factor (`0.0` mono to `2.0` wide).

### `mgvideo glitch <video>`
- `-i, --intensity <factor>`: Effect intensity (`0.1` to `1.0`).
- `-s, --shift <pixels>`: RGB chromatic aberration split in pixels.

### `mgvideo multicam <videos...>`
- `-l, --layout <layout>`: Split layout (`side-by-side`, `top-bottom`, `quad-2x2`).

### `mgvideo compress-audio <audio>`
- `-p, --preset <preset>`: Mastering preset (`broadcast-master`, `vocal-leveler`, `punchy-bass`).
- `-t, --threshold <db>`: Optional custom threshold.
- Makeup gain is loudness-matched: the input and the compressed signal are measured (EBU R128) and the difference is added back, so every preset keeps the input's integrated loudness and only the dynamic range shrinks. A `-0.3 dBFS` limiter catches transients. The SDK option `makeupGainDb` sets a fixed makeup instead.

### `mgvideo pip <mainVideo> <overlayVideo>`
- `-c, --corner <corner>`: Window corner (`bottom_right`, `top_right`, `bottom_left`, `top_left`).
- `-w, --width <pixels>`: Window width in pixels (default: `480`).

### `mgvideo vignette <video>`
- `-a, --angle <radians>`: Lens darkening angle in radians (default: `0.5`).

### `mgvideo declick <audio>`
- Eliminates mouth clicks and electrical pops via FFmpeg `adeclick` filtering.
