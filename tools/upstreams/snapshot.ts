import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

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

  constructor(workspaceRoot = process.cwd()) {
    this.vendorRoot = path.join(workspaceRoot, 'vendor');
  }

  getSnapshotDir(sourceId: string, commitSha: string): string {
    return path.join(this.vendorRoot, sourceId, commitSha);
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

    for (const file of files) {
      const fullPath = path.join(targetDir, file.relativePath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      const buffer = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content, 'utf8');
      fs.writeFileSync(fullPath, buffer);

      entries.push({
        path: file.relativePath,
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
  verifySnapshot(sourceId: string, commitSha: string): VerificationResult {
    const targetDir = this.getSnapshotDir(sourceId, commitSha);
    const manifestPath = path.join(targetDir, 'snapshot.manifest.json');

    if (!fs.existsSync(manifestPath)) {
      return {
        valid: false,
        source_id: sourceId,
        commit_sha: commitSha,
        verifiedFiles: 0,
        errors: [`Missing snapshot manifest at ${manifestPath}`]
      };
    }

    const manifest: SnapshotManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const errors: string[] = [];
    let verified = 0;

    for (const entry of manifest.files) {
      const fullPath = path.join(targetDir, entry.path);
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

    return {
      valid: errors.length === 0,
      source_id: sourceId,
      commit_sha: commitSha,
      verifiedFiles: verified,
      errors
    };
  }
}
