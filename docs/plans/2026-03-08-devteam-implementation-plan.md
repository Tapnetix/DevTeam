# DevTeam Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an AI-powered Agile development team system where role-specialized Claude Code agents collaborate through Slack, following a structured feature pipeline with Jira/CI/CD integration.

**Architecture:** TypeScript monorepo with five services — Orchestrator (Team Lead brain), Worker Pool (role agents spawning Claude Code), Slack Bot (Bolt SDK), Integration Layer (Jira/CI/CD/GitHub adapters), all coordinated via PostgreSQL LISTEN/NOTIFY event bus with pgvector for semantic knowledge retrieval.

**Tech Stack:** TypeScript, Node.js, PostgreSQL + pgvector, Slack Bolt SDK, Docker Compose, Kubernetes, Zod (validation), Drizzle ORM, Vitest (testing)

**Security note:** All code examples in this plan use `spawn()` with argument arrays for subprocess execution, never string-interpolated `exec()`. The actual implementation must follow this pattern to prevent command injection.

---

## Phase 1: Foundation — Monorepo, Config, Database, Event Bus

This phase delivers the project skeleton, configuration loading, database schema, and event bus. Everything else builds on this.

---

### Task 1: Initialize TypeScript Monorepo

**Files:**
- Create: `package.json` (root workspace)
- Create: `tsconfig.json` (root)
- Create: `tsconfig.base.json` (shared compiler options)
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/orchestrator/package.json`
- Create: `packages/orchestrator/tsconfig.json`
- Create: `packages/orchestrator/src/index.ts`
- Create: `packages/slack-bot/package.json`
- Create: `packages/slack-bot/tsconfig.json`
- Create: `packages/slack-bot/src/index.ts`
- Create: `packages/integrations/package.json`
- Create: `packages/integrations/tsconfig.json`
- Create: `packages/integrations/src/index.ts`
- Create: `packages/worker/package.json`
- Create: `packages/worker/tsconfig.json`
- Create: `packages/worker/src/index.ts`
- Create: `.gitignore`

**Step 1: Create root package.json with workspaces**

```json
{
  "name": "devteam",
  "version": "0.1.0",
  "private": true,
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "build": "tsc --build",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint packages/*/src/**/*.ts",
    "clean": "rm -rf packages/*/dist"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0",
    "eslint": "^9.0.0",
    "@types/node": "^22.0.0"
  }
}
```

**Step 2: Create tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

**Step 3: Create root tsconfig.json with project references**

```json
{
  "files": [],
  "references": [
    { "path": "packages/shared" },
    { "path": "packages/orchestrator" },
    { "path": "packages/slack-bot" },
    { "path": "packages/integrations" },
    { "path": "packages/worker" }
  ]
}
```

**Step 4: Create packages/shared with package.json, tsconfig.json, and empty src/index.ts**

`packages/shared/package.json`:
```json
{
  "name": "@devteam/shared",
  "version": "0.1.0",
  "private": true,
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run"
  },
  "dependencies": {
    "zod": "^3.24.0"
  }
}
```

`packages/shared/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

`packages/shared/src/index.ts`:
```typescript
export {};
```

**Step 5: Repeat for orchestrator, slack-bot, integrations, worker packages**

Each gets a similar `package.json` (name: `@devteam/<name>`, dependency on `@devteam/shared`), `tsconfig.json` (extending base, with reference to shared), and empty `src/index.ts`.

**Step 6: Create .gitignore**

```
node_modules/
dist/
*.tsbuildinfo
.env
.env.*
!.env.example
```

**Step 7: Install dependencies and verify build**

Run: `npm install && npm run build`
Expected: Clean build, no errors

**Step 8: Commit**

```bash
git add -A
git commit -m "feat: initialize TypeScript monorepo with 5 packages"
```

---

### Task 2: Configuration Schema and Loader

**Files:**
- Create: `packages/shared/src/config/schema.ts`
- Create: `packages/shared/src/config/loader.ts`
- Create: `packages/shared/src/config/index.ts`
- Test: `packages/shared/src/__tests__/config.test.ts`
- Create: `devteam.example.yaml`

**Step 1: Write the failing test**

```typescript
// packages/shared/src/__tests__/config.test.ts
import { describe, it, expect } from 'vitest';
import { loadConfig, TeamConfig } from '../config/index.js';

const VALID_YAML = `
team:
  name: "Test Team"
  project: "testproj"
  repository: "git@github.com:org/repo.git"

members:
  - role: team_lead
    name: Timothy
    handle: TimothyLead
    personality: "Decisive"
  - role: developer
    name: Donald
    handle: DonaldDev
    personality: "TDD enthusiast"

slack:
  workspace: "testorg"
  channels:
    main: "devteam-test"
    dev: "devteam-test-dev"
    design: "devteam-test-design"
    alerts: "devteam-test-alerts"

integrations:
  jira:
    baseUrl: "https://test.atlassian.net"
    project: "TEST"
  github:
    repo: "org/repo"
  cicd:
    type: "github_actions"

guardrails:
  autoMerge:
    maxFilesChanged: 10
    excludePaths: ["**/migrations/**"]
    requireTests: true
  humanApproval:
    - action: "production_deploy"
  blocked:
    - action: "force_push_main"

knowledge:
  embeddingModel: "text-embedding-3-small"
  maxContextTokens: 50000
`;

describe('loadConfig', () => {
  it('parses valid YAML config', () => {
    const config = loadConfig(VALID_YAML);
    expect(config.team.name).toBe('Test Team');
    expect(config.members).toHaveLength(2);
    expect(config.members[0].role).toBe('team_lead');
    expect(config.slack.channels.main).toBe('devteam-test');
  });

  it('rejects config missing required fields', () => {
    expect(() => loadConfig('team:\n  name: "X"')).toThrow();
  });

  it('rejects config with invalid role', () => {
    const bad = VALID_YAML.replace('team_lead', 'invalid_role');
    expect(() => loadConfig(bad)).toThrow();
  });

  it('requires at least one team_lead member', () => {
    const noLead = VALID_YAML.replace('team_lead', 'developer');
    expect(() => loadConfig(noLead)).toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/shared/src/__tests__/config.test.ts`
Expected: FAIL — module not found

**Step 3: Implement config schema with Zod**

```typescript
// packages/shared/src/config/schema.ts
import { z } from 'zod';

export const RoleEnum = z.enum([
  'team_lead',
  'product_owner',
  'architect',
  'ux_designer',
  'developer',
  'reviewer',
  'qa_engineer',
  'devops',
]);
export type Role = z.infer<typeof RoleEnum>;

export const TeamMemberSchema = z.object({
  role: RoleEnum,
  name: z.string().min(1),
  handle: z.string().min(1),
  personality: z.string().optional(),
  avatar: z.string().url().optional(),
});
export type TeamMember = z.infer<typeof TeamMemberSchema>;

export const SlackConfigSchema = z.object({
  workspace: z.string().min(1),
  channels: z.object({
    main: z.string().min(1),
    dev: z.string().min(1),
    design: z.string().min(1),
    alerts: z.string().min(1),
  }),
});

export const JiraConfigSchema = z.object({
  baseUrl: z.string().url(),
  project: z.string().min(1),
});

export const GitHubConfigSchema = z.object({
  repo: z.string().min(1),
});

export const CICDConfigSchema = z.object({
  type: z.string().min(1),
});

export const IntegrationsSchema = z.object({
  jira: JiraConfigSchema.optional(),
  github: GitHubConfigSchema.optional(),
  cicd: CICDConfigSchema.optional(),
});

export const AutoMergeSchema = z.object({
  maxFilesChanged: z.number().int().positive(),
  excludePaths: z.array(z.string()).default([]),
  requireTests: z.boolean().default(true),
});

export const GuardrailActionSchema = z.object({
  action: z.string().min(1),
});

export const GuardrailsSchema = z.object({
  autoMerge: AutoMergeSchema.optional(),
  humanApproval: z.array(GuardrailActionSchema).default([]),
  blocked: z.array(GuardrailActionSchema).default([]),
});

export const KnowledgeConfigSchema = z.object({
  embeddingModel: z.string().default('text-embedding-3-small'),
  maxContextTokens: z.number().int().positive().default(50000),
});

export const TeamConfigSchema = z.object({
  team: z.object({
    name: z.string().min(1),
    project: z.string().min(1),
    repository: z.string().min(1),
  }),
  members: z.array(TeamMemberSchema).min(1),
  slack: SlackConfigSchema,
  integrations: IntegrationsSchema.default({}),
  guardrails: GuardrailsSchema.default({}),
  knowledge: KnowledgeConfigSchema.default({}),
}).refine(
  (config) => config.members.some((m) => m.role === 'team_lead'),
  { message: 'Team must have at least one team_lead member' }
);

export type TeamConfig = z.infer<typeof TeamConfigSchema>;
```

```typescript
// packages/shared/src/config/loader.ts
import YAML from 'yaml';
import { readFileSync } from 'node:fs';
import { TeamConfigSchema, type TeamConfig } from './schema.js';

export function loadConfig(yamlContent: string): TeamConfig {
  const raw = YAML.parse(yamlContent);
  return TeamConfigSchema.parse(raw);
}

export function loadConfigFromFile(filePath: string): TeamConfig {
  const content = readFileSync(filePath, 'utf-8');
  return loadConfig(content);
}
```

```typescript
// packages/shared/src/config/index.ts
export { loadConfig, loadConfigFromFile } from './loader.js';
export { TeamConfigSchema, RoleEnum, type TeamConfig, type Role, type TeamMember } from './schema.js';
```

Update `packages/shared/src/index.ts`:
```typescript
export * from './config/index.js';
```

Add `yaml` dependency to `packages/shared/package.json`.

**Step 4: Run test to verify it passes**

Run: `npx vitest run packages/shared/src/__tests__/config.test.ts`
Expected: 4 tests PASS

**Step 5: Create devteam.example.yaml at project root**

(Copy the full example config from the design doc)

**Step 6: Commit**

```bash
git add packages/shared/src/config packages/shared/src/__tests__/config.test.ts devteam.example.yaml packages/shared/package.json
git commit -m "feat: add team config schema with Zod validation and YAML loader"
```

---

### Task 3: Database Schema and Migrations

**Files:**
- Create: `packages/shared/src/db/schema.ts`
- Create: `packages/shared/src/db/connection.ts`
- Create: `packages/shared/src/db/migrations/001_initial.sql`
- Create: `packages/shared/src/db/index.ts`
- Test: `packages/shared/src/__tests__/db.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/shared/src/__tests__/db.test.ts
import { describe, it, expect } from 'vitest';
import { getDbSchema } from '../db/index.js';

describe('database schema', () => {
  it('exports all required table definitions', () => {
    const schema = getDbSchema();
    const tableNames = Object.keys(schema);

    expect(tableNames).toContain('teams');
    expect(tableNames).toContain('teamMembers');
    expect(tableNames).toContain('workItems');
    expect(tableNames).toContain('pipelineStages');
    expect(tableNames).toContain('sessions');
    expect(tableNames).toContain('events');
    expect(tableNames).toContain('guardrails');
    expect(tableNames).toContain('sprintState');
    expect(tableNames).toContain('learnings');
    expect(tableNames).toContain('decisions');
    expect(tableNames).toContain('patterns');
    expect(tableNames).toContain('incidents');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/shared/src/__tests__/db.test.ts`
Expected: FAIL — module not found

**Step 3: Implement Drizzle ORM schema**

Define all 12 tables in `schema.ts` matching the design document. Include enums for role, work_item_type, work_item_status, and priority. Knowledge tables (learnings, decisions, patterns) include comments noting pgvector columns are added via migration.

Implement `connection.ts` with `createDb(connectionString)` using drizzle-orm/node-postgres.

Implement `index.ts` with `getDbSchema()` returning all table references.

**Step 4: Create SQL migration**

`001_initial.sql` creates extensions (uuid-ossp, vector), enums, all tables, vector columns on knowledge tables, and indexes including ivfflat indexes for vector columns.

**Step 5: Run test to verify it passes**

Run: `npx vitest run packages/shared/src/__tests__/db.test.ts`
Expected: PASS

**Step 6: Add drizzle-orm and pg dependencies to packages/shared/package.json**

**Step 7: Commit**

```bash
git add packages/shared/src/db packages/shared/src/__tests__/db.test.ts
git commit -m "feat: add database schema with Drizzle ORM and pgvector support"
```

---

### Task 4: Event Bus (PostgreSQL LISTEN/NOTIFY)

**Files:**
- Create: `packages/shared/src/events/event-bus.ts`
- Create: `packages/shared/src/events/types.ts`
- Create: `packages/shared/src/events/index.ts`
- Test: `packages/shared/src/__tests__/event-bus.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/shared/src/__tests__/event-bus.test.ts
import { describe, it, expect, vi } from 'vitest';
import { InMemoryEventBus } from '../events/index.js';

describe('InMemoryEventBus', () => {
  it('publishes and receives events', async () => {
    const bus = new InMemoryEventBus();
    const handler = vi.fn();

    bus.subscribe('work_item.created', handler);
    await bus.publish({
      type: 'work_item.created',
      actor: 'TimothyLead',
      payload: { title: 'New feature' },
    });

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].payload.title).toBe('New feature');
  });

  it('supports wildcard subscriptions', async () => {
    const bus = new InMemoryEventBus();
    const handler = vi.fn();

    bus.subscribe('work_item.*', handler);
    await bus.publish({ type: 'work_item.created', actor: 'test', payload: {} });
    await bus.publish({ type: 'work_item.updated', actor: 'test', payload: {} });

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('unsubscribes correctly', async () => {
    const bus = new InMemoryEventBus();
    const handler = vi.fn();

    const unsub = bus.subscribe('test.event', handler);
    await bus.publish({ type: 'test.event', actor: 'test', payload: {} });
    unsub();
    await bus.publish({ type: 'test.event', actor: 'test', payload: {} });

    expect(handler).toHaveBeenCalledOnce();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/shared/src/__tests__/event-bus.test.ts`
Expected: FAIL

**Step 3: Implement event bus types and InMemoryEventBus**

```typescript
// packages/shared/src/events/types.ts
export interface DevTeamEvent {
  type: string;
  actor: string;
  workItemId?: string;
  taskId?: string;
  payload: Record<string, unknown>;
  timestamp?: Date;
}

export type EventHandler = (event: DevTeamEvent) => void | Promise<void>;

export interface EventBus {
  publish(event: DevTeamEvent): Promise<void>;
  subscribe(pattern: string, handler: EventHandler): () => void;
  close(): Promise<void>;
}
```

```typescript
// packages/shared/src/events/event-bus.ts
import type { DevTeamEvent, EventHandler, EventBus } from './types.js';

export class InMemoryEventBus implements EventBus {
  private handlers = new Map<string, Set<EventHandler>>();

  subscribe(pattern: string, handler: EventHandler): () => void {
    if (!this.handlers.has(pattern)) {
      this.handlers.set(pattern, new Set());
    }
    this.handlers.get(pattern)!.add(handler);
    return () => { this.handlers.get(pattern)?.delete(handler); };
  }

  async publish(event: DevTeamEvent): Promise<void> {
    event.timestamp ??= new Date();
    for (const [pattern, handlers] of this.handlers) {
      if (this.matches(event.type, pattern)) {
        for (const handler of handlers) {
          await handler(event);
        }
      }
    }
  }

  async close(): Promise<void> {
    this.handlers.clear();
  }

  private matches(type: string, pattern: string): boolean {
    if (pattern === type) return true;
    if (pattern.endsWith('.*')) {
      const prefix = pattern.slice(0, -2);
      return type.startsWith(prefix + '.');
    }
    return false;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run packages/shared/src/__tests__/event-bus.test.ts`
Expected: 3 tests PASS

**Step 5: Commit**

```bash
git add packages/shared/src/events packages/shared/src/__tests__/event-bus.test.ts
git commit -m "feat: add event bus with InMemory implementation and wildcard subscriptions"
```

---

### Task 5: PgEventBus Implementation

**Files:**
- Create: `packages/shared/src/events/pg-event-bus.ts`
- Modify: `packages/shared/src/events/index.ts`
- Test: `packages/shared/src/__tests__/pg-event-bus.integration.test.ts`

This is an integration test that requires a running PostgreSQL. Mark it for separate execution.

**Step 1: Write the failing integration test**

Test that PgEventBus can publish from one instance and receive on another. Skip if no DATABASE_URL env var.

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/shared/src/__tests__/pg-event-bus.integration.test.ts`
Expected: FAIL (module not found or skipped)

**Step 3: Implement PgEventBus**

Uses `pg` library's Client for LISTEN and Pool for NOTIFY. The PgEventBus implements the same `EventBus` interface, using a dedicated LISTEN connection and pg_notify for publishing. Uses `spawn`-style safe patterns for any subprocess calls.

**Step 4: Update exports and run unit tests**

Run: `npx vitest run packages/shared/src/__tests__/event-bus.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/shared/src/events/pg-event-bus.ts packages/shared/src/__tests__/pg-event-bus.integration.test.ts packages/shared/src/events/index.ts
git commit -m "feat: add PostgreSQL LISTEN/NOTIFY event bus implementation"
```

---

## Phase 2: Worker System — Role Agents and Claude Code Spawning

This phase builds the worker system that spawns Claude Code sessions with role-specific system prompts.

---

### Task 6: Role System Prompt Templates

**Files:**
- Create: `packages/worker/src/roles/prompts.ts`
- Create: `packages/worker/src/roles/types.ts`
- Create: `packages/worker/src/roles/index.ts`
- Test: `packages/worker/src/__tests__/roles.test.ts`

**Step 1: Write the failing test**

Test that `buildSystemPrompt()` generates role-appropriate prompts containing the member's name, handle, role responsibilities, personality, and project context. Verify all 8 roles produce distinct prompts.

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/worker/src/__tests__/roles.test.ts`
Expected: FAIL

**Step 3: Implement role prompt builder**

Create a `ROLE_TEMPLATES` map with system prompt templates per role. Each template includes:
- Identity and name
- Core responsibilities (what they do/don't do)
- Process guidelines (how they fit into the pipeline)
- Communication style (for Slack posting)
- Personality trait injection
- Guardrails (what needs approval)

`buildSystemPrompt(member, context)` interpolates the template with member and project data.

**Step 4: Run tests**

Run: `npx vitest run packages/worker/src/__tests__/roles.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/worker/src/roles packages/worker/src/__tests__/roles.test.ts
git commit -m "feat: add role-based system prompt templates for all 8 team roles"
```

---

### Task 7: Claude Code Session Spawner

**Files:**
- Create: `packages/worker/src/claude/spawner.ts`
- Create: `packages/worker/src/claude/types.ts`
- Create: `packages/worker/src/claude/index.ts`
- Test: `packages/worker/src/__tests__/spawner.test.ts`

**Step 1: Write the failing test**

Test that `ClaudeCodeSpawner.buildArgs()` constructs correct CLI arguments including `--print`, `--system-prompt`, optional `--max-turns` and `--model`.

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/worker/src/__tests__/spawner.test.ts`
Expected: FAIL

**Step 3: Implement Claude Code spawner**

Uses `spawn()` from `node:child_process` (NOT `exec`) with argument arrays for safe subprocess execution. Configuration includes workingDirectory, systemPrompt, maxTurns, model, and allowedTools. Returns `{ exitCode, stdout, stderr }`.

**Step 4: Run tests**

Run: `npx vitest run packages/worker/src/__tests__/spawner.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/worker/src/claude packages/worker/src/__tests__/spawner.test.ts
git commit -m "feat: add Claude Code session spawner with configurable system prompts"
```

---

### Task 8: Worker Process (Role Agent Lifecycle)

**Files:**
- Create: `packages/worker/src/worker.ts`
- Create: `packages/worker/src/worktree.ts`
- Test: `packages/worker/src/__tests__/worker.test.ts`
- Test: `packages/worker/src/__tests__/worktree.test.ts`

**Step 1: Write the failing tests**

Test WorktreeManager: path generation, command building for `git worktree add`, list, and remove.
Test Worker: creation with role config, event emission on start/complete.

**Step 2: Run tests to verify failure**

**Step 3: Implement WorktreeManager**

Uses `spawn()` (not `exec`) for all git commands. Methods: `getWorktreePath()`, `create()`, `remove()`, `list()`.

**Step 4: Implement Worker class**

Composes WorktreeManager + ClaudeCodeSpawner + EventBus. The `executeTask()` method: publishes `worker.started` event → creates worktree → spawns Claude Code session → publishes `worker.completed` or `worker.failed` → returns result.

**Step 5: Run all tests**

Run: `npx vitest run packages/worker/`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/worker/src/worker.ts packages/worker/src/worktree.ts packages/worker/src/__tests__/
git commit -m "feat: add Worker process with worktree management and Claude Code execution"
```

---

## Phase 3: Slack Bot — Team Communication

---

### Task 9: Slack Bot with Multi-Identity Messaging

**Files:**
- Create: `packages/slack-bot/src/app.ts`
- Create: `packages/slack-bot/src/identity.ts`
- Create: `packages/slack-bot/src/channels.ts`
- Test: `packages/slack-bot/src/__tests__/identity.test.ts`

**Step 1: Write the failing test**

Test `TeamIdentityManager.buildMessage()`: generates Slack message payload with correct username, channel, and text. Throws for unknown handle.

**Step 2: Run test to verify it fails**

**Step 3: Implement TeamIdentityManager and Slack Bolt app**

TeamIdentityManager maps handles to Slack bot user tokens/usernames. Channels module handles routing logic. App module initializes Bolt SDK with event handlers.

**Step 4: Run tests, commit**

```bash
git add packages/slack-bot/src/ packages/slack-bot/src/__tests__/
git commit -m "feat: add Slack bot with multi-identity team member messaging"
```

---

### Task 10: Slack Event Handlers (Mentions, Reactions, Approvals)

**Files:**
- Create: `packages/slack-bot/src/handlers/mention.ts`
- Create: `packages/slack-bot/src/handlers/reaction.ts`
- Create: `packages/slack-bot/src/handlers/approval.ts`
- Create: `packages/slack-bot/src/handlers/index.ts`
- Test: `packages/slack-bot/src/__tests__/handlers.test.ts`

**Step 1: Write the failing test**

Test each handler: mention routing to correct team member, reaction mapping to approval/rejection events, thread reply context preservation.

**Step 2: Implement handlers**

- @mentions → parse target member → route to appropriate worker via event bus
- Reactions (checkmark/cross) → map to approval/rejection → publish guardrail event
- Thread replies → extract thread context → publish to event bus for conversation tracking

**Step 3: Run tests, commit**

```bash
git add packages/slack-bot/src/handlers packages/slack-bot/src/__tests__/handlers.test.ts
git commit -m "feat: add Slack event handlers for mentions, reactions, and approvals"
```

---

## Phase 4: Orchestrator — Team Lead Brain

---

### Task 11: Task Dependency Graph

**Files:**
- Create: `packages/orchestrator/src/graph/task-graph.ts`
- Create: `packages/orchestrator/src/graph/index.ts`
- Test: `packages/orchestrator/src/__tests__/task-graph.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/orchestrator/src/__tests__/task-graph.test.ts
import { describe, it, expect } from 'vitest';
import { TaskGraph } from '../graph/index.js';

describe('TaskGraph', () => {
  it('returns tasks with no dependencies as ready', () => {
    const graph = new TaskGraph();
    graph.addTask({ id: 't1', title: 'Create theme context' });
    graph.addTask({ id: 't2', title: 'Add toggle', dependsOn: ['t1'] });
    graph.addTask({ id: 't3', title: 'Persist theme' }); // independent

    const ready = graph.getReady();
    expect(ready.map(t => t.id)).toEqual(['t1', 't3']);
  });

  it('unblocks tasks when dependencies complete', () => {
    const graph = new TaskGraph();
    graph.addTask({ id: 't1', title: 'Create theme context' });
    graph.addTask({ id: 't2', title: 'Add toggle', dependsOn: ['t1'] });

    expect(graph.getReady().map(t => t.id)).toEqual(['t1']);

    const unblocked = graph.markComplete('t1');
    expect(unblocked.map(t => t.id)).toEqual(['t2']);
    expect(graph.getReady().map(t => t.id)).toEqual(['t2']);
  });

  it('detects circular dependencies', () => {
    const graph = new TaskGraph();
    graph.addTask({ id: 't1', title: 'A', dependsOn: ['t2'] });
    graph.addTask({ id: 't2', title: 'B', dependsOn: ['t1'] });

    expect(() => graph.validate()).toThrow(/circular/i);
  });

  it('returns empty when all tasks are complete', () => {
    const graph = new TaskGraph();
    graph.addTask({ id: 't1', title: 'Only task' });
    graph.markComplete('t1');

    expect(graph.getReady()).toEqual([]);
    expect(graph.isComplete()).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/orchestrator/src/__tests__/task-graph.test.ts`
Expected: FAIL

**Step 3: Implement TaskGraph**

TaskGraph with `addTask()`, `getReady()`, `markComplete()`, `isComplete()`, and `validate()` (cycle detection via topological sort).

**Step 4: Run tests**

Run: `npx vitest run packages/orchestrator/src/__tests__/task-graph.test.ts`
Expected: 4 tests PASS

**Step 5: Commit**

```bash
git add packages/orchestrator/src/graph packages/orchestrator/src/__tests__/task-graph.test.ts
git commit -m "feat: add task dependency graph with cycle detection"
```

---

### Task 12: Pipeline State Machine

**Files:**
- Create: `packages/orchestrator/src/pipeline/state-machine.ts`
- Create: `packages/orchestrator/src/pipeline/index.ts`
- Test: `packages/orchestrator/src/__tests__/pipeline.test.ts`

**Step 1: Write the failing test**

Test valid transitions (intake→requirements→design→implement→review→qa→done), invalid transitions (intake→qa should throw), bug fast-path (intake→implement), feedback loops (review→implement, qa→intake for bugs), and role assignments per stage.

**Step 2: Implement PipelineStateMachine**

Define valid transitions as a map. Methods: `canTransition(from, to)`, `transition(workItem, targetStage)`, `getRoleForStage(stage)`, `getBugFastPath()`.

**Step 3: Run tests, commit**

```bash
git add packages/orchestrator/src/pipeline packages/orchestrator/src/__tests__/pipeline.test.ts
git commit -m "feat: add pipeline state machine with transitions and fast paths"
```

---

### Task 13: Orchestrator Core (Triage, Assign, Advance)

**Files:**
- Create: `packages/orchestrator/src/orchestrator.ts`
- Create: `packages/orchestrator/src/context-builder.ts`
- Test: `packages/orchestrator/src/__tests__/orchestrator.test.ts`

**Step 1: Write the failing test**

Test `triageIncoming()` classifies work items correctly. Test `assignToRole()` matches tasks to available workers. Test `advancePipeline()` moves work items to next stage and publishes events. Test `buildTaskContext()` assembles a context package.

**Step 2: Implement Orchestrator**

Composes TaskGraph + PipelineStateMachine + EventBus + Database. Methods: `triageIncoming()`, `assignToRole()`, `advancePipeline()`, `buildTaskContext()`, `handleWorkerComplete()`.

**Step 3: Run tests, commit**

```bash
git add packages/orchestrator/src/orchestrator.ts packages/orchestrator/src/context-builder.ts packages/orchestrator/src/__tests__/orchestrator.test.ts
git commit -m "feat: add Orchestrator core with triage, assignment, and pipeline advancement"
```

---

## Phase 5: Integration Layer — Jira, CI/CD, GitHub

---

### Task 14: Adapter Interfaces and Jira Adapter

**Files:**
- Create: `packages/integrations/src/adapters/types.ts`
- Create: `packages/integrations/src/adapters/jira.ts`
- Create: `packages/integrations/src/adapters/index.ts`
- Test: `packages/integrations/src/__tests__/jira.test.ts`

**Step 1: Write the failing test**

Test JiraAdapter methods with mocked HTTP responses: `getWorkItems()`, `createWorkItem()`, `updateWorkItem()`, `addComment()`.

**Step 2: Implement adapter interfaces (ProjectTrackerAdapter, CICDAdapter, SourceControlAdapter) and JiraAdapter**

JiraAdapter uses Jira REST API v3 with authentication via API token. Implements bidirectional sync.

**Step 3: Run tests, commit**

```bash
git add packages/integrations/src/adapters packages/integrations/src/__tests__/jira.test.ts
git commit -m "feat: add Jira adapter with bidirectional sync"
```

---

### Task 15: GitHub Adapter

**Files:**
- Create: `packages/integrations/src/adapters/github.ts`
- Test: `packages/integrations/src/__tests__/github.test.ts`

Implement `SourceControlAdapter` for GitHub using Octokit. Methods: `createPR()`, `reviewPR()`, `mergePR()`, `onPREvent()`.

**Test with mocked Octokit, implement, commit.**

```bash
git add packages/integrations/src/adapters/github.ts packages/integrations/src/__tests__/github.test.ts
git commit -m "feat: add GitHub adapter for PR management and webhooks"
```

---

### Task 16: CI/CD Adapter (GitHub Actions)

**Files:**
- Create: `packages/integrations/src/adapters/github-actions.ts`
- Test: `packages/integrations/src/__tests__/github-actions.test.ts`

Implement `CICDAdapter` for GitHub Actions. Methods: `onBuildComplete()`, `onTestResults()`, `triggerBuild()`, `getArtifacts()`.

**Test, implement, commit.**

```bash
git add packages/integrations/src/adapters/github-actions.ts packages/integrations/src/__tests__/github-actions.test.ts
git commit -m "feat: add GitHub Actions CI/CD adapter"
```

---

### Task 17: Webhook Receiver Service

**Files:**
- Create: `packages/integrations/src/webhook-server.ts`
- Create: `packages/integrations/src/webhook-handlers.ts`
- Test: `packages/integrations/src/__tests__/webhooks.test.ts`

**Step 1: Write the failing test**

Test webhook signature validation, event parsing, and event bus publishing for Jira, GitHub, and CI/CD webhooks.

**Step 2: Implement webhook server**

Fastify HTTP server that receives webhooks, validates signatures (HMAC for GitHub, JWT for Jira), parses payloads, and publishes events to the event bus.

**Step 3: Run tests, commit**

```bash
git add packages/integrations/src/webhook-server.ts packages/integrations/src/webhook-handlers.ts packages/integrations/src/__tests__/webhooks.test.ts
git commit -m "feat: add webhook receiver service with signature validation"
```

---

## Phase 6: Knowledge System — Semantic Search and Learning

---

### Task 18: Embedding Service

**Files:**
- Create: `packages/shared/src/knowledge/embeddings.ts`
- Create: `packages/shared/src/knowledge/index.ts`
- Test: `packages/shared/src/__tests__/embeddings.test.ts`

**Step 1: Write the failing test**

Test that `EmbeddingService.embed()` returns a vector of the correct dimension. Test with mocked API response.

**Step 2: Implement EmbeddingService**

Calls configurable embedding API (default: OpenAI text-embedding-3-small). Returns `number[]` (1536 dimensions). Includes retry logic and rate limiting.

**Step 3: Run tests, commit**

```bash
git add packages/shared/src/knowledge packages/shared/src/__tests__/embeddings.test.ts
git commit -m "feat: add embedding service for semantic knowledge search"
```

---

### Task 19: Knowledge Repository (CRUD + Semantic Search)

**Files:**
- Create: `packages/shared/src/knowledge/repository.ts`
- Test: `packages/shared/src/__tests__/knowledge-repository.test.ts`

**Step 1: Write the failing test**

Test CRUD operations: `store()`, `search()` (semantic), `getByWorkItem()`, `getByTags()`.

**Step 2: Implement KnowledgeRepository**

Uses Drizzle ORM for CRUD. Semantic search uses pgvector cosine similarity (`<=>` operator). Auto-generates embeddings on store via EmbeddingService.

**Step 3: Run tests, commit**

```bash
git add packages/shared/src/knowledge/repository.ts packages/shared/src/__tests__/knowledge-repository.test.ts
git commit -m "feat: add knowledge repository with semantic search via pgvector"
```

---

### Task 20: Context Builder Enhancement

**Files:**
- Modify: `packages/orchestrator/src/context-builder.ts`
- Test: `packages/orchestrator/src/__tests__/context-builder.test.ts`

**Step 1: Write the failing test**

Test that `buildTaskContext()` queries KnowledgeRepository for relevant learnings, decisions, and patterns, and assembles the full `TaskContext` interface.

**Step 2: Enhance context builder**

Integrate KnowledgeRepository.search() into the context assembly. Respect `maxContextTokens` from config.

**Step 3: Run tests, commit**

```bash
git add packages/orchestrator/src/context-builder.ts packages/orchestrator/src/__tests__/context-builder.test.ts
git commit -m "feat: enhance context builder with semantic knowledge retrieval"
```

---

## Phase 7: Deployment — Docker and Kubernetes

---

### Task 21: Dockerfiles for Each Service

**Files:**
- Create: `packages/orchestrator/Dockerfile`
- Create: `packages/slack-bot/Dockerfile`
- Create: `packages/integrations/Dockerfile`
- Create: `packages/worker/Dockerfile`

Each Dockerfile: multi-stage build (build stage with TypeScript compilation, production stage with only dist/ and node_modules).

Worker Dockerfile must include Claude Code CLI installation.

**Build and verify each image.**

```bash
git add packages/*/Dockerfile
git commit -m "feat: add Dockerfiles for all services"
```

---

### Task 22: Docker Compose for Development

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`

Full docker-compose with PostgreSQL (pgvector), orchestrator, slack-bot, integrations, and shared volumes.

**Test with `docker compose config` (validate) then `docker compose build`.**

```bash
git add docker-compose.yml .env.example
git commit -m "feat: add Docker Compose for local development"
```

---

### Task 23: Kubernetes Manifests

**Files:**
- Create: `k8s/orchestrator-deployment.yaml`
- Create: `k8s/slack-bot-deployment.yaml`
- Create: `k8s/integrations-deployment.yaml`
- Create: `k8s/postgres-statefulset.yaml`
- Create: `k8s/worker-job-template.yaml`
- Create: `k8s/configmap.yaml`
- Create: `k8s/secrets.yaml`
- Create: `k8s/ingress.yaml`

**Validate with `kubectl apply --dry-run=client -f k8s/`.**

```bash
git add k8s/
git commit -m "feat: add Kubernetes manifests for production deployment"
```

---

## Phase 8: End-to-End Integration

---

### Task 24: CLI Setup Command

**Files:**
- Create: `packages/cli/src/commands/init.ts`
- Create: `packages/cli/src/commands/start.ts`
- Create: `packages/cli/src/commands/status.ts`
- Create: `packages/cli/src/index.ts`
- Create: `packages/cli/package.json`
- Test: `packages/cli/src/__tests__/commands.test.ts`

CLI commands:
- `devteam init` — interactive team setup, generates `devteam.yaml`
- `devteam start` — boots all services, creates Slack channels, initializes DB
- `devteam status` — shows team state, active work, sprint progress

**Test, implement, commit.**

```bash
git add packages/cli/
git commit -m "feat: add CLI with init, start, and status commands"
```

---

### Task 25: End-to-End Smoke Test

**Files:**
- Create: `tests/e2e/smoke.test.ts`

Integration test that:
1. Boots DevTeam with Docker Compose (using test config)
2. Creates a mock work item via the event bus
3. Verifies it flows through INTAKE → REQUIREMENTS (PO worker activates)
4. Verifies Slack messages are posted (mock Slack API)
5. Verifies events are logged in PostgreSQL

**Test, commit.**

```bash
git add tests/e2e/
git commit -m "test: add end-to-end smoke test for feature pipeline"
```

---

## Task Dependencies

```
Phase 1 (Foundation):
  Task 1 (monorepo) → Task 2 (config) → Task 3 (database) → Task 4 (event bus) → Task 5 (pg event bus)

Phase 2 (Workers):           Phase 3 (Slack):           Phase 4 (Orchestrator):
  Task 6 (prompts) ─┐         Task 9 (identity) ─┐       Task 11 (graph) ─┐
  Task 7 (spawner) ──┤         Task 10 (handlers)─┤       Task 12 (pipeline)┤
  Task 8 (worker) ───┘                            ┘       Task 13 (core) ───┘

Phase 5 (Integrations):     Phase 6 (Knowledge):
  Task 14 (jira) ─┐           Task 18 (embeddings)──┐
  Task 15 (github)─┤           Task 19 (repository)──┤
  Task 16 (cicd) ──┤           Task 20 (context) ────┘
  Task 17 (webhooks)┘

Phase 7 (Deploy):            Phase 8 (E2E):
  Task 21 (dockerfiles)─┐     Task 24 (CLI) ──┐
  Task 22 (compose) ────┤     Task 25 (smoke)──┘
  Task 23 (k8s) ────────┘

Phases 2, 3, 4 can be worked on in parallel (they all depend on Phase 1).
Phase 5 depends on Phase 4 (orchestrator).
Phase 6 depends on Phase 1 (database).
Phase 7 depends on Phases 2-5.
Phase 8 depends on everything.
```

## Execution Notes

- **Phases 2, 3, 4 are parallelizable** — assign to different developers (or parallel subagents)
- Each task should take 15-45 minutes for an experienced developer
- Phase 1 is the critical path — nothing else can start until it's done
- Integration tests (Task 5, Task 25) require running PostgreSQL
- Worker Dockerfile (Task 21) requires Claude Code CLI to be installable in containers
- All subprocess execution must use `spawn()` with argument arrays, never string-interpolated `exec()`
