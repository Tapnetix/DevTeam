import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebhookServer } from '../webhook-server.js';
import { WebhookHandlers } from '../webhook-handlers.js';
import { createHmac } from 'node:crypto';
import type { DevTeamEvent, EventBus } from '@devteam/shared';

// ── Mock EventBus ─────────────────────────────────────────────────────

function createMockEventBus(): EventBus & { publishedEvents: DevTeamEvent[] } {
  const publishedEvents: DevTeamEvent[] = [];
  return {
    publishedEvents,
    publish: vi.fn(async (event: DevTeamEvent) => {
      publishedEvents.push(event);
    }),
    subscribe: vi.fn(() => () => {}),
    close: vi.fn(async () => {}),
  };
}

// ── Signature helpers ─────────────────────────────────────────────────

function createGitHubSignature(body: string, secret: string): string {
  const hmac = createHmac('sha256', secret);
  hmac.update(body);
  return 'sha256=' + hmac.digest('hex');
}

function createJiraSignature(body: string, secret: string): string {
  const hmac = createHmac('sha256', secret);
  hmac.update(body);
  return hmac.digest('base64');
}

describe('WebhookHandlers', () => {
  let eventBus: ReturnType<typeof createMockEventBus>;
  let handlers: WebhookHandlers;

  beforeEach(() => {
    vi.clearAllMocks();
    eventBus = createMockEventBus();
    handlers = new WebhookHandlers(eventBus);
  });

  describe('GitHub webhook signature validation', () => {
    const secret = 'github-webhook-secret';

    it('validates a correct HMAC-SHA256 signature', () => {
      const body = JSON.stringify({ action: 'opened' });
      const signature = createGitHubSignature(body, secret);

      expect(handlers.validateGitHubSignature(body, signature, secret)).toBe(true);
    });

    it('rejects an incorrect signature', () => {
      const body = JSON.stringify({ action: 'opened' });
      const signature = 'sha256=invalid';

      expect(handlers.validateGitHubSignature(body, signature, secret)).toBe(false);
    });

    it('rejects a signature with wrong prefix', () => {
      const body = JSON.stringify({ action: 'opened' });
      const hmac = createHmac('sha256', secret);
      hmac.update(body);
      const signature = 'sha1=' + hmac.digest('hex');

      expect(handlers.validateGitHubSignature(body, signature, secret)).toBe(false);
    });
  });

  describe('Jira webhook signature validation', () => {
    const secret = 'jira-webhook-secret';

    it('validates a correct HMAC-SHA256 signature (base64)', () => {
      const body = JSON.stringify({ webhookEvent: 'jira:issue_created' });
      const signature = createJiraSignature(body, secret);

      expect(handlers.validateJiraSignature(body, signature, secret)).toBe(true);
    });

    it('rejects an incorrect signature', () => {
      const body = JSON.stringify({ webhookEvent: 'jira:issue_created' });

      expect(handlers.validateJiraSignature(body, 'invalid-signature', secret)).toBe(false);
    });
  });

  describe('GitHub PR event parsing and publishing', () => {
    it('parses pull_request webhook and publishes to event bus', async () => {
      const payload = {
        action: 'opened',
        pull_request: {
          id: 100,
          number: 42,
          title: 'feat: login page',
          body: 'Implements login',
          state: 'open',
          head: { ref: 'feature/login' },
          base: { ref: 'main' },
          html_url: 'https://github.com/org/repo/pull/42',
          user: { login: 'alice' },
          created_at: '2025-06-01T10:00:00Z',
          updated_at: '2025-06-01T10:00:00Z',
        },
      };

      await handlers.handleGitHubPullRequest(payload);

      expect(eventBus.publish).toHaveBeenCalledTimes(1);
      const event = eventBus.publishedEvents[0];
      expect(event.type).toBe('integration.github.pr.opened');
      expect(event.actor).toBe('alice');
      expect(event.payload).toMatchObject({
        action: 'opened',
        prNumber: 42,
        title: 'feat: login page',
        headBranch: 'feature/login',
        baseBranch: 'main',
      });
    });

    it('parses review_requested event', async () => {
      const payload = {
        action: 'review_requested',
        pull_request: {
          id: 100,
          number: 42,
          title: 'feat: login page',
          body: 'Review needed',
          state: 'open',
          head: { ref: 'feature/login' },
          base: { ref: 'main' },
          html_url: 'https://github.com/org/repo/pull/42',
          user: { login: 'alice' },
          created_at: '2025-06-01T10:00:00Z',
          updated_at: '2025-06-01T11:00:00Z',
        },
      };

      await handlers.handleGitHubPullRequest(payload);

      const event = eventBus.publishedEvents[0];
      expect(event.type).toBe('integration.github.pr.review_requested');
    });
  });

  describe('GitHub workflow_run event parsing and publishing', () => {
    it('parses workflow_run completed event and publishes to event bus', async () => {
      const payload = {
        action: 'completed',
        workflow_run: {
          id: 5001,
          name: 'CI',
          status: 'completed',
          conclusion: 'success',
          html_url: 'https://github.com/org/repo/actions/runs/5001',
          head_sha: 'abc123',
          head_branch: 'main',
          run_started_at: '2025-06-01T10:00:00Z',
          updated_at: '2025-06-01T10:30:00Z',
        },
      };

      await handlers.handleGitHubWorkflowRun(payload);

      expect(eventBus.publish).toHaveBeenCalledTimes(1);
      const event = eventBus.publishedEvents[0];
      expect(event.type).toBe('integration.cicd.build.completed');
      expect(event.actor).toBe('github-actions');
      expect(event.payload).toMatchObject({
        buildId: '5001',
        status: 'success',
        commit: 'abc123',
        branch: 'main',
      });
    });

    it('ignores non-completed workflow runs', async () => {
      const payload = {
        action: 'requested',
        workflow_run: {
          id: 5002,
          name: 'CI',
          status: 'queued',
          conclusion: null,
          html_url: 'https://github.com/org/repo/actions/runs/5002',
          head_sha: 'def456',
          head_branch: 'feature/x',
          run_started_at: '2025-06-01T11:00:00Z',
          updated_at: '2025-06-01T11:00:00Z',
        },
      };

      await handlers.handleGitHubWorkflowRun(payload);

      expect(eventBus.publish).not.toHaveBeenCalled();
    });
  });

  describe('Jira event parsing and publishing', () => {
    it('parses jira:issue_created event and publishes to event bus', async () => {
      const payload = {
        webhookEvent: 'jira:issue_created',
        user: { displayName: 'Bob' },
        issue: {
          id: '10001',
          key: 'DEV-42',
          fields: {
            summary: 'Implement login',
            status: { name: 'To Do' },
            issuetype: { name: 'Story' },
            priority: { name: 'High' },
          },
        },
      };

      await handlers.handleJiraEvent(payload);

      expect(eventBus.publish).toHaveBeenCalledTimes(1);
      const event = eventBus.publishedEvents[0];
      expect(event.type).toBe('integration.jira.issue.created');
      expect(event.actor).toBe('Bob');
      expect(event.payload).toMatchObject({
        issueId: '10001',
        issueKey: 'DEV-42',
        summary: 'Implement login',
        status: 'To Do',
        issueType: 'Story',
      });
    });

    it('parses jira:issue_updated event', async () => {
      const payload = {
        webhookEvent: 'jira:issue_updated',
        user: { displayName: 'Carol' },
        issue: {
          id: '10002',
          key: 'DEV-43',
          fields: {
            summary: 'Fix bug',
            status: { name: 'In Progress' },
            issuetype: { name: 'Bug' },
            priority: { name: 'Critical' },
          },
        },
        changelog: {
          items: [
            { field: 'status', fromString: 'To Do', toString: 'In Progress' },
          ],
        },
      };

      await handlers.handleJiraEvent(payload);

      const event = eventBus.publishedEvents[0];
      expect(event.type).toBe('integration.jira.issue.updated');
      expect(event.payload).toMatchObject({
        issueKey: 'DEV-43',
        changelog: [
          { field: 'status', from: 'To Do', to: 'In Progress' },
        ],
      });
    });

    it('parses comment_created event', async () => {
      const payload = {
        webhookEvent: 'comment_created',
        user: { displayName: 'Dave' },
        issue: {
          id: '10001',
          key: 'DEV-42',
          fields: {
            summary: 'Implement login',
            status: { name: 'To Do' },
            issuetype: { name: 'Story' },
            priority: { name: 'Normal' },
          },
        },
        comment: {
          id: 'comment-1',
          body: 'Ready for review',
          author: { displayName: 'Dave' },
          created: '2025-06-03T09:00:00.000Z',
        },
      };

      await handlers.handleJiraEvent(payload);

      const event = eventBus.publishedEvents[0];
      expect(event.type).toBe('integration.jira.comment.created');
      expect(event.payload).toMatchObject({
        issueKey: 'DEV-42',
        commentId: 'comment-1',
        body: 'Ready for review',
      });
    });
  });
});

describe('WebhookServer', () => {
  let eventBus: ReturnType<typeof createMockEventBus>;

  beforeEach(() => {
    eventBus = createMockEventBus();
  });

  it('can be constructed with event bus and secrets', () => {
    const server = new WebhookServer({
      eventBus,
      githubSecret: 'gh-secret',
      jiraSecret: 'jira-secret',
      port: 3001,
    });

    expect(server).toBeDefined();
  });

  it('exposes route handler configuration', () => {
    const server = new WebhookServer({
      eventBus,
      githubSecret: 'gh-secret',
      jiraSecret: 'jira-secret',
      port: 3001,
    });

    const routes = server.getRoutes();
    expect(routes).toContainEqual(
      expect.objectContaining({ method: 'POST', path: '/webhooks/github' }),
    );
    expect(routes).toContainEqual(
      expect.objectContaining({ method: 'POST', path: '/webhooks/jira' }),
    );
    expect(routes).toContainEqual(
      expect.objectContaining({ method: 'GET', path: '/health' }),
    );
  });

  it('validates GitHub webhook and processes PR event', async () => {
    const server = new WebhookServer({
      eventBus,
      githubSecret: 'gh-secret',
      jiraSecret: 'jira-secret',
      port: 3001,
    });

    const body = JSON.stringify({
      action: 'opened',
      pull_request: {
        id: 100,
        number: 42,
        title: 'feat: login page',
        body: 'Implements login',
        state: 'open',
        head: { ref: 'feature/login' },
        base: { ref: 'main' },
        html_url: 'https://github.com/org/repo/pull/42',
        user: { login: 'alice' },
        created_at: '2025-06-01T10:00:00Z',
        updated_at: '2025-06-01T10:00:00Z',
      },
    });

    const signature = createGitHubSignature(body, 'gh-secret');

    const result = await server.processGitHubWebhook(body, {
      'x-hub-signature-256': signature,
      'x-github-event': 'pull_request',
    });

    expect(result.status).toBe(200);
    expect(eventBus.publishedEvents).toHaveLength(1);
    expect(eventBus.publishedEvents[0].type).toBe('integration.github.pr.opened');
  });

  it('rejects GitHub webhook with invalid signature', async () => {
    const server = new WebhookServer({
      eventBus,
      githubSecret: 'gh-secret',
      jiraSecret: 'jira-secret',
      port: 3001,
    });

    const body = JSON.stringify({ action: 'opened' });

    const result = await server.processGitHubWebhook(body, {
      'x-hub-signature-256': 'sha256=invalid',
      'x-github-event': 'pull_request',
    });

    expect(result.status).toBe(401);
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('validates Jira webhook and processes event', async () => {
    const server = new WebhookServer({
      eventBus,
      githubSecret: 'gh-secret',
      jiraSecret: 'jira-secret',
      port: 3001,
    });

    const body = JSON.stringify({
      webhookEvent: 'jira:issue_created',
      user: { displayName: 'Bob' },
      issue: {
        id: '10001',
        key: 'DEV-42',
        fields: {
          summary: 'New feature',
          status: { name: 'To Do' },
          issuetype: { name: 'Story' },
          priority: { name: 'High' },
        },
      },
    });

    const signature = createJiraSignature(body, 'jira-secret');

    const result = await server.processJiraWebhook(body, {
      'x-hub-signature': signature,
    });

    expect(result.status).toBe(200);
    expect(eventBus.publishedEvents).toHaveLength(1);
    expect(eventBus.publishedEvents[0].type).toBe('integration.jira.issue.created');
  });

  it('rejects Jira webhook with invalid signature', async () => {
    const server = new WebhookServer({
      eventBus,
      githubSecret: 'gh-secret',
      jiraSecret: 'jira-secret',
      port: 3001,
    });

    const body = JSON.stringify({ webhookEvent: 'jira:issue_created' });

    const result = await server.processJiraWebhook(body, {
      'x-hub-signature': 'invalid',
    });

    expect(result.status).toBe(401);
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('processes GitHub workflow_run events', async () => {
    const server = new WebhookServer({
      eventBus,
      githubSecret: 'gh-secret',
      jiraSecret: 'jira-secret',
      port: 3001,
    });

    const body = JSON.stringify({
      action: 'completed',
      workflow_run: {
        id: 5001,
        name: 'CI',
        status: 'completed',
        conclusion: 'success',
        html_url: 'https://github.com/org/repo/actions/runs/5001',
        head_sha: 'abc123',
        head_branch: 'main',
        run_started_at: '2025-06-01T10:00:00Z',
        updated_at: '2025-06-01T10:30:00Z',
      },
    });

    const signature = createGitHubSignature(body, 'gh-secret');

    const result = await server.processGitHubWebhook(body, {
      'x-hub-signature-256': signature,
      'x-github-event': 'workflow_run',
    });

    expect(result.status).toBe(200);
    expect(eventBus.publishedEvents).toHaveLength(1);
    expect(eventBus.publishedEvents[0].type).toBe('integration.cicd.build.completed');
  });
});
