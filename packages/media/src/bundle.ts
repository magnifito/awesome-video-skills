import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

export interface BundleOptions {
  outputBundlePath?: string;
  bundleName?: string;
  includeRawAssets?: boolean;
}

export interface BundleSummary {
  bundlePath: string;
  bundleSizeBytes: number;
  bundleSha256: string;
  bundledFiles: string[];
  manifestPath: string;
}

export class ProductionBundleExporter {
  /**
   * Bundles validated deliverables, signed review records, license notices, and checksums
   * into an immutable .tar.gz production package ready for air or cold storage.
   */
  static createBundle(deliveryDir: string, options: BundleOptions = {}): BundleSummary {
    if (!fs.existsSync(deliveryDir)) {
      throw new Error(`Delivery directory not found: ${deliveryDir}`);
    }

    const defaultName = `production-bundle-${Date.now()}.tar.gz`;
    const outBundlePath = options.outputBundlePath ?? path.join(deliveryDir, defaultName);

    // List all files inside deliveryDir (excluding existing .tar.gz)
    const filesToBundle: string[] = [];
    const entries = fs.readdirSync(deliveryDir);
    for (const entry of entries) {
      if (entry.endsWith('.tar.gz') || entry.startsWith('.')) continue;
      filesToBundle.push(entry);
    }

    if (filesToBundle.length === 0) {
      throw new Error(`No deliverable files found in: ${deliveryDir}`);
    }

    // Use standard tar to compress
    const tarCmd = `tar -czf "${outBundlePath}" -C "${deliveryDir}" ${filesToBundle.map(f => `"${f}"`).join(' ')}`;
    execSync(tarCmd, { stdio: 'pipe' });

    if (!fs.existsSync(outBundlePath)) {
      throw new Error(`Failed to create production bundle at: ${outBundlePath}`);
    }

    const bundleBytes = fs.readFileSync(outBundlePath);
    const bundleSha256 = crypto.createHash('sha256').update(bundleBytes).digest('hex');

    const manifestPath = path.join(path.dirname(outBundlePath), `${path.basename(outBundlePath, '.tar.gz')}-summary.json`);
    const summaryData = {
      version: '1.0.0',
      created_at: new Date().toISOString(),
      bundle_file: path.basename(outBundlePath),
      bundle_sha256: bundleSha256,
      bundle_size_bytes: bundleBytes.length,
      bundled_files: filesToBundle
    };

    fs.writeFileSync(manifestPath, JSON.stringify(summaryData, null, 2));

    return {
      bundlePath: outBundlePath,
      bundleSizeBytes: bundleBytes.length,
      bundleSha256,
      bundledFiles: filesToBundle,
      manifestPath
    };
  }
}

