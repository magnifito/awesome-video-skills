import path from 'node:path';
import fs from 'node:fs';
import { runTool } from './proc.js';
import { DeliverableArchiver } from './archiver.js';

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
   * into an immutable .tar.gz production package ready for cold storage.
   */
  static createBundle(deliveryDir: string, options: BundleOptions = {}): BundleSummary {
    if (!fs.existsSync(deliveryDir)) {
      throw new Error(`Delivery directory not found: ${deliveryDir}`);
    }

    const defaultName = options.bundleName
      ? `${path.basename(options.bundleName, '.tar.gz')}.tar.gz`
      : `production-bundle-${Date.now()}.tar.gz`;
    const outBundlePath = options.outputBundlePath ?? path.join(deliveryDir, defaultName);

    // List all files inside deliveryDir (excluding existing bundles and hidden files)
    const filesToBundle: string[] = [];
    for (const entry of fs.readdirSync(deliveryDir).sort()) {
      if (entry.endsWith('.tar.gz') || entry.startsWith('.')) continue;
      filesToBundle.push(entry);
    }

    if (filesToBundle.length === 0) {
      throw new Error(`No deliverable files found in: ${deliveryDir}`);
    }

    // Argument array: no shell, so file names cannot inject commands.
    // "--" stops option parsing so an entry named "-x" is treated as a file.
    runTool('tar', ['-czf', outBundlePath, '-C', deliveryDir, '--', ...filesToBundle]);

    if (!fs.existsSync(outBundlePath)) {
      throw new Error(`Failed to create production bundle at: ${outBundlePath}`);
    }

    const bundleSha256 = DeliverableArchiver.computeSha256(outBundlePath);
    const bundleSizeBytes = fs.statSync(outBundlePath).size;

    const manifestPath = path.join(path.dirname(outBundlePath), `${path.basename(outBundlePath, '.tar.gz')}-summary.json`);
    const summaryData = {
      version: '1.0.0',
      created_at: new Date().toISOString(),
      bundle_file: path.basename(outBundlePath),
      bundle_sha256: bundleSha256,
      bundle_size_bytes: bundleSizeBytes,
      bundled_files: filesToBundle
    };

    fs.writeFileSync(manifestPath, JSON.stringify(summaryData, null, 2));

    return {
      bundlePath: outBundlePath,
      bundleSizeBytes,
      bundleSha256,
      bundledFiles: filesToBundle,
      manifestPath
    };
  }
}
