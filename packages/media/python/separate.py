#!/usr/bin/env python3
"""Object separation helper for `mgvideo separate`.

Ported from the object-separation skill by Barty-Bart (Barty-Bart/motion-graphics, MIT licence):
hardware-based SAM 2.1 model choice, click points with labels on the first frame, and chunked
mask propagation where each chunk is seeded with the last mask of the previous one.

Commands (all output is JSON on stdout; progress goes to stderr):
  separate.py scan
      Detect the device and the model that would be used. Does not download weights.
  separate.py run --frames DIR --start N --end M --masks DIR --point x,y[,label] ... [--model ID]
      Read frames DIR/%05d.jpg (absolute frame numbers N..M), propagate a mask from the click
      points on frame N, and write DIR/%05d.png masks (white = subject).

Frames are read from disk one chunk at a time and masks are written as soon as they are
produced, so memory stays bounded by the chunk size, not by the clip length.
"""

import argparse
import json
import os
import platform
import sys
import time

MODELS = {
    "tiny": "facebook/sam2.1-hiera-tiny",
    "base-plus": "facebook/sam2.1-hiera-base-plus",
    "large": "facebook/sam2.1-hiera-large",
}


def log(msg):
    print(msg, file=sys.stderr, flush=True)


def scan():
    """Pick device and model from the hardware (same thresholds as upstream)."""
    import torch

    info = {"system": platform.system(), "machine": platform.machine(), "torch": torch.__version__}
    if torch.cuda.is_available():
        props = torch.cuda.get_device_properties(0)
        gb = props.total_memory / 1e9
        info.update(device="cuda", gpu=torch.cuda.get_device_name(0), vram_gb=round(gb, 1),
                    model_size="large" if gb >= 12 else "base-plus")
    elif getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        info.update(device="mps", gpu="Apple Silicon (MPS)", model_size="base-plus")
    else:
        info.update(device="cpu", model_size="tiny")
    info["model"] = MODELS[info["model_size"]]
    try:
        import transformers

        info["transformers"] = transformers.__version__
    except Exception as exc:  # noqa: BLE001 - reported, not fatal for a scan
        info["transformers_error"] = str(exc)
    return info


def parse_point(text):
    parts = text.split(",")
    if len(parts) not in (2, 3):
        raise ValueError(f"bad point {text!r}, expected x,y[,label]")
    x, y = float(parts[0]), float(parts[1])
    label = int(parts[2]) if len(parts) == 3 else 1
    if label not in (0, 1):
        raise ValueError(f"bad label in {text!r}, expected 0 or 1")
    return [x, y], label


def run(args):
    import cv2
    import numpy as np
    import torch
    from transformers import Sam2VideoModel, Sam2VideoProcessor

    t0 = time.time()
    hw = scan()
    dev = args.device or hw["device"]
    model_id = MODELS.get(args.model, args.model) if args.model else hw["model"]
    points, labels = zip(*(parse_point(p) for p in args.point))
    points, labels = [list(p) for p in points], list(labels)
    if 1 not in labels:
        raise ValueError("at least one point must have label 1 (subject)")

    log(f"separate: device={dev} model={model_id} frames={args.start}..{args.end}")
    model = Sam2VideoModel.from_pretrained(model_id).to(dev).eval()  # downloads on first run
    proc = Sam2VideoProcessor.from_pretrained(model_id)
    t_load = time.time() - t0

    def frame_path(i):
        return os.path.join(args.frames, f"{i:05d}.jpg")

    def read_frames(a, b):
        out = []
        for i in range(a, b + 1):
            im = cv2.imread(frame_path(i), cv2.IMREAD_COLOR)
            if im is None:
                raise FileNotFoundError(f"missing frame {frame_path(i)}")
            out.append(cv2.cvtColor(im, cv2.COLOR_BGR2RGB))
        return out

    os.makedirs(args.masks, exist_ok=True)
    written = 0
    covered = []

    def separate_chunk(a, frames, seed=None):
        nonlocal written
        h, w = frames[0].shape[:2]
        s = proc.init_video_session(video=frames, inference_device=dev, video_storage_device="cpu",
                                    inference_state_device="cpu", dtype=torch.float32)
        if seed is None:
            proc.add_inputs_to_inference_session(inference_session=s, frame_idx=0, obj_ids=1,
                                                 input_points=[[points]], input_labels=[[labels]])
        else:
            proc.add_inputs_to_inference_session(inference_session=s, frame_idx=0, obj_ids=1,
                                                 input_masks=seed.astype(np.uint8))
        last = None
        with torch.inference_mode():
            model(inference_session=s, frame_idx=0)
            for o in model.propagate_in_video_iterator(s, start_frame_idx=0):
                m = proc.post_process_masks([o.pred_masks], original_sizes=[[h, w]], binarize=True)[0]
                m = m.squeeze().cpu().numpy().astype(bool)
                if m.ndim != 2:
                    m = m.reshape(h, w)
                idx = a + int(o.frame_idx)
                cv2.imwrite(os.path.join(args.masks, f"{idx:05d}.png"), m.astype(np.uint8) * 255)
                covered.append(float(m.mean()))
                written += 1
                if int(o.frame_idx) == len(frames) - 1:
                    last = m
        if last is None:
            raise RuntimeError(f"propagation did not reach the end of chunk starting at {a}")
        return last

    t1 = time.time()
    a, seed, chunks = args.start, None, 0
    while True:
        b = min(args.end, a + args.chunk - 1)
        frames = read_frames(a, b)
        seed = separate_chunk(a, frames, seed)
        chunks += 1
        log(f"separate: frames {a}..{b} done ({time.time() - t1:.1f}s)")
        del frames
        if b >= args.end:
            break
        # The next chunk starts on the last frame of this one, seeded with its mask.
        a = b
    t_prop = time.time() - t1
    unique = args.end - args.start + 1
    return {
        "ok": True,
        "device": dev,
        "model": model_id,
        "hardware": hw,
        "start": args.start,
        "end": args.end,
        "frames": unique,
        "chunks": chunks,
        "masks_dir": os.path.abspath(args.masks),
        "mean_coverage": round(sum(covered) / max(1, len(covered)), 4),
        "timings": {
            "load_s": round(t_load, 2),
            "propagate_s": round(t_prop, 2),
            "per_frame_s": round(t_prop / max(1, unique), 3),
            "total_s": round(time.time() - t0, 2),
        },
    }


def main():
    ap = argparse.ArgumentParser(prog="separate.py")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("scan")
    r = sub.add_parser("run")
    r.add_argument("--frames", required=True)
    r.add_argument("--masks", required=True)
    r.add_argument("--start", type=int, required=True)
    r.add_argument("--end", type=int, required=True)
    r.add_argument("--point", action="append", required=True)
    r.add_argument("--model")
    r.add_argument("--device", choices=["cuda", "mps", "cpu"])
    r.add_argument("--chunk", type=int, default=60)
    args = ap.parse_args()
    try:
        if args.cmd == "scan":
            out = scan()
        else:
            if args.end < args.start or args.start < 0 or args.chunk < 2:
                raise ValueError("invalid frame range or chunk size")
            out = run(args)
    except Exception as exc:  # noqa: BLE001 - surfaced to the caller as JSON
        print(json.dumps({"ok": False, "error": f"{type(exc).__name__}: {exc}"}))
        sys.exit(1)
    print(json.dumps(out))


if __name__ == "__main__":
    main()
