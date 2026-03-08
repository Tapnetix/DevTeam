import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryEventBus } from '@devteam/shared';
import type { DevTeamEvent, TeamMember } from '@devteam/shared';
import { Orchestrator, resetIdCounter } from '../orchestrator.js';

const teamMembers: TeamMember[] = [
  { role: 'team_lead', name: 'Alice', handle: '@alice' },
  { role: 'product_owner', name: 'Bob', handle: '@bob' },
  { role: 'architect', name: 'Carol', handle: '@carol' },
  { role: 'developer', name: 'Dave', handle: '@dave' },
  { role: 'reviewer', name: 'Eve', handle: '@eve' },
  { role: 'qa_engineer', name: 'Frank', handle: '@frank' },
  { role: 'devops', name: 'Grace', handle: '@grace' },
];

describe('Orchestrator', () => {
  let eventBus: InMemoryEventBus;
  let orchestrator: Orchestrator;
  let events: DevTeamEvent[];

  beforeEach(async () => {
    resetIdCounter();
    eventBus = new InMemoryEventBus();
    events = [];
    eventBus.subscribe('*', (event) => {
      events.push(event);
    });
    // Subscribe to specific patterns for capture since '*' won't match with wildcard logic
    eventBus.subscribe('work_item.*', (event) => {
      events.push(event);
    });
    eventBus.subscribe('pipeline.*', (event) => {
      events.push(event);
    });
    eventBus.subscribe('task.*', (event) => {
      events.push(event);
    });
    orchestrator = new Orchestrator({
      teamMembers,
      eventBus,
      projectName: 'TestProject',
    });
  });

  it('triages incoming work items', async () => {
    const item = await orchestrator.triageIncoming({
      title: 'Add dark mode toggle',
      description: 'Users want a dark mode option',
      type: 'feature',
      priority: 'high',
    });

    expect(item.id).toBeDefined();
    expect(item.title).toBe('Add dark mode toggle');
    expect(item.type).toBe('feature');
    expect(item.priority).toBe('high');
    expect(item.status).toBe('intake');

    // Verify work_item.created event published
    const createdEvents = events.filter((e) => e.type === 'work_item.created');
    expect(createdEvents.length).toBeGreaterThan(0);
    expect(createdEvents[0].workItemId).toBe(item.id);
  });

  it('advances pipeline through stages', async () => {
    const item = await orchestrator.triageIncoming({
      title: 'Feature X',
      description: 'Implement feature X',
      type: 'feature',
    });

    // intake -> requirements
    const r1 = await orchestrator.advancePipeline(item.id);
    expect(r1.status).toBe('requirements');

    // requirements -> design
    const r2 = await orchestrator.advancePipeline(item.id);
    expect(r2.status).toBe('design');

    // Verify pipeline.advanced events published
    const advancedEvents = events.filter(
      (e) => e.type === 'pipeline.advanced',
    );
    expect(advancedEvents.length).toBeGreaterThanOrEqual(2);
  });

  it('assigns work to appropriate role', async () => {
    const item = await orchestrator.triageIncoming({
      title: 'Write specs',
      description: 'Write requirements',
      type: 'feature',
    });

    const assigned = await orchestrator.assignToRole(
      item.id,
      'product_owner',
    );
    expect(assigned.assigneeHandle).toBe('@bob');

    // Verify work_item.assigned event published
    const assignedEvents = events.filter(
      (e) => e.type === 'work_item.assigned',
    );
    expect(assignedEvents.length).toBeGreaterThan(0);
  });

  it('rejects invalid pipeline transitions', async () => {
    const item = await orchestrator.triageIncoming({
      title: 'Feature Y',
      description: 'Something',
      type: 'feature',
    });

    // intake -> qa should fail
    await expect(
      orchestrator.advancePipeline(item.id, 'qa'),
    ).rejects.toThrow(/invalid transition/i);
  });

  it('breaks work into tasks with dependencies', async () => {
    const item = await orchestrator.triageIncoming({
      title: 'Dark mode',
      description: 'Add dark mode support',
      type: 'feature',
    });

    const tasks = await orchestrator.breakIntoTasks(item.id, [
      { title: 'Create theme context', description: 'Set up React context' },
      {
        title: 'Add toggle component',
        description: 'Toggle switch UI',
        dependsOn: [`${item.id}-task-1`],
      },
      {
        title: 'Persist preference',
        description: 'Save to localStorage',
        dependsOn: [`${item.id}-task-1`],
      },
    ]);

    expect(tasks).toHaveLength(3);
    expect(tasks[0].id).toBe(`${item.id}-task-1`);
    expect(tasks[1].dependsOn).toEqual([`${item.id}-task-1`]);
  });

  it('handles worker completion and unblocks next tasks', async () => {
    const item = await orchestrator.triageIncoming({
      title: 'Dark mode',
      description: 'Add dark mode',
      type: 'feature',
    });

    // Advance to implement stage first
    await orchestrator.advancePipeline(item.id); // intake -> requirements
    await orchestrator.advancePipeline(item.id); // requirements -> design
    await orchestrator.advancePipeline(item.id); // design -> implement

    await orchestrator.breakIntoTasks(item.id, [
      { title: 'Task A', description: 'First task' },
      {
        title: 'Task B',
        description: 'Depends on A',
        dependsOn: [`${item.id}-task-1`],
      },
    ]);

    // Clear events to focus on completion events
    events.length = 0;

    // Complete first task
    await orchestrator.handleWorkerComplete(item.id, `${item.id}-task-1`);

    // Verify task.completed event published
    const completedEvents = events.filter((e) => e.type === 'task.completed');
    expect(completedEvents.length).toBeGreaterThan(0);
    expect(completedEvents[0].payload.unblockedTasks).toContain(
      `${item.id}-task-2`,
    );

    // Complete second task - should advance pipeline
    await orchestrator.handleWorkerComplete(item.id, `${item.id}-task-2`);

    // All tasks complete: should have advanced from implement to review
    const workItem = orchestrator.getWorkItem(item.id);
    expect(workItem?.status).toBe('review');
  });

  it('uses bug fast path for bug work items', async () => {
    const item = await orchestrator.triageIncoming({
      title: 'Fix login crash',
      description: 'App crashes on login',
      type: 'bug',
      priority: 'critical',
    });

    expect(item.status).toBe('intake');

    // Advance: should go intake -> implement (skip requirements/design)
    const advanced = await orchestrator.advancePipeline(item.id);
    expect(advanced.status).toBe('implement');
  });
});
