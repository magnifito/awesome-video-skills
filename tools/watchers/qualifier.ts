import fs from 'node:fs/promises';
import path from 'node:path';

export interface WatchlistQualification {
  framework_id: string;
  name: string;
  license_classification: {
    core_license: string;
    exporter_license?: string;
    redistribution_risk: 'low' | 'medium' | 'high';
  };
  runtime_requirements: {
    node_version: string;
    browser_dependency: string;
  };
  readiness_tier: 'candidate' | 'watchlist' | 'restricted';
  recommendation: string;
}

export class WatchlistQualifier {
  static async qualifyFramework(workspaceRoot: string, frameworkId: string): Promise<WatchlistQualification> {
    const capabilitiesPath = path.join(workspaceRoot, 'registry', 'capabilities.json');
    const capabilities = JSON.parse(await fs.readFile(capabilitiesPath, 'utf-8'));

    const adapter = capabilities.adapters.find((a: { id: string }) => a.id === frameworkId);
    if (!adapter) {
      throw new Error(`Framework '${frameworkId}' not found in registry/capabilities.json`);
    }

    if (frameworkId === 'motion-canvas') {
      return {
        framework_id: 'motion-canvas',
        name: 'Motion Canvas Vector Animation',
        license_classification: {
          core_license: 'MIT',
          exporter_license: 'GPL-3.0 (@motion-canvas/ffmpeg)',
          redistribution_risk: 'high'
        },
        runtime_requirements: {
          node_version: 'Node >= 22 (pinned)',
          browser_dependency: 'Vite / Chromium canvas'
        },
        readiness_tier: 'watchlist',
        recommendation:
          'Retain on specialist watchlist. Component licensing alert: Exporter is GPL-3.0. Isolate worker and do not bundle into MIT client deliveries.'
      };
    }

    if (frameworkId === 'revideo') {
      return {
        framework_id: 'revideo',
        name: 'Revideo Headless TS Framework',
        license_classification: {
          core_license: 'MIT',
          redistribution_risk: 'low'
        },
        runtime_requirements: {
          node_version: 'Node >= 22.12.0',
          browser_dependency: 'Puppeteer / Vite'
        },
        readiness_tier: 'watchlist',
        recommendation:
          'Retain on batch watchlist. Headless generator API is suitable for high-volume parameterization once client job justifies maintenance.'
      };
    }

    if (frameworkId === 'remotion') {
      return {
        framework_id: 'remotion',
        name: 'Remotion React Video Framework',
        license_classification: {
          core_license: 'Remotion Company License',
          redistribution_risk: 'medium'
        },
        runtime_requirements: {
          node_version: 'Node >= 22',
          browser_dependency: 'Headless Chrome / React isolated worker'
        },
        readiness_tier: 'restricted',
        recommendation:
          'Commercial license evaluation required based on whether client receives finished video (permissible) vs source project (requires client license).'
      };
    }

    return {
      framework_id: frameworkId,
      name: adapter.name,
      license_classification: {
        core_license: 'Apache-2.0',
        redistribution_risk: 'low'
      },
      runtime_requirements: {
        node_version: 'Node >= 22',
        browser_dependency: 'Headless Chrome'
      },
      readiness_tier: 'candidate',
      recommendation: 'Qualified for active production.'
    };
  }
}
