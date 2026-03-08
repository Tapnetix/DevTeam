import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
  integer,
  boolean,
  index,
  vector,
} from 'drizzle-orm/pg-core';

// ─── Enums ───────────────────────────────────────────────────────────────────

export const roleEnum = pgEnum('role', [
  'team_lead',
  'product_owner',
  'architect',
  'ux_designer',
  'developer',
  'reviewer',
  'qa_engineer',
  'devops',
]);

export const workItemTypeEnum = pgEnum('work_item_type', [
  'feature',
  'bug',
  'tech_debt',
  'task',
]);

export const workItemStatusEnum = pgEnum('work_item_status', [
  'backlog',
  'intake',
  'requirements',
  'design',
  'implement',
  'review',
  'qa',
  'done',
  'cancelled',
]);

export const priorityEnum = pgEnum('priority', [
  'critical',
  'high',
  'normal',
  'low',
]);

// ─── Tables ──────────────────────────────────────────────────────────────────

export const teams = pgTable('teams', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  project: varchar('project', { length: 255 }).notNull().unique(),
  repository: varchar('repository', { length: 512 }).notNull(),
  config: jsonb('config'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const teamMembers = pgTable('team_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id').notNull().references(() => teams.id),
  role: roleEnum('role').notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  handle: varchar('handle', { length: 255 }).notNull(),
  personality: text('personality'),
  systemPrompt: text('system_prompt'),
  slackBotUserId: varchar('slack_bot_user_id', { length: 255 }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const workItems = pgTable('work_items', (t) => ({
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id').notNull().references(() => teams.id),
  externalId: varchar('external_id', { length: 255 }),
  type: workItemTypeEnum('type').notNull(),
  status: workItemStatusEnum('status').notNull().default('backlog'),
  priority: priorityEnum('priority').notNull().default('normal'),
  title: varchar('title', { length: 1024 }).notNull(),
  description: text('description'),
  assigneeId: uuid('assignee_id').references(() => teamMembers.id),
  parentId: uuid('parent_id'), // self-ref FK defined in SQL migration
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}), (table) => [
  index('idx_work_items_team_status').on(table.teamId, table.status),
]);

export const pipelineStages = pgTable('pipeline_stages', {
  id: uuid('id').primaryKey().defaultRandom(),
  workItemId: uuid('work_item_id').notNull().references(() => workItems.id),
  stage: workItemStatusEnum('stage').notNull(),
  enteredAt: timestamp('entered_at', { withTimezone: true }).notNull().defaultNow(),
  exitedAt: timestamp('exited_at', { withTimezone: true }),
  assignedTo: uuid('assigned_to').references(() => teamMembers.id),
  notes: text('notes'),
});

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamMemberId: uuid('team_member_id').notNull().references(() => teamMembers.id),
  workItemId: uuid('work_item_id').references(() => workItems.id),
  worktreePath: varchar('worktree_path', { length: 1024 }),
  status: varchar('status', { length: 50 }).notNull().default('active'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  tokensUsed: integer('tokens_used').notNull().default(0),
});

export const events = pgTable('events', (t) => ({
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id').notNull().references(() => teams.id),
  type: varchar('type', { length: 255 }).notNull(),
  actor: varchar('actor', { length: 255 }),
  workItemId: uuid('work_item_id').references(() => workItems.id),
  taskId: varchar('task_id', { length: 255 }),
  payload: jsonb('payload').notNull().default({}),
  durationMs: integer('duration_ms'),
  tokensUsed: integer('tokens_used'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}), (table) => [
  index('idx_events_team_type').on(table.teamId, table.type),
]);

export const guardrails = pgTable('guardrails', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id').notNull().references(() => teams.id),
  config: jsonb('config').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sprintState = pgTable('sprint_state', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id').notNull().references(() => teams.id),
  sprintNumber: integer('sprint_number').notNull(),
  startDate: timestamp('start_date', { withTimezone: true }).notNull(),
  endDate: timestamp('end_date', { withTimezone: true }).notNull(),
  goals: jsonb('goals').notNull().default([]),
  velocity: integer('velocity'),
  status: varchar('status', { length: 50 }).notNull().default('active'),
});

export const learnings = pgTable('learnings', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id').notNull().references(() => teams.id),
  workItemId: uuid('work_item_id').references(() => workItems.id),
  category: varchar('category', { length: 50 }).notNull(),
  content: text('content').notNull(),
  filePaths: jsonb('file_paths').notNull().default([]),
  tags: jsonb('tags').notNull().default([]),
  embedding: vector('embedding', { dimensions: 1536 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const decisions = pgTable('decisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id').notNull().references(() => teams.id),
  workItemId: uuid('work_item_id').references(() => workItems.id),
  title: varchar('title', { length: 1024 }).notNull(),
  context: text('context'),
  decision: text('decision').notNull(),
  rationale: text('rationale'),
  embedding: vector('embedding', { dimensions: 1536 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const patterns = pgTable('patterns', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id').notNull().references(() => teams.id),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  codeExample: text('code_example'),
  applicability: text('applicability'),
  embedding: vector('embedding', { dimensions: 1536 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const incidents = pgTable('incidents', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id').notNull().references(() => teams.id),
  title: varchar('title', { length: 1024 }).notNull(),
  description: text('description'),
  rootCause: text('root_cause'),
  resolution: text('resolution'),
  severity: priorityEnum('severity').notNull().default('normal'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
});
