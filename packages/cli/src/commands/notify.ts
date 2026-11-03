import {
  NotificationDispatcher,
  PIPELINE_EVENTS,
  type NotificationPayload,
  type PipelineEventType
} from '../../../media/src/notifications.js';

/**
 * Builds a notification payload for a pipeline event. This does not send anything:
 * callers (CI, webhooks) are responsible for delivering the returned payload.
 */
export async function runNotify(
  event: string,
  projectName: string,
  details: Record<string, unknown> = {}
): Promise<NotificationPayload> {
  if (!(PIPELINE_EVENTS as readonly string[]).includes(event)) {
    throw new Error(`Unknown pipeline event '${event}'. Allowed: ${PIPELINE_EVENTS.join(', ')}`);
  }
  return NotificationDispatcher.formatEvent(event as PipelineEventType, projectName, details);
}
