import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InMemoryEventBus } from '@devteam/shared';
import type { DevTeamEvent, TeamMember } from '@devteam/shared';
import { TeamIdentityManager } from '../identity.js';
import { MentionHandler } from '../handlers/mention.js';
import { ReactionHandler } from '../handlers/reaction.js';
import { ApprovalHandler } from '../handlers/approval.js';

const mockMembers: TeamMember[] = [
  {
    role: 'team_lead',
    name: 'Alice Chen',
    handle: 'alice',
    avatar: 'https://avatars.example.com/alice.png',
  },
  {
    role: 'developer',
    name: 'Bob Smith',
    handle: 'bob',
  },
  {
    role: 'ux_designer',
    name: 'Carol Wu',
    handle: 'carol',
  },
];

describe('MentionHandler', () => {
  let eventBus: InMemoryEventBus;
  let identityManager: TeamIdentityManager;
  let handler: MentionHandler;

  beforeEach(() => {
    eventBus = new InMemoryEventBus();
    identityManager = new TeamIdentityManager(mockMembers);
    handler = new MentionHandler(identityManager, eventBus);
  });

  afterEach(async () => {
    await eventBus.close();
  });

  it('parses @mentions and publishes slack.mention event', async () => {
    const received: DevTeamEvent[] = [];
    eventBus.subscribe('slack.mention', (event) => {
      received.push(event);
    });

    await handler.handle({
      text: 'Hey @alice can you review this?',
      user: 'U12345',
      channel: '#general',
      ts: '1234567890.123456',
    });

    expect(received).toHaveLength(1);
    expect(received[0].type).toBe('slack.mention');
    expect(received[0].actor).toBe('U12345');
    expect(received[0].payload).toEqual({
      targetHandle: 'alice',
      text: 'Hey @alice can you review this?',
      channel: '#general',
      threadTs: undefined,
    });
  });

  it('handles multiple @mentions in one message', async () => {
    const received: DevTeamEvent[] = [];
    eventBus.subscribe('slack.mention', (event) => {
      received.push(event);
    });

    await handler.handle({
      text: '@alice and @bob please look at this',
      user: 'U12345',
      channel: '#dev',
      ts: '1234567890.123456',
    });

    expect(received).toHaveLength(2);
    expect(received[0].payload.targetHandle).toBe('alice');
    expect(received[1].payload.targetHandle).toBe('bob');
  });

  it('ignores unrecognized @mentions', async () => {
    const received: DevTeamEvent[] = [];
    eventBus.subscribe('slack.mention', (event) => {
      received.push(event);
    });

    await handler.handle({
      text: 'Hey @unknown and @alice check this out',
      user: 'U12345',
      channel: '#general',
      ts: '1234567890.123456',
    });

    expect(received).toHaveLength(1);
    expect(received[0].payload.targetHandle).toBe('alice');
  });
});

describe('ReactionHandler', () => {
  let eventBus: InMemoryEventBus;
  let handler: ReactionHandler;

  beforeEach(() => {
    eventBus = new InMemoryEventBus();
    handler = new ReactionHandler(eventBus);
  });

  afterEach(async () => {
    await eventBus.close();
  });

  it('identifies approval reactions', () => {
    expect(handler.isApproval('white_check_mark')).toBe(true);
    expect(handler.isApproval('+1')).toBe(true);
    expect(handler.isApproval('thumbsup')).toBe(true);
    expect(handler.isApproval('x')).toBe(false);
    expect(handler.isApproval('smile')).toBe(false);
  });

  it('identifies rejection reactions', () => {
    expect(handler.isRejection('x')).toBe(true);
    expect(handler.isRejection('-1')).toBe(true);
    expect(handler.isRejection('thumbsdown')).toBe(true);
    expect(handler.isRejection('white_check_mark')).toBe(false);
    expect(handler.isRejection('smile')).toBe(false);
  });

  it('publishes slack.reaction event', async () => {
    const received: DevTeamEvent[] = [];
    eventBus.subscribe('slack.reaction', (event) => {
      received.push(event);
    });

    await handler.handle({
      reaction: 'white_check_mark',
      user: 'U12345',
      item: {
        type: 'message',
        channel: '#general',
        ts: '1234567890.123456',
      },
    });

    expect(received).toHaveLength(1);
    expect(received[0].type).toBe('slack.reaction');
    expect(received[0].actor).toBe('U12345');
    expect(received[0].payload).toEqual({
      reaction: 'white_check_mark',
      isApproval: true,
      isRejection: false,
      itemType: 'message',
      channel: '#general',
      messageTs: '1234567890.123456',
    });
  });

  it('ignores non-approval/rejection reactions', async () => {
    const received: DevTeamEvent[] = [];
    eventBus.subscribe('slack.reaction', (event) => {
      received.push(event);
    });

    await handler.handle({
      reaction: 'smile',
      user: 'U12345',
      item: {
        type: 'message',
        channel: '#general',
        ts: '1234567890.123456',
      },
    });

    expect(received).toHaveLength(0);
  });
});

describe('ApprovalHandler', () => {
  let eventBus: InMemoryEventBus;
  let handler: ApprovalHandler;

  beforeEach(() => {
    eventBus = new InMemoryEventBus();
    handler = new ApprovalHandler(eventBus);
  });

  afterEach(async () => {
    await eventBus.close();
  });

  it('stores and retrieves pending approvals', async () => {
    const request = {
      workItemId: 'wi-123',
      action: 'merge_pr',
      requestedBy: 'alice',
      channel: '#dev',
      messageTs: '1234567890.123456',
    };

    await handler.requestApproval(request);

    const pending = handler.getPendingApprovals();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toEqual(request);
  });

  it('resolves approval on positive reaction', async () => {
    const received: DevTeamEvent[] = [];
    eventBus.subscribe('approval.resolved', (event) => {
      received.push(event);
    });

    await handler.requestApproval({
      workItemId: 'wi-123',
      action: 'merge_pr',
      requestedBy: 'alice',
      channel: '#dev',
      messageTs: '1234567890.123456',
    });

    await handler.handleReaction('1234567890.123456', 'U99999', true);

    expect(received).toHaveLength(1);
    expect(received[0].type).toBe('approval.resolved');
    expect(received[0].actor).toBe('U99999');
    expect(received[0].workItemId).toBe('wi-123');
    expect(received[0].payload.approved).toBe(true);
    expect(received[0].payload.action).toBe('merge_pr');

    // Should be removed from pending
    expect(handler.getPendingApprovals()).toHaveLength(0);
  });

  it('resolves rejection on negative reaction', async () => {
    const received: DevTeamEvent[] = [];
    eventBus.subscribe('approval.resolved', (event) => {
      received.push(event);
    });

    await handler.requestApproval({
      workItemId: 'wi-456',
      action: 'production_deploy',
      requestedBy: 'bob',
      channel: '#alerts',
      messageTs: '9876543210.654321',
    });

    await handler.handleReaction('9876543210.654321', 'U88888', false);

    expect(received).toHaveLength(1);
    expect(received[0].payload.approved).toBe(false);
    expect(received[0].payload.action).toBe('production_deploy');
    expect(received[0].payload.requestedBy).toBe('bob');
  });

  it('publishes approval.resolved event', async () => {
    const requested: DevTeamEvent[] = [];
    const resolved: DevTeamEvent[] = [];
    eventBus.subscribe('approval.requested', (event) => {
      requested.push(event);
    });
    eventBus.subscribe('approval.resolved', (event) => {
      resolved.push(event);
    });

    await handler.requestApproval({
      workItemId: 'wi-789',
      action: 'merge_pr',
      requestedBy: 'carol',
      channel: '#dev',
      messageTs: '1111111111.111111',
    });

    expect(requested).toHaveLength(1);
    expect(requested[0].type).toBe('approval.requested');
    expect(requested[0].actor).toBe('carol');

    await handler.handleReaction('1111111111.111111', 'U77777', true);

    expect(resolved).toHaveLength(1);
    expect(resolved[0].type).toBe('approval.resolved');
  });

  it('ignores reactions on non-pending messages', async () => {
    const received: DevTeamEvent[] = [];
    eventBus.subscribe('approval.resolved', (event) => {
      received.push(event);
    });

    await handler.handleReaction('nonexistent.timestamp', 'U12345', true);

    expect(received).toHaveLength(0);
  });
});
