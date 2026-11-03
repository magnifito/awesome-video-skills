import path from 'node:path';
import fs from 'node:fs';
import { runDoctor } from './doctor.js';
import { runCatalog } from './catalog.js';

export interface DashboardWorkflowStatus {
  name: string;
  id: string;
  format: string;
  hasRuns: boolean;
  hasDelivery: boolean;
}

export interface DashboardStatus {
  timestamp: string;
  doctorPassed: boolean;
  trackedReposCount: number;
  workflows: DashboardWorkflowStatus[];
  /** True when every fixture brief declares a zero external media budget. */
  mediaBudgetZeroEnforced: boolean;
}

export async function runDashboard(workspaceRoot: string = process.cwd()): Promise<DashboardStatus> {
  const doctorReport = await runDoctor();
  const catalog = await runCatalog(workspaceRoot);
  const repos = Array.isArray(catalog.repositories) ? catalog.repositories : [];

  const fixtureWorkflows = [
    { id: 'promo-bulgarian-15s', name: 'Branded Promo (Bulgarian 15s Cyrillic)', format: '9:16' },
    { id: 'product-demo-saas', name: 'SaaS Product Demo Tour', format: '16:9' },
    { id: 'talking-head-edit', name: 'Talking-Head Interview Cut', format: '16:9' },
    { id: 'commerce-batch', name: 'Multi-SKU Dynamic Commerce Batch', format: '9:16' },
    { id: 'multilingual-explainer', name: 'Multilingual Explainer (EN/BG)', format: '16:9' }
  ];

  const workflows: DashboardWorkflowStatus[] = [];
  let allZeroBudget = true;
  for (const wf of fixtureWorkflows) {
    const projDir = path.join(workspaceRoot, 'fixtures', wf.id);
    const briefPath = path.join(projDir, 'brief.json');
    if (fs.existsSync(briefPath)) {
      try {
        const brief = JSON.parse(fs.readFileSync(briefPath, 'utf8'));
        if (brief?.budgets?.media_budget_usd !== 0) allZeroBudget = false;
      } catch {
        allZeroBudget = false;
      }
    }
    const hasRuns = fs.existsSync(path.join(projDir, 'runs'));
    const hasDelivery = fs.existsSync(path.join(projDir, 'delivery'));
    workflows.push({
      id: wf.id,
      name: wf.name,
      format: wf.format,
      hasRuns,
      hasDelivery
    });
  }

  return {
    timestamp: new Date().toISOString(),
    doctorPassed: doctorReport.passed,
    trackedReposCount: repos.length,
    workflows,
    mediaBudgetZeroEnforced: allZeroBudget
  };
}
