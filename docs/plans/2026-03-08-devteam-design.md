# DevTeam: AI-Powered Agile Development Team

**Date:** 2026-03-08
**Status:** Approved
**Author:** Design brainstormed collaboratively

## Overview

DevTeam is a standalone TypeScript/Node.js system that simulates a complete Agile development team using AI agents backed by Claude Code. Team members communicate through Slack with distinct human-like identities, work in parallel using git worktrees, and follow a structured feature development pipeline.

The system accepts work from Jira, CI/CD webhooks, and Slack conversations, processes it through an Agile pipeline (INTAKE → REQUIREMENTS → DESIGN → IMPLEMENT → REVIEW → QA → DONE), and delivers code changes with full traceability.

## Architecture

**Approach:** Orchestrator + Workers hybrid with event-driven pipeline.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        DEVTEAM SYSTEM                                │
│                                                                      │
│  ┌──────────────┐    ┌───────────────────┐    ┌──────────────────┐  │
│  │  Slack Bot    │◄──►│   Orchestrator    │◄──►│  Event Bus       │  │
│  │  (Bolt SDK)   │    │   (Team Lead)     │    │  (PG LISTEN/     │  │
│  │              │    │                   │    │   NOTIFY)        │  │
│  └──────────────┘    └───────┬───────────┘    └────────┬─────────┘  │
│                              │                         │             │
│          ┌───────────────────┼─────────────────────────┤             │
│          │                   │                         │             │
│  ┌───────▼──────┐    ┌──────▼────────┐    ┌───────────▼──────────┐  │
│  │  Worker Pool  │    │  PostgreSQL   │    │  Integration Layer   │  │
│  │  (Role-based  │    │  + pgvector   │    │  (Jira, CI/CD,       │  │
│  │   agents)     │    │  (State,      │    │   GitHub webhooks)   │  │
│  │              │    │   Knowledge)   │    │                      │  │
│  └──────────────┘    └──────────────┘    └──────────────────────┘  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │              Git Repository (Knowledge Base)                  │   │
│  │  docs/designs/  docs/plans/  docs/learnings/  docs/adr/      │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### Core Services

1. **Orchestrator** — Team Lead brain. Manages team state, assigns work, enforces process, makes routing decisions using Claude reasoning. Runs as a long-lived Claude Code session.
2. **Slack Bot** — Human interface using Bolt SDK. Each team member posts as a distinct Slack bot user with configurable name, handle, avatar, and personality.
3. **Worker Pool** — Role-specialized agents that spawn Claude Code sessions to execute work in isolated git worktrees.
4. **Event Bus** — PostgreSQL LISTEN/NOTIFY for inter-service communication. Lightweight, no extra infrastructure.
5. **Integration Layer** — Pluggable adapters for Jira, CI/CD, and GitHub.

### Key Design Decisions

- **PostgreSQL LISTEN/NOTIFY** as event bus (no Redis/NATS dependency; sufficient throughput for single-team scale)
- **Git worktrees** for parallel isolated work by multiple developers
- **Claude Code sessions** as the execution engine (full tooling: file ops, git, testing, LSP)
- **pgvector** for semantic search over accumulated knowledge
- **Single YAML config** (`devteam.yaml`) for all team configuration

## Team Roles

| Role | Name (configurable) | Responsibilities | Autonomy |
|------|---------------------|-----------------|----------|
| Team Lead | Timothy | Sprint planning, task assignment, conflict resolution, progress tracking | N/A (orchestration) |
| Product Owner | Patricia | Requirements, user stories, acceptance criteria, backlog prioritization | High - create/update Jira |
| Software Architect | Arthur | System design, API design, ADRs, technical feasibility | High - create design docs |
| UX Designer | Uma | UI/UX specs, component design, accessibility review | Medium - needs PO approval |
| Full-Stack Dev 1 | Donald | Implementation, unit tests, bug fixes (TDD-focused) | Configurable per guardrails |
| Full-Stack Dev 2 | David | Implementation, unit tests, bug fixes (performance-focused) | Configurable per guardrails |
| Code Reviewer | Rachel | PR review, code quality, security, standards enforcement | High - approve/request changes |
| QA Engineer | Quinn | Test planning, E2E tests, test execution, bug reporting | High - create bug tickets |
| DevOps/SRE | Derek | CI/CD pipelines, Dockerfiles, k8s, monitoring, incidents | Medium - needs approval for production |

Each role has:
- **System prompt** with identity, responsibilities, process, knowledge context, communication style, and guardrails
- **Personality trait** that subtly shapes their Claude Code behavior and Slack voice
- **Autonomy level** configurable per action type

### Worker Agent Lifecycle

```
1. Orchestrator assigns task to role
2. Worker process spawns with role-specific system prompt
3. Worker creates/enters git worktree for the task
4. Worker spawns Claude Code session with task context
5. Claude Code executes (coding, reviewing, testing, etc.)
6. Worker reports results back via Event Bus
7. Worker posts status update to Slack
8. Worker process can be recycled or kept warm
```

## Feature Development Pipeline

Features flow through defined stages. The pipeline is not rigid — the Orchestrator can skip, repeat, or parallelize stages based on complexity.

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ INTAKE   │───►│ REQUIRE- │───►│ DESIGN   │───►│ IMPLEMENT│───►│ REVIEW   │───►│ QA       │───► DONE
│          │    │ MENTS    │    │          │    │          │    │          │    │          │
│ Team Lead│    │ PO       │    │ Architect│    │ Dev(s)   │    │ Reviewer │    │ QA Eng   │
│          │    │          │    │ UX Des.  │    │ DevOps   │    │          │    │          │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
```

### Stage Details

**INTAKE** (Team Lead): Triage incoming work (Jira, Slack, CI/CD alerts). Classify as feature/bug/tech-debt, assign priority.

**REQUIREMENTS** (Product Owner): Gather requirements, write user stories, define acceptance criteria. May ask clarifying questions in Slack. Commits to `docs/requirements/`.

**DESIGN** (Architect + UX Designer, parallel): Architect designs APIs, data models, component architecture. UX Designer defines UI specs, interaction flows. Commits to `docs/designs/`.

**IMPLEMENT** (Developers + DevOps, parallel): Multiple developers work on independent tasks concurrently in separate worktrees. Each follows TDD. DevOps handles infra changes.

**REVIEW** (Code Reviewer): Two-stage review — spec compliance (matches design?) then code quality. Can request changes → loops back to developer.

**QA** (QA Engineer): Run test suites, write E2E tests, exploratory testing. Can file bugs → creates new INTAKE items.

### Bug/Hotfix Fast Path

```
INTAKE → (reproduce) → IMPLEMENT → REVIEW → QA → DONE
```

Bugs skip REQUIREMENTS and DESIGN. Severity determines priority:
- **Critical:** Immediate assignment, skip queue, urgent Slack notification
- **Normal:** Enter backlog, prioritized in next sprint
- **Low:** Backlogged

## Shared Knowledge & Context System

### Layer 1: PostgreSQL (Structured State)

```sql
-- Core tables
teams              -- Team config (roles, project, settings)
team_members       -- Role assignments, system prompts, autonomy config
work_items         -- Features, bugs, tasks (mirrored from Jira)
pipeline_stages    -- Current stage per work item
sessions           -- Claude Code session tracking
events             -- Event log (audit trail)
guardrails         -- Approval rules
sprint_state       -- Current sprint, velocity, capacity

-- Knowledge tables (with pgvector embeddings)
learnings          -- Accumulated insights (embedding vector(1536))
decisions          -- Key decisions with rationale (embedding vector(1536))
patterns           -- Reusable patterns (embedding vector(1536))
incidents          -- Past incidents and resolutions
```

### Layer 2: Git-Committed Knowledge Base

```
docs/
├── requirements/        # PO-authored requirements per feature
├── designs/            # Architect-authored design docs
├── plans/              # Implementation plans (task breakdowns)
├── adr/                # Architecture Decision Records
├── learnings/          # Team learnings (indexed in PG)
├── runbooks/           # DevOps runbooks
├── standards/          # Coding standards, review checklists
└── retrospectives/     # Sprint retrospectives
```

### Layer 3: Context Injection

When a worker starts a task, the Orchestrator assembles a context package:

```typescript
interface TaskContext {
  task: WorkItem;
  designDoc: string;
  relatedRequirements: string;
  relevantLearnings: Learning[];     // Semantic search via pgvector
  relevantDecisions: Decision[];
  codingStandards: string;
  relevantFiles: string[];
  recentChanges: string;
  inProgressWork: WorkItem[];        // Avoid conflicts
  blockers: string[];
}
```

### Learning Accumulation

After each completed task, workers produce a learnings report:

```typescript
interface LearningReport {
  taskId: string;
  insights: string[];         // "The auth middleware expects X format"
  pitfalls: string[];         // "Don't use Y because Z"
  patterns: string[];         // "Use pattern X for this type of problem"
  suggestedStandards: string[];
}
```

Learnings are stored in PostgreSQL with vector embeddings and committed as markdown. Future context packages query these by semantic similarity.

## Slack Integration

### Channel Structure

```
#devteam-[project]           # Main team channel
#devteam-[project]-dev       # Developer-specific: PRs, builds
#devteam-[project]-design    # Design discussions
#devteam-[project]-alerts    # CI/CD alerts, incidents
```

### Team Member Identities

Each role posts as a distinct Slack bot user with configurable name, handle, avatar, and personality. Examples:

- **@TimothyLead** — Sprint summaries, task assignments, blockers
- **@PatriciaPO** — Requirements, clarifying questions
- **@ArthurArch** — Design decisions, API specs, ADRs
- **@DonaldDev** — Implementation progress, PR links
- **@RachelReview** — Review feedback, approvals
- **@QuinnQA** — Test results, bug reports
- **@DerekDevOps** — Deploy status, infra alerts

### Communication Patterns

**Status updates:** Automated per-task progress in main channel.
**Design discussions:** Threaded in #design channel with @mentions between roles.
**Human interaction:** Humans @mention any team member to ask questions or give direction.
**Approval requests:** Reaction-based (checkmark/cross) for human sign-off on high-risk actions.

### Human-in-the-Loop

Humans can:
- Ask questions to any team member via @mention
- Override decisions by posting in the channel
- Approve/reject PRs and deployments via reactions
- Join as team members (human developer alongside AI developers)
- Adjust priorities by telling @TeamLead to reprioritize

## Integration Layer

### Pluggable Adapter Interfaces

```typescript
interface ProjectTrackerAdapter {
  getWorkItems(filter: WorkItemFilter): Promise<WorkItem[]>;
  createWorkItem(item: NewWorkItem): Promise<WorkItem>;
  updateWorkItem(id: string, update: WorkItemUpdate): Promise<void>;
  addComment(id: string, comment: string): Promise<void>;
  getSprintItems(sprintId: string): Promise<WorkItem[]>;
}

interface CICDAdapter {
  onBuildComplete(handler: (result: BuildResult) => void): void;
  onTestResults(handler: (results: TestResults) => void): void;
  triggerBuild(branch: string, config?: BuildConfig): Promise<void>;
  getArtifacts(buildId: string): Promise<Artifact[]>;
}

interface SourceControlAdapter {
  createPR(pr: NewPullRequest): Promise<PullRequest>;
  reviewPR(prId: string, review: Review): Promise<void>;
  mergePR(prId: string, strategy: MergeStrategy): Promise<void>;
  onPREvent(handler: (event: PREvent) => void): void;
}
```

### Bidirectional Jira Sync

- Jira → DevTeam: New issues, status changes, comments, sprint changes
- DevTeam → Jira: Status updates, sub-task creation, comments, time tracking
- Conflict resolution: Jira is source of truth for status

### CI/CD Flow

CI/CD webhooks flow to Integration Service → Event Bus → appropriate role:
- Build failures → @DerekDevOps investigates
- Test failures → @QuinnQA analyzes and routes to likely-cause developer
- Successful deploys → @TimothyLead announces

## Orchestrator

The Orchestrator acts as Team Lead using Claude-powered reasoning for dynamic decisions.

### Core Functions

```typescript
class Orchestrator {
  // Work management
  triageIncoming(item: IncomingWorkItem): Promise<void>;
  assignToRole(item: WorkItem, role: Role): Promise<void>;
  advancePipeline(itemId: string): Promise<void>;
  handleFeedbackLoop(itemId: string, feedback: Feedback): Promise<void>;

  // Task breakdown
  breakIntoTasks(designDoc: DesignDoc): Promise<Task[]>;
  assignTasks(tasks: Task[], workers: Worker[]): Promise<void>;
  identifyParallelizable(tasks: Task[]): Promise<TaskGroup[]>;

  // Sprint management
  planSprint(backlog: WorkItem[]): Promise<Sprint>;
  trackProgress(): Promise<SprintProgress>;
  runRetrospective(): Promise<Retrospective>;

  // Context assembly
  buildTaskContext(task: Task, worker: Worker): Promise<TaskContext>;
  queryRelevantKnowledge(task: Task): Promise<Knowledge[]>;
}
```

### Task Assignment Logic

1. Check task dependencies (is this task unblocked?)
2. Check worker availability (who's idle?)
3. Match task to role (implementation → developer, review → reviewer)
4. If multiple workers for same role: prefer most relevant recent context, then lowest load
5. Assemble context package
6. Dispatch worker via Event Bus
7. Post assignment in Slack

### Task Dependency Graph

```typescript
interface TaskGraph {
  tasks: Task[];
  dependencies: Map<TaskId, TaskId[]>;
  getReady(): Task[];
  markComplete(id: TaskId): Task[];  // Returns newly unblocked tasks
}
```

Independent tasks assigned to different developers in parallel. Sequential tasks ordered by dependency. Review tasks assigned after implementation completes.

## Guardrail Configuration

```typescript
interface GuardrailConfig {
  autoMerge: {
    conditions: {
      allTestsPass: boolean;
      approvedByReviewer: boolean;
      maxFilesChanged: number;
      excludePaths: string[];
      requireHumanApproval: boolean;
    };
  };

  humanApproval: {
    triggers: string[];   // "production_deploy", "schema_migration", etc.
    approvers: string[];  // Slack user IDs
    timeout: string;      // Escalation timeout
  };

  blocked: {
    actions: string[];    // "force_push_main", "delete_branch_main"
  };
}
```

## Error Handling

| Error | Handling |
|-------|----------|
| Claude Code session crash | Retry with fresh session (max 3) |
| API rate limit | Exponential backoff, throttle worker spawning |
| Git merge conflict | Auto-resolve attempt, escalate to Slack if fails |
| Tests fail after implementation | Developer analyzes, attempts fix (max 3), then escalates |
| Jira webhook down | Queue events in PG, replay on reconnection |
| Worker hangs | Orchestrator monitors heartbeats, kills + restarts after timeout |
| Design rejected by human | Pipeline loops back to DESIGN with feedback context |
| CI build breaks | QA analyzes, creates bug ticket, assigns to likely-cause developer |

## Observability

All events logged to PostgreSQL:

```typescript
interface Event {
  id: string;
  timestamp: Date;
  type: EventType;
  actor: string;         // "DonaldDev" | "Orchestrator" | "human:jjb"
  workItemId?: string;
  taskId?: string;
  payload: Record<string, any>;
  duration_ms?: number;
  tokens_used?: number;  // API cost tracking
}
```

Full audit trail plus cost tracking per feature/task/role.

## Deployment

### Docker Compose (Development)

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    volumes: [postgres-data:/var/lib/postgresql/data]

  orchestrator:
    build: ./packages/orchestrator
    depends_on: [postgres]
    volumes:
      - ./repos:/repos
      - claude-config:/root/.claude
    environment:
      - ANTHROPIC_API_KEY
      - DATABASE_URL

  slack-bot:
    build: ./packages/slack-bot
    depends_on: [orchestrator]
    environment:
      - SLACK_BOT_TOKEN
      - SLACK_SIGNING_SECRET

  integrations:
    build: ./packages/integrations
    depends_on: [orchestrator]
    ports: [3002:3002]
```

### Kubernetes (Production)

- **Orchestrator:** Deployment (1 replica, persistent)
- **Slack Bot:** Deployment (1 replica)
- **Integration Service:** Deployment (1+ replicas, behind ingress)
- **PostgreSQL:** StatefulSet with pgvector, or managed service
- **Workers:** Jobs spawned by Orchestrator, auto-cleanup on completion
- **Shared storage:** PVC for git repos

## Configuration

Single YAML file (`devteam.yaml`):

```yaml
team:
  name: "MyApp Development Team"
  project: "myapp"
  repository: "git@github.com:org/myapp.git"

members:
  - role: team_lead
    name: Timothy
    handle: TimothyLead
    personality: "Organized, decisive, keeps things moving"
  - role: product_owner
    name: Patricia
    handle: PatriciaPO
    personality: "User-focused, asks probing questions"
  - role: architect
    name: Arthur
    handle: ArthurArch
    personality: "Pragmatic, favors simplicity"
  - role: ux_designer
    name: Uma
    handle: UmaUX
    personality: "Accessibility-first, detail-oriented"
  - role: developer
    name: Donald
    handle: DonaldDev
    personality: "TDD enthusiast, clean code"
  - role: developer
    name: David
    handle: DavidDev
    personality: "Full-stack, performance-minded"
  - role: reviewer
    name: Rachel
    handle: RachelReview
    personality: "Thorough, constructive feedback"
  - role: qa_engineer
    name: Quinn
    handle: QuinnQA
    personality: "Edge-case hunter, methodical"
  - role: devops
    name: Derek
    handle: DerekDevOps
    personality: "Infrastructure-as-code, automation-first"

slack:
  workspace: "myorg"
  channels:
    main: "devteam-myapp"
    dev: "devteam-myapp-dev"
    design: "devteam-myapp-design"
    alerts: "devteam-myapp-alerts"

integrations:
  jira:
    baseUrl: "https://myorg.atlassian.net"
    project: "MYAPP"
  github:
    repo: "org/myapp"
  cicd:
    type: "github_actions"

guardrails:
  autoMerge:
    maxFilesChanged: 10
    excludePaths: ["**/migrations/**"]
    requireTests: true
  humanApproval:
    - action: "production_deploy"
    - action: "schema_migration"
    - action: "security_config_change"

knowledge:
  embeddingModel: "text-embedding-3-small"
  maxContextTokens: 50000
```

## Market Analysis

### Competitive Landscape

| Tool | Approach | Key Differentiator | Gap DevTeam Fills |
|------|----------|-------------------|-------------------|
| Ruflo | 60+ agent swarm, Q-learning routing | Cost optimization (75% reduction), self-learning | Not truly role-based; no Slack team feel |
| MetaGPT | SOP-based multi-agent (PM, Architect, Engineer) | Structured communication, clear roles | Primarily greenfield; no Jira/CI/CD |
| ChatDev | Virtual software company, DAG topology | Scales to 1000+ agents | Project generation, not maintenance |
| OpenClaw | Multi-agent + Lobster workflow engine | 145K+ stars, 50+ integrations | Less formalized roles; limited Jira |
| Devin | Single autonomous AI engineer | 67% PR merge rate, enterprise proven | Proprietary, single-agent, expensive |
| Superpowers | Skill-based workflows + subagent dispatch | Hard gates, TDD, two-stage review | Single-developer workflow, no team |

### DevTeam's Differentiators

1. **Real team feel** — Named AI team members with distinct personalities communicating in Slack
2. **Full Agile lifecycle** — INTAKE through QA with sprint management and retrospectives
3. **Human + AI collaboration** — Humans and AI agents work together as peers in Slack
4. **Bidirectional Jira integration** — Not just reading tickets, but managing the full workflow
5. **Accumulated knowledge** — Team learns and improves through semantic knowledge retrieval
6. **Configurable guardrails** — From full autonomy to human-approval-required per action type
7. **Existing codebase focus** — Designed for ongoing maintenance, not just greenfield projects
