import type { EventBus } from '@devteam/shared';
import { WebhookHandlers } from './webhook-handlers.js';

export interface WebhookServerConfig {
  eventBus: EventBus;
  githubSecret: string;
  jiraSecret: string;
  port: number;
}

export interface WebhookRoute {
  method: 'GET' | 'POST';
  path: string;
  description: string;
}

export interface WebhookResult {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Webhook receiver service.
 *
 * Receives incoming webhooks from GitHub and Jira, validates their
 * signatures using HMAC-SHA256, parses payloads, and publishes
 * normalized events to the DevTeam event bus.
 *
 * Designed to be mounted into a Fastify server or used standalone.
 */
export class WebhookServer {
  private readonly handlers: WebhookHandlers;
  private readonly githubSecret: string;
  private readonly jiraSecret: string;
  readonly port: number;

  constructor(config: WebhookServerConfig) {
    this.handlers = new WebhookHandlers(config.eventBus);
    this.githubSecret = config.githubSecret;
    this.jiraSecret = config.jiraSecret;
    this.port = config.port;
  }

  /**
   * Returns the route definitions this server handles.
   * Can be used to register routes with Fastify or another HTTP framework.
   */
  getRoutes(): WebhookRoute[] {
    return [
      { method: 'POST', path: '/webhooks/github', description: 'GitHub webhook receiver' },
      { method: 'POST', path: '/webhooks/jira', description: 'Jira webhook receiver' },
      { method: 'GET', path: '/health', description: 'Health check endpoint' },
    ];
  }

  /**
   * Process an incoming GitHub webhook request.
   *
   * Validates the HMAC-SHA256 signature from the `x-hub-signature-256`
   * header, then dispatches to the appropriate handler based on the
   * `x-github-event` header.
   */
  async processGitHubWebhook(
    rawBody: string,
    headers: Record<string, string>,
  ): Promise<WebhookResult> {
    const signature = headers['x-hub-signature-256'] ?? '';
    const eventType = headers['x-github-event'] ?? '';

    // Validate signature
    if (!this.handlers.validateGitHubSignature(rawBody, signature, this.githubSecret)) {
      return { status: 401, body: { error: 'Invalid signature' } };
    }

    try {
      const payload = JSON.parse(rawBody);

      switch (eventType) {
        case 'pull_request':
          await this.handlers.handleGitHubPullRequest(payload);
          break;
        case 'pull_request_review':
          await this.handlers.handleGitHubPullRequest(payload);
          break;
        case 'workflow_run':
          await this.handlers.handleGitHubWorkflowRun(payload);
          break;
        default:
          return {
            status: 200,
            body: { message: `Unhandled event type: ${eventType}` },
          };
      }

      return { status: 200, body: { message: 'Webhook processed' } };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { status: 500, body: { error: message } };
    }
  }

  /**
   * Process an incoming Jira webhook request.
   *
   * Validates the HMAC-SHA256 signature from the `x-hub-signature`
   * header, then parses and publishes the event.
   */
  async processJiraWebhook(
    rawBody: string,
    headers: Record<string, string>,
  ): Promise<WebhookResult> {
    const signature = headers['x-hub-signature'] ?? '';

    // Validate signature
    if (!this.handlers.validateJiraSignature(rawBody, signature, this.jiraSecret)) {
      return { status: 401, body: { error: 'Invalid signature' } };
    }

    try {
      const payload = JSON.parse(rawBody);
      await this.handlers.handleJiraEvent(payload);
      return { status: 200, body: { message: 'Webhook processed' } };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { status: 500, body: { error: message } };
    }
  }
}
