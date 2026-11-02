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
| `clean` | `mgvideo clean <project>` | Purges temporary render caches and older runs to preserve disk hygiene. |
| `upstream` | `mgvideo upstream [check\|propose\|rollback]` | Manages external repository tracking, candidate review branches, and baseline rollbacks. |

---

## Detailed Command Options

### `mgvideo render <project>`
- `-f, --format <format>`: Aspect ratio (`9:16`, `16:9`, `1:1`). Defaults to `9:16`.
- `-c, --codec <codec>`: Output codec container (`mp4`, `webm`, `mov_prores`). Defaults to `mp4`.
- `--transparent`: Render with transparent alpha channel (requires `mov_prores` or `webm`).
- `--force`: Bypass cache and force re-rendering.

### `mgvideo batch <catalog>`
- `-c, --concurrency <number>`: Number of concurrent render workers (default: `2`).
- `--force`: Bypass SKU cache and force re-render.

### `mgvideo storyboard <project>`
- `-f, --format <format>`: Target aspect ratio for styleframes (`16:9`, `9:16`, `1:1`).

### `mgvideo clean <project>`
- `--all`: Purge all runs and storyboard frames.
- `--cache-only`: Delete only `runs/cache/` without touching finished run directories.
- `--keep-latest`: Retain the newest run and delete older runs (default: `true`).
