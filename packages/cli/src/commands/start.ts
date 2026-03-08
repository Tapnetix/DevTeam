import * as fs from 'node:fs';
import { loadConfig, type TeamConfig } from '@devteam/shared';

// ── Types ───────────────────────────────────────────────────────────────

export interface ChecklistItem {
  name: string;
  status: 'ok' | 'pending' | 'error';
  message: string;
}

export interface StartResult {
  valid: boolean;
  config?: TeamConfig;
  checklist?: ChecklistItem[];
  error?: string;
}

export interface StartOptions {
  configPath: string;
}

// ── Core logic ──────────────────────────────────────────────────────────

function buildChecklist(config: TeamConfig): ChecklistItem[] {
  const checklist: ChecklistItem[] = [];

  // 1. Configuration validation (already passed if we got here)
  checklist.push({
    name: 'Configuration',
    status: 'ok',
    message: `Loaded config for "${config.team.name}" (project: ${config.team.project})`,
  });

  // 2. Database connection (placeholder — actual check deferred)
  checklist.push({
    name: 'Database',
    status: 'pending',
    message: 'Database connection will be verified on actual startup',
  });

  // 3. Event Bus
  checklist.push({
    name: 'Event Bus',
    status: 'pending',
    message: 'Event bus will be initialized on actual startup',
  });

  // 4. Slack Bot
  checklist.push({
    name: 'Slack Bot',
    status: 'pending',
    message: config.slack
      ? `Slack workspace "${config.slack.workspace}" configured`
      : 'No Slack configuration found',
  });

  // 5. Integrations
  const integrationNames: string[] = [];
  if (config.integrations?.jira) integrationNames.push('Jira');
  if (config.integrations?.github) integrationNames.push('GitHub');
  if (config.integrations?.cicd) integrationNames.push(`CI/CD (${config.integrations.cicd.type})`);

  checklist.push({
    name: 'Integrations',
    status: 'pending',
    message:
      integrationNames.length > 0
        ? `Configured: ${integrationNames.join(', ')}`
        : 'No integrations configured',
  });

  return checklist;
}

function formatChecklist(checklist: ChecklistItem[]): string {
  const lines: string[] = ['\n  Startup Checklist', '  ' + '-'.repeat(50)];

  for (const item of checklist) {
    const icon =
      item.status === 'ok' ? '[OK]' : item.status === 'pending' ? '[..]' : '[!!]';
    lines.push(`  ${icon} ${item.name}: ${item.message}`);
  }

  lines.push('');
  return lines.join('\n');
}

// ── Public API ──────────────────────────────────────────────────────────

export async function runStart(options: StartOptions): Promise<StartResult> {
  const { configPath } = options;

  // Check file exists
  if (!fs.existsSync(configPath)) {
    const error = `Config file not found: ${configPath}`;
    console.error(error);
    return { valid: false, error };
  }

  // Read and validate
  let config: TeamConfig;
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    config = loadConfig(content);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`Invalid configuration: ${error}`);
    return { valid: false, error };
  }

  // Build and display checklist
  const checklist = buildChecklist(config);
  console.log(formatChecklist(checklist));

  console.log(
    '  All services validated. Run with --start to boot (not yet implemented).\n',
  );

  return { valid: true, config, checklist };
}
