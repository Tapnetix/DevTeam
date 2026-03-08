import { Octokit } from '@octokit/rest';
import type {
  CICDAdapter,
  BuildResult,
  BuildArtifact,
  BuildEventHandler,
  TestResults,
  TestResultsHandler,
} from './types.js';

export interface GitHubActionsConfig {
  owner: string;
  repo: string;
  token: string;
  defaultWorkflow: string;
}

/**
 * Maps GitHub Actions conclusion strings to our BuildResult status.
 */
function mapConclusion(conclusion: string | null): BuildResult['status'] {
  switch (conclusion) {
    case 'success':
      return 'success';
    case 'failure':
    case 'timed_out':
      return 'failure';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'pending';
  }
}

/**
 * Maps GitHub Actions run status to our BuildResult status.
 */
function mapStatus(status: string, conclusion: string | null): BuildResult['status'] {
  if (status === 'completed') {
    return mapConclusion(conclusion);
  }
  return 'pending';
}

/**
 * GitHub Actions CI/CD adapter implementing CICDAdapter.
 *
 * Uses Octokit to trigger workflows, retrieve artifacts, and handle
 * build completion / test result webhook events.
 */
export class GitHubActionsAdapter implements CICDAdapter {
  private readonly octokit: Octokit;
  private readonly owner: string;
  private readonly repo: string;
  private readonly defaultWorkflow: string;
  private readonly buildHandlers = new Set<BuildEventHandler>();
  private readonly testResultsHandlers = new Set<TestResultsHandler>();

  constructor(config: GitHubActionsConfig) {
    this.owner = config.owner;
    this.repo = config.repo;
    this.defaultWorkflow = config.defaultWorkflow;
    this.octokit = new Octokit({ auth: config.token });
  }

  // ── CICDAdapter ────────────────────────────────────────────────────

  async triggerBuild(params: { branch: string; workflow?: string }): Promise<BuildResult> {
    const workflowId = params.workflow ?? this.defaultWorkflow;

    await this.octokit.rest.actions.createWorkflowDispatch({
      owner: this.owner,
      repo: this.repo,
      workflow_id: workflowId,
      ref: params.branch,
    });

    // Small delay to allow the run to be created, then fetch the latest run
    const { data } = await this.octokit.rest.actions.listWorkflowRuns({
      owner: this.owner,
      repo: this.repo,
      workflow_id: workflowId,
      branch: params.branch,
      per_page: 1,
    });

    const run = data.workflow_runs[0];
    return this.mapWorkflowRun(run);
  }

  async getArtifacts(buildId: string): Promise<BuildArtifact[]> {
    const { data } = await this.octokit.rest.actions.listWorkflowRunArtifacts({
      owner: this.owner,
      repo: this.repo,
      run_id: parseInt(buildId, 10),
    });

    return data.artifacts.map((artifact: WorkflowArtifact) => ({
      id: String(artifact.id),
      name: artifact.name,
      url: artifact.archive_download_url,
      size: artifact.size_in_bytes,
    }));
  }

  onBuildComplete(handler: BuildEventHandler): () => void {
    this.buildHandlers.add(handler);
    return () => {
      this.buildHandlers.delete(handler);
    };
  }

  onTestResults(handler: TestResultsHandler): () => void {
    this.testResultsHandlers.add(handler);
    return () => {
      this.testResultsHandlers.delete(handler);
    };
  }

  // ── Webhook handling ───────────────────────────────────────────────

  /**
   * Process an incoming GitHub Actions workflow_run webhook event.
   */
  async handleBuildEvent(payload: WorkflowRunEvent): Promise<void> {
    if (payload.action !== 'completed') return;

    const result = this.mapWorkflowRun(payload.workflow_run);
    result.completedAt = new Date(payload.workflow_run.updated_at);

    if (result.startedAt && result.completedAt) {
      result.duration = result.completedAt.getTime() - result.startedAt.getTime();
    }

    for (const handler of this.buildHandlers) {
      await handler(result);
    }
  }

  /**
   * Process parsed test results (typically extracted from build artifacts
   * or a separate webhook). Called by the webhook handler layer.
   */
  async handleTestResultsEvent(results: TestResults): Promise<void> {
    for (const handler of this.testResultsHandlers) {
      await handler(results);
    }
  }

  // ── Private helpers ────────────────────────────────────────────────

  private mapWorkflowRun(run: WorkflowRunData): BuildResult {
    return {
      id: String(run.id),
      status: mapStatus(run.status, run.conclusion),
      url: run.html_url,
      commit: run.head_sha,
      branch: run.head_branch,
      startedAt: new Date(run.run_started_at),
    };
  }
}

// ── GitHub Actions types (internal) ────────────────────────────────────

interface WorkflowRunData {
  id: number;
  status: string;
  conclusion: string | null;
  html_url: string;
  head_sha: string;
  head_branch: string;
  run_started_at: string;
  updated_at: string;
}

interface WorkflowRunEvent {
  action: string;
  workflow_run: WorkflowRunData;
}

interface WorkflowArtifact {
  id: number;
  name: string;
  archive_download_url: string;
  size_in_bytes: number;
}
