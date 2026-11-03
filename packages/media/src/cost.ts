import { parseDateStrict } from './proc.js';
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
  /** Which line items are measured from the run and which are flat estimates. */
  basis: {
    render_compute_usd: 'measured_wall_clock';
    storage_usd: 'measured_output_bytes';
    agent_usage_usd: 'flat_estimate' | 'reported';
    external_media_usd: 'reported';
  };
}

export interface RunCostInputs {
  /** Actual agent/LLM spend for this run, if known (e.g. from a billing export). */
  agentUsageUsd?: number;
  /** Actual paid media/API spend for this run (stock footage, TTS, etc). Default 0. */
  externalMediaUsd?: number;
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
    isFirstProjectForClient = false,
    inputs: RunCostInputs = {}
  ): CostBreakdown {
    const started = parseDateStrict(result.started_at, 'started_at').getTime();
    const completed = parseDateStrict(result.completed_at, 'completed_at').getTime();
    const elapsedComputeSeconds = Math.max(1.0, (completed - started) / 1000);

    const computeCost = Math.round(elapsedComputeSeconds * this.COMPUTE_RATE_PER_SECOND * 1000) / 1000;

    const totalOutputBytes = result.output_files.reduce((acc, f) => acc + f.size_bytes, 0);
    const storageMb = totalOutputBytes / (1024 * 1024);
    const storageCost = Math.round(storageMb * this.STORAGE_RATE_PER_MB_MONTH * 1000) / 1000;

    // Media spend is whatever the caller reports; this toolkit itself makes no paid media calls.
    const mediaCost = Math.round((inputs.externalMediaUsd ?? 0) * 100) / 100;
    // Without reported usage, agent cost is a flat per-run estimate and is labelled as such.
    const agentReported = inputs.agentUsageUsd !== undefined;
    const agentCost = agentReported
      ? Math.round(inputs.agentUsageUsd! * 100) / 100
      : this.BASE_AGENT_DISPATCH_COST;
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
      budget_warnings: warnings,
      basis: {
        render_compute_usd: 'measured_wall_clock',
        storage_usd: 'measured_output_bytes',
        agent_usage_usd: agentReported ? 'reported' : 'flat_estimate',
        external_media_usd: 'reported'
      }
    };
  }
}

