import fs from 'node:fs';
import path from 'node:path';
import {
  ProjectBriefSchema,
  BrandProfileSchema,
  type ProjectBrief,
  type BrandProfile
} from './index.js';

export interface MigrationChange {
  file: string;
  field: string;
  action: 'added_default' | 'normalized_value' | 'migrated_version';
  value: unknown;
}

export interface MigrationSummary {
  project_id: string;
  previous_version: string;
  target_version: string;
  changes: MigrationChange[];
  success: boolean;
}

export class ContractMigrator {
  static readonly CURRENT_SCHEMA_VERSION = '1.0.0';

  static migrateProject(projectDir: string): MigrationSummary {
    const briefPath = path.join(projectDir, 'brief.json');
    if (!fs.existsSync(briefPath)) {
      throw new Error(`Cannot migrate project: brief.json not found in ${projectDir}`);
    }

    const rawBrief = JSON.parse(fs.readFileSync(briefPath, 'utf8'));
    const previousVersion = rawBrief.schema_version || '0.9.0';
    const changes: MigrationChange[] = [];

    // Ensure budgets object and zero-budget media policy default
    if (!rawBrief.budgets) {
      rawBrief.budgets = {
        agent_budget_usd: 10.0,
        compute_budget_usd: 10.0,
        media_budget_usd: 0.00,
        max_retries: 3
      };
      changes.push({
        file: 'brief.json',
        field: 'budgets',
        action: 'added_default',
        value: rawBrief.budgets
      });
    } else if (rawBrief.budgets.media_budget_usd === undefined) {
      rawBrief.budgets.media_budget_usd = 0.00;
      changes.push({
        file: 'brief.json',
        field: 'budgets.media_budget_usd',
        action: 'added_default',
        value: 0.00
      });
    }

    // Ensure language default
    if (!rawBrief.language) {
      rawBrief.language = 'en';
      changes.push({
        file: 'brief.json',
        field: 'language',
        action: 'added_default',
        value: 'en'
      });
    }

    // Upgrade schema version
    if (rawBrief.schema_version !== this.CURRENT_SCHEMA_VERSION) {
      rawBrief.schema_version = this.CURRENT_SCHEMA_VERSION;
      changes.push({
        file: 'brief.json',
        field: 'schema_version',
        action: 'migrated_version',
        value: this.CURRENT_SCHEMA_VERSION
      });
    }

    // Validate brief
    const validatedBrief = ProjectBriefSchema.parse(rawBrief);
    fs.writeFileSync(briefPath, JSON.stringify(validatedBrief, null, 2), 'utf8');

    // Migrate brand profile if exists
    const brandPath = path.join(projectDir, 'brand.json');
    if (fs.existsSync(brandPath)) {
      const rawBrand = JSON.parse(fs.readFileSync(brandPath, 'utf8'));
      if (rawBrand.schema_version !== this.CURRENT_SCHEMA_VERSION) {
        rawBrand.schema_version = this.CURRENT_SCHEMA_VERSION;
        changes.push({
          file: 'brand.json',
          field: 'schema_version',
          action: 'migrated_version',
          value: this.CURRENT_SCHEMA_VERSION
        });
      }
      const validatedBrand = BrandProfileSchema.parse(rawBrand);
      fs.writeFileSync(brandPath, JSON.stringify(validatedBrand, null, 2), 'utf8');
    }

    return {
      project_id: validatedBrief.project_id,
      previous_version: previousVersion,
      target_version: this.CURRENT_SCHEMA_VERSION,
      changes,
      success: true
    };
  }
}
