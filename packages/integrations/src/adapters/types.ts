/**
 * Integration adapter interfaces for external services.
 *
 * Three adapter types:
 *   - ProjectTrackerAdapter: Jira, Linear, etc.
 *   - SourceControlAdapter: GitHub, GitLab, etc.
 *   - CICDAdapter: GitHub Actions, CircleCI, etc.
 */

// ── Work Item types (project tracking) ─────────────────────────────────

export interface WorkItem {
  id: string;
  externalId: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  type: string;
  assignee?: string;
  labels: string[];
  url: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateWorkItemInput {
  title: string;
  description: string;
  type: string;
  priority?: string;
  assignee?: string;
  labels?: string[];
  parentId?: string;
}

export interface UpdateWorkItemInput {
  status?: string;
  priority?: string;
  assignee?: string;
  labels?: string[];
  title?: string;
  description?: string;
}

export interface WorkItemComment {
  id: string;
  body: string;
  author: string;
  createdAt: Date;
}

// ── Pull Request types (source control) ────────────────────────────────

export interface PullRequest {
  id: number;
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed' | 'merged';
  headBranch: string;
  baseBranch: string;
  url: string;
  author: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePRInput {
  title: string;
  body: string;
  headBranch: string;
  baseBranch: string;
  draft?: boolean;
}

export interface PRReview {
  id: number;
  state: 'approved' | 'changes_requested' | 'commented';
  body: string;
  author: string;
}

export type PREventHandler = (event: PREvent) => void | Promise<void>;

export interface PREvent {
  action: string;
  pullRequest: PullRequest;
  review?: PRReview;
}

// ── CI/CD types ────────────────────────────────────────────────────────

export interface BuildResult {
  id: string;
  status: 'success' | 'failure' | 'pending' | 'cancelled';
  url: string;
  commit: string;
  branch: string;
  startedAt: Date;
  completedAt?: Date;
  duration?: number;
}

export interface TestResults {
  buildId: string;
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  suites: TestSuite[];
}

export interface TestSuite {
  name: string;
  passed: number;
  failed: number;
  tests: TestCase[];
}

export interface TestCase {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: string;
}

export interface BuildArtifact {
  id: string;
  name: string;
  url: string;
  size: number;
}

export type BuildEventHandler = (result: BuildResult) => void | Promise<void>;
export type TestResultsHandler = (results: TestResults) => void | Promise<void>;

// ── Adapter Interfaces ─────────────────────────────────────────────────

export interface ProjectTrackerAdapter {
  /** Get work items from the tracker, optionally filtered by status */
  getWorkItems(filters?: { status?: string; assignee?: string }): Promise<WorkItem[]>;

  /** Create a new work item */
  createWorkItem(input: CreateWorkItemInput): Promise<WorkItem>;

  /** Update an existing work item */
  updateWorkItem(id: string, input: UpdateWorkItemInput): Promise<WorkItem>;

  /** Add a comment to a work item */
  addComment(workItemId: string, body: string): Promise<WorkItemComment>;

  /** Sync work items from the external tracker to internal state */
  syncFromExternal(): Promise<WorkItem[]>;

  /** Push internal state to the external tracker */
  syncToExternal(workItems: WorkItem[]): Promise<void>;
}

export interface SourceControlAdapter {
  /** Create a pull request */
  createPR(input: CreatePRInput): Promise<PullRequest>;

  /** Submit a review on a pull request */
  reviewPR(prNumber: number, review: { state: PRReview['state']; body: string }): Promise<PRReview>;

  /** Merge a pull request */
  mergePR(prNumber: number, method?: 'merge' | 'squash' | 'rebase'): Promise<void>;

  /** Register a callback for PR events */
  onPREvent(handler: PREventHandler): () => void;
}

export interface CICDAdapter {
  /** Trigger a build/workflow */
  triggerBuild(params: { branch: string; workflow?: string }): Promise<BuildResult>;

  /** Get artifacts from a build */
  getArtifacts(buildId: string): Promise<BuildArtifact[]>;

  /** Register a callback for build completion events */
  onBuildComplete(handler: BuildEventHandler): () => void;

  /** Register a callback for test result events */
  onTestResults(handler: TestResultsHandler): () => void;
}
