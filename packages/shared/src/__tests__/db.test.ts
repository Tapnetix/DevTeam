import { describe, it, expect } from 'vitest';
import { getDbSchema } from '../db/index.js';

const EXPECTED_TABLES = [
  'teams',
  'teamMembers',
  'workItems',
  'pipelineStages',
  'sessions',
  'events',
  'guardrails',
  'sprintState',
  'learnings',
  'decisions',
  'patterns',
  'incidents',
] as const;

describe('database schema', () => {
  it('exports all required table definitions', () => {
    const schema = getDbSchema();
    const tableNames = Object.keys(schema);
    expect(tableNames).toHaveLength(12);
    for (const name of EXPECTED_TABLES) {
      expect(schema).toHaveProperty(name);
    }
  });

  it('each table is a valid Drizzle table object', () => {
    const schema = getDbSchema();
    for (const [name, table] of Object.entries(schema)) {
      expect(table).toBeDefined();
      expect(typeof table).toBe('object');
      // Drizzle pgTable objects expose columns as direct properties (uuid/varchar/etc columns)
      // and have an id column that is a PgColumn instance with a .name property
      const tableObj = table as Record<string, any>;
      expect(tableObj['id']).toBeDefined();
      // Each column should have a name property from the PgColumn class
      expect(tableObj['id'].name).toBe('id');
    }
  });

  it('teams table has expected columns', () => {
    const { teams } = getDbSchema();
    const columns = Object.keys(teams);
    expect(columns).toContain('id');
    expect(columns).toContain('name');
    expect(columns).toContain('project');
    expect(columns).toContain('repository');
    expect(columns).toContain('config');
    expect(columns).toContain('createdAt');
    expect(columns).toContain('updatedAt');
  });

  it('work_items table has expected columns', () => {
    const { workItems } = getDbSchema();
    const columns = Object.keys(workItems);
    expect(columns).toContain('id');
    expect(columns).toContain('teamId');
    expect(columns).toContain('externalId');
    expect(columns).toContain('type');
    expect(columns).toContain('status');
    expect(columns).toContain('priority');
    expect(columns).toContain('title');
    expect(columns).toContain('description');
    expect(columns).toContain('assigneeId');
    expect(columns).toContain('parentId');
    expect(columns).toContain('metadata');
    expect(columns).toContain('createdAt');
    expect(columns).toContain('updatedAt');
  });

  it('team_members table has expected columns', () => {
    const { teamMembers } = getDbSchema();
    const columns = Object.keys(teamMembers);
    expect(columns).toContain('id');
    expect(columns).toContain('teamId');
    expect(columns).toContain('role');
    expect(columns).toContain('name');
    expect(columns).toContain('handle');
    expect(columns).toContain('personality');
    expect(columns).toContain('systemPrompt');
    expect(columns).toContain('slackBotUserId');
    expect(columns).toContain('isActive');
    expect(columns).toContain('createdAt');
  });

  it('events table has expected columns', () => {
    const { events } = getDbSchema();
    const columns = Object.keys(events);
    expect(columns).toContain('id');
    expect(columns).toContain('teamId');
    expect(columns).toContain('type');
    expect(columns).toContain('actor');
    expect(columns).toContain('workItemId');
    expect(columns).toContain('taskId');
    expect(columns).toContain('payload');
    expect(columns).toContain('durationMs');
    expect(columns).toContain('tokensUsed');
    expect(columns).toContain('createdAt');
  });
});
