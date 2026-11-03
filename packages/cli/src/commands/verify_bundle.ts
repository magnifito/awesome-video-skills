import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { SIGNING_KEY_ENV, signContent, signaturesEqual } from './_shared.js';

export interface BundleVerificationResult {
  bundlePath: string;
  valid: boolean;
  verifiedFilesCount: number;
  hasSignedReview: boolean;
  signatureStatus: 'valid' | 'invalid' | 'missing' | 'unsigned';
  errors: string[];
}

export interface VerifyBundleOptions {
  /** Accept bundles whose signature cannot be checked because no signing key is configured. */
  allowUnsigned?: boolean;
}

/** Recursively lists every regular file under dir, relative to dir, using forward slashes. */
function listFiles(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      // Symlinks could point outside the extraction directory; report them as files so they fail the listing check.
      out.push(path.relative(base, full).split(path.sep).join('/'));
    } else if (entry.isDirectory()) {
      out.push(...listFiles(full, base));
    } else if (entry.isFile()) {
      out.push(path.relative(base, full).split(path.sep).join('/'));
    }
  }
  return out;
}

/** Returns the resolved path if it stays inside root, otherwise null. */
function containedPath(root: string, rel: string): string | null {
  const target = path.resolve(root, rel);
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return target;
}

export async function runVerifyBundle(
  bundlePath: string,
  options: VerifyBundleOptions = {}
): Promise<BundleVerificationResult> {
  const resolvedBundle = path.resolve(process.cwd(), bundlePath);
  if (!fs.existsSync(resolvedBundle)) {
    throw new Error(`Bundle file not found: ${resolvedBundle}`);
  }

  const tempExtractDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mgvideo-bundle-verify-'));
  const errors: string[] = [];
  let verifiedCount = 0;
  let hasSignedReview = false;
  let signatureStatus: BundleVerificationResult['signatureStatus'] = 'missing';

  try {
    // Reject archives containing absolute or parent-relative member names before extracting.
    const members = execFileSync('tar', ['-tzf', resolvedBundle], { stdio: 'pipe' })
      .toString()
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);
    for (const m of members) {
      if (path.isAbsolute(m) || m.split(/[\\/]/).includes('..')) {
        throw new Error(`Bundle contains unsafe entry path: ${m}`);
      }
    }

    execFileSync('tar', ['-xzf', resolvedBundle, '-C', tempExtractDir], { stdio: 'pipe' });

    const sumsPath = path.join(tempExtractDir, 'SHA256SUMS.txt');
    const listed = new Set<string>();
    if (!fs.existsSync(sumsPath)) {
      errors.push('Missing SHA256SUMS.txt in production bundle.');
    } else {
      const sumsContent = fs.readFileSync(sumsPath);

      // Detached signature over SHA256SUMS.txt (HMAC-SHA256 with the delivery signing key).
      const sigPath = path.join(tempExtractDir, 'SHA256SUMS.sig');
      const expectedSig = signContent(sumsContent);
      if (!fs.existsSync(sigPath)) {
        // A bundle packaged without a signing key has no signature file; only --allow-unsigned accepts it.
        if (options.allowUnsigned) {
          signatureStatus = 'unsigned';
        } else {
          signatureStatus = 'missing';
          errors.push('Missing SHA256SUMS.sig: bundle is not signed.');
        }
      } else if (expectedSig === null) {
        signatureStatus = 'unsigned';
        if (!options.allowUnsigned) {
          errors.push(`UNSIGNED: ${SIGNING_KEY_ENV} is not set, so the bundle signature cannot be verified.`);
        }
      } else if (signaturesEqual(fs.readFileSync(sigPath, 'utf8'), expectedSig)) {
        signatureStatus = 'valid';
      } else {
        signatureStatus = 'invalid';
        errors.push('Signature mismatch: SHA256SUMS.txt was modified or signed with a different key.');
      }

      const lines = sumsContent.toString('utf8').trim().split('\n').filter(Boolean);
      for (const line of lines) {
        const match = /^([0-9a-f]{64})\s+\*?(.+)$/.exec(line.trim());
        if (!match) {
          errors.push(`Malformed checksum line: ${line}`);
          continue;
        }
        const [, expectedHash, fileName] = match;
        const filePath = containedPath(tempExtractDir, fileName);
        if (!filePath) {
          errors.push(`Checksum entry escapes bundle root: ${fileName}`);
          continue;
        }
        listed.add(path.relative(tempExtractDir, filePath).split(path.sep).join('/'));

        if (!fs.existsSync(filePath) || !fs.lstatSync(filePath).isFile()) {
          errors.push(`File listed in SHA256SUMS.txt is missing from bundle: ${fileName}`);
          continue;
        }

        const actualHash = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
        if (actualHash !== expectedHash) {
          errors.push(`Checksum mismatch for file "${fileName}": expected ${expectedHash}, got ${actualHash}`);
        } else {
          verifiedCount++;
        }
      }

      // Every extracted file except the manifest and its signature must be covered by the manifest.
      for (const rel of listFiles(tempExtractDir)) {
        if (rel === 'SHA256SUMS.txt' || rel === 'SHA256SUMS.sig') continue;
        if (!listed.has(rel)) {
          errors.push(`File not covered by SHA256SUMS.txt: ${rel}`);
        }
        const full = path.join(tempExtractDir, rel);
        if (fs.lstatSync(full).isSymbolicLink()) {
          errors.push(`Symbolic link not allowed in bundle: ${rel}`);
        }
      }
    }

    // A signed, approved review record is mandatory.
    const reviewPath = path.join(tempExtractDir, 'review-record.json');
    if (!fs.existsSync(reviewPath)) {
      errors.push('Missing review-record.json: delivery has no human approval record.');
    } else if (!listed.has('review-record.json')) {
      errors.push('review-record.json is not covered by SHA256SUMS.txt.');
    } else {
      try {
        const reviewData = JSON.parse(fs.readFileSync(reviewPath, 'utf8'));
        if (reviewData.decision !== 'approved') {
          errors.push(`Review record decision is not approved: ${reviewData.decision}`);
        } else {
          hasSignedReview = signatureStatus === 'valid' || (signatureStatus === 'unsigned' && !!options.allowUnsigned);
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
      signatureStatus,
      errors
    };
  } finally {
    fs.rmSync(tempExtractDir, { recursive: true, force: true });
  }
}
