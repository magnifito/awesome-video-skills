import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Shared helpers for CLI commands: run directory resolution, approved-lock access,
 * rendered master lookup and delivery signing.
 */

/**
 * Resolves a run reference into an absolute run directory.
 * - absolute path: used as-is
 * - bare run id with projectDir: <projectDir>/runs/<id>
 * - anything else: resolved against cwd
 */
export function resolveRunDir(runPathOrId: string, projectDir?: string): string {
  if (path.isAbsolute(runPathOrId)) return runPathOrId;
  if (projectDir && !runPathOrId.includes('/') && !runPathOrId.includes('\\')) {
    return path.join(path.resolve(projectDir), 'runs', runPathOrId);
  }
  return path.resolve(process.cwd(), runPathOrId);
}

/** Project directory for a run: explicit, or two levels above the run directory. */
export function resolveProjectDir(runDir: string, projectDir?: string): string {
  return projectDir ? path.resolve(projectDir) : path.resolve(runDir, '..', '..');
}

export interface ApprovedBaseline {
  approved_commit: string;
  license?: string;
  approved_date?: string;
  verification_status?: string;
  /** Previously approved commits, newest first. Rollback may only target one of these. */
  history?: Array<{ commit: string; approved_date?: string; verification_status?: string }>;
}

export interface ApprovedLock {
  approved_baselines: Record<string, ApprovedBaseline>;
  file_hashes?: Record<string, string>;
  [key: string]: unknown;
}

export function approvedLockPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, 'registry', 'approved.lock.json');
}

export function readApprovedLock(workspaceRoot: string): ApprovedLock {
  const p = approvedLockPath(workspaceRoot);
  const data = JSON.parse(fs.readFileSync(p, 'utf-8')) as ApprovedLock;
  if (!data.approved_baselines || typeof data.approved_baselines !== 'object') {
    data.approved_baselines = {};
  }
  return data;
}

/** Finds the toolkit workspace root by walking up from this file until registry/approved.lock.json exists. */
export function findWorkspaceRoot(start: string = path.dirname(new URL(import.meta.url).pathname)): string {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(approvedLockPath(dir))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error('Could not locate workspace root (registry/approved.lock.json)');
    dir = parent;
  }
}

export function isFullSha(value: string): boolean {
  return /^[0-9a-f]{40}$/.test(value);
}

const MASTER_EXTS = ['.mp4', '.mov', '.webm'];

/**
 * Finds the newest rendered master in <projectDir>/runs/<runId>/final_output_<runId>.<ext>.
 * Returns null when none exists.
 */
export function findLatestMaster(projectDir: string): string | null {
  const runsDir = path.join(projectDir, 'runs');
  if (!fs.existsSync(runsDir)) return null;
  const found: Array<{ file: string; mtime: number }> = [];
  for (const entry of fs.readdirSync(runsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'cache') continue;
    for (const ext of MASTER_EXTS) {
      const candidate = path.join(runsDir, entry.name, `final_output_${entry.name}${ext}`);
      if (fs.existsSync(candidate)) {
        found.push({ file: candidate, mtime: fs.statSync(candidate).mtimeMs });
      }
    }
  }
  found.sort((a, b) => b.mtime - a.mtime);
  return found[0]?.file ?? null;
}

export const SIGNING_KEY_ENV = 'MGVIDEO_SIGNING_KEY';

/** HMAC-SHA256 of content using the signing key from the environment, or null when no key is set. */
export function signContent(content: string | Buffer): string | null {
  const key = process.env[SIGNING_KEY_ENV];
  if (!key) return null;
  return crypto.createHmac('sha256', key).update(content).digest('hex');
}

/** Constant-time comparison of two hex signatures. */
export function signaturesEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a.trim(), 'hex');
  const bb = Buffer.from(b.trim(), 'hex');
  return ab.length === bb.length && ab.length > 0 && crypto.timingSafeEqual(ab, bb);
}

export function sha256File(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

export function sha256String(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/** Escapes text for safe interpolation into HTML. */
export function escapeHtml(text: unknown): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
