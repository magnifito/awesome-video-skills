import fs from 'node:fs/promises';
import path from 'node:path';

export interface WatchlistQualification {
  framework_id: string;
  name: string;
  upstream_id: string;
  license_classification: {
    core_license: string;
    exporter_license?: string;
    component_licenses: Record<string, string>;
    redistribution_risk: 'low' | 'medium' | 'high';
  };
  runtime_requirements: {
    node_version: string;
    browser_dependency: string;
  };
  readiness_tier: 'candidate' | 'watchlist' | 'restricted';
  recommendation: string;
}

/** Adapter ids whose upstream repository id differs from the adapter id. */
const ADAPTER_UPSTREAM: Record<string, string> = {
  remotion: 'remotion-skills',
  html: 'noam-html-product-video',
};

/** Runtime notes are operational metadata, not license facts. Unknown adapters get 'unverified'. */
const RUNTIME: Record<string, { node_version: string; browser_dependency: string }> = {
  hyperframes: { node_version: 'Node >= 22', browser_dependency: 'None (SVG rasterizer + ffmpeg)' },
  html: { node_version: 'Node >= 22', browser_dependency: 'None (SVG rasterizer + ffmpeg)' },
  remotion: { node_version: 'Node >= 22', browser_dependency: 'Headless Chrome / React isolated worker' },
  revideo: { node_version: 'Node >= 22.12.0', browser_dependency: 'Puppeteer / Vite' },
  'motion-canvas': { node_version: 'Node >= 22 (pinned)', browser_dependency: 'Vite / Chromium canvas' },
};

const PERMISSIVE = /^(MIT|ISC|Apache-2\.0|BSD-2-Clause|BSD-3-Clause|0BSD|CC0-1\.0|OFL-1\.1|Unlicense|Zlib)$/i;
const COPYLEFT = /\b(A?GPL|LGPL|MPL|EUPL|CC-BY-SA)/i;
const RESTRICTIVE = /(NonCommercial|Reference-Only|Proprietary|Commercial|Company-License)/i;

type Risk = 'low' | 'medium' | 'high';

function licenseRisk(license: string): Risk {
  if (COPYLEFT.test(license) || /NonCommercial|Reference-Only/i.test(license)) return 'high';
  if (RESTRICTIVE.test(license) || !PERMISSIVE.test(license)) return 'medium';
  return 'low';
}

function maxRisk(a: Risk, b: Risk): Risk {
  const order: Risk[] = ['low', 'medium', 'high'];
  return order[Math.max(order.indexOf(a), order.indexOf(b))];
}

function componentLabel(upstreamId: string, key: string): string {
  // "packages/ffmpeg" in a monorepo maps to the npm scope "@<upstream>/ffmpeg".
  if (key.startsWith('packages/')) return `@${upstreamId}/${key.slice('packages/'.length)}`;
  return key;
}

export class WatchlistQualifier {
  /**
   * Derives a qualification from registry/capabilities.json and registry/upstreams.json.
   * Throws for adapters that are not registered or have no tracked upstream, so nothing is
   * cleared by default.
   */
  static async qualifyFramework(workspaceRoot: string, frameworkId: string): Promise<WatchlistQualification> {
    const capabilities = JSON.parse(await fs.readFile(path.join(workspaceRoot, 'registry', 'capabilities.json'), 'utf-8'));
    const upstreams = JSON.parse(await fs.readFile(path.join(workspaceRoot, 'registry', 'upstreams.json'), 'utf-8'));

    const adapter = capabilities.adapters.find((a: { id: string }) => a.id === frameworkId);
    if (!adapter) {
      throw new Error(`Framework '${frameworkId}' not found in registry/capabilities.json`);
    }

    const upstreamId = ADAPTER_UPSTREAM[frameworkId] ?? frameworkId;
    const upstream = (upstreams.repositories as Array<Record<string, unknown>>).find(r => r.id === upstreamId);
    if (!upstream) {
      throw new Error(`Framework '${frameworkId}' has no tracked upstream '${upstreamId}' in registry/upstreams.json`);
    }

    const coreLicense = String(upstream.license ?? 'UNKNOWN');
    const components = (upstream.component_licenses as Record<string, string> | undefined) ?? {};

    let risk = licenseRisk(coreLicense);
    let exporterLicense: string | undefined;
    const flagged: string[] = [];
    for (const [key, lic] of Object.entries(components)) {
      const r = licenseRisk(lic);
      risk = maxRisk(risk, r);
      if (r !== 'low') flagged.push(`${key}: ${lic}`);
      if (/ffmpeg|export/i.test(key)) exporterLicense = `${lic} (${componentLabel(upstreamId, key)})`;
    }

    const tier = String(adapter.tier ?? '');
    const status = String(adapter.status ?? '');
    let readiness: WatchlistQualification['readiness_tier'];
    if (tier === 'watchlist' || status === 'monitored') readiness = 'watchlist';
    else if (status === 'profile_only' || adapter.renderable === false || risk !== 'low') readiness = 'restricted';
    else readiness = 'candidate';

    const parts: string[] = [];
    if (readiness === 'watchlist') parts.push('Retain on watchlist until a concrete project justifies maintenance.');
    if (readiness === 'restricted') parts.push('Restricted: requires license and/or runtime qualification before production use.');
    if (readiness === 'candidate') parts.push('Candidate for production subject to sandbox qualification of the approved commit.');
    if (flagged.length) parts.push(`Component licensing alert: ${flagged.join('; ')}. Isolate these components from client deliveries.`);
    if (!PERMISSIVE.test(coreLicense)) parts.push(`Core license '${coreLicense}' is not a standard permissive license; legal review required.`);
    if (!upstream.approved_commit) parts.push('No approved upstream commit recorded.');

    return {
      framework_id: frameworkId,
      name: String(adapter.name),
      upstream_id: upstreamId,
      license_classification: {
        core_license: coreLicense,
        exporter_license: exporterLicense,
        component_licenses: components,
        redistribution_risk: risk
      },
      runtime_requirements: RUNTIME[frameworkId] ?? { node_version: 'unverified', browser_dependency: 'unverified' },
      readiness_tier: readiness,
      recommendation: parts.join(' ')
    };
  }
}
