import { describe, it, expect } from 'vitest';
import { loadConfig } from '../config/index.js';

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
integrations:
  jira:
    baseUrl: "https://test.atlassian.net"
    project: "TEST"
  github:
    repo: "org/repo"
  cicd:
    type: "github_actions"
guardrails:
  autoMerge:
    maxFilesChanged: 10
    excludePaths: ["**/migrations/**"]
    requireTests: true
  humanApproval:
    - action: "production_deploy"
  blocked:
    - action: "force_push_main"
knowledge:
  embeddingModel: "text-embedding-3-small"
  maxContextTokens: 50000
`;

describe('Config', () => {
  it('parses valid YAML config', () => {
    const config = loadConfig(VALID_YAML);
    expect(config.team.name).toBe('Test Team');
    expect(config.members).toHaveLength(2);
    expect(config.members[0].role).toBe('team_lead');
    expect(config.slack.channels.main).toBe('devteam-test');
  });

  it('rejects config missing required fields', () => {
    const partial = `
team:
  name: "Incomplete"
`;
    expect(() => loadConfig(partial)).toThrow();
  });

  it('rejects config with invalid role', () => {
    const invalid = VALID_YAML.replace('team_lead', 'invalid_role');
    expect(() => loadConfig(invalid)).toThrow();
  });

  it('requires at least one team_lead member', () => {
    const noLead = VALID_YAML.replace('team_lead', 'developer');
    expect(() => loadConfig(noLead)).toThrow();
  });
});
