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
| `validate` | `mgvideo validate <run>` | Audits output files, duration, audio streams, platform safe zones, and claims integrity. |
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
| `chapters` | `mgvideo chapters <project>` | Generates YouTube chapters, WebVTT cue markers, and QuickTime chapter metadata. |
| `loop` | `mgvideo loop <video>` | Creates seamless ping-pong loops (forward + reverse) for social reels and web hero banners. |
| `freeze` | `mgvideo freeze <video>` | Holds start or final frame of video using native tpad clone filter and audio padding. |
| `blur-bg` | `mgvideo blur-bg <video>` | Adapts 9:16 vertical video onto a 16:9 canvas with an aesthetic blurred backdrop. |
| `gate` | `mgvideo gate <project>` | Runs automated pre-delivery compliance audit (contracts, Cyrillic clearance, $0 budget). |
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
- `-h, --height <pixels>`: Waveform height (default: `240`).
- `-c, --color <hex>`: Waveform stroke color (default: `#2563EB`).
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
