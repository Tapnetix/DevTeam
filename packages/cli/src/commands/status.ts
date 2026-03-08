import * as fs from 'node:fs';
import { loadConfig, type TeamConfig, type TeamMember } from '@devteam/shared';

// ── Types ───────────────────────────────────────────────────────────────

export interface StatusWorkItem {
  id: string;
  title: string;
  type: string;
  status: string;
  assignee?: string;
}

export interface StatusResult {
  team?: { name: string; project: string; repository: string };
  members?: Array<{ role: string; name: string; handle: string }>;
  workItems?: StatusWorkItem[];
  error?: string;
}

export interface StatusOptions {
  configPath: string;
}

// ── Formatting helpers ──────────────────────────────────────────────────

function formatMembersTable(
  members: Array<{ role: string; name: string; handle: string }>,
): string {
  const header = '  Role              Name            Handle';
  const sep = '  ' + '-'.repeat(50);
  const rows = members.map(
    (m) =>
      `  ${m.role.padEnd(18)}${m.name.padEnd(16)}${m.handle}`,
  );
  return [header, sep, ...rows].join('\n');
}

function formatWorkItems(items: StatusWorkItem[]): string {
  if (items.length === 0) {
    return '  No active work items.';
  }
  const header = '  ID          Type      Status        Title';
  const sep = '  ' + '-'.repeat(60);
  const rows = items.map(
    (w) =>
      `  ${w.id.padEnd(12)}${w.type.padEnd(10)}${w.status.padEnd(14)}${w.title}`,
  );
  return [header, sep, ...rows].join('\n');
}

// ── Mock data (placeholder until DB is connected) ───────────────────────

function getMockWorkItems(): StatusWorkItem[] {
  // Returns empty — this will be populated from the DB in the future
  return [];
}

// ── Public API ──────────────────────────────────────────────────────────

export async function runStatus(options: StatusOptions): Promise<StatusResult> {
  const { configPath } = options;

  // Read config
  if (!fs.existsSync(configPath)) {
    const error = `Config file not found: ${configPath}`;
    console.error(error);
    return { error };
  }

  let config: TeamConfig;
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    config = loadConfig(content);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`Invalid configuration: ${error}`);
    return { error };
  }

  // Build result
  const team = {
    name: config.team.name,
    project: config.team.project,
    repository: config.team.repository,
  };

  const members = config.members.map((m: TeamMember) => ({
    role: m.role,
    name: m.name,
    handle: m.handle,
  }));

  const workItems = getMockWorkItems();

  // Print output
  console.log(`\n  Team: ${team.name}`);
  console.log(`  Project: ${team.project}`);
  console.log(`  Repository: ${team.repository}\n`);
  console.log('  Team Members:');
  console.log(formatMembersTable(members));
  console.log('\n  Active Work Items:');
  console.log(formatWorkItems(workItems));
  console.log('');

  return { team, members, workItems };
}
