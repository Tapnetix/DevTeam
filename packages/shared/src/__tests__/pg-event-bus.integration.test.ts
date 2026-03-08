import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PgEventBus } from '../events/pg-event-bus.js';
import type { DevTeamEvent } from '../events/types.js';

const DATABASE_URL = process.env.DATABASE_URL;
const describeIf = DATABASE_URL ? describe : describe.skip;

describeIf('PgEventBus (integration)', () => {
  let bus1: PgEventBus;
  let bus2: PgEventBus;

  beforeAll(async () => {
    bus1 = new PgEventBus(DATABASE_URL!);
    bus2 = new PgEventBus(DATABASE_URL!);
    await bus1.connect();
    await bus2.connect();
  });

  afterAll(async () => {
    await bus1.close();
    await bus2.close();
  });

  it('publishes from one instance and receives on another', async () => {
    const received: DevTeamEvent[] = [];
    bus2.subscribe('work_item.created', (event) => {
      received.push(event);
    });

    await bus1.publish({
      type: 'work_item.created',
      actor: 'user-1',
      workItemId: 'wi-123',
      payload: { title: 'Implement login' },
    });

    // Wait for PG notification propagation
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(received).toHaveLength(1);
    expect(received[0].type).toBe('work_item.created');
    expect(received[0].actor).toBe('user-1');
    expect(received[0].workItemId).toBe('wi-123');
    expect(received[0].payload).toEqual({ title: 'Implement login' });
    expect(received[0].timestamp).toBeDefined();
  });

  it('supports wildcard subscriptions across instances', async () => {
    const received: DevTeamEvent[] = [];
    bus2.subscribe('task.*', (event) => {
      received.push(event);
    });

    await bus1.publish({
      type: 'task.assigned',
      actor: 'user-1',
      taskId: 't-1',
      payload: { assignee: 'agent-1' },
    });

    await bus1.publish({
      type: 'task.completed',
      actor: 'agent-1',
      taskId: 't-1',
      payload: {},
    });

    // Should NOT match different prefix
    await bus1.publish({
      type: 'work_item.created',
      actor: 'user-2',
      payload: {},
    });

    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(received).toHaveLength(2);
    expect(received[0].type).toBe('task.assigned');
    expect(received[1].type).toBe('task.completed');
  });

  it('receives events on the same instance that published them', async () => {
    const received: DevTeamEvent[] = [];
    bus1.subscribe('self.test', (event) => {
      received.push(event);
    });

    await bus1.publish({
      type: 'self.test',
      actor: 'system',
      payload: { msg: 'hello' },
    });

    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(received).toHaveLength(1);
    expect(received[0].payload).toEqual({ msg: 'hello' });
  });

  it('unsubscribe stops receiving events', async () => {
    const received: DevTeamEvent[] = [];
    const unsub = bus2.subscribe('unsub.test', (event) => {
      received.push(event);
    });

    await bus1.publish({
      type: 'unsub.test',
      actor: 'system',
      payload: {},
    });

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(received).toHaveLength(1);

    unsub();

    await bus1.publish({
      type: 'unsub.test',
      actor: 'system',
      payload: {},
    });

    await new Promise((resolve) => setTimeout(resolve, 300));
    // Should still be 1 -- handler was removed
    expect(received).toHaveLength(1);
  });
});
