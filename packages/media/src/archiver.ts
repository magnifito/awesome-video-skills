import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

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
  static computeSha256(filePath: string): string {
    const data = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(data).digest('hex');
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
      if (!match) continue;

      const [_, expectedHash, filename] = match;
      const targetFile = path.join(dir, filename);

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
