import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InMemoryEventBus } from '../events/event-bus.js';
import type { DevTeamEvent } from '../events/types.js';

describe('InMemoryEventBus', () => {
  let bus: InMemoryEventBus;

  beforeEach(() => {
    bus = new InMemoryEventBus();
  });

  afterEach(async () => {
    await bus.close();
  });

  it('publishes and receives events', async () => {
    const received: DevTeamEvent[] = [];
    bus.subscribe('work_item.created', (event) => {
      received.push(event);
    });

    await bus.publish({
      type: 'work_item.created',
      actor: 'user-1',
      workItemId: 'wi-123',
      payload: { title: 'Implement login' },
    });

    expect(received).toHaveLength(1);
    expect(received[0].type).toBe('work_item.created');
    expect(received[0].actor).toBe('user-1');
    expect(received[0].workItemId).toBe('wi-123');
    expect(received[0].payload).toEqual({ title: 'Implement login' });
    expect(received[0].timestamp).toBeInstanceOf(Date);
  });

  it('supports wildcard subscriptions', async () => {
    const received: DevTeamEvent[] = [];
    bus.subscribe('work_item.*', (event) => {
      received.push(event);
    });

    await bus.publish({
      type: 'work_item.created',
      actor: 'user-1',
      payload: { title: 'First' },
    });

    await bus.publish({
      type: 'work_item.updated',
      actor: 'user-2',
      payload: { title: 'Second' },
    });

    // Should NOT match a different prefix
    await bus.publish({
      type: 'task.assigned',
      actor: 'user-3',
      payload: {},
    });

    expect(received).toHaveLength(2);
    expect(received[0].type).toBe('work_item.created');
    expect(received[1].type).toBe('work_item.updated');
  });

  it('unsubscribes correctly', async () => {
    const received: DevTeamEvent[] = [];
    const unsubscribe = bus.subscribe('work_item.created', (event) => {
      received.push(event);
    });

    await bus.publish({
      type: 'work_item.created',
      actor: 'user-1',
      payload: {},
    });

    expect(received).toHaveLength(1);

    unsubscribe();

    await bus.publish({
      type: 'work_item.created',
      actor: 'user-1',
      payload: {},
    });

    // Should still be 1 — handler was removed
    expect(received).toHaveLength(1);
  });

  it('auto-sets timestamp if missing', async () => {
    const received: DevTeamEvent[] = [];
    bus.subscribe('test.event', (event) => {
      received.push(event);
    });

    const before = new Date();
    await bus.publish({
      type: 'test.event',
      actor: 'system',
      payload: {},
    });
    const after = new Date();

    expect(received).toHaveLength(1);
    const ts = received[0].timestamp!;
    expect(ts.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(ts.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('preserves explicitly provided timestamp', async () => {
    const received: DevTeamEvent[] = [];
    bus.subscribe('test.event', (event) => {
      received.push(event);
    });

    const explicit = new Date('2025-01-01T00:00:00Z');
    await bus.publish({
      type: 'test.event',
      actor: 'system',
      payload: {},
      timestamp: explicit,
    });

    expect(received).toHaveLength(1);
    expect(received[0].timestamp).toBe(explicit);
  });

  it('close() clears all handlers', async () => {
    const received: DevTeamEvent[] = [];
    bus.subscribe('test.event', (event) => {
      received.push(event);
    });

    await bus.close();

    await bus.publish({
      type: 'test.event',
      actor: 'system',
      payload: {},
    });

    expect(received).toHaveLength(0);
  });
});
