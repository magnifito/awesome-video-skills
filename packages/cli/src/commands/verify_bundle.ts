import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';

export interface BundleVerificationResult {
  bundlePath: string;
  valid: boolean;
  verifiedFilesCount: number;
  hasSignedReview: boolean;
  errors: string[];
}

export async function runVerifyBundle(bundlePath: string): Promise<BundleVerificationResult> {
  const resolvedBundle = path.resolve(process.cwd(), bundlePath);
  if (!fs.existsSync(resolvedBundle)) {
    throw new Error(`Bundle file not found: ${resolvedBundle}`);
  }

  const tempExtractDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mgvideo-bundle-verify-'));
  const errors: string[] = [];
  let verifiedCount = 0;
  let hasSignedReview = false;

  try {
    // Unpack tarball
    execSync(`tar -xzf "${resolvedBundle}" -C "${tempExtractDir}"`, { stdio: 'pipe' });

    const sumsPath = path.join(tempExtractDir, 'SHA256SUMS.txt');
    if (!fs.existsSync(sumsPath)) {
      errors.push('Missing SHA256SUMS.txt in production bundle.');
    } else {
      const sumsContent = fs.readFileSync(sumsPath, 'utf8');
      const lines = sumsContent.trim().split('\n').filter(Boolean);

      for (const line of lines) {
        const [expectedHash, ...filenameParts] = line.trim().split(/\s+/);
        const fileName = filenameParts.join(' ');
        const filePath = path.join(tempExtractDir, fileName);

        if (!fs.existsSync(filePath)) {
          errors.push(`Bundled file missing from manifest: ${fileName}`);
          continue;
        }

        const actualHash = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
        if (actualHash !== expectedHash) {
          errors.push(`Checksum mismatch for file "${fileName}": expected ${expectedHash}, got ${actualHash}`);
        } else {
          verifiedCount++;
        }
      }
    }

    // Verify review record if present
    const reviewPath = path.join(tempExtractDir, 'review-record.json');
    if (fs.existsSync(reviewPath)) {
      try {
        const reviewData = JSON.parse(fs.readFileSync(reviewPath, 'utf8'));
        if (reviewData.decision === 'approved') {
          hasSignedReview = true;
        } else {
          errors.push(`Review record decision is not approved: ${reviewData.decision}`);
        }
      } catch {
        errors.push('Invalid JSON in bundled review-record.json');
      }
    }

    return {
      bundlePath: resolvedBundle,
      valid: errors.length === 0,
      verifiedFilesCount: verifiedCount,
      hasSignedReview,
      errors
    };
  } finally {
    fs.rmSync(tempExtractDir, { recursive: true, force: true });
  }
}

