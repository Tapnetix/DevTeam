-- DevTeam Initial Schema Migration
-- Creates all 12 tables, 4 enums, pgvector extension, and indexes.

-- ─── Extensions ──────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── Enum Types ──────────────────────────────────────────────────────────────

CREATE TYPE role AS ENUM (
  'team_lead',
  'product_owner',
  'architect',
  'ux_designer',
  'developer',
  'reviewer',
  'qa_engineer',
  'devops'
);

CREATE TYPE work_item_type AS ENUM (
  'feature',
  'bug',
  'tech_debt',
  'task'
);

CREATE TYPE work_item_status AS ENUM (
  'backlog',
  'intake',
  'requirements',
  'design',
  'implement',
  'review',
  'qa',
  'done',
  'cancelled'
);

CREATE TYPE priority AS ENUM (
  'critical',
  'high',
  'normal',
  'low'
);

-- ─── Tables ──────────────────────────────────────────────────────────────────

-- 1. teams
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  project VARCHAR(255) NOT NULL UNIQUE,
  repository VARCHAR(512) NOT NULL,
  config JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. team_members
CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id),
  role role NOT NULL,
  name VARCHAR(255) NOT NULL,
  handle VARCHAR(255) NOT NULL,
  personality TEXT,
  system_prompt TEXT,
  slack_bot_user_id VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. work_items
CREATE TABLE work_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id),
  external_id VARCHAR(255),
  type work_item_type NOT NULL,
  status work_item_status NOT NULL DEFAULT 'backlog',
  priority priority NOT NULL DEFAULT 'normal',
  title VARCHAR(1024) NOT NULL,
  description TEXT,
  assignee_id UUID REFERENCES team_members(id),
  parent_id UUID REFERENCES work_items(id),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. pipeline_stages
CREATE TABLE pipeline_stages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  work_item_id UUID NOT NULL REFERENCES work_items(id),
  stage work_item_status NOT NULL,
  entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  exited_at TIMESTAMPTZ,
  assigned_to UUID REFERENCES team_members(id),
  notes TEXT
);

-- 5. sessions
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_member_id UUID NOT NULL REFERENCES team_members(id),
  work_item_id UUID REFERENCES work_items(id),
  worktree_path VARCHAR(1024),
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  tokens_used INTEGER NOT NULL DEFAULT 0
);

-- 6. events
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id),
  type VARCHAR(255) NOT NULL,
  actor VARCHAR(255),
  work_item_id UUID REFERENCES work_items(id),
  task_id VARCHAR(255),
  payload JSONB NOT NULL DEFAULT '{}',
  duration_ms INTEGER,
  tokens_used INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. guardrails
CREATE TABLE guardrails (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id),
  config JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. sprint_state
CREATE TABLE sprint_state (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id),
  sprint_number INTEGER NOT NULL,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  goals JSONB NOT NULL DEFAULT '[]',
  velocity INTEGER,
  status VARCHAR(50) NOT NULL DEFAULT 'active'
);

-- 9. learnings (with pgvector embedding)
CREATE TABLE learnings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id),
  work_item_id UUID REFERENCES work_items(id),
  category VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  file_paths JSONB NOT NULL DEFAULT '[]',
  tags JSONB NOT NULL DEFAULT '[]',
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. decisions (with pgvector embedding)
CREATE TABLE decisions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id),
  work_item_id UUID REFERENCES work_items(id),
  title VARCHAR(1024) NOT NULL,
  context TEXT,
  decision TEXT NOT NULL,
  rationale TEXT,
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. patterns (with pgvector embedding)
CREATE TABLE patterns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  code_example TEXT,
  applicability TEXT,
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. incidents
CREATE TABLE incidents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id),
  title VARCHAR(1024) NOT NULL,
  description TEXT,
  root_cause TEXT,
  resolution TEXT,
  severity priority NOT NULL DEFAULT 'normal',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

-- Work items: fast lookup by team + status
CREATE INDEX idx_work_items_team_status ON work_items (team_id, status);

-- Events: fast lookup by team + event type
CREATE INDEX idx_events_team_type ON events (team_id, type);

-- Sessions: active sessions by team member
CREATE INDEX idx_sessions_team_member ON sessions (team_member_id, status);

-- Pipeline stages: lookup by work item
CREATE INDEX idx_pipeline_stages_work_item ON pipeline_stages (work_item_id);

-- Vector similarity search indexes (IVFFlat)
-- Note: These indexes require at least some rows to exist before they become effective.
-- IVFFlat is used for approximate nearest-neighbor search on pgvector columns.
CREATE INDEX idx_learnings_embedding ON learnings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_decisions_embedding ON decisions USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_patterns_embedding ON patterns USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
