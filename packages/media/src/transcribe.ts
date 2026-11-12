/**
 * Local speech recognition: `mgvideo transcribe` turns the speech in a video or audio file into a
 * Transcript contract with word times. faster-whisper (CTranslate2, MIT) runs in a managed venv in
 * the user cache (`mgvideo setup transcribe`), on CPU (int8) or CUDA. No network call except the
 * one-time model download into the Hugging Face cache, so it costs nothing per run.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { TranscriptSchema, type Transcript } from '../../contracts/src/index.js';
import { runTool } from './proc.js';
import { mgvideoCacheDir, venvPython } from './separate.js';

export const TRANSCRIBE_PINS = ['faster-whisper==1.2.1', 'ctranslate2==4.9.0'];
/** Python range the pinned wheels cover (ctranslate2 4.9 ships cp39 to cp315). */
const PYTHON_RANGE: [[number, number], [number, number]] = [[3, 10], [3, 15]];
/** Multilingual (Bulgarian included), about 1.6 GB; `small` is faster and less accurate. */
export const DEFAULT_TRANSCRIBE_MODEL = 'large-v3-turbo';

export interface TranscribeMarker {
  pins: string[];
  pythonVersion: string;
  createdAt: string;
}

export function transcribeVenvDir(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(mgvideoCacheDir(env), 'venvs', 'transcribe');
}

function markerPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(transcribeVenvDir(env), 'mgvideo-setup.json');
}

/** The marker of a completed `mgvideo setup transcribe`, or null when it is not set up. */
export function readTranscribeMarker(env: NodeJS.ProcessEnv = process.env): TranscribeMarker | null {
  const marker = markerPath(env);
  if (!fs.existsSync(marker) || !fs.existsSync(venvPython(transcribeVenvDir(env)))) return null;
  try {
    return JSON.parse(fs.readFileSync(marker, 'utf8')) as TranscribeMarker;
  } catch {
    return null;
  }
}

function findPython(env: NodeJS.ProcessEnv): { bin: string; version: string } {
  const candidates = env.MGVIDEO_PYTHON ? [env.MGVIDEO_PYTHON] : ['python3.13', 'python3.12', 'python3.14', 'python3', 'python'];
  const seen: string[] = [];
  for (const bin of candidates) {
    let v: number[];
    try {
      v = runTool(bin, ['-c', 'import sys; print("%d.%d.%d" % sys.version_info[:3])']).trim().split('.').map(Number);
    } catch {
      continue;
    }
    seen.push(`${bin} ${v.join('.')}`);
    const mm = v[0] * 100 + v[1];
    if (mm >= PYTHON_RANGE[0][0] * 100 + PYTHON_RANGE[0][1] && mm <= PYTHON_RANGE[1][0] * 100 + PYTHON_RANGE[1][1]) {
      return { bin, version: v.join('.') };
    }
  }
  const range = `${PYTHON_RANGE[0].join('.')} to ${PYTHON_RANGE[1].join('.')}`;
  throw new Error(`Transcription needs Python ${range}. Found: ${seen.join(', ') || 'none'}. Install one or set MGVIDEO_PYTHON.`);
}

/** Creates (or reuses) the managed venv with the pinned faster-whisper. */
export function setupTranscribe(opts: { force?: boolean; log?: (msg: string) => void } = {}): { status: 'created' | 'exists'; venvDir: string; marker: TranscribeMarker } {
  const log = opts.log ?? (() => {});
  const venvDir = transcribeVenvDir();
  const existing = readTranscribeMarker();
  if (!opts.force && existing && JSON.stringify(existing.pins) === JSON.stringify(TRANSCRIBE_PINS)) {
    return { status: 'exists', venvDir, marker: existing };
  }
  if (opts.force) fs.rmSync(venvDir, { recursive: true, force: true });
  const vpy = venvPython(venvDir);
  if (!fs.existsSync(vpy)) {
    const py = findPython(process.env);
    log(`Creating venv at ${venvDir} with ${py.bin} ${py.version}`);
    fs.mkdirSync(path.dirname(venvDir), { recursive: true });
    runTool(py.bin, ['-m', 'venv', venvDir]);
  }
  log(`Installing ${TRANSCRIBE_PINS.join(' ')}`);
  const pip = spawnSync(vpy, ['-m', 'pip', 'install', '--disable-pip-version-check', '--progress-bar', 'off', ...TRANSCRIBE_PINS], { stdio: 'inherit' });
  if (pip.error) throw new Error(`pip failed to start: ${pip.error.message}`);
  if (pip.status !== 0) throw new Error(`pip install failed with exit code ${pip.status}`);
  const version = runTool(vpy, ['-c', 'import sys; print("%d.%d.%d" % sys.version_info[:3])']).trim();
  const marker: TranscribeMarker = { pins: [...TRANSCRIBE_PINS], pythonVersion: version, createdAt: new Date().toISOString() };
  fs.writeFileSync(markerPath(), JSON.stringify(marker, null, 2));
  return { status: 'created', venvDir, marker };
}

function helperPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, '../python/transcribe.py'),
    path.resolve(here, '../../../../packages/media/python/transcribe.py'),
  ];
  const found = candidates.find(p => fs.existsSync(p));
  if (!found) throw new Error(`transcribe.py helper not found (looked in ${candidates.join(', ')})`);
  return found;
}

export interface TranscribeOptions {
  /** ISO 639-1 code (`bg`, `en`); detected when omitted. */
  language?: string;
  model?: string;
  log?: (msg: string) => void;
}

interface HelperOutput {
  language: string;
  language_probability: number;
  duration: number;
  model: string;
  device: string;
  words: { word: string; start: number; end: number; probability: number }[];
}

/** Transcribes the first audio stream of `media` into a Transcript with recognised word times. */
export function transcribe(media: string, opts: TranscribeOptions = {}): Transcript {
  if (!readTranscribeMarker()) {
    throw new Error('Transcription is not set up. Run `mgvideo setup transcribe` first (installs faster-whisper into the user cache).');
  }
  if (!fs.existsSync(media)) throw new Error(`File not found: ${media}`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mgvideo-transcribe-'));
  try {
    const wav = path.join(tmp, 'audio.wav');
    runTool('ffmpeg', ['-v', 'error', '-y', '-i', media, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav]);
    const args = [helperPath(), '--audio', wav, '--model', opts.model ?? DEFAULT_TRANSCRIBE_MODEL];
    if (opts.language) args.push('--language', opts.language);
    const res = spawnSync(venvPython(transcribeVenvDir()), args, {
      encoding: 'utf8', stdio: ['ignore', 'pipe', opts.log ? 'pipe' : 'inherit'], maxBuffer: 256 * 1024 * 1024,
    });
    if (res.error) throw new Error(`transcribe helper failed to start: ${res.error.message}`);
    if (res.status !== 0) throw new Error(`transcribe helper failed (exit ${res.status})${res.stderr ? `: ${res.stderr.trim().split('\n').slice(-3).join(' ')}` : ''}`);
    if (opts.log && res.stderr) for (const line of res.stderr.trim().split('\n')) opts.log(line);
    const out = JSON.parse(res.stdout) as HelperOutput;
    return TranscriptSchema.parse({
      source_audio_hash: sha256File(media),
      language: out.language,
      correction_version: `asr:faster-whisper:${out.model}`,
      words: out.words.map(w => {
        const start = Math.round(w.start * 1000);
        return {
          word: w.word,
          start_ms: start,
          end_ms: Math.max(start, Math.round(w.end * 1000)),
          confidence: Math.min(1, Math.max(0, Math.round(w.probability * 1000) / 1000)),
          speaker: 'Speaker 1',
        };
      }),
    });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function sha256File(file: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
