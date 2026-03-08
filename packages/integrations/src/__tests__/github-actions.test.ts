import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubActionsAdapter } from '../adapters/github-actions.js';
import type { GitHubActionsConfig } from '../adapters/github-actions.js';
import type { BuildResult, TestResults, BuildArtifact } from '../adapters/types.js';

// ── Mock Octokit ────────────────────────────────────────────────────────

const mockOctokit = {
  rest: {
    actions: {
      createWorkflowDispatch: vi.fn(),
      listWorkflowRuns: vi.fn(),
      listWorkflowRunArtifacts: vi.fn(),
    },
  },
};

vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn(() => mockOctokit),
}));

function makeConfig(overrides?: Partial<GitHubActionsConfig>): GitHubActionsConfig {
  return {
    owner: 'test-org',
    repo: 'test-repo',
    token: 'ghp_test-token-123',
    defaultWorkflow: 'ci.yml',
    ...overrides,
  };
}

describe('GitHubActionsAdapter', () => {
  let adapter: GitHubActionsAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new GitHubActionsAdapter(makeConfig());
  });

  describe('triggerBuild', () => {
    it('dispatches a workflow and returns initial build result', async () => {
      mockOctokit.rest.actions.createWorkflowDispatch.mockResolvedValueOnce({
        status: 204,
      });

      // After dispatch, list runs to find the triggered one
      mockOctokit.rest.actions.listWorkflowRuns.mockResolvedValueOnce({
        data: {
          workflow_runs: [
            {
              id: 5001,
              status: 'queued',
              conclusion: null,
              html_url: 'https://github.com/test-org/test-repo/actions/runs/5001',
              head_sha: 'abc123',
              head_branch: 'feature/login',
              run_started_at: '2025-06-01T10:00:00Z',
              updated_at: '2025-06-01T10:00:00Z',
            },
          ],
        },
      });

      const result = await adapter.triggerBuild({ branch: 'feature/login' });

      expect(mockOctokit.rest.actions.createWorkflowDispatch).toHaveBeenCalledWith({
        owner: 'test-org',
        repo: 'test-repo',
        workflow_id: 'ci.yml',
        ref: 'feature/login',
      });

      expect(result).toMatchObject({
        id: '5001',
        status: 'pending',
        url: 'https://github.com/test-org/test-repo/actions/runs/5001',
        commit: 'abc123',
        branch: 'feature/login',
      });
      expect(result.startedAt).toBeInstanceOf(Date);
    });

    it('uses specified workflow instead of default', async () => {
      mockOctokit.rest.actions.createWorkflowDispatch.mockResolvedValueOnce({
        status: 204,
      });

      mockOctokit.rest.actions.listWorkflowRuns.mockResolvedValueOnce({
        data: {
          workflow_runs: [
            {
              id: 5002,
              status: 'queued',
              conclusion: null,
              html_url: 'https://github.com/test-org/test-repo/actions/runs/5002',
              head_sha: 'def456',
              head_branch: 'main',
              run_started_at: '2025-06-01T10:00:00Z',
              updated_at: '2025-06-01T10:00:00Z',
            },
          ],
        },
      });

      await adapter.triggerBuild({ branch: 'main', workflow: 'deploy.yml' });

      expect(mockOctokit.rest.actions.createWorkflowDispatch).toHaveBeenCalledWith(
        expect.objectContaining({ workflow_id: 'deploy.yml' }),
      );
    });
  });

  describe('getArtifacts', () => {
    it('returns artifacts for a given build/run', async () => {
      mockOctokit.rest.actions.listWorkflowRunArtifacts.mockResolvedValueOnce({
        data: {
          artifacts: [
            {
              id: 9001,
              name: 'test-report',
              archive_download_url:
                'https://api.github.com/repos/test-org/test-repo/actions/artifacts/9001/zip',
              size_in_bytes: 1024,
            },
            {
              id: 9002,
              name: 'coverage',
              archive_download_url:
                'https://api.github.com/repos/test-org/test-repo/actions/artifacts/9002/zip',
              size_in_bytes: 2048,
            },
          ],
        },
      });

      const artifacts = await adapter.getArtifacts('5001');

      expect(mockOctokit.rest.actions.listWorkflowRunArtifacts).toHaveBeenCalledWith({
        owner: 'test-org',
        repo: 'test-repo',
        run_id: 5001,
      });

      expect(artifacts).toHaveLength(2);
      expect(artifacts[0]).toMatchObject({
        id: '9001',
        name: 'test-report',
        size: 1024,
      });
      expect(artifacts[1]).toMatchObject({
        id: '9002',
        name: 'coverage',
        size: 2048,
      });
    });
  });

  describe('onBuildComplete', () => {
    it('registers and invokes build completion handlers', async () => {
      const results: BuildResult[] = [];
      const unsubscribe = adapter.onBuildComplete((result) => {
        results.push(result);
      });

      await adapter.handleBuildEvent({
        action: 'completed',
        workflow_run: {
          id: 5001,
          status: 'completed',
          conclusion: 'success',
          html_url: 'https://github.com/test-org/test-repo/actions/runs/5001',
          head_sha: 'abc123',
          head_branch: 'feature/login',
          run_started_at: '2025-06-01T10:00:00Z',
          updated_at: '2025-06-01T10:30:00Z',
        },
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        id: '5001',
        status: 'success',
        commit: 'abc123',
        branch: 'feature/login',
      });
      expect(results[0].startedAt).toBeInstanceOf(Date);
      expect(results[0].completedAt).toBeInstanceOf(Date);

      unsubscribe();

      // After unsubscribe, handler is not called
      await adapter.handleBuildEvent({
        action: 'completed',
        workflow_run: {
          id: 5002,
          status: 'completed',
          conclusion: 'failure',
          html_url: 'https://github.com/test-org/test-repo/actions/runs/5002',
          head_sha: 'def456',
          head_branch: 'main',
          run_started_at: '2025-06-01T11:00:00Z',
          updated_at: '2025-06-01T11:30:00Z',
        },
      });

      expect(results).toHaveLength(1);
    });

    it('maps failure conclusion to failure status', async () => {
      const results: BuildResult[] = [];
      adapter.onBuildComplete((result) => {
        results.push(result);
      });

      await adapter.handleBuildEvent({
        action: 'completed',
        workflow_run: {
          id: 5003,
          status: 'completed',
          conclusion: 'failure',
          html_url: 'https://github.com/test-org/test-repo/actions/runs/5003',
          head_sha: 'xyz789',
          head_branch: 'bugfix/crash',
          run_started_at: '2025-06-01T12:00:00Z',
          updated_at: '2025-06-01T12:15:00Z',
        },
      });

      expect(results[0].status).toBe('failure');
    });

    it('maps cancelled conclusion to cancelled status', async () => {
      const results: BuildResult[] = [];
      adapter.onBuildComplete((result) => {
        results.push(result);
      });

      await adapter.handleBuildEvent({
        action: 'completed',
        workflow_run: {
          id: 5004,
          status: 'completed',
          conclusion: 'cancelled',
          html_url: 'https://github.com/test-org/test-repo/actions/runs/5004',
          head_sha: 'xyz789',
          head_branch: 'feature/x',
          run_started_at: '2025-06-01T13:00:00Z',
          updated_at: '2025-06-01T13:05:00Z',
        },
      });

      expect(results[0].status).toBe('cancelled');
    });
  });

  describe('onTestResults', () => {
    it('registers and invokes test result handlers', async () => {
      const results: TestResults[] = [];
      const unsubscribe = adapter.onTestResults((r) => {
        results.push(r);
      });

      await adapter.handleTestResultsEvent({
        buildId: '5001',
        passed: 50,
        failed: 2,
        skipped: 3,
        total: 55,
        suites: [
          {
            name: 'unit',
            passed: 45,
            failed: 1,
            tests: [
              { name: 'test-a', status: 'passed', duration: 10 },
              { name: 'test-b', status: 'failed', duration: 20, error: 'assertion error' },
            ],
          },
        ],
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        buildId: '5001',
        passed: 50,
        failed: 2,
        skipped: 3,
        total: 55,
      });
      expect(results[0].suites).toHaveLength(1);
      expect(results[0].suites[0].name).toBe('unit');

      unsubscribe();

      await adapter.handleTestResultsEvent({
        buildId: '5002',
        passed: 10,
        failed: 0,
        skipped: 0,
        total: 10,
        suites: [],
      });

      expect(results).toHaveLength(1);
    });
  });
});
