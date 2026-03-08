import type { EventBus } from '@devteam/shared';
import type { TeamIdentityManager } from '../identity.js';

export interface MentionEvent {
  text: string;
  user: string; // Slack user ID of the person who @mentioned
  channel: string;
  thread_ts?: string;
  ts: string;
}

export class MentionHandler {
  constructor(
    private identityManager: TeamIdentityManager,
    private eventBus: EventBus,
  ) {}

  async handle(event: MentionEvent): Promise<void> {
    const mentionedHandles = this.parseMentionedHandles(event.text);

    for (const targetHandle of mentionedHandles) {
      await this.eventBus.publish({
        type: 'slack.mention',
        actor: event.user,
        payload: {
          targetHandle,
          text: event.text,
          channel: event.channel,
          threadTs: event.thread_ts,
        },
      });
    }
  }

  parseMentionedHandles(text: string): string[] {
    const knownHandles = this.identityManager.getAllHandles();
    const mentionPattern = /@(\w+)/g;
    const matched: string[] = [];

    let match: RegExpExecArray | null;
    while ((match = mentionPattern.exec(text)) !== null) {
      const handle = match[1];
      if (knownHandles.includes(handle) && !matched.includes(handle)) {
        matched.push(handle);
      }
    }

    return matched;
  }
}
