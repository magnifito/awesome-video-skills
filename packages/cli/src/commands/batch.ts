import fs from 'node:fs/promises';
import path from 'node:path';
import { runInit } from './init.js';
import { runRender } from './render.js';
import { runValidate } from './validate.js';

export interface CatalogItem {
  sku: string;
  title: string;
  price: number;
  discount_percent: number;
  in_stock: boolean;
  image_asset?: string | null;
  status: string;
}

export interface CatalogBatchFile {
  batch_id: string;
  client_id: string;
  currency: string;
  items: CatalogItem[];
}

export interface BatchItemResult {
  sku: string;
  title: string;
  status: 'rendered' | 'cached' | 'skipped_out_of_stock' | 'failed';
  run_id?: string;
  output_path?: string;
  output_hash?: string;
  error?: string;
}

export interface BatchReport {
  batch_id: string;
  total_items: number;
  rendered: number;
  cached: number;
  skipped: number;
  failed: number;
  items: BatchItemResult[];
}

export async function runBatchCommerce(catalogFilePath: string, options?: { force?: boolean }): Promise<BatchReport> {
  const catalogDir = path.dirname(path.resolve(process.cwd(), catalogFilePath));
  const catalogData: CatalogBatchFile = JSON.parse(await fs.readFile(catalogFilePath, 'utf-8'));

  const itemsResults: BatchItemResult[] = [];
  const batchRunsDir = path.join(catalogDir, 'runs', catalogData.batch_id);
  await fs.mkdir(batchRunsDir, { recursive: true });

  for (const item of catalogData.items) {
    if (!item.in_stock) {
      itemsResults.push({
        sku: item.sku,
        title: item.title,
        status: 'skipped_out_of_stock'
      });
      continue;
    }

    const skuDir = path.join(batchRunsDir, item.sku);

    try {
      // 1. Initialize SKU workspace if needed
      await runInit(skuDir, {
        projectId: `${catalogData.batch_id}-${item.sku}`,
        clientId: catalogData.client_id,
        workflow: 'commerce-variants',
        language: 'en',
        duration: 15
      });

      // Update claims with price & discount
      const claimsPath = path.join(skuDir, 'claims.json');
      const discountText = item.discount_percent > 0 ? `Save ${item.discount_percent}% today!` : 'Best everyday price';
      const priceText = `${catalogData.currency} ${item.price.toFixed(2)}`;

      const skuClaims = {
        schema_version: '1.0.0',
        revision: 'rev-batch-1',
        claims: [
          {
            claim_id: `claim-${item.sku}-title`,
            approved_wording: item.title,
            evidence_source: 'Product Master Catalog 2026',
            owner: 'Catalog Merchandiser',
            locale: 'en'
          },
          {
            claim_id: `claim-${item.sku}-offer`,
            approved_wording: `${priceText} - ${discountText}`,
            evidence_source: 'Retail Price Register 2026',
            owner: 'Commercial Director',
            locale: 'en'
          }
        ]
      };
      await fs.writeFile(claimsPath, JSON.stringify(skuClaims, null, 2), 'utf-8');

      // Update scene plan
      const scenePlanPath = path.join(skuDir, 'scene-plan.json');
      const skuScenePlan = {
        schema_version: '1.0.0',
        plan_revision: 'rev-batch-1',
        renderer: 'hyperframes',
        timing_authority: 'template',
        scenes: [
          {
            scene_id: 'scene-01-title',
            factual_purpose: 'Show product title',
            duration_seconds: 5.0,
            duration_frames: 150,
            copy_text: item.title,
            claims_refs: [`claim-${item.sku}-title`],
            asset_refs: ['brand-logo'],
            visual_recipe: 'kinetic-typography',
            audio_events: []
          },
          {
            scene_id: 'scene-02-offer',
            factual_purpose: 'Show verified price and discount',
            duration_seconds: 5.0,
            duration_frames: 150,
            copy_text: `${priceText} - ${discountText}`,
            claims_refs: [`claim-${item.sku}-offer`],
            asset_refs: [],
            visual_recipe: 'retail-card',
            audio_events: []
          },
          {
            scene_id: 'scene-03-cta',
            factual_purpose: 'Call to action',
            duration_seconds: 5.0,
            duration_frames: 150,
            copy_text: 'Order now with express delivery',
            claims_refs: [],
            asset_refs: ['brand-logo'],
            visual_recipe: 'retail-card',
            audio_events: []
          }
        ]
      };
      await fs.writeFile(scenePlanPath, JSON.stringify(skuScenePlan, null, 2), 'utf-8');

      // 2. Render SKU video
      const renderRes = await runRender(skuDir, { format: '9:16', force: options?.force });

      // 3. Validate SKU render
      const valRes = await runValidate(renderRes.run_id, skuDir);
      if (!valRes.passed) {
        itemsResults.push({
          sku: item.sku,
          title: item.title,
          status: 'failed',
          run_id: renderRes.run_id,
          error: `Validation failed: ${valRes.unresolved_review_items.join('; ')}`
        });
      } else {
        itemsResults.push({
          sku: item.sku,
          title: item.title,
          status: renderRes.status === 'cached' ? 'cached' : 'rendered',
          run_id: renderRes.run_id,
          output_path: renderRes.output_files[0]?.path,
          output_hash: renderRes.output_files[0]?.hash
        });
      }
    } catch (err) {
      itemsResults.push({
        sku: item.sku,
        title: item.title,
        status: 'failed',
        error: (err as Error).message
      });
    }
  }

  const report: BatchReport = {
    batch_id: catalogData.batch_id,
    total_items: catalogData.items.length,
    rendered: itemsResults.filter(i => i.status === 'rendered').length,
    cached: itemsResults.filter(i => i.status === 'cached').length,
    skipped: itemsResults.filter(i => i.status === 'skipped_out_of_stock').length,
    failed: itemsResults.filter(i => i.status === 'failed').length,
    items: itemsResults
  };

  const reportPath = path.join(batchRunsDir, 'batch-report.json');
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  return report;
}

