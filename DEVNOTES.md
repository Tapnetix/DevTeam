# DevTeam — Developer Notes

Technical reference for contributors covering architecture, package structure, build system, testing, and database schema.

## Architecture Overview

DevTeam follows an **Orchestrator + Worker** architecture with an event-driven pipeline. The system is a TypeScript monorepo with six packages that communicate through a PostgreSQL-backed event bus.

```
┌──────────────────────────────────────────────────────────────┐
│                        Slack Bot                             │
│  Multi-identity messaging (each role has its own persona)    │
│  Handlers: @mentions, reactions, approval workflows          │
└──────────────┬───────────────────────────────┬───────────────┘
               │ events                        │ messages
┌──────────────▼───────────────┐  ┌────────────▼───────────────┐
│        Orchestrator          │  │       Integrations         │
│                              │  │                            │
│  PipelineStateMachine        │  │  JiraAdapter               │
│  TaskGraph (DAG)             │  │  GitHubAdapter             │
│  ContextBuilder              │  │  GitHubActionsAdapter      │
│  Role-based assignment       │  │  WebhookServer             │
└──────────────┬───────────────┘  └────────────┬───────────────┘
               │ spawn                         │ webhooks
┌──────────────▼───────────────┐               │
│        Worker Pool           │               │
│                              │               │
│  Claude Code sessions        │               │
│  Git worktree isolation      │               │
│  Role-specific prompts       │               │
└──────────────┬───────────────┘               │
               │                               │
┌──────────────▼───────────────────────────────▼───────────────┐
│                     Shared Layer                             │
│                                                              │
│  Config (Zod)  │  Database (Drizzle)  │  EventBus (PG)      │
│  Knowledge (pgvector embeddings, semantic search)            │
└──────────────────────────────────────────────────────────────┘
               │
┌──────────────▼───────────────────────────────────────────────┐
│              PostgreSQL 16 + pgvector                        │
│  12 tables, 4 enums, IVFFlat vector indexes                 │
└──────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Input** arrives via Slack messages, Jira webhooks, or GitHub webhooks
2. **Integrations** validates webhook signatures and normalizes events
3. **Event Bus** (PostgreSQL LISTEN/NOTIFY) distributes events to subscribers
4. **Orchestrator** triages incoming work, manages the pipeline state machine, breaks work into a task dependency graph, assigns tasks to roles, and assembles context packages with semantic knowledge retrieval
5. **Workers** execute tasks in isolated git worktrees as Claude Code sessions with role-specific system prompts
6. **Slack Bot** posts updates with team member identities (configurable names and avatars)
7. **Knowledge System** stores learnings, decisions, and patterns with vector embeddings for future context retrieval

### Event Bus

The event bus uses PostgreSQL LISTEN/NOTIFY rather than Redis or NATS. This eliminates an external dependency while providing sufficient throughput for single-team scale. Two implementations:

- **InMemoryEventBus** — used in tests and the E2E smoke suite
- **PgEventBus** — production implementation using a dedicated LISTEN connection and `pg_notify()` for publishing

Events follow the pattern `<domain>.<action>`, e.g., `work_item.created`, `pipeline.advanced`, `worker.completed`. Wildcard subscriptions (`work_item.*`) are supported.

### Pipeline State Machine

Nine stages with validated transitions:

```
backlog → intake → requirements → design → implement → review → qa → done
                                                                    → cancelled
```

Feedback loops: `review → implement`, `qa → implement` (for bugs).

Bug fast-path skips `requirements` and `design`: `intake → implement → review → qa → done`.

Each stage maps to a role via `STAGE_ROLES`:
- intake → team_lead
- requirements → product_owner
- design → architect
- implement → developer
- review → reviewer
- qa → qa_engineer

## Package Structure

```
devteam/
├── packages/
│   ├── shared/          @devteam/shared        Config, DB, events, knowledge
│   ├── orchestrator/    @devteam/orchestrator   Pipeline, task graph, triage
│   ├── worker/          @devteam/worker         Claude Code spawner, worktrees
│   ├── slack-bot/       @devteam/slack-bot      Bolt SDK, multi-identity
│   ├── integrations/    @devteam/integrations   Jira, GitHub, CI/CD, webhooks
│   └── cli/             @devteam/cli            init, start, status commands
├── tests/
│   └── e2e/             End-to-end smoke tests
├── k8s/                 Kubernetes manifests
├── docs/plans/          Design doc and implementation plan
├── docker-compose.yml
├── devteam.example.yaml
├── .env.example
├── tsconfig.json        Project references (root)
├── tsconfig.base.json   Shared compiler options
└── package.json         Workspace root
```

### Package Dependencies

```
cli ──────────→ shared
orchestrator ──→ shared
worker ────────→ shared
slack-bot ─────→ shared
integrations ──→ shared
```

All packages depend on `@devteam/shared`. There are no cross-dependencies between orchestrator, worker, slack-bot, integrations, or cli.

### Package Exports

**@devteam/shared**
- `loadConfig()`, `loadConfigFromFile()` — YAML config loading with Zod validation
- `TeamConfigSchema`, `RoleEnum`, and all sub-schemas
- Database: `createDbConnection()`, Drizzle table definitions (12 tables)
- `InMemoryEventBus`, `PgEventBus` — event bus implementations
- `EmbeddingService` — OpenAI embedding API wrapper with retry logic
- `KnowledgeRepository` — CRUD + semantic search over learnings, decisions, patterns

**@devteam/orchestrator**
- `Orchestrator` — core class: triage, assign, advance, break into tasks
- `PipelineStateMachine` — stage transitions, fast paths, role mapping
- `TaskGraph` — dependency DAG with cycle detection (Kahn's algorithm)
- `ContextBuilder` — assembles context packages with optional knowledge retrieval

**@devteam/worker**
- `Worker` — full lifecycle: event publish → worktree → Claude Code → cleanup
- `WorktreeManager` — git worktree create/remove/list
- `ClaudeCodeSpawner` — safe `spawn()` with CLI argument construction
- `buildSystemPrompt()`, `ROLE_TEMPLATES` — role-specific prompt generation

**@devteam/slack-bot**
- `createSlackBot()` — Bolt SDK app factory
- `TeamIdentityManager` — maps handles to Slack message payloads
- `ChannelRouter` — routes events to appropriate Slack channels
- `MentionHandler`, `ReactionHandler`, `ApprovalHandler` — event handlers

**@devteam/integrations**
- `JiraAdapter` — Jira REST API v3, bidirectional sync
- `GitHubAdapter` — Octokit-based PR management
- `GitHubActionsAdapter` — CI/CD build status and artifact retrieval
- `WebhookServer`, `WebhookHandlers` — signature validation (HMAC-SHA256), event normalization

**@devteam/cli**
- `runInit()` — interactive or programmatic config generation
- `runStart()` — config validation and startup checklist
- `runStatus()` — team info and work item display

## Build System

### TypeScript Configuration

The monorepo uses TypeScript project references with composite builds:

- **`tsconfig.base.json`** — shared compiler options: `ES2022` target, `Node16` modules, strict mode, declaration files, source maps
- **`tsconfig.json`** (root) — project references to all 6 packages
- Each package has its own `tsconfig.json` extending the base and referencing its dependencies

### Commands

```bash
# Full incremental build (all packages)
npm run build

# Clean all build artifacts
npm run clean

# Lint all packages
npm run lint
```

`npm run build` runs `tsc --build` from the root, which uses project references for incremental compilation. The build order is determined automatically from the dependency graph.

### Adding a New Package

1. Create `packages/<name>/package.json` with `"name": "@devteam/<name>"`
2. Create `packages/<name>/tsconfig.json` extending `../../tsconfig.base.json`
3. Add `{ "path": "packages/<name>" }` to root `tsconfig.json` references
4. If it depends on shared: add `"@devteam/shared": "*"` to dependencies and `{ "path": "../shared" }` to tsconfig references
5. Run `npm install` to link workspaces

## Testing

### Framework

Tests use [Vitest](https://vitest.dev/) 3.x. The root `vitest` config discovers tests across all packages via the workspace glob.

### Test Organization

Tests live alongside their source in `__tests__/` directories:

```
packages/<name>/src/__tests__/<module>.test.ts
```

E2E tests are in `tests/e2e/`.

### Running Tests

```bash
npm test                              # All tests
npm run test:watch                    # Watch mode
npx vitest run packages/shared/       # Single package
npx vitest run tests/e2e/             # E2E only
```

### Test Counts

| Package | Test Files | Tests |
|---------|-----------|-------|
| shared | 6 | 38 (4 skipped) |
| orchestrator | 4 | 29 |
| worker | 4 | 20 |
| slack-bot | 2 | 21 |
| integrations | 4 | 45 |
| cli | 1 | 15 |
| e2e | 1 | 13 |
| **Total** | **22** | **177 (4 skipped)** |

The 4 skipped tests are PostgreSQL integration tests (`pg-event-bus.integration.test.ts`) that require a running database with `DATABASE_URL` set.

### Testing Patterns

- **Mocked fetch** — Jira adapter, embedding service, and other HTTP clients mock `global.fetch`
- **Dependency injection** — GitHub and CI/CD adapters accept injected Octokit clients rather than importing directly, making tests straightforward
- **InMemoryEventBus** — all orchestrator and worker tests use the in-memory event bus
- **No module mocking** — tests avoid `vi.mock()` at the module level; dependency injection is preferred
- **E2E smoke tests** — verify the full pipeline flow using in-memory implementations, no external services needed

## Database

### Schema

PostgreSQL 16 with two extensions: `uuid-ossp` and `vector` (pgvector).

**4 Enums:** `role`, `work_item_type`, `work_item_status`, `priority`

**12 Tables:**

| Table | Purpose | Key Columns |
|-------|---------|------------|
| `teams` | Team identity and config | name, project, repository, config (JSONB) |
| `team_members` | Team roster | role, name, handle, personality, system_prompt |
| `work_items` | Features, bugs, tasks | type, status, priority, title, assignee, parent |
| `pipeline_stages` | Stage history per work item | stage, entered_at, exited_at, assigned_to |
| `sessions` | Claude Code session tracking | worktree_path, status, tokens_used |
| `events` | Event audit log | type, actor, payload (JSONB), duration_ms |
| `guardrails` | Guardrail configuration | config (JSONB) |
| `sprint_state` | Sprint tracking | sprint_number, goals (JSONB), velocity |
| `learnings` | Accumulated learnings | content, tags, **embedding vector(1536)** |
| `decisions` | Architecture decisions | title, decision, rationale, **embedding vector(1536)** |
| `patterns` | Code patterns | name, code_example, **embedding vector(1536)** |
| `incidents` | Incident records | title, root_cause, resolution, severity |

### Vector Search

The `learnings`, `decisions`, and `patterns` tables have `vector(1536)` columns for semantic search via pgvector. IVFFlat indexes are created for approximate nearest-neighbor search:

```sql
CREATE INDEX idx_learnings_embedding ON learnings
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

The `KnowledgeRepository` uses cosine distance (`<=>`) for semantic search and the `EmbeddingService` (OpenAI `text-embedding-3-small`) to generate embeddings on store.

### Migrations

The initial migration is at `packages/shared/src/db/migrations/001_initial.sql`. Apply it with:

```bash
psql $DATABASE_URL -f packages/shared/src/db/migrations/001_initial.sql
```

### ORM

[Drizzle ORM](https://orm.drizzle.team/) 0.38.x is used for type-safe database access. Table definitions are in `packages/shared/src/db/schema.ts`. The `KnowledgeRepository` uses raw SQL for pgvector operations that Drizzle doesn't support natively.

## Deployment

### Docker

Each service has a multi-stage Dockerfile:

1. **Build stage** — Node 20 Alpine, full workspace `npm ci`, `tsc --build`
2. **Production stage** — Node 20 Alpine, only `dist/` and `node_modules`, runs as `node` user

The Worker Dockerfile additionally installs the Claude Code CLI globally.

### Docker Compose

`docker-compose.yml` provides the full local development stack:

| Service | Port | Image |
|---------|------|-------|
| postgres | 5432 | pgvector/pgvector:pg16 |
| orchestrator | 3000 | Built from packages/orchestrator/Dockerfile |
| slack-bot | 3001 | Built from packages/slack-bot/Dockerfile |
| integrations | 3002 | Built from packages/integrations/Dockerfile |

PostgreSQL has a health check; all services wait for it before starting.

### Kubernetes

Production manifests in `k8s/`:

| Manifest | Kind | Details |
|----------|------|---------|
| namespace.yaml | Namespace | `devteam` |
| configmap.yaml | ConfigMap | Non-secret env vars |
| secrets.yaml | Secret | Credentials (edit before applying) |
| postgres-statefulset.yaml | StatefulSet + Service | 1 replica, 10Gi PVC, pg_isready probes |
| orchestrator-deployment.yaml | Deployment + Service | 2 replicas, 1 CPU / 512Mi |
| slack-bot-deployment.yaml | Deployment + Service | 2 replicas, 500m CPU / 512Mi |
| integrations-deployment.yaml | Deployment + Service | 2 replicas, 500m CPU / 512Mi |
| worker-job-template.yaml | Job template | 2 CPU / 2Gi, 1h deadline, spawned on demand |
| ingress.yaml | Ingress | nginx, routes /webhooks, /slack, /api |

## Security Notes

- All subprocess execution uses `spawn()` with argument arrays — never string interpolation
- Webhook signatures are validated with timing-safe comparison (HMAC-SHA256)
- Guardrails prevent dangerous actions (force push, production deploy without approval)
- Secrets are managed via environment variables, never committed to git
- The `.env` file is gitignored

## Key Design Decisions

1. **PostgreSQL LISTEN/NOTIFY as event bus** — eliminates Redis/NATS dependency while providing sufficient throughput for single-team scale
2. **Git worktrees for worker isolation** — each Claude Code session operates in its own worktree, preventing file conflicts during parallel work
3. **Role-specific system prompts** — each team role has a detailed prompt defining responsibilities, boundaries, communication style, and guardrails
4. **Pluggable adapter interfaces** — `ProjectTrackerAdapter`, `SourceControlAdapter`, `CICDAdapter` allow swapping Jira for Linear, GitHub for GitLab, etc.
5. **Semantic knowledge retrieval** — pgvector embeddings enable context-aware task assignment and accumulated learning across work items
6. **One team per project** — simplifies state management; run multiple instances for multiple projects
