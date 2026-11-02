import type { ProjectBrief, RenderResult } from '../../contracts/src/index.js';

export interface CostBreakdown {
  project_id: string;
  run_id: string;
  currency: string;
  items: {
    agent_usage_usd: number;
    render_compute_usd: number;
    external_media_usd: number;
    storage_usd: number;
    one_time_brand_setup_usd: number;
  };
  total_cost_usd: number;
  budget_limits: {
    agent_budget_usd: number;
    compute_budget_usd: number;
    media_budget_usd: number;
  };
  within_budget: boolean;
  budget_warnings: string[];
}

export class CostTracker {
  // Rates per production standard
  static readonly COMPUTE_RATE_PER_SECOND = 0.001; // $0.06 / min
  static readonly STORAGE_RATE_PER_MB_MONTH = 0.00002;
  static readonly DEFAULT_BRAND_SETUP_ESTIMATE = 15.0; // One-time setup
  static readonly BASE_AGENT_DISPATCH_COST = 0.25;

  static calculateRunCost(
    brief: ProjectBrief,
    result: RenderResult,
    isFirstProjectForClient = false
  ): CostBreakdown {
    const elapsedComputeSeconds = Math.max(
      1.0,
      (new Date(result.completed_at).getTime() - new Date(result.started_at).getTime()) / 1000
    );

    const computeCost = Math.round(elapsedComputeSeconds * this.COMPUTE_RATE_PER_SECOND * 1000) / 1000;

    const totalOutputBytes = result.output_files.reduce((acc, f) => acc + f.size_bytes, 0);
    const storageMb = totalOutputBytes / (1024 * 1024);
    const storageCost = Math.round(storageMb * this.STORAGE_RATE_PER_MB_MONTH * 1000) / 1000;

    const mediaCost = 0.0; // Kept strictly zero-budget
    const agentCost = Math.round(this.BASE_AGENT_DISPATCH_COST * (result.logs.length > 5 ? 1.5 : 1.0) * 100) / 100;
    const brandSetupCost = isFirstProjectForClient ? this.DEFAULT_BRAND_SETUP_ESTIMATE : 0.0;

    const total = Math.round((computeCost + storageCost + mediaCost + agentCost + brandSetupCost) * 100) / 100;

    const warnings: string[] = [];
    if (agentCost > brief.budgets.agent_budget_usd) {
      warnings.push(`Agent cost ($${agentCost}) exceeds approved budget ($${brief.budgets.agent_budget_usd})`);
    }
    if (computeCost > brief.budgets.compute_budget_usd) {
      warnings.push(`Compute cost ($${computeCost}) exceeds approved budget ($${brief.budgets.compute_budget_usd})`);
    }
    if (mediaCost > brief.budgets.media_budget_usd) {
      warnings.push(`Media API cost ($${mediaCost}) exceeds approved budget ($${brief.budgets.media_budget_usd})`);
    }

    return {
      project_id: brief.project_id,
      run_id: result.run_id,
      currency: 'USD',
      items: {
        agent_usage_usd: agentCost,
        render_compute_usd: computeCost,
        external_media_usd: mediaCost,
        storage_usd: storageCost,
        one_time_brand_setup_usd: brandSetupCost
      },
      total_cost_usd: total,
      budget_limits: {
        agent_budget_usd: brief.budgets.agent_budget_usd,
        compute_budget_usd: brief.budgets.compute_budget_usd,
        media_budget_usd: brief.budgets.media_budget_usd
      },
      within_budget: warnings.length === 0,
      budget_warnings: warnings
    };
  }
}

