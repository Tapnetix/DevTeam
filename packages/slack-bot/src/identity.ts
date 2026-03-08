import type { TeamMember } from '@devteam/shared';

export interface SlackMessagePayload {
  channel: string;
  text: string;
  username: string;
  icon_url?: string;
  thread_ts?: string;
}

export class TeamIdentityManager {
  private members: Map<string, TeamMember>;

  constructor(members: TeamMember[]) {
    this.members = new Map(members.map((m) => [m.handle, m]));
  }

  getMember(handle: string): TeamMember | undefined {
    return this.members.get(handle);
  }

  buildMessage(
    handle: string,
    channel: string,
    text: string,
    threadTs?: string,
  ): SlackMessagePayload {
    const member = this.members.get(handle);
    if (!member) {
      throw new Error(`Unknown team member handle: ${handle}`);
    }

    const payload: SlackMessagePayload = {
      channel,
      text,
      username: member.handle,
    };

    if (member.avatar) {
      payload.icon_url = member.avatar;
    }

    if (threadTs) {
      payload.thread_ts = threadTs;
    }

    return payload;
  }

  getAllHandles(): string[] {
    return Array.from(this.members.keys());
  }
}
