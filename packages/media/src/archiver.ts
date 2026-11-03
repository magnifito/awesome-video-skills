import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { safeJoin } from './proc.js';

export interface ChecksumItem {
  filename: string;
  sha256: string;
  bytes: number;
}

export interface ChecksumManifestResult {
  manifest_path: string;
  items: ChecksumItem[];
  total_files: number;
}

export class DeliverableArchiver {
  /**
   * Streams the file through SHA-256 in 1 MiB chunks so files larger than 2 GiB
   * (the Buffer limit of readFileSync) can be hashed.
   */
  static computeSha256(filePath: string): string {
    const hash = crypto.createHash('sha256');
    const fd = fs.openSync(filePath, 'r');
    try {
      const buf = Buffer.allocUnsafe(1024 * 1024);
      let n: number;
      while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
        hash.update(buf.subarray(0, n));
      }
    } finally {
      fs.closeSync(fd);
    }
    return hash.digest('hex');
  }

  /**
   * Generates a standard GNU-style SHA256SUMS.txt manifest in the delivery folder.
   */
  static generateChecksumManifest(deliveryDir: string): ChecksumManifestResult {
    const files = fs.readdirSync(deliveryDir).filter(f => f !== 'SHA256SUMS.txt');
    const items: ChecksumItem[] = [];

    const lines: string[] = [];

    for (const file of files.sort()) {
      const fullPath = path.join(deliveryDir, file);
      if (fs.statSync(fullPath).isDirectory()) continue;

      const hash = this.computeSha256(fullPath);
      const bytes = fs.statSync(fullPath).size;

      items.push({ filename: file, sha256: hash, bytes });
      lines.push(`${hash}  ${file}`);
    }

    const manifestPath = path.join(deliveryDir, 'SHA256SUMS.txt');
    fs.writeFileSync(manifestPath, lines.join('\n') + '\n', 'utf8');

    return {
      manifest_path: manifestPath,
      items,
      total_files: items.length
    };
  }

  /**
   * Cryptographically audits all deliverables listed in SHA256SUMS.txt.
   */
  static verifyChecksumManifest(manifestPath: string): {
    valid: boolean;
    verifiedCount: number;
    errors: string[];
  } {
    if (!fs.existsSync(manifestPath)) {
      return { valid: false, verifiedCount: 0, errors: [`Manifest not found at ${manifestPath}`] };
    }

    const dir = path.dirname(manifestPath);
    const content = fs.readFileSync(manifestPath, 'utf8');
    const lines = content.split('\n').map(l => l.trim()).filter(Boolean);

    const errors: string[] = [];
    let verifiedCount = 0;

    for (const line of lines) {
      const match = line.match(/^([a-f0-9]{64})\s+(.+)$/);
      if (!match) {
        errors.push(`Malformed manifest line: ${line}`);
        continue;
      }

      const [, expectedHash, filename] = match;
      let targetFile: string;
      try {
        // Reject entries such as ../../etc/passwd or absolute paths.
        targetFile = safeJoin(dir, filename);
      } catch {
        errors.push(`Manifest entry escapes delivery directory: ${filename}`);
        continue;
      }

      if (!fs.existsSync(targetFile)) {
        errors.push(`Missing deliverable file: ${filename}`);
        continue;
      }

      const actualHash = this.computeSha256(targetFile);
      if (actualHash !== expectedHash) {
        errors.push(`Checksum mismatch for ${filename}: expected ${expectedHash}, got ${actualHash}`);
      } else {
        verifiedCount++;
      }
    }

    return {
      valid: errors.length === 0,
      verifiedCount,
      errors
    };
  }
}

