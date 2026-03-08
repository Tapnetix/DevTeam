import { describe, it, expect } from 'vitest';
import type { TeamMember } from '@devteam/shared';
import { TeamIdentityManager } from '../identity.js';
import { ChannelRouter } from '../channels.js';

const mockMembers: TeamMember[] = [
  {
    role: 'team_lead',
    name: 'Alice Chen',
    handle: 'alice',
    personality: 'decisive leader',
    avatar: 'https://avatars.example.com/alice.png',
  },
  {
    role: 'developer',
    name: 'Bob Smith',
    handle: 'bob',
    personality: 'meticulous coder',
  },
  {
    role: 'ux_designer',
    name: 'Carol Wu',
    handle: 'carol',
    avatar: 'https://avatars.example.com/carol.png',
  },
];

describe('TeamIdentityManager', () => {
  it('creates message payload with team member identity', () => {
    const manager = new TeamIdentityManager(mockMembers);
    const payload = manager.buildMessage('alice', '#general', 'Hello team!');

    expect(payload.username).toBe('alice');
    expect(payload.channel).toBe('#general');
    expect(payload.text).toBe('Hello team!');
  });

  it('throws for unknown handle', () => {
    const manager = new TeamIdentityManager(mockMembers);

    expect(() => manager.buildMessage('unknown', '#general', 'Hello')).toThrow(
      'Unknown team member handle: unknown',
    );
  });

  it('returns all handles', () => {
    const manager = new TeamIdentityManager(mockMembers);
    const handles = manager.getAllHandles();

    expect(handles).toHaveLength(3);
    expect(handles).toContain('alice');
    expect(handles).toContain('bob');
    expect(handles).toContain('carol');
  });

  it('includes avatar as icon_url when available', () => {
    const manager = new TeamIdentityManager(mockMembers);

    const alicePayload = manager.buildMessage('alice', '#general', 'Hi');
    expect(alicePayload.icon_url).toBe('https://avatars.example.com/alice.png');

    const bobPayload = manager.buildMessage('bob', '#general', 'Hi');
    expect(bobPayload.icon_url).toBeUndefined();
  });

  it('includes thread_ts when provided', () => {
    const manager = new TeamIdentityManager(mockMembers);

    const withThread = manager.buildMessage('alice', '#general', 'Reply', '1234567890.123456');
    expect(withThread.thread_ts).toBe('1234567890.123456');

    const withoutThread = manager.buildMessage('alice', '#general', 'Top-level');
    expect(withoutThread.thread_ts).toBeUndefined();
  });
});

describe('ChannelRouter', () => {
  const channels = {
    main: '#devteam-main',
    dev: '#devteam-dev',
    design: '#devteam-design',
    alerts: '#devteam-alerts',
  };

  it('routes CI events to alerts channel', () => {
    const router = new ChannelRouter(channels);
    expect(router.routeByEventType('ci.build_started')).toBe('#devteam-alerts');
    expect(router.routeByEventType('deploy.production')).toBe('#devteam-alerts');
  });

  it('routes PR events to dev channel', () => {
    const router = new ChannelRouter(channels);
    expect(router.routeByEventType('pr.opened')).toBe('#devteam-dev');
    expect(router.routeByEventType('build.completed')).toBe('#devteam-dev');
  });

  it('routes design events to design channel', () => {
    const router = new ChannelRouter(channels);
    expect(router.routeByEventType('design.updated')).toBe('#devteam-design');
    expect(router.routeByEventType('requirements.changed')).toBe('#devteam-design');
  });

  it('routes other events to main channel', () => {
    const router = new ChannelRouter(channels);
    expect(router.routeByEventType('work_item.created')).toBe('#devteam-main');
    expect(router.routeByEventType('task.assigned')).toBe('#devteam-main');
    expect(router.routeByEventType('unknown.event')).toBe('#devteam-main');
  });
});
