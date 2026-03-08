import type {
  SourceControlAdapter,
  PullRequest,
  CreatePRInput,
  PRReview,
  PREventHandler,
  PREvent,
} from './types.js';

export interface GitHubConfig {
  owner: string;
  repo: string;
  token: string;
}

/**
 * Minimal interface for the Octokit client methods we use.
 * Allows dependency injection for testing and avoids ESM import issues.
 */
export interface OctokitClient {
  rest: {
    pulls: {
      create(params: Record<string, unknown>): Promise<{ data: Record<string, unknown> }>;
      createReview(params: Record<string, unknown>): Promise<{ data: Record<string, unknown> }>;
      merge(params: Record<string, unknown>): Promise<{ data: Record<string, unknown> }>;
    };
  };
}

/**
 * Maps our review state names to GitHub's review event names.
 */
const REVIEW_STATE_TO_EVENT: Record<PRReview['state'], string> = {
  approved: 'APPROVE',
  changes_requested: 'REQUEST_CHANGES',
  commented: 'COMMENT',
};

/**
 * Maps GitHub's review state names back to our normalized names.
 */
const GITHUB_STATE_TO_REVIEW: Record<string, PRReview['state']> = {
  APPROVED: 'approved',
  CHANGES_REQUESTED: 'changes_requested',
  COMMENTED: 'commented',
};

/**
 * Creates an Octokit client via dynamic import to avoid ESM issues.
 */
async function createOctokitClient(token: string): Promise<OctokitClient> {
  const { Octokit } = await import('@octokit/rest');
  return new Octokit({ auth: token }) as unknown as OctokitClient;
}

/**
 * GitHub adapter implementing SourceControlAdapter.
 *
 * Uses Octokit for GitHub REST API interactions. Provides PR management
 * and webhook event handling for pull request lifecycle events.
 */
export class GitHubAdapter implements SourceControlAdapter {
  private octokit: OctokitClient;
  private readonly owner: string;
  private readonly repo: string;
  private readonly prEventHandlers = new Set<PREventHandler>();

  constructor(config: GitHubConfig, octokit?: OctokitClient) {
    this.owner = config.owner;
    this.repo = config.repo;
    // Accept an injected client (for testing) or create a stub that will
    // be lazily replaced on first API call
    this.octokit = octokit ?? this.createLazyClient(config.token);
  }

  /**
   * Create a Proxy-based lazy client that initialises Octokit on first use.
   */
  private createLazyClient(token: string): OctokitClient {
    let realClient: OctokitClient | null = null;
    const self = this;

    const handler: ProxyHandler<OctokitClient> = {
      get(_target, prop) {
        if (prop === 'rest') {
          return new Proxy({} as OctokitClient['rest'], {
            get(_restTarget, restProp) {
              return new Proxy({} as Record<string, unknown>, {
                get(_nsProp, method) {
                  return async (...args: unknown[]) => {
                    if (!realClient) {
                      realClient = await createOctokitClient(token);
                      self.octokit = realClient;
                    }
                    const ns = (realClient.rest as Record<string, Record<string, Function>>)[restProp as string];
                    return ns[method as string](...args);
                  };
                },
              });
            },
          });
        }
        return undefined;
      },
    };

    return new Proxy({} as OctokitClient, handler);
  }

  // ── SourceControlAdapter ───────────────────────────────────────────

  async createPR(input: CreatePRInput): Promise<PullRequest> {
    const { data } = await this.octokit.rest.pulls.create({
      owner: this.owner,
      repo: this.repo,
      title: input.title,
      body: input.body,
      head: input.headBranch,
      base: input.baseBranch,
      draft: input.draft ?? false,
    });

    return this.mapPR(data as unknown as GitHubPRData);
  }

  async reviewPR(
    prNumber: number,
    review: { state: PRReview['state']; body: string },
  ): Promise<PRReview> {
    const event = REVIEW_STATE_TO_EVENT[review.state];

    const { data } = await this.octokit.rest.pulls.createReview({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
      event,
      body: review.body,
    });

    const d = data as { id: number; state: string; body?: string; user?: { login: string } };
    return {
      id: d.id,
      state: GITHUB_STATE_TO_REVIEW[d.state] ?? 'commented',
      body: d.body ?? '',
      author: d.user?.login ?? 'unknown',
    };
  }

  async mergePR(prNumber: number, method: 'merge' | 'squash' | 'rebase' = 'squash'): Promise<void> {
    await this.octokit.rest.pulls.merge({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
      merge_method: method,
    });
  }

  onPREvent(handler: PREventHandler): () => void {
    this.prEventHandlers.add(handler);
    return () => {
      this.prEventHandlers.delete(handler);
    };
  }

  // ── Webhook handling ───────────────────────────────────────────────

  /**
   * Process an incoming GitHub webhook payload for pull_request events.
   * Called by the webhook receiver service.
   */
  async handleWebhookEvent(payload: GitHubWebhookPayload): Promise<void> {
    const prEvent: PREvent = {
      action: payload.action,
      pullRequest: this.mapWebhookPR(payload.pull_request),
    };

    if (payload.review) {
      prEvent.review = {
        id: payload.review.id,
        state: (payload.review.state as PRReview['state']) ?? 'commented',
        body: payload.review.body ?? '',
        author: payload.review.user?.login ?? 'unknown',
      };
    }

    for (const handler of this.prEventHandlers) {
      await handler(prEvent);
    }
  }

  // ── Private helpers ────────────────────────────────────────────────

  private mapPR(data: GitHubPRData): PullRequest {
    return {
      id: data.id,
      number: data.number,
      title: data.title,
      body: data.body ?? '',
      state: data.state as PullRequest['state'],
      headBranch: data.head.ref,
      baseBranch: data.base.ref,
      url: data.html_url,
      author: data.user?.login ?? 'unknown',
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  }

  private mapWebhookPR(pr: GitHubWebhookPR): PullRequest {
    return {
      id: pr.id,
      number: pr.number,
      title: pr.title,
      body: pr.body ?? '',
      state: pr.state as PullRequest['state'],
      headBranch: pr.head.ref,
      baseBranch: pr.base.ref,
      url: pr.html_url,
      author: pr.user?.login ?? 'unknown',
      createdAt: new Date(pr.created_at),
      updatedAt: new Date(pr.updated_at),
    };
  }
}

// ── GitHub API types (internal) ────────────────────────────────────────

interface GitHubPRData {
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
}

interface GitHubWebhookPR {
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
}

export interface GitHubWebhookPayload {
  action: string;
  pull_request: GitHubWebhookPR;
  review?: {
    id: number;
    state: string;
    body: string;
    user: { login: string } | null;
  };
}
