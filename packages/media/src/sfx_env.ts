import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Managed Python environment for the sound pass (`mgvideo setup sfx`).
 *
 * The venv lives in the user cache, never in the repo:
 *   ${XDG_CACHE_HOME:-~/.cache}/mgvideo/venvs/sfx
 * Every package is pinned. The pins form one wheel-compatible set for CPython 3.10-3.13
 * (numba, which librosa needs, has no wheels for newer interpreters at these pins).
 */

export const SFX_REQUIREMENTS: readonly string[] = [
  'numpy==2.2.6',
  'scipy==1.15.3',
  'numba==0.61.2',
  'soundfile==0.13.1',
  'librosa==0.11.0',
];

/** Interpreter versions the pinned wheel set supports. */
export const SFX_PYTHON_MIN: [number, number] = [3, 10];
export const SFX_PYTHON_MAX: [number, number] = [3, 13];

const MARKER = 'mgvideo-sfx.json';

export function mgvideoCacheDir(env: NodeJS.ProcessEnv = process.env): string {
  const base = env.XDG_CACHE_HOME && path.isAbsolute(env.XDG_CACHE_HOME)
    ? env.XDG_CACHE_HOME
    : path.join(os.homedir(), '.cache');
  return path.join(base, 'mgvideo');
}

export function sfxVenvDir(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(mgvideoCacheDir(env), 'venvs', 'sfx');
}

export function venvPython(venvDir: string): string {
  return process.platform === 'win32'
    ? path.join(venvDir, 'Scripts', 'python.exe')
    : path.join(venvDir, 'bin', 'python');
}

function requirementsHash(): string {
  return crypto.createHash('sha256').update(SFX_REQUIREMENTS.join('\n')).digest('hex').slice(0, 16);
}

export interface SfxEnvStatus {
  ready: boolean;
  venvDir: string;
  python: string;
  /** Why the venv is not ready, when it is not. */
  reason?: string;
  pythonVersion?: string;
}

/** Cheap status check (no imports run): venv python exists and the marker matches the pins. */
export function sfxEnvStatus(env: NodeJS.ProcessEnv = process.env): SfxEnvStatus {
  const venvDir = sfxVenvDir(env);
  const python = venvPython(venvDir);
  if (!fs.existsSync(python)) {
    return { ready: false, venvDir, python, reason: `no venv at ${venvDir}` };
  }
  const markerPath = path.join(venvDir, MARKER);
  if (!fs.existsSync(markerPath)) {
    return { ready: false, venvDir, python, reason: 'venv exists but setup did not finish (no marker)' };
  }
  try {
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8')) as { requirements_hash?: string; python_version?: string };
    if (marker.requirements_hash !== requirementsHash()) {
      return { ready: false, venvDir, python, reason: 'venv was built for different pinned versions' };
    }
    return { ready: true, venvDir, python, pythonVersion: marker.python_version };
  } catch {
    return { ready: false, venvDir, python, reason: 'unreadable setup marker' };
  }
}

/** Returns the venv python or throws the user-facing "run setup" error. */
export function requireSfxPython(env: NodeJS.ProcessEnv = process.env): string {
  const st = sfxEnvStatus(env);
  if (!st.ready) {
    throw new Error(`The sound-pass Python environment is not ready (${st.reason}). Run \`mgvideo setup sfx\` first.`);
  }
  return st.python;
}

function pythonVersion(bin: string): [number, number, number] | null {
  const res = spawnSync(bin, ['-c', 'import sys; print("%d.%d.%d" % sys.version_info[:3])'], { encoding: 'utf8' });
  if (res.error || res.status !== 0) return null;
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(res.stdout.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function inRange(v: [number, number, number]): boolean {
  const cmp = (a: [number, number], b: [number, number]) => a[0] - b[0] || a[1] - b[1];
  return cmp([v[0], v[1]], SFX_PYTHON_MIN) >= 0 && cmp([v[0], v[1]], SFX_PYTHON_MAX) <= 0;
}

/**
 * Finds a CPython interpreter the pins support. An explicit choice (flag or MGVIDEO_PYTHON)
 * must satisfy the range; otherwise versioned names are tried newest first, then python3.
 */
export function findSfxBasePython(explicit?: string, env: NodeJS.ProcessEnv = process.env): { bin: string; version: string } {
  const wanted = explicit ?? env.MGVIDEO_PYTHON;
  const range = `${SFX_PYTHON_MIN.join('.')}-${SFX_PYTHON_MAX.join('.')}`;
  if (wanted) {
    const v = pythonVersion(wanted);
    if (!v) throw new Error(`Python interpreter not runnable: ${wanted}`);
    if (!inRange(v)) throw new Error(`${wanted} is Python ${v.join('.')}; the sound pass needs Python ${range} (python3 >= 3.10).`);
    return { bin: wanted, version: v.join('.') };
  }
  const seen: string[] = [];
  for (const bin of ['python3.13', 'python3.12', 'python3.11', 'python3.10', 'python3']) {
    const v = pythonVersion(bin);
    if (!v) continue;
    seen.push(`${bin}=${v.join('.')}`);
    if (inRange(v)) return { bin, version: v.join('.') };
  }
  throw new Error(
    `No usable Python found: the sound pass needs python3 >= 3.10 (pinned wheels support ${range}). ` +
    `Found: ${seen.join(', ') || 'none'}. Install Python 3.12 or 3.13, or pass --python <path>.`,
  );
}

export interface SetupSfxOptions {
  python?: string;
  force?: boolean;
  env?: NodeJS.ProcessEnv;
  /** Receives progress lines. */
  log?: (line: string) => void;
}

export interface SetupSfxResult {
  venvDir: string;
  python: string;
  pythonVersion: string;
  installed: boolean;
  requirements: readonly string[];
}

function run(bin: string, args: string[], log: (l: string) => void): void {
  log(`$ ${[bin, ...args].join(' ')}`);
  const res = spawnSync(bin, args, { stdio: ['ignore', 'inherit', 'inherit'] });
  if (res.error) throw new Error(`${bin} failed to start: ${res.error.message}`);
  if (res.status !== 0) throw new Error(`${bin} ${args.slice(0, 3).join(' ')} exited with ${res.status}`);
}

/** Creates (or verifies) the managed venv. Idempotent: a ready venv with matching pins is left alone. */
export function setupSfxEnv(opts: SetupSfxOptions = {}): SetupSfxResult {
  const env = opts.env ?? process.env;
  const log = opts.log ?? (() => {});
  const status = sfxEnvStatus(env);
  if (status.ready && !opts.force) {
    // Confirm the imports still work before declaring it ready.
    const check = spawnSync(status.python, ['-c', 'import librosa, soundfile, numpy, scipy'], { encoding: 'utf8' });
    if (check.status === 0) {
      return { venvDir: status.venvDir, python: status.python, pythonVersion: status.pythonVersion ?? 'unknown', installed: false, requirements: SFX_REQUIREMENTS };
    }
    log('Existing venv failed its import check; rebuilding.');
  }
  const base = findSfxBasePython(opts.python, env);
  const venvDir = status.venvDir;
  if (fs.existsSync(venvDir)) fs.rmSync(venvDir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(venvDir), { recursive: true });
  log(`Using ${base.bin} (Python ${base.version}).`);
  run(base.bin, ['-m', 'venv', venvDir], log);
  const py = venvPython(venvDir);
  run(py, ['-m', 'pip', 'install', '--disable-pip-version-check', '--upgrade', 'pip'], log);
  run(py, ['-m', 'pip', 'install', '--disable-pip-version-check', '--only-binary=:all:', ...SFX_REQUIREMENTS], log);
  run(py, ['-c', 'import librosa, soundfile, numpy, scipy'], log);
  fs.writeFileSync(
    path.join(venvDir, MARKER),
    JSON.stringify({ requirements: SFX_REQUIREMENTS, requirements_hash: requirementsHash(), python_version: base.version, created: new Date().toISOString() }, null, 2),
  );
  return { venvDir, python: py, pythonVersion: base.version, installed: true, requirements: SFX_REQUIREMENTS };
}
