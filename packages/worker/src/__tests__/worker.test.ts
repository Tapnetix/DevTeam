import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InMemoryEventBus } from '@devteam/shared';
import type { TeamMember, DevTeamEvent } from '@devteam/shared';
import { Worker } from '../worker.js';
import type { WorkerConfig } from '../worker.js';

function makeMember(overrides?: Partial<TeamMember>): TeamMember {
  return {
    role: 'developer',
    name: 'Alice Coder',
    handle: '@alice',
    personality: 'Meticulous and test-driven.',
    ...overrides,
  };
}

function makeConfig(overrides?: Partial<WorkerConfig>): WorkerConfig {
  return {
    member: makeMember(),
    repoPath: '/repos/my-project',
    worktreeBase: '/tmp/worktrees',
    eventBus: new InMemoryEventBus(),
    projectName: 'Acme App',
    repository: 'acme-corp/acme-app',
    ...overrides,
  };
}

describe('Worker', () => {
  let eventBus: InMemoryEventBus;

  beforeEach(() => {
    eventBus = new InMemoryEventBus();
  });

  afterEach(async () => {
    await eventBus.close();
  });

  it('creates a worker with role config', () => {
    const config = makeConfig({ eventBus });
    const worker = new Worker(config);

    expect(worker).toBeInstanceOf(Worker);
    expect(worker.role).toBe('developer');
    expect(worker.name).toBe('Alice Coder');
    expect(worker.handle).toBe('@alice');
  });

  it('exposes role, name, and handle properties', () => {
    const member = makeMember({
      role: 'reviewer',
      name: 'Bob Reviewer',
      handle: '@bob',
    });
    const worker = new Worker(makeConfig({ member, eventBus }));

    expect(worker.role).toBe('reviewer');
    expect(worker.name).toBe('Bob Reviewer');
    expect(worker.handle).toBe('@bob');
  });

  it('creates workers for different roles', () => {
    const roles: Array<TeamMember['role']> = [
      'team_lead',
      'product_owner',
      'architect',
      'ux_designer',
      'developer',
      'reviewer',
      'qa_engineer',
      'devops',
    ];

    for (const role of roles) {
      const member = makeMember({ role, name: `${role} agent`, handle: `@${role}` });
      const worker = new Worker(makeConfig({ member, eventBus }));
      expect(worker.role).toBe(role);
    }
  });

  it('publishes worker.started event on executeTask', async () => {
    const events: DevTeamEvent[] = [];
    eventBus.subscribe('worker.*', (event) => {
      events.push(event);
    });

    const worker = new Worker(makeConfig({ eventBus }));

    // executeTask will fail because we don't have a real git repo,
    // but it should still publish worker.started before failing
    await worker.executeTask({
      id: 'task-1',
      title: 'Implement login',
      description: 'Add OAuth2 login flow',
      branchName: 'feature/login',
    });

    // Should have published at least a started event and a failed event
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events[0].type).toBe('worker.started');
    expect(events[0].actor).toBe('@alice');
    expect(events[0].taskId).toBe('task-1');
    expect(events[0].payload).toMatchObject({
      role: 'developer',
      title: 'Implement login',
    });

    // Should also have a failed event (because no real git repo)
    expect(events[1].type).toBe('worker.failed');
  });
});
