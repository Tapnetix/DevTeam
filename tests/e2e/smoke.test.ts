/**
 * End-to-End Smoke Test
 *
 * Verifies the core pipeline flow WITHOUT requiring external services.
 * Uses in-memory implementations from @devteam/shared and wires them
 * together with the Orchestrator from @devteam/orchestrator.
 */
import { describe, it, expect, beforeEach } from 'vitest';

import {
  loadConfig,
  InMemoryEventBus,
  type DevTeamEvent,
  type TeamConfig,
} from '@devteam/shared';

import {
  Orchestrator,
  resetIdCounter,
  type WorkItem,
} from '@devteam/orchestrator';

// ── Shared fixtures ─────────────────────────────────────────────────────

const TEAM_YAML = `
team:
  name: "Smoke Test Team"
  project: "smoke"
  repository: "git@github.com:org/smoke.git"
members:
  - role: team_lead
    name: Alice
    handle: AliceLead
  - role: product_owner
    name: Bob
    handle: BobPO
  - role: architect
    name: Carol
    handle: CarolArch
  - role: developer
    name: Dave
    handle: DaveDev
  - role: reviewer
    name: Eve
    handle: EveReview
  - role: qa_engineer
    name: Frank
    handle: FrankQA
  - role: devops
    name: Grace
    handle: GraceOps
slack:
  workspace: "smoke-org"
  channels:
    main: "smoke-main"
    dev: "smoke-dev"
    design: "smoke-design"
    alerts: "smoke-alerts"
`;

// ── Test suite ──────────────────────────────────────────────────────────

describe('E2E Smoke Test — feature pipeline', () => {
  let config: TeamConfig;
  let eventBus: InMemoryEventBus;
  let orchestrator: Orchestrator;
  let events: DevTeamEvent[];

  beforeEach(() => {
    resetIdCounter();

    // 1. Create team config using loadConfig from @devteam/shared
    config = loadConfig(TEAM_YAML);

    // 2. Set up InMemoryEventBus from @devteam/shared
    eventBus = new InMemoryEventBus();
    events = [];

    // Subscribe to all relevant event patterns to capture them
    eventBus.subscribe('work_item.*', (event) => {
      events.push(event);
    });
    eventBus.subscribe('pipeline.*', (event) => {
      events.push(event);
    });
    eventBus.subscribe('task.*', (event) => {
      events.push(event);
    });

    // 3. Create Orchestrator from @devteam/orchestrator
    orchestrator = new Orchestrator({
      teamMembers: config.members,
      eventBus,
      projectName: config.team.project,
    });
  });

  // ── Test 1: Config loading ──────────────────────────────────────────

  it('loads team config correctly', () => {
    expect(config.team.name).toBe('Smoke Test Team');
    expect(config.team.project).toBe('smoke');
    expect(config.members).toHaveLength(7);
    expect(config.members.some((m) => m.role === 'team_lead')).toBe(true);
  });

  // ── Test 2: Triage creates work item at INTAKE stage ────────────────

  it('creates a work item via triageIncoming at intake stage', async () => {
    // 4. Create a mock work item via orchestrator.triageIncoming()
    const item = await orchestrator.triageIncoming({
      title: 'Add user dashboard',
      description: 'Build a dashboard page for logged-in users',
      type: 'feature',
      priority: 'high',
    });

    // 5. Verify the work item is at INTAKE stage
    expect(item.id).toBeDefined();
    expect(item.status).toBe('intake');
    expect(item.type).toBe('feature');
    expect(item.priority).toBe('high');

    // Verify work_item.created event was published
    const createdEvents = events.filter((e) => e.type === 'work_item.created');
    expect(createdEvents).toHaveLength(1);
    expect(createdEvents[0].workItemId).toBe(item.id);
    expect(createdEvents[0].payload.title).toBe('Add user dashboard');
  });

  // ── Test 3: Advance through pipeline stages ─────────────────────────

  it('advances feature through intake -> requirements', async () => {
    const item = await orchestrator.triageIncoming({
      title: 'Search feature',
      description: 'Full-text search across the app',
      type: 'feature',
    });

    events.length = 0; // clear creation events

    // 6. Advance INTAKE -> REQUIREMENTS
    const advanced = await orchestrator.advancePipeline(item.id);
    expect(advanced.status).toBe('requirements');

    // 7. Verify events are published at each stage
    const pipelineEvents = events.filter(
      (e) => e.type === 'pipeline.advanced',
    );
    expect(pipelineEvents).toHaveLength(1);
    expect(pipelineEvents[0].payload.from).toBe('intake');
    expect(pipelineEvents[0].payload.to).toBe('requirements');
  });

  // ── Test 4: Full feature pipeline flow ──────────────────────────────

  it('advances feature through complete pipeline: intake -> requirements -> design -> implement -> review -> qa -> done', async () => {
    const item = await orchestrator.triageIncoming({
      title: 'Complete feature',
      description: 'Test full pipeline flow',
      type: 'feature',
    });

    events.length = 0;

    // Advance through each stage
    const stageSequence = [
      'requirements',
      'design',
      'implement',
      'review',
      'qa',
      'done',
    ] as const;

    for (const expectedStage of stageSequence) {
      const result = await orchestrator.advancePipeline(item.id);
      expect(result.status).toBe(expectedStage);
    }

    // Verify all pipeline.advanced events were published
    const pipelineEvents = events.filter(
      (e) => e.type === 'pipeline.advanced',
    );
    expect(pipelineEvents).toHaveLength(6);

    // Verify the transitions in order
    expect(pipelineEvents[0].payload.from).toBe('intake');
    expect(pipelineEvents[0].payload.to).toBe('requirements');
    expect(pipelineEvents[5].payload.from).toBe('qa');
    expect(pipelineEvents[5].payload.to).toBe('done');

    // Final state
    const final = orchestrator.getWorkItem(item.id);
    expect(final?.status).toBe('done');
  });

  // ── Test 5: Bug fast-path ───────────────────────────────────────────

  it('uses bug fast-path: intake -> implement (skips requirements/design)', async () => {
    // 8. Test bug fast-path
    const bug = await orchestrator.triageIncoming({
      title: 'Fix login crash',
      description: 'App crashes when logging in with SSO',
      type: 'bug',
      priority: 'critical',
    });

    expect(bug.status).toBe('intake');

    events.length = 0;

    // Advance — should go directly to implement
    const advanced = await orchestrator.advancePipeline(bug.id);
    expect(advanced.status).toBe('implement');

    const pipelineEvents = events.filter(
      (e) => e.type === 'pipeline.advanced',
    );
    expect(pipelineEvents).toHaveLength(1);
    expect(pipelineEvents[0].payload.from).toBe('intake');
    expect(pipelineEvents[0].payload.to).toBe('implement');
  });

  // ── Test 6: Full bug pipeline ───────────────────────────────────────

  it('completes bug through fast-path pipeline: intake -> implement -> review -> qa -> done', async () => {
    const bug = await orchestrator.triageIncoming({
      title: 'Fix pagination',
      description: 'Off-by-one error in pagination',
      type: 'bug',
    });

    events.length = 0;

    const bugStages = ['implement', 'review', 'qa', 'done'] as const;
    for (const stage of bugStages) {
      const result = await orchestrator.advancePipeline(bug.id);
      expect(result.status).toBe(stage);
    }

    expect(orchestrator.getWorkItem(bug.id)?.status).toBe('done');

    const pipelineEvents = events.filter(
      (e) => e.type === 'pipeline.advanced',
    );
    expect(pipelineEvents).toHaveLength(4);
  });

  // ── Test 7: Task decomposition and dependency tracking ──────────────

  it('decomposes work items into tasks with dependencies', async () => {
    // 9. Test task decomposition and dependency tracking
    const item = await orchestrator.triageIncoming({
      title: 'API endpoints',
      description: 'Build REST API endpoints',
      type: 'feature',
    });

    // Advance to implement stage
    await orchestrator.advancePipeline(item.id); // -> requirements
    await orchestrator.advancePipeline(item.id); // -> design
    await orchestrator.advancePipeline(item.id); // -> implement

    // Break into tasks with dependencies
    const tasks = await orchestrator.breakIntoTasks(item.id, [
      { title: 'Setup Express router', description: 'Base router config' },
      {
        title: 'Add GET /users endpoint',
        description: 'List users',
        dependsOn: [`${item.id}-task-1`],
      },
      {
        title: 'Add POST /users endpoint',
        description: 'Create user',
        dependsOn: [`${item.id}-task-1`],
      },
      {
        title: 'Add integration tests',
        description: 'Test all endpoints',
        dependsOn: [`${item.id}-task-2`, `${item.id}-task-3`],
      },
    ]);

    expect(tasks).toHaveLength(4);
    expect(tasks[0].id).toBe(`${item.id}-task-1`);
    expect(tasks[3].dependsOn).toEqual([
      `${item.id}-task-2`,
      `${item.id}-task-3`,
    ]);
  });

  // ── Test 8: Worker completion unblocks dependents ───────────────────

  it('completes tasks and unblocks dependent tasks', async () => {
    const item = await orchestrator.triageIncoming({
      title: 'Auth module',
      description: 'Implement authentication',
      type: 'feature',
    });

    await orchestrator.advancePipeline(item.id); // -> requirements
    await orchestrator.advancePipeline(item.id); // -> design
    await orchestrator.advancePipeline(item.id); // -> implement

    await orchestrator.breakIntoTasks(item.id, [
      { title: 'Setup auth middleware', description: 'JWT validation' },
      {
        title: 'Add login route',
        description: 'POST /login',
        dependsOn: [`${item.id}-task-1`],
      },
      {
        title: 'Add registration route',
        description: 'POST /register',
        dependsOn: [`${item.id}-task-1`],
      },
    ]);

    events.length = 0;

    // Complete first task — should unblock task-2 and task-3
    await orchestrator.handleWorkerComplete(item.id, `${item.id}-task-1`);

    const completedEvents = events.filter((e) => e.type === 'task.completed');
    expect(completedEvents).toHaveLength(1);
    expect(completedEvents[0].payload.unblockedTasks).toContain(
      `${item.id}-task-2`,
    );
    expect(completedEvents[0].payload.unblockedTasks).toContain(
      `${item.id}-task-3`,
    );

    // Work item should still be at implement (not all tasks done)
    expect(orchestrator.getWorkItem(item.id)?.status).toBe('implement');
  });

  // ── Test 9: All tasks complete auto-advances pipeline ───────────────

  it('auto-advances pipeline when all tasks are completed', async () => {
    const item = await orchestrator.triageIncoming({
      title: 'Notifications',
      description: 'Push notifications',
      type: 'feature',
    });

    await orchestrator.advancePipeline(item.id); // -> requirements
    await orchestrator.advancePipeline(item.id); // -> design
    await orchestrator.advancePipeline(item.id); // -> implement

    await orchestrator.breakIntoTasks(item.id, [
      { title: 'Setup push service', description: 'FCM integration' },
      {
        title: 'Add notification UI',
        description: 'Bell icon + dropdown',
        dependsOn: [`${item.id}-task-1`],
      },
    ]);

    // Complete all tasks
    await orchestrator.handleWorkerComplete(item.id, `${item.id}-task-1`);
    await orchestrator.handleWorkerComplete(item.id, `${item.id}-task-2`);

    // All tasks done -> pipeline should auto-advance from implement to review
    const workItem = orchestrator.getWorkItem(item.id);
    expect(workItem?.status).toBe('review');
  });

  // ── Test 10: Full integration — orchestrator + event bus + pipeline ─

  it('verifies full integration: multiple work items, events, and pipeline', async () => {
    // 10. Full integration test
    // Create multiple work items of different types
    const feature = await orchestrator.triageIncoming({
      title: 'Dark mode',
      description: 'Add dark mode theme',
      type: 'feature',
      priority: 'normal',
    });

    const bug = await orchestrator.triageIncoming({
      title: 'Fix button hover',
      description: 'Hover state missing on primary button',
      type: 'bug',
      priority: 'high',
    });

    const techDebt = await orchestrator.triageIncoming({
      title: 'Refactor auth module',
      description: 'Extract auth into separate service',
      type: 'tech_debt',
      priority: 'low',
    });

    // All start at intake
    expect(feature.status).toBe('intake');
    expect(bug.status).toBe('intake');
    expect(techDebt.status).toBe('intake');

    // Verify creation events for all three
    const createdEvents = events.filter((e) => e.type === 'work_item.created');
    expect(createdEvents).toHaveLength(3);

    // Advance feature through partial pipeline
    await orchestrator.advancePipeline(feature.id); // -> requirements
    await orchestrator.advancePipeline(feature.id); // -> design

    // Advance bug through fast path
    await orchestrator.advancePipeline(bug.id); // -> implement
    await orchestrator.advancePipeline(bug.id); // -> review

    // Advance tech debt to requirements
    await orchestrator.advancePipeline(techDebt.id); // -> requirements

    // Verify all items are at different stages
    expect(orchestrator.getWorkItem(feature.id)?.status).toBe('design');
    expect(orchestrator.getWorkItem(bug.id)?.status).toBe('review');
    expect(orchestrator.getWorkItem(techDebt.id)?.status).toBe('requirements');

    // getAllWorkItems should return all three
    const allItems = orchestrator.getAllWorkItems();
    expect(allItems).toHaveLength(3);

    // getWorkItemsByStatus should filter correctly
    const inDesign = orchestrator.getWorkItemsByStatus('design');
    expect(inDesign).toHaveLength(1);
    expect(inDesign[0].id).toBe(feature.id);

    const inReview = orchestrator.getWorkItemsByStatus('review');
    expect(inReview).toHaveLength(1);
    expect(inReview[0].id).toBe(bug.id);

    // Verify total events captured (3 created + 5 pipeline advances)
    const allPipelineEvents = events.filter(
      (e) => e.type === 'pipeline.advanced',
    );
    expect(allPipelineEvents).toHaveLength(5);
  });

  // ── Test 11: Event bus isolation ────────────────────────────────────

  it('event bus delivers events to correct subscribers', async () => {
    const workItemEvents: DevTeamEvent[] = [];
    const pipelineOnlyEvents: DevTeamEvent[] = [];

    eventBus.subscribe('work_item.*', (e) => workItemEvents.push(e));
    eventBus.subscribe('pipeline.*', (e) => pipelineOnlyEvents.push(e));

    const item = await orchestrator.triageIncoming({
      title: 'Event test',
      description: 'Test event routing',
      type: 'task',
    });

    // work_item.created should be in workItemEvents but NOT in pipelineOnlyEvents
    expect(workItemEvents.some((e) => e.type === 'work_item.created')).toBe(
      true,
    );
    expect(
      pipelineOnlyEvents.some((e) => e.type === 'work_item.created'),
    ).toBe(false);

    // Advance pipeline
    await orchestrator.advancePipeline(item.id);

    // pipeline.advanced should be in pipelineOnlyEvents
    expect(
      pipelineOnlyEvents.some((e) => e.type === 'pipeline.advanced'),
    ).toBe(true);
  });

  // ── Test 12: Invalid transitions are rejected ───────────────────────

  it('rejects invalid pipeline transitions', async () => {
    const item = await orchestrator.triageIncoming({
      title: 'Invalid test',
      description: 'Test rejection',
      type: 'feature',
    });

    // Trying to jump from intake to qa should fail
    await expect(
      orchestrator.advancePipeline(item.id, 'qa'),
    ).rejects.toThrow(/invalid transition/i);

    // Item should still be at intake
    expect(orchestrator.getWorkItem(item.id)?.status).toBe('intake');
  });

  // ── Test 13: Role assignment ────────────────────────────────────────

  it('assigns work items to team members by role', async () => {
    const item = await orchestrator.triageIncoming({
      title: 'Assign test',
      description: 'Test role assignment',
      type: 'feature',
    });

    const assigned = await orchestrator.assignToRole(
      item.id,
      'product_owner',
    );
    expect(assigned.assigneeHandle).toBe('BobPO');

    // Verify assignment event
    const assignEvents = events.filter(
      (e) => e.type === 'work_item.assigned',
    );
    expect(assignEvents.length).toBeGreaterThan(0);
    expect(assignEvents[0].payload.role).toBe('product_owner');
  });
});
