# DevTeam

An AI-powered Agile development team that simulates a real software team with distinct roles, personalities, and Slack presence. Built on [Claude Code](https://docs.anthropic.com/en/docs/claude-code), DevTeam accepts feature requests, bug reports, and Jira tickets, then autonomously processes them through a full Agile pipeline — from requirements gathering through design, implementation, code review, and QA.

Each team member is a Claude Code session with a role-specific system prompt, working in isolated git worktrees and communicating through Slack with configurable human-like names and personalities.

## How It Works

```
                    Slack / Jira / GitHub Webhooks
                              │
                    ┌─────────▼──────────┐
                    │   Integrations     │  ← Webhook receiver, adapters
                    └─────────┬──────────┘
                              │ events
                    ┌─────────▼──────────┐
                    │   Orchestrator     │  ← Team Lead brain
                    │  (Pipeline + DAG)  │
                    └──┬──────┬──────┬───┘
                       │      │      │
                 ┌─────▼┐  ┌──▼──┐  ┌▼─────┐
                 │Worker│  │Worker│  │Worker│  ← Claude Code sessions
                 │ (PO) │  │(Dev)│  │ (QA) │     in git worktrees
                 └──────┘  └─────┘  └──────┘
                       │      │      │
                    ┌──▼──────▼──────▼───┐
                    │   PostgreSQL       │  ← State + pgvector knowledge
                    └────────────────────┘
                              │
                    ┌─────────▼──────────┐
                    │     Slack Bot      │  ← Team member identities
                    └────────────────────┘
```

**Feature pipeline:** INTAKE → REQUIREMENTS → DESIGN → IMPLEMENT → REVIEW → QA → DONE

**Bug fast-path:** INTAKE → IMPLEMENT → REVIEW → QA → DONE

## Team Roles

| Role | Default Name | Responsibilities |
|------|-------------|------------------|
| Team Lead | Timothy | Sprint planning, task assignment, pipeline orchestration |
| Product Owner | Patricia | Requirements, acceptance criteria, prioritization |
| Architect | Arthur | System design, API design, architecture decision records |
| UX Designer | Uma | UI/UX specs, accessibility, design consistency |
| Developer | Donald | Implementation, TDD, small focused PRs |
| Developer | David | Full-stack, refactoring, performance optimization |
| Reviewer | Rachel | Code review, security, correctness, maintainability |
| QA Engineer | Quinn | Test planning, edge cases, E2E testing |
| DevOps | Derek | CI/CD, Dockerfiles, Kubernetes, infrastructure |

All names, handles, and personalities are fully configurable in `devteam.yaml`.

## Prerequisites

- **Node.js** 20+
- **PostgreSQL** 16+ with [pgvector](https://github.com/pgvector/pgvector) extension
- **Claude Code** CLI installed (`npm install -g @anthropic-ai/claude-code`)
- **Slack App** with Bot Token, Signing Secret, and App Token (Socket Mode)
- **API Keys**: Anthropic (Claude), OpenAI (embeddings)

Optional:
- **Docker** and **Docker Compose** for containerized development
- **kubectl** for Kubernetes deployment
- **Jira** account with API token for ticket integration
- **GitHub** personal access token for PR management

## Quick Start

### 1. Clone and install

```bash
git clone <repository-url>
cd devteam
npm install
npm run build
```

### 2. Configure your team

Copy the example configuration and customize it:

```bash
cp devteam.example.yaml devteam.yaml
```

Or use the interactive CLI:

```bash
npx devteam init
```

Edit `devteam.yaml` to set your team name, member names/personalities, Slack workspace, and integration settings. See [Configuration](#configuration) for details.

### 3. Set up environment variables

```bash
cp .env.example .env
```

Fill in the required values:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `ANTHROPIC_API_KEY` | Yes | Claude API key for agent sessions |
| `OPENAI_API_KEY` | Yes | OpenAI key for embedding generation |
| `SLACK_BOT_TOKEN` | Yes | Slack bot token (`xoxb-...`) |
| `SLACK_SIGNING_SECRET` | Yes | Slack app signing secret |
| `SLACK_APP_TOKEN` | Yes | Slack app-level token (`xapp-...`) for Socket Mode |
| `JIRA_BASE_URL` | No | Jira instance URL |
| `JIRA_EMAIL` | No | Jira account email |
| `JIRA_API_TOKEN` | No | Jira API token |
| `GITHUB_TOKEN` | No | GitHub PAT for PR operations |
| `GITHUB_WEBHOOK_SECRET` | No | Secret for validating GitHub webhooks |
| `JIRA_WEBHOOK_SECRET` | No | Secret for validating Jira webhooks |

### 4. Set up the database

Start PostgreSQL with pgvector (Docker is the easiest method):

```bash
docker compose up postgres -d
```

Run the initial migration:

```bash
psql $DATABASE_URL -f packages/shared/src/db/migrations/001_initial.sql
```

### 5. Start the services

**With Docker Compose** (recommended for development):

```bash
docker compose up --build
```

This starts PostgreSQL, Orchestrator (port 3000), Slack Bot (port 3001), and Integrations (port 3002).

**Without Docker** (run each service manually):

```bash
# Terminal 1: Orchestrator
node packages/orchestrator/dist/index.js

# Terminal 2: Slack Bot
node packages/slack-bot/dist/index.js

# Terminal 3: Integrations
node packages/integrations/dist/index.js
```

### 6. Validate the setup

```bash
npx devteam start --config devteam.yaml
npx devteam status --config devteam.yaml
```

## Configuration

The `devteam.yaml` file controls all aspects of your team. Here is the full schema:

```yaml
# Required: Team identity
team:
  name: "My Team"            # Display name
  project: "my-project"      # Project identifier
  repository: "git@github.com:org/repo.git"

# Required: At least one member with role 'team_lead'
members:
  - role: team_lead           # One of: team_lead, product_owner, architect,
    name: Timothy             #         ux_designer, developer, reviewer,
    handle: TimothyLead       #         qa_engineer, devops
    personality: "Decisive, pragmatic."  # Optional: influences communication style

# Required: Slack workspace and channels
slack:
  workspace: "your-org"
  channels:
    main: "devteam-main"      # General discussion
    dev: "devteam-dev"        # Development updates
    design: "devteam-design"  # Design discussions
    alerts: "devteam-alerts"  # CI/CD alerts, incidents

# Optional: External tool integrations
integrations:
  jira:
    baseUrl: "https://your-org.atlassian.net"
    project: "DEV"
  github:
    repo: "org/repo"
  cicd:
    type: "github_actions"    # One of: github_actions, gitlab_ci, jenkins, circleci

# Optional: Safety guardrails
guardrails:
  autoMerge:
    maxFilesChanged: 10       # Auto-merge PRs with <= N files changed
    excludePaths:             # Never auto-merge changes to these paths
      - "**/migrations/**"
    requireTests: true        # Require tests to pass before auto-merge
  humanApproval:              # Actions requiring human approval
    - action: "production_deploy"
    - action: "database_migration"
  blocked:                    # Actions that are never allowed
    - action: "force_push_main"

# Optional: Knowledge system tuning
knowledge:
  embeddingModel: "text-embedding-3-small"
  maxContextTokens: 50000
```

## Slack App Setup

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and create a new app
2. Enable **Socket Mode** and generate an App-Level Token (`xapp-...`)
3. Under **OAuth & Permissions**, add these bot token scopes:
   - `chat:write`, `chat:write.customize` (for team member identities)
   - `channels:history`, `channels:read`
   - `reactions:read`
   - `app_mentions:read`
   - `users:read`
4. Under **Event Subscriptions**, subscribe to:
   - `message.channels`, `app_mention`, `reaction_added`
5. Install the app to your workspace
6. Copy the Bot Token (`xoxb-...`) and Signing Secret to your `.env`
7. Create the four channels defined in your `devteam.yaml` and invite the bot

## Webhook Setup

### GitHub Webhooks

1. Go to your repository Settings → Webhooks → Add webhook
2. Set payload URL to `https://your-domain/webhooks/github`
3. Set content type to `application/json`
4. Set the secret (same as `GITHUB_WEBHOOK_SECRET` in `.env`)
5. Select events: Pull requests, Pull request reviews, Workflow runs

### Jira Webhooks

1. Go to Jira Settings → System → WebHooks
2. Set URL to `https://your-domain/webhooks/jira`
3. Select events: Issue created, updated, commented

## CLI Commands

```bash
# Interactive team setup — generates devteam.yaml
npx devteam init

# Validate config and show startup checklist
npx devteam start --config devteam.yaml

# Show team state, members, and active work items
npx devteam status --config devteam.yaml
```

## Kubernetes Deployment

Production manifests are provided in the `k8s/` directory:

```bash
# Create namespace and apply all manifests
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secrets.yaml      # Edit with real credentials first
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/postgres-statefulset.yaml
kubectl apply -f k8s/orchestrator-deployment.yaml
kubectl apply -f k8s/slack-bot-deployment.yaml
kubectl apply -f k8s/integrations-deployment.yaml
kubectl apply -f k8s/ingress.yaml
```

Workers are spawned as Kubernetes Jobs using the template at `k8s/worker-job-template.yaml`.

The Ingress routes:
- `/webhooks` → Integrations service (port 3002)
- `/slack` → Slack Bot service (port 3001)
- `/api` → Orchestrator service (port 3000)

## Running Tests

```bash
# All tests
npm test

# Watch mode
npm run test:watch

# Specific package
npx vitest run packages/shared/
npx vitest run packages/orchestrator/
npx vitest run packages/worker/
npx vitest run packages/slack-bot/
npx vitest run packages/integrations/
npx vitest run packages/cli/

# E2E smoke tests (no external services needed)
npx vitest run tests/e2e/

# Integration tests (requires running PostgreSQL)
DATABASE_URL=postgresql://devteam:devteam@localhost:5432/devteam npx vitest run packages/shared/src/__tests__/pg-event-bus.integration.test.ts
```

## License

See [LICENSE](LICENSE) for details.
