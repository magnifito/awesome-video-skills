import { NotificationDispatcher, type NotificationPayload, type PipelineEventType } from '../../../media/src/notifications.js';

export async function runNotify(
  event: PipelineEventType,
  projectName: string,
  details: Record<string, unknown> = {}
): Promise<NotificationPayload> {
  const notif = NotificationDispatcher.formatEvent(event, projectName, details);
  return notif;
}
