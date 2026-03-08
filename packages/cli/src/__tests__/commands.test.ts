import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runInit } from '../commands/init.js';
import { runStart } from '../commands/start.js';
import { runStatus } from '../commands/status.js';
import { loadConfig } from '@devteam/shared';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import YAML from 'yaml';

// ── Helpers ─────────────────────────────────────────────────────────────

/** Create a temporary directory for each test. */
function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'devteam-cli-test-'));
}

/** A valid devteam.yaml content string for testing. */
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
`;

// ── init command ────────────────────────────────────────────────────────

describe('init command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('generates a valid devteam.yaml from provided answers', async () => {
    const answers = {
      teamName: 'Alpha Squad',
      projectName: 'alpha-project',
      repository: 'git@github.com:org/alpha.git',
      slackWorkspace: 'alpha-org',
      slackMainChannel: 'alpha-main',
      slackDevChannel: 'alpha-dev',
      slackDesignChannel: 'alpha-design',
      slackAlertsChannel: 'alpha-alerts',
      members: [
        { role: 'team_lead' as const, name: 'Alice', handle: 'AliceLead' },
        { role: 'developer' as const, name: 'Bob', handle: 'BobDev' },
      ],
    };

    const result = await runInit({ answers, outputDir: tmpDir });

    expect(result.filePath).toBe(path.join(tmpDir, 'devteam.yaml'));
    expect(fs.existsSync(result.filePath)).toBe(true);

    // The generated YAML should be parseable by the shared config loader
    const content = fs.readFileSync(result.filePath, 'utf-8');
    const config = loadConfig(content);

    expect(config.team.name).toBe('Alpha Squad');
    expect(config.team.project).toBe('alpha-project');
    expect(config.team.repository).toBe('git@github.com:org/alpha.git');
    expect(config.members).toHaveLength(2);
    expect(config.members[0].role).toBe('team_lead');
    expect(config.members[0].name).toBe('Alice');
    expect(config.slack.workspace).toBe('alpha-org');
    expect(config.slack.channels.main).toBe('alpha-main');
  });

  it('includes personality field when provided', async () => {
    const answers = {
      teamName: 'Beta Team',
      projectName: 'beta-project',
      repository: 'git@github.com:org/beta.git',
      slackWorkspace: 'beta-org',
      slackMainChannel: 'beta-main',
      slackDevChannel: 'beta-dev',
      slackDesignChannel: 'beta-design',
      slackAlertsChannel: 'beta-alerts',
      members: [
        {
          role: 'team_lead' as const,
          name: 'Alice',
          handle: 'AliceLead',
          personality: 'Focused and pragmatic',
        },
      ],
    };

    const result = await runInit({ answers, outputDir: tmpDir });

    const content = fs.readFileSync(result.filePath, 'utf-8');
    const parsed = YAML.parse(content);
    expect(parsed.members[0].personality).toBe('Focused and pragmatic');
  });

  it('does not overwrite existing file when overwrite is false', async () => {
    const existingPath = path.join(tmpDir, 'devteam.yaml');
    fs.writeFileSync(existingPath, 'existing content');

    const answers = {
      teamName: 'Team',
      projectName: 'proj',
      repository: 'git@github.com:org/repo.git',
      slackWorkspace: 'org',
      slackMainChannel: 'main',
      slackDevChannel: 'dev',
      slackDesignChannel: 'design',
      slackAlertsChannel: 'alerts',
      members: [
        { role: 'team_lead' as const, name: 'A', handle: 'ALead' },
      ],
    };

    const result = await runInit({
      answers,
      outputDir: tmpDir,
      overwrite: false,
    });

    expect(result.skipped).toBe(true);
    expect(fs.readFileSync(existingPath, 'utf-8')).toBe('existing content');
  });
});

// ── start command ──────────────────────────────────────────────────────

describe('start command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('validates a correct config and returns checklist', async () => {
    const configPath = path.join(tmpDir, 'devteam.yaml');
    fs.writeFileSync(configPath, VALID_YAML);

    const result = await runStart({ configPath });

    expect(result.valid).toBe(true);
    expect(result.config).toBeDefined();
    expect(result.config!.team.name).toBe('Test Team');
    expect(result.checklist).toBeDefined();
    expect(result.checklist).toContainEqual(
      expect.objectContaining({ name: 'Configuration', status: 'ok' }),
    );
  });

  it('reports invalid config', async () => {
    const configPath = path.join(tmpDir, 'devteam.yaml');
    fs.writeFileSync(configPath, 'invalid: true\n');

    const result = await runStart({ configPath });

    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('reports missing config file', async () => {
    const configPath = path.join(tmpDir, 'nonexistent.yaml');

    const result = await runStart({ configPath });

    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/not found|no such file/i);
  });

  it('checklist includes all expected services', async () => {
    const configPath = path.join(tmpDir, 'devteam.yaml');
    fs.writeFileSync(configPath, VALID_YAML);

    const result = await runStart({ configPath });

    const names = result.checklist!.map((c) => c.name);
    expect(names).toContain('Configuration');
    expect(names).toContain('Database');
    expect(names).toContain('Event Bus');
    expect(names).toContain('Slack Bot');
    expect(names).toContain('Integrations');
  });
});

// ── status command ─────────────────────────────────────────────────────

describe('status command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('shows team info from config', async () => {
    const configPath = path.join(tmpDir, 'devteam.yaml');
    fs.writeFileSync(configPath, VALID_YAML);

    const result = await runStatus({ configPath });

    expect(result.team).toBeDefined();
    expect(result.team!.name).toBe('Test Team');
    expect(result.team!.project).toBe('testproj');
  });

  it('lists all team members', async () => {
    const configPath = path.join(tmpDir, 'devteam.yaml');
    fs.writeFileSync(configPath, VALID_YAML);

    const result = await runStatus({ configPath });

    expect(result.members).toBeDefined();
    expect(result.members).toHaveLength(2);
    expect(result.members![0]).toEqual(
      expect.objectContaining({
        role: 'team_lead',
        name: 'Timothy',
        handle: 'TimothyLead',
      }),
    );
  });

  it('returns mock work items', async () => {
    const configPath = path.join(tmpDir, 'devteam.yaml');
    fs.writeFileSync(configPath, VALID_YAML);

    const result = await runStatus({ configPath });

    expect(result.workItems).toBeDefined();
    expect(Array.isArray(result.workItems)).toBe(true);
  });

  it('reports error for missing config', async () => {
    const configPath = path.join(tmpDir, 'nonexistent.yaml');

    const result = await runStatus({ configPath });

    expect(result.error).toBeDefined();
  });
});

// ── CLI argument parsing ───────────────────────────────────────────────

describe('CLI entry point', () => {
  it('parseArgs extracts command and flags', async () => {
    const { parseArgs } = await import('../index.js');

    const result = parseArgs(['node', 'devteam', 'init', '--dir', '/tmp']);
    expect(result.command).toBe('init');
    expect(result.flags.dir).toBe('/tmp');
  });

  it('parseArgs defaults to help for unknown command', async () => {
    const { parseArgs } = await import('../index.js');

    const result = parseArgs(['node', 'devteam']);
    expect(result.command).toBe('help');
  });

  it('parseArgs handles start with --config flag', async () => {
    const { parseArgs } = await import('../index.js');

    const result = parseArgs([
      'node',
      'devteam',
      'start',
      '--config',
      'custom.yaml',
    ]);
    expect(result.command).toBe('start');
    expect(result.flags.config).toBe('custom.yaml');
  });

  it('parseArgs handles status command', async () => {
    const { parseArgs } = await import('../index.js');

    const result = parseArgs(['node', 'devteam', 'status']);
    expect(result.command).toBe('status');
  });
});
