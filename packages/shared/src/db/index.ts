export {
  // Enums
  roleEnum,
  workItemTypeEnum,
  workItemStatusEnum,
  priorityEnum,
  // Tables
  teams,
  teamMembers,
  workItems,
  pipelineStages,
  sessions,
  events,
  guardrails,
  sprintState,
  learnings,
  decisions,
  patterns,
  incidents,
} from './schema.js';

export {
  createDbConnection,
  type DbConnectionOptions,
  type DbConnection,
  type Database,
} from './connection.js';

import {
  teams,
  teamMembers,
  workItems,
  pipelineStages,
  sessions,
  events,
  guardrails,
  sprintState,
  learnings,
  decisions,
  patterns,
  incidents,
} from './schema.js';

/**
 * Returns all 12 table definitions as a single schema object.
 * Useful for passing to Drizzle's drizzle() function or for introspection.
 */
export function getDbSchema() {
  return {
    teams,
    teamMembers,
    workItems,
    pipelineStages,
    sessions,
    events,
    guardrails,
    sprintState,
    learnings,
    decisions,
    patterns,
    incidents,
  };
}
