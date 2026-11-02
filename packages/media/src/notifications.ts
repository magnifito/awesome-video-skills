export type PipelineEventType =
  | 'render.started'
  | 'render.completed'
  | 'validation.passed'
  | 'validation.failed'
  | 'package.approved';

export interface NotificationPayload {
  event: PipelineEventType;
  timestamp: string;
  project_id: string;
  summary: string;
  color_hex: string;
  fields: Array<{ title: string; value: string; short?: boolean }>;
}

export class NotificationDispatcher {
  /**
   * Generates a deterministic, platform-agnostic notification payload suitable for Webhooks, Slack, or Discord.
   */
  static formatEvent(
    event: PipelineEventType,
    projectId: string,
    metadata: {
      durationSeconds?: number;
      resolution?: string;
      costUsd?: number;
      reviewer?: string;
      error?: string;
      sha256?: string;
    } = {}
  ): NotificationPayload {
    const timestamp = new Date().toISOString();
    let summary = '';
    let colorHex = '#3B82F6';
    const fields: NotificationPayload['fields'] = [
      { title: 'Project', value: projectId, short: true },
      { title: 'Event', value: event, short: true }
    ];

    switch (event) {
      case 'render.started':
        summary = `🎬 Render initiated for project "${projectId}"`;
        colorHex = '#3B82F6'; // Blue
        break;

      case 'render.completed':
        summary = `✅ Render completed successfully for project "${projectId}"`;
        colorHex = '#10B981'; // Green
        if (metadata.resolution) fields.push({ title: 'Resolution', value: metadata.resolution, short: true });
        if (metadata.durationSeconds !== undefined) fields.push({ title: 'Duration', value: `${metadata.durationSeconds}s`, short: true });
        if (metadata.sha256) fields.push({ title: 'SHA-256', value: metadata.sha256.slice(0, 16) + '...', short: true });
        break;

      case 'validation.passed':
        summary = `🔎 Automated validation PASSED for project "${projectId}"`;
        colorHex = '#10B981'; // Green
        break;

      case 'validation.failed':
        summary = `⚠️ Automated validation FAILED for project "${projectId}"`;
        colorHex = '#EF4444'; // Red
        if (metadata.error) fields.push({ title: 'Failure Reason', value: metadata.error, short: false });
        break;

      case 'package.approved':
        summary = `📦 Client delivery package signed and approved for project "${projectId}"`;
        colorHex = '#8B5CF6'; // Purple
        if (metadata.reviewer) fields.push({ title: 'Reviewer', value: metadata.reviewer, short: true });
        if (metadata.costUsd !== undefined) fields.push({ title: 'Total Cost', value: `$${metadata.costUsd.toFixed(2)} USD`, short: true });
        break;
    }

    return {
      event,
      timestamp,
      project_id: projectId,
      summary,
      color_hex: colorHex,
      fields
    };
  }
}
