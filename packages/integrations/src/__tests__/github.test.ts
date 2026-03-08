import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubAdapter } from '../adapters/github.js';
import type { GitHubConfig, OctokitClient } from '../adapters/github.js';
import type { CreatePRInput, PullRequest, PREvent } from '../adapters/types.js';

// ── Mock Octokit client ─────────────────────────────────────────────────

function createMockOctokit(): OctokitClient & {
  _pulls: {
    create: ReturnType<typeof vi.fn>;
    createReview: ReturnType<typeof vi.fn>;
    merge: ReturnType<typeof vi.fn>;
  };
} {
  const pulls = {
    create: vi.fn(),
    createReview: vi.fn(),
    merge: vi.fn(),
  };
  return {
    rest: { pulls },
    _pulls: pulls,
  };
}

function makeConfig(overrides?: Partial<GitHubConfig>): GitHubConfig {
  return {
    owner: 'test-org',
    repo: 'test-repo',
    token: 'ghp_test-token-123',
    ...overrides,
  };
}

function githubPRPayload(overrides?: Record<string, unknown>) {
  return {
    data: {
      id: 100,
      number: 42,
      title: 'feat: add login page',
      body: 'Implements the login page with OAuth2',
      state: 'open',
      head: { ref: 'feature/login' },
      base: { ref: 'main' },
      html_url: 'https://github.com/test-org/test-repo/pull/42',
      user: { login: 'alice' },
      created_at: '2025-06-01T10:00:00Z',
      updated_at: '2025-06-02T12:00:00Z',
      ...overrides,
    },
  };
}

describe('GitHubAdapter', () => {
  let adapter: GitHubAdapter;
  let mockOctokit: ReturnType<typeof createMockOctokit>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockOctokit = createMockOctokit();
    adapter = new GitHubAdapter(makeConfig(), mockOctokit);
  });

  describe('createPR', () => {
    it('creates a pull request and returns mapped PullRequest', async () => {
      mockOctokit._pulls.create.mockResolvedValueOnce(githubPRPayload());

      const input: CreatePRInput = {
        title: 'feat: add login page',
        body: 'Implements the login page with OAuth2',
        headBranch: 'feature/login',
        baseBranch: 'main',
        draft: false,
      };

      const pr = await adapter.createPR(input);

      expect(mockOctokit._pulls.create).toHaveBeenCalledWith({
        owner: 'test-org',
        repo: 'test-repo',
        title: 'feat: add login page',
        body: 'Implements the login page with OAuth2',
        head: 'feature/login',
        base: 'main',
        draft: false,
      });

      expect(pr).toMatchObject({
        id: 100,
        number: 42,
        title: 'feat: add login page',
        body: 'Implements the login page with OAuth2',
        state: 'open',
        headBranch: 'feature/login',
        baseBranch: 'main',
        url: 'https://github.com/test-org/test-repo/pull/42',
        author: 'alice',
      });
      expect(pr.createdAt).toBeInstanceOf(Date);
      expect(pr.updatedAt).toBeInstanceOf(Date);
    });

    it('creates a draft PR when draft is true', async () => {
      mockOctokit._pulls.create.mockResolvedValueOnce(githubPRPayload());

      await adapter.createPR({
        title: 'WIP: login',
        body: 'Work in progress',
        headBranch: 'feature/login',
        baseBranch: 'main',
        draft: true,
      });

      expect(mockOctokit._pulls.create).toHaveBeenCalledWith(
        expect.objectContaining({ draft: true }),
      );
    });
  });

  describe('reviewPR', () => {
    it('submits a review with APPROVED event', async () => {
      mockOctokit._pulls.createReview.mockResolvedValueOnce({
        data: {
          id: 200,
          state: 'APPROVED',
          body: 'LGTM!',
          user: { login: 'bob' },
        },
      });

      const review = await adapter.reviewPR(42, {
        state: 'approved',
        body: 'LGTM!',
      });

      expect(mockOctokit._pulls.createReview).toHaveBeenCalledWith({
        owner: 'test-org',
        repo: 'test-repo',
        pull_number: 42,
        event: 'APPROVE',
        body: 'LGTM!',
      });

      expect(review).toMatchObject({
        id: 200,
        state: 'approved',
        body: 'LGTM!',
        author: 'bob',
      });
    });

    it('submits a review with REQUEST_CHANGES event', async () => {
      mockOctokit._pulls.createReview.mockResolvedValueOnce({
        data: {
          id: 201,
          state: 'CHANGES_REQUESTED',
          body: 'Need fixes',
          user: { login: 'carol' },
        },
      });

      const review = await adapter.reviewPR(42, {
        state: 'changes_requested',
        body: 'Need fixes',
      });

      expect(mockOctokit._pulls.createReview).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'REQUEST_CHANGES' }),
      );

      expect(review.state).toBe('changes_requested');
    });

    it('submits a comment-only review', async () => {
      mockOctokit._pulls.createReview.mockResolvedValueOnce({
        data: {
          id: 202,
          state: 'COMMENTED',
          body: 'Looks interesting',
          user: { login: 'dave' },
        },
      });

      const review = await adapter.reviewPR(42, {
        state: 'commented',
        body: 'Looks interesting',
      });

      expect(mockOctokit._pulls.createReview).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'COMMENT' }),
      );

      expect(review.state).toBe('commented');
    });
  });

  describe('mergePR', () => {
    it('merges a PR with squash method by default', async () => {
      mockOctokit._pulls.merge.mockResolvedValueOnce({
        data: { merged: true },
      });

      await adapter.mergePR(42);

      expect(mockOctokit._pulls.merge).toHaveBeenCalledWith({
        owner: 'test-org',
        repo: 'test-repo',
        pull_number: 42,
        merge_method: 'squash',
      });
    });

    it('merges with specified method', async () => {
      mockOctokit._pulls.merge.mockResolvedValueOnce({
        data: { merged: true },
      });

      await adapter.mergePR(42, 'rebase');

      expect(mockOctokit._pulls.merge).toHaveBeenCalledWith(
        expect.objectContaining({ merge_method: 'rebase' }),
      );
    });

    it('throws if merge fails', async () => {
      mockOctokit._pulls.merge.mockRejectedValueOnce(
        new Error('Pull request is not mergeable'),
      );

      await expect(adapter.mergePR(42)).rejects.toThrow('Pull request is not mergeable');
    });
  });

  describe('onPREvent', () => {
    it('registers and invokes a PR event handler', async () => {
      const events: PREvent[] = [];
      const unsubscribe = adapter.onPREvent((event) => {
        events.push(event);
      });

      // Simulate an incoming event
      await adapter.handleWebhookEvent({
        action: 'opened',
        pull_request: {
          id: 100,
          number: 42,
          title: 'feat: login',
          body: 'Login feature',
          state: 'open',
          head: { ref: 'feature/login' },
          base: { ref: 'main' },
          html_url: 'https://github.com/test-org/test-repo/pull/42',
          user: { login: 'alice' },
          created_at: '2025-06-01T10:00:00Z',
          updated_at: '2025-06-02T12:00:00Z',
        },
      });

      expect(events).toHaveLength(1);
      expect(events[0].action).toBe('opened');
      expect(events[0].pullRequest.number).toBe(42);

      unsubscribe();

      // After unsubscribe, no more events
      await adapter.handleWebhookEvent({
        action: 'closed',
        pull_request: {
          id: 100,
          number: 42,
          title: 'feat: login',
          body: 'Login feature',
          state: 'closed',
          head: { ref: 'feature/login' },
          base: { ref: 'main' },
          html_url: 'https://github.com/test-org/test-repo/pull/42',
          user: { login: 'alice' },
          created_at: '2025-06-01T10:00:00Z',
          updated_at: '2025-06-02T12:00:00Z',
        },
      });

      expect(events).toHaveLength(1);
    });

    it('handles review events', async () => {
      const events: PREvent[] = [];
      adapter.onPREvent((event) => {
        events.push(event);
      });

      await adapter.handleWebhookEvent({
        action: 'submitted',
        pull_request: {
          id: 100,
          number: 42,
          title: 'feat: login',
          body: 'Login feature',
          state: 'open',
          head: { ref: 'feature/login' },
          base: { ref: 'main' },
          html_url: 'https://github.com/test-org/test-repo/pull/42',
          user: { login: 'alice' },
          created_at: '2025-06-01T10:00:00Z',
          updated_at: '2025-06-02T12:00:00Z',
        },
        review: {
          id: 200,
          state: 'approved',
          body: 'LGTM',
          user: { login: 'bob' },
        },
      });

      expect(events).toHaveLength(1);
      expect(events[0].review).toBeDefined();
      expect(events[0].review!.state).toBe('approved');
      expect(events[0].review!.author).toBe('bob');
    });
  });
});
