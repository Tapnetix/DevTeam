import type { EventBus } from '@devteam/shared';

export interface ReactionEvent {
  reaction: string; // emoji name (e.g., 'white_check_mark', 'x')
  user: string;
  item: {
    type: string;
    channel: string;
    ts: string;
  };
}

const APPROVAL_REACTIONS = new Set(['white_check_mark', '+1', 'thumbsup']);
const REJECTION_REACTIONS = new Set(['x', '-1', 'thumbsdown']);

export class ReactionHandler {
  constructor(private eventBus: EventBus) {}

  async handle(event: ReactionEvent): Promise<void> {
    const isApproval = this.isApproval(event.reaction);
    const isRejection = this.isRejection(event.reaction);

    if (!isApproval && !isRejection) {
      return; // Ignore non-approval/rejection reactions
    }

    await this.eventBus.publish({
      type: 'slack.reaction',
      actor: event.user,
      payload: {
        reaction: event.reaction,
        isApproval,
        isRejection,
        itemType: event.item.type,
        channel: event.item.channel,
        messageTs: event.item.ts,
      },
    });
  }

  isApproval(reaction: string): boolean {
    return APPROVAL_REACTIONS.has(reaction);
  }

  isRejection(reaction: string): boolean {
    return REJECTION_REACTIONS.has(reaction);
  }
}
