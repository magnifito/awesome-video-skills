import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { AssetManifest, AssetManifestItem } from '../../contracts/src/index.js';

export interface AssetAuditResult {
  asset_id: string;
  file_path: string;
  expected_hash: string;
  actual_hash?: string;
  passed: boolean;
  status: AssetManifestItem['status'];
  rights_cleared: boolean;
  error?: string;
}

export interface AssetManifestAuditReport {
  valid: boolean;
  total_assets: number;
  verified_assets: number;
  errors: string[];
  results: AssetAuditResult[];
}

export class AssetAuditor {
  static computeSha256(filePath: string): string {
    const data = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  static auditManifest(projectDir: string, manifest?: AssetManifest): AssetManifestAuditReport {
    const manifestPath = path.join(projectDir, 'manifest.json');
    let loadedManifest: AssetManifest;

    if (manifest) {
      loadedManifest = manifest;
    } else {
      if (!fs.existsSync(manifestPath)) {
        return {
          valid: true,
          total_assets: 0,
          verified_assets: 0,
          errors: [],
          results: []
        };
      }
      loadedManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    }

    const results: AssetAuditResult[] = [];
    const errors: string[] = [];
    let verifiedCount = 0;

    for (const item of loadedManifest.assets) {
      const resolvedPath = path.isAbsolute(item.local_path)
        ? item.local_path
        : path.resolve(projectDir, item.local_path);

      if (!fs.existsSync(resolvedPath)) {
        const err = `Asset file missing: ${item.local_path} (asset_id: ${item.asset_id})`;
        errors.push(err);
        results.push({
          asset_id: item.asset_id,
          file_path: item.local_path,
          expected_hash: item.content_hash,
          passed: false,
          status: item.status,
          rights_cleared: item.consent_obtained && item.status === 'approved',
          error: err
        });
        continue;
      }

      const actualHash = this.computeSha256(resolvedPath);
      const expectedNormalized = item.content_hash.replace(/^sha256:/i, '').toLowerCase();
      const actualNormalized = actualHash.toLowerCase();

      const hashMatches = actualNormalized === expectedNormalized;
      const rightsCleared = item.consent_obtained && item.status === 'approved';

      let errorMsg: string | undefined;
      if (!hashMatches) {
        errorMsg = `Checksum mismatch for asset ${item.asset_id}: expected ${item.content_hash}, got sha256:${actualHash}`;
        errors.push(errorMsg);
      } else if (!rightsCleared) {
        errorMsg = `Asset rights unverified for ${item.asset_id} (status: ${item.status}, consent: ${item.consent_obtained})`;
        errors.push(errorMsg);
      } else {
        verifiedCount++;
      }

      results.push({
        asset_id: item.asset_id,
        file_path: item.local_path,
        expected_hash: item.content_hash,
        actual_hash: `sha256:${actualHash}`,
        passed: hashMatches && rightsCleared,
        status: item.status,
        rights_cleared: rightsCleared,
        error: errorMsg
      });
    }

    return {
      valid: errors.length === 0,
      total_assets: loadedManifest.assets.length,
      verified_assets: verifiedCount,
      errors,
      results
    };
  }
}
