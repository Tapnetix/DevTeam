import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JiraAdapter } from '../adapters/jira.js';
import type { JiraConfig } from '../adapters/jira.js';
import type { WorkItem, CreateWorkItemInput, UpdateWorkItemInput } from '../adapters/types.js';

// ── Mock global fetch ────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function makeConfig(overrides?: Partial<JiraConfig>): JiraConfig {
  return {
    baseUrl: 'https://test.atlassian.net',
    project: 'DEV',
    email: 'bot@example.com',
    apiToken: 'jira-api-token-123',
    ...overrides,
  };
}

function jiraIssuePayload(overrides?: Record<string, unknown>) {
  return {
    id: '10001',
    key: 'DEV-42',
    fields: {
      summary: 'Implement login page',
      description: { content: [{ content: [{ text: 'Build the login page with OAuth2' }] }] },
      status: { name: 'To Do' },
      priority: { name: 'High' },
      issuetype: { name: 'Story' },
      assignee: { displayName: 'Alice' },
      labels: ['frontend', 'auth'],
      created: '2025-06-01T10:00:00.000Z',
      updated: '2025-06-02T12:00:00.000Z',
    },
    self: 'https://test.atlassian.net/rest/api/3/issue/10001',
    ...overrides,
  };
}

describe('JiraAdapter', () => {
  let adapter: JiraAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new JiraAdapter(makeConfig());
  });

  describe('getWorkItems', () => {
    it('fetches issues with JQL and returns mapped WorkItems', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          issues: [jiraIssuePayload()],
          total: 1,
        }),
      });

      const items = await adapter.getWorkItems();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/rest/api/3/search');
      expect(url).toContain('jql=');
      expect(url).toContain('project%3DDEV');
      expect(options.headers['Authorization']).toMatch(/^Basic /);
      expect(options.headers['Content-Type']).toBe('application/json');

      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        id: '10001',
        externalId: 'DEV-42',
        title: 'Implement login page',
        status: 'To Do',
        priority: 'High',
        type: 'Story',
        assignee: 'Alice',
        labels: ['frontend', 'auth'],
      });
    });

    it('applies status filter via JQL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ issues: [], total: 0 }),
      });

      await adapter.getWorkItems({ status: 'In Progress' });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('status%3D%22In%20Progress%22');
    });

    it('throws on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Invalid credentials',
      });

      await expect(adapter.getWorkItems()).rejects.toThrow('Jira API error: 401 Unauthorized');
    });
  });

  describe('createWorkItem', () => {
    it('creates an issue and returns the mapped WorkItem', async () => {
      const created = jiraIssuePayload();

      // First call: create issue
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: '10001', key: 'DEV-42', self: created.self }),
      });

      // Second call: fetch the created issue details
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => created,
      });

      const input: CreateWorkItemInput = {
        title: 'Implement login page',
        description: 'Build the login page with OAuth2',
        type: 'Story',
        priority: 'High',
        labels: ['frontend', 'auth'],
      };

      const item = await adapter.createWorkItem(input);

      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Verify create call
      const [createUrl, createOpts] = mockFetch.mock.calls[0];
      expect(createUrl).toContain('/rest/api/3/issue');
      expect(createOpts.method).toBe('POST');

      const body = JSON.parse(createOpts.body);
      expect(body.fields.summary).toBe('Implement login page');
      expect(body.fields.project.key).toBe('DEV');
      expect(body.fields.issuetype.name).toBe('Story');

      // Verify result
      expect(item.externalId).toBe('DEV-42');
      expect(item.title).toBe('Implement login page');
    });
  });

  describe('updateWorkItem', () => {
    it('updates an issue and returns the mapped WorkItem', async () => {
      const updated = jiraIssuePayload();
      updated.fields.status = { name: 'In Progress' };

      // First call: update issue
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      // Second call: fetch updated issue
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => updated,
      });

      const input: UpdateWorkItemInput = {
        status: 'In Progress',
      };

      const item = await adapter.updateWorkItem('10001', input);

      expect(mockFetch).toHaveBeenCalledTimes(2);

      const [updateUrl, updateOpts] = mockFetch.mock.calls[0];
      expect(updateUrl).toContain('/rest/api/3/issue/10001');
      expect(updateOpts.method).toBe('PUT');

      expect(item.status).toBe('In Progress');
    });
  });

  describe('addComment', () => {
    it('adds a comment and returns the mapped comment', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'comment-1',
          body: { content: [{ content: [{ text: 'This is ready for review' }] }] },
          author: { displayName: 'DevTeam Bot' },
          created: '2025-06-03T09:00:00.000Z',
        }),
      });

      const comment = await adapter.addComment('10001', 'This is ready for review');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain('/rest/api/3/issue/10001/comment');
      expect(opts.method).toBe('POST');

      expect(comment.id).toBe('comment-1');
      expect(comment.body).toBe('This is ready for review');
      expect(comment.author).toBe('DevTeam Bot');
    });
  });

  describe('syncFromExternal', () => {
    it('fetches all project issues', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          issues: [jiraIssuePayload()],
          total: 1,
        }),
      });

      const items = await adapter.syncFromExternal();
      expect(items).toHaveLength(1);
      expect(items[0].externalId).toBe('DEV-42');
    });
  });

  describe('syncToExternal', () => {
    it('updates existing issues in Jira', async () => {
      const workItem: WorkItem = {
        id: '10001',
        externalId: 'DEV-42',
        title: 'Updated title',
        description: 'Updated desc',
        status: 'Done',
        priority: 'Low',
        type: 'Story',
        labels: ['done'],
        url: 'https://test.atlassian.net/browse/DEV-42',
        createdAt: new Date('2025-06-01'),
        updatedAt: new Date('2025-06-02'),
      };

      // Update call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      // Fetch-back call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => jiraIssuePayload(),
      });

      await adapter.syncToExternal([workItem]);

      expect(mockFetch).toHaveBeenCalled();
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain('/rest/api/3/issue/10001');
      expect(opts.method).toBe('PUT');
    });
  });

  describe('authentication', () => {
    it('uses Basic auth with email and API token', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ issues: [], total: 0 }),
      });

      await adapter.getWorkItems();

      const [, options] = mockFetch.mock.calls[0];
      const authHeader = options.headers['Authorization'];
      const decoded = Buffer.from(authHeader.replace('Basic ', ''), 'base64').toString();
      expect(decoded).toBe('bot@example.com:jira-api-token-123');
    });
  });
});
