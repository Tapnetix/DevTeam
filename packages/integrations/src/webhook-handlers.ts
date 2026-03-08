import { createHmac, timingSafeEqual } from 'node:crypto';
import type { EventBus } from '@devteam/shared';

/**
 * Webhook event handlers for parsing and publishing integration events.
 *
 * Handles webhook payloads from GitHub (PRs, workflow runs) and Jira
 * (issues, comments), validates signatures, and publishes normalized
 * events to the DevTeam event bus.
 */
export class WebhookHandlers {
  constructor(private readonly eventBus: EventBus) {}

  // ── Signature Validation ───────────────────────────────────────────

  /**
   * Validate GitHub webhook HMAC-SHA256 signature.
   *
   * GitHub sends the signature as `sha256=<hex>` in the
   * `x-hub-signature-256` header.
   */
  validateGitHubSignature(body: string, signature: string, secret: string): boolean {
    if (!signature.startsWith('sha256=')) {
      return false;
    }

    const expected = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');

    if (signature.length !== expected.length) {
      return false;
    }

    try {
      return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  }

  /**
   * Validate Jira webhook HMAC-SHA256 signature.
   *
   * Jira sends the signature as a base64-encoded HMAC-SHA256 in
   * the `x-hub-signature` header.
   */
  validateJiraSignature(body: string, signature: string, secret: string): boolean {
    const expected = createHmac('sha256', secret).update(body).digest('base64');

    if (signature.length !== expected.length) {
      return false;
    }

    try {
      return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  }

  // ── GitHub Event Handlers ──────────────────────────────────────────

  /**
   * Handle a GitHub pull_request webhook event.
   */
  async handleGitHubPullRequest(payload: GitHubPullRequestPayload): Promise<void> {
    const pr = payload.pull_request;

    await this.eventBus.publish({
      type: `integration.github.pr.${payload.action}`,
      actor: pr.user?.login ?? 'unknown',
      payload: {
        action: payload.action,
        prNumber: pr.number,
        prId: pr.id,
        title: pr.title,
        body: pr.body ?? '',
        state: pr.state,
        headBranch: pr.head.ref,
        baseBranch: pr.base.ref,
        url: pr.html_url,
      },
    });
  }

  /**
   * Handle a GitHub workflow_run webhook event.
   * Only processes 'completed' events.
   */
  async handleGitHubWorkflowRun(payload: GitHubWorkflowRunPayload): Promise<void> {
    if (payload.action !== 'completed') {
      return;
    }

    const run = payload.workflow_run;

    await this.eventBus.publish({
      type: 'integration.cicd.build.completed',
      actor: 'github-actions',
      payload: {
        buildId: String(run.id),
        workflowName: run.name,
        status: run.conclusion ?? 'unknown',
        commit: run.head_sha,
        branch: run.head_branch,
        url: run.html_url,
        startedAt: run.run_started_at,
        completedAt: run.updated_at,
      },
    });
  }

  // ── Jira Event Handlers ────────────────────────────────────────────

  /**
   * Handle a Jira webhook event (issue created, updated, comment, etc.).
   */
  async handleJiraEvent(payload: JiraWebhookPayload): Promise<void> {
    const eventType = this.mapJiraEventType(payload.webhookEvent);
    const issue = payload.issue;
    const user = payload.user;

    const eventPayload: Record<string, unknown> = {
      issueId: issue.id,
      issueKey: issue.key,
      summary: issue.fields.summary,
      status: issue.fields.status.name,
      issueType: issue.fields.issuetype.name,
      priority: issue.fields.priority?.name,
    };

    // Include changelog for update events
    if (payload.changelog) {
      eventPayload.changelog = payload.changelog.items.map((item) => ({
        field: item.field,
        from: item.fromString,
        to: item.toString,
      }));
    }

    // Include comment data for comment events
    if (payload.comment) {
      eventPayload.commentId = payload.comment.id;
      eventPayload.body = payload.comment.body;
      eventPayload.commentAuthor = payload.comment.author?.displayName;
    }

    await this.eventBus.publish({
      type: eventType,
      actor: user?.displayName ?? 'unknown',
      payload: eventPayload,
    });
  }

  // ── Private helpers ────────────────────────────────────────────────

  private mapJiraEventType(webhookEvent: string): string {
    switch (webhookEvent) {
      case 'jira:issue_created':
        return 'integration.jira.issue.created';
      case 'jira:issue_updated':
        return 'integration.jira.issue.updated';
      case 'jira:issue_deleted':
        return 'integration.jira.issue.deleted';
      case 'comment_created':
        return 'integration.jira.comment.created';
      case 'comment_updated':
        return 'integration.jira.comment.updated';
      case 'comment_deleted':
        return 'integration.jira.comment.deleted';
      default:
        return `integration.jira.${webhookEvent}`;
    }
  }
}

// ── Internal webhook payload types ─────────────────────────────────────

interface GitHubPullRequestPayload {
  action: string;
  pull_request: {
    id: number;
    number: number;
    title: string;
    body: string | null;
    state: string;
    head: { ref: string };
    base: { ref: string };
    html_url: string;
    user: { login: string } | null;
    created_at: string;
    updated_at: string;
  };
  review?: {
    id: number;
    state: string;
    body: string;
    user: { login: string } | null;
  };
}

interface GitHubWorkflowRunPayload {
  action: string;
  workflow_run: {
    id: number;
    name: string;
    status: string;
    conclusion: string | null;
    html_url: string;
    head_sha: string;
    head_branch: string;
    run_started_at: string;
    updated_at: string;
  };
}

interface JiraWebhookPayload {
  webhookEvent: string;
  user?: { displayName: string };
  issue: {
    id: string;
    key: string;
    fields: {
      summary: string;
      status: { name: string };
      issuetype: { name: string };
      priority?: { name: string };
    };
  };
  changelog?: {
    items: Array<{
      field: string;
      fromString: string;
      toString: string;
    }>;
  };
  comment?: {
    id: string;
    body: string;
    author?: { displayName: string };
    created?: string;
  };
}
