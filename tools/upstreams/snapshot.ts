import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { safeId, safeJoin } from '../../packages/media/src/proc.js';

const MANIFEST_NAME = 'snapshot.manifest.json';
const COMMIT_SHA = /^[0-9a-f]{40}$/;

export interface SnapshotFileEntry {
  path: string;
  bytes: number;
  sha256: string;
}

export interface SnapshotManifest {
  source_id: string;
  commit_sha: string;
  created_at: string;
  license: string;
  files: SnapshotFileEntry[];
}

export interface VerificationResult {
  valid: boolean;
  source_id: string;
  commit_sha: string;
  verifiedFiles: number;
  errors: string[];
}

export class SnapshotManager {
  private vendorRoot: string;
  private workspaceRoot: string;

  constructor(workspaceRoot = process.cwd()) {
    this.workspaceRoot = workspaceRoot;
    this.vendorRoot = path.join(workspaceRoot, 'vendor');
  }

  getSnapshotDir(sourceId: string, commitSha: string): string {
    safeId(sourceId, 'source id');
    if (!COMMIT_SHA.test(commitSha)) throw new Error(`Invalid commit SHA (expected 40 lowercase hex chars): ${JSON.stringify(commitSha)}`);
    return safeJoin(this.vendorRoot, sourceId, commitSha);
  }

  /** SHA-256 of the manifest file on disk; pin this in registry/approved.lock.json file_hashes. */
  manifestHash(sourceId: string, commitSha: string): string {
    return this.computeHash(fs.readFileSync(path.join(this.getSnapshotDir(sourceId, commitSha), MANIFEST_NAME)));
  }

  /** Reads the pinned manifest hash for `<sourceId>/<commitSha>` from registry/approved.lock.json, if any. */
  private pinnedManifestHash(sourceId: string, commitSha: string): string | undefined {
    const lockPath = path.join(this.workspaceRoot, 'registry', 'approved.lock.json');
    if (!fs.existsSync(lockPath)) return undefined;
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as { file_hashes?: Record<string, string> };
    return lock.file_hashes?.[`${sourceId}/${commitSha}`];
  }

  computeHash(content: Buffer | string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Creates or records a vendor snapshot from in-memory/disk files with strict cryptographic hash tracking.
   */
  createSnapshot(
    sourceId: string,
    commitSha: string,
    license: string,
    files: Array<{ relativePath: string; content: string | Buffer }>
  ): SnapshotManifest {
    const targetDir = this.getSnapshotDir(sourceId, commitSha);
    fs.mkdirSync(targetDir, { recursive: true });

    const entries: SnapshotFileEntry[] = [];
    const seen = new Set<string>();

    for (const file of files) {
      // Reject absolute paths and any path that escapes the snapshot directory.
      const fullPath = safeJoin(targetDir, file.relativePath);
      const normalized = path.relative(targetDir, fullPath).split(path.sep).join('/');
      if (normalized === MANIFEST_NAME) throw new Error(`Reserved snapshot path: ${file.relativePath}`);
      if (seen.has(normalized)) throw new Error(`Duplicate snapshot path: ${file.relativePath}`);
      seen.add(normalized);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      const buffer = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content, 'utf8');
      fs.writeFileSync(fullPath, buffer);

      entries.push({
        path: normalized,
        bytes: buffer.length,
        sha256: this.computeHash(buffer)
      });
    }

    const manifest: SnapshotManifest = {
      source_id: sourceId,
      commit_sha: commitSha,
      created_at: new Date().toISOString(),
      license,
      files: entries.sort((a, b) => a.path.localeCompare(b.path))
    };

    const manifestPath = path.join(targetDir, 'snapshot.manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    return manifest;
  }

  /**
   * Cryptographically verifies that all vendored files match their recorded snapshot manifest.
   */
  verifySnapshot(sourceId: string, commitSha: string, expectedManifestSha256?: string): VerificationResult {
    const targetDir = this.getSnapshotDir(sourceId, commitSha);
    const manifestPath = path.join(targetDir, MANIFEST_NAME);

    if (!fs.existsSync(manifestPath)) {
      return {
        valid: false,
        source_id: sourceId,
        commit_sha: commitSha,
        verifiedFiles: 0,
        errors: [`Missing snapshot manifest at ${manifestPath}`]
      };
    }

    const manifestRaw = fs.readFileSync(manifestPath);
    const errors: string[] = [];
    let manifest: SnapshotManifest;
    try {
      manifest = JSON.parse(manifestRaw.toString('utf8'));
    } catch {
      return { valid: false, source_id: sourceId, commit_sha: commitSha, verifiedFiles: 0, errors: ['Snapshot manifest is not valid JSON'] };
    }

    // The manifest sits next to the files it describes, so it must itself be anchored to a
    // hash recorded outside the snapshot (argument or approved.lock.json).
    const pinned = expectedManifestSha256 ?? this.pinnedManifestHash(sourceId, commitSha);
    if (pinned && this.computeHash(manifestRaw) !== pinned) {
      errors.push('Snapshot manifest hash does not match the pinned value in approved.lock.json');
    }
    if (manifest.source_id !== sourceId || manifest.commit_sha !== commitSha) {
      errors.push('Snapshot manifest source_id/commit_sha do not match the requested snapshot');
    }

    let verified = 0;
    const listed = new Set<string>();

    for (const entry of manifest.files) {
      let fullPath: string;
      try {
        fullPath = safeJoin(targetDir, entry.path);
      } catch {
        errors.push(`Manifest entry escapes snapshot directory: ${entry.path}`);
        continue;
      }
      listed.add(path.relative(targetDir, fullPath).split(path.sep).join('/'));
      if (!fs.existsSync(fullPath)) {
        errors.push(`Missing vendored file: ${entry.path}`);
        continue;
      }

      const fileData = fs.readFileSync(fullPath);
      const actualHash = this.computeHash(fileData);

      if (actualHash !== entry.sha256) {
        errors.push(`Checksum mismatch for ${entry.path}: expected ${entry.sha256}, got ${actualHash}`);
      } else {
        verified++;
      }
    }

    // Any file present on disk but absent from the manifest is unverified content.
    for (const rel of listFiles(targetDir)) {
      if (rel === MANIFEST_NAME) continue;
      if (!listed.has(rel)) errors.push(`Unlisted file in snapshot: ${rel}`);
    }

    return {
      valid: errors.length === 0,
      source_id: sourceId,
      commit_sha: commitSha,
      verifiedFiles: verified,
      errors
    };
  }
}

function listFiles(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
    if (ent.isDirectory()) out.push(...listFiles(path.join(dir, ent.name), rel));
    else out.push(rel);
  }
  return out;
}

