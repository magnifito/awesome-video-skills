import type { ProjectBrief } from '../../contracts/src/index.js';
import { parseDateStrict, requirePositive } from './proc.js';

export type SlaStatus = 'on_schedule' | 'at_risk' | 'breached' | 'delivered';

export interface SlaEvaluation {
  projectId: string;
  targetTurnaroundHours: number;
  elapsedHours: number;
  remainingHours: number;
  status: SlaStatus;
  percentElapsed: number;
  deadlineIso: string;
}

export class DeliverySlaTracker {
  /**
   * Evaluates project delivery progress against SLA deadlines.
   */
  static evaluateSla(
    brief: ProjectBrief,
    startedAtIso: string,
    completedAtIso?: string,
    targetTurnaroundHours = 24
  ): SlaEvaluation {
    requirePositive(targetTurnaroundHours, 'targetTurnaroundHours');
    const started = parseDateStrict(startedAtIso, 'startedAtIso').getTime();
    const targetMs = targetTurnaroundHours * 3600 * 1000;
    const deadlineMs = started + targetMs;
    const deadlineIso = new Date(deadlineMs).toISOString();

    const endMs = completedAtIso ? parseDateStrict(completedAtIso, 'completedAtIso').getTime() : Date.now();
    const elapsedMs = Math.max(0, endMs - started);
    const elapsedHours = parseFloat((elapsedMs / (3600 * 1000)).toFixed(2));
    const remainingMs = deadlineMs - endMs;
    const remainingHours = parseFloat((remainingMs / (3600 * 1000)).toFixed(2));
    const percentElapsed = Math.min(100, parseFloat(((elapsedMs / targetMs) * 100).toFixed(1)));

    let status: SlaStatus = 'on_schedule';
    if (completedAtIso) {
      status = endMs <= deadlineMs ? 'delivered' : 'breached';
    } else if (remainingHours <= 0) {
      status = 'breached';
    } else if (remainingHours <= 4) {
      status = 'at_risk';
    }

    return {
      projectId: brief.project_id,
      targetTurnaroundHours,
      elapsedHours,
      remainingHours,
      status,
      percentElapsed,
      deadlineIso
    };
  }
}

