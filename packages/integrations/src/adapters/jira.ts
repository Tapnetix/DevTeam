import type {
  ProjectTrackerAdapter,
  WorkItem,
  CreateWorkItemInput,
  UpdateWorkItemInput,
  WorkItemComment,
} from './types.js';

export interface JiraConfig {
  baseUrl: string;
  project: string;
  email: string;
  apiToken: string;
}

/**
 * Jira REST API v3 adapter implementing ProjectTrackerAdapter.
 *
 * Provides bidirectional sync between DevTeam's internal work items
 * and Jira issues. Uses Basic auth (email + API token).
 */
export class JiraAdapter implements ProjectTrackerAdapter {
  private readonly baseUrl: string;
  private readonly project: string;
  private readonly authHeader: string;

  constructor(private config: JiraConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.project = config.project;
    this.authHeader =
      'Basic ' + Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');
  }

  // ── ProjectTrackerAdapter ──────────────────────────────────────────

  async getWorkItems(filters?: { status?: string; assignee?: string }): Promise<WorkItem[]> {
    let jql = `project=${this.project}`;

    if (filters?.status) {
      jql += ` AND status="${filters.status}"`;
    }
    if (filters?.assignee) {
      jql += ` AND assignee="${filters.assignee}"`;
    }

    const url = `${this.baseUrl}/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=100`;
    const data = await this.request<JiraSearchResponse>(url);

    return data.issues.map((issue) => this.mapIssueToWorkItem(issue));
  }

  async createWorkItem(input: CreateWorkItemInput): Promise<WorkItem> {
    const body: Record<string, unknown> = {
      fields: {
        project: { key: this.project },
        summary: input.title,
        description: this.toADF(input.description),
        issuetype: { name: input.type },
        ...(input.priority ? { priority: { name: input.priority } } : {}),
        ...(input.labels ? { labels: input.labels } : {}),
        ...(input.parentId ? { parent: { id: input.parentId } } : {}),
      },
    };

    const created = await this.request<{ id: string; key: string; self: string }>(
      `${this.baseUrl}/rest/api/3/issue`,
      { method: 'POST', body: JSON.stringify(body) },
    );

    // Fetch the full issue details
    return this.fetchIssue(created.id);
  }

  async updateWorkItem(id: string, input: UpdateWorkItemInput): Promise<WorkItem> {
    const fields: Record<string, unknown> = {};

    if (input.title) fields.summary = input.title;
    if (input.description) fields.description = this.toADF(input.description);
    if (input.priority) fields.priority = { name: input.priority };
    if (input.labels) fields.labels = input.labels;

    await this.request(`${this.baseUrl}/rest/api/3/issue/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ fields }),
    });

    // Fetch updated issue
    return this.fetchIssue(id);
  }

  async addComment(workItemId: string, body: string): Promise<WorkItemComment> {
    const payload = {
      body: this.toADF(body),
    };

    const data = await this.request<JiraComment>(
      `${this.baseUrl}/rest/api/3/issue/${workItemId}/comment`,
      { method: 'POST', body: JSON.stringify(payload) },
    );

    return this.mapComment(data);
  }

  async syncFromExternal(): Promise<WorkItem[]> {
    return this.getWorkItems();
  }

  async syncToExternal(workItems: WorkItem[]): Promise<void> {
    for (const item of workItems) {
      await this.updateWorkItem(item.id, {
        title: item.title,
        description: item.description,
        priority: item.priority,
        labels: item.labels,
      });
    }
  }

  // ── Private helpers ────────────────────────────────────────────────

  private async fetchIssue(id: string): Promise<WorkItem> {
    const issue = await this.request<JiraIssue>(`${this.baseUrl}/rest/api/3/issue/${id}`);
    return this.mapIssueToWorkItem(issue);
  }

  private async request<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/json',
        ...((options?.headers as Record<string, string>) ?? {}),
      },
    });

    if (!response.ok) {
      throw new Error(`Jira API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  private mapIssueToWorkItem(issue: JiraIssue): WorkItem {
    return {
      id: issue.id,
      externalId: issue.key,
      title: issue.fields.summary,
      description: this.extractText(issue.fields.description),
      status: issue.fields.status.name,
      priority: issue.fields.priority?.name ?? 'Normal',
      type: issue.fields.issuetype.name,
      assignee: issue.fields.assignee?.displayName,
      labels: issue.fields.labels ?? [],
      url: `${this.baseUrl}/browse/${issue.key}`,
      createdAt: new Date(issue.fields.created),
      updatedAt: new Date(issue.fields.updated),
    };
  }

  private mapComment(comment: JiraComment): WorkItemComment {
    return {
      id: comment.id,
      body: this.extractText(comment.body),
      author: comment.author.displayName,
      createdAt: new Date(comment.created),
    };
  }

  /**
   * Convert a plain text string to Atlassian Document Format (ADF).
   */
  private toADF(text: string): Record<string, unknown> {
    return {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text }],
        },
      ],
    };
  }

  /**
   * Extract plain text from an ADF document.
   */
  private extractText(adf: unknown): string {
    if (!adf || typeof adf !== 'object') return '';
    const doc = adf as { content?: Array<{ content?: Array<{ text?: string }> }> };
    if (!doc.content) return '';

    return doc.content
      .flatMap((block) => (block.content ?? []).map((inline) => inline.text ?? ''))
      .join('\n');
  }
}

// ── Jira API types (internal) ──────────────────────────────────────────

interface JiraSearchResponse {
  issues: JiraIssue[];
  total: number;
}

interface JiraIssue {
  id: string;
  key: string;
  self: string;
  fields: {
    summary: string;
    description: unknown;
    status: { name: string };
    priority: { name: string } | null;
    issuetype: { name: string };
    assignee: { displayName: string } | null;
    labels: string[];
    created: string;
    updated: string;
  };
}

interface JiraComment {
  id: string;
  body: unknown;
  author: { displayName: string };
  created: string;
}
