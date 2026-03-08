import type { EventBus } from '@devteam/shared';

export interface ApprovalRequest {
  workItemId: string;
  action: string; // e.g., 'merge_pr', 'production_deploy'
  requestedBy: string; // team member handle
  channel: string;
  messageTs: string; // message to react to
}

export class ApprovalHandler {
  private pendingApprovals = new Map<string, ApprovalRequest>();

  constructor(private eventBus: EventBus) {}

  async requestApproval(request: ApprovalRequest): Promise<void> {
    this.pendingApprovals.set(request.messageTs, request);

    await this.eventBus.publish({
      type: 'approval.requested',
      actor: request.requestedBy,
      workItemId: request.workItemId,
      payload: {
        action: request.action,
        channel: request.channel,
        messageTs: request.messageTs,
      },
    });
  }

  async handleReaction(messageTs: string, userId: string, isApproved: boolean): Promise<void> {
    const pending = this.pendingApprovals.get(messageTs);
    if (!pending) {
      return; // Ignore reactions on non-pending messages
    }

    this.pendingApprovals.delete(messageTs);

    await this.eventBus.publish({
      type: 'approval.resolved',
      actor: userId,
      workItemId: pending.workItemId,
      payload: {
        action: pending.action,
        approved: isApproved,
        channel: pending.channel,
        messageTs,
        requestedBy: pending.requestedBy,
      },
    });
  }

  getPendingApprovals(): ApprovalRequest[] {
    return Array.from(this.pendingApprovals.values());
  }
}
