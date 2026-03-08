import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContextBuilder } from '../context-builder.js';
import type { KnowledgeRepository, SearchResults } from '@devteam/shared';

// ── Helpers ──────────────────────────────────────────────────────────────

const TEAM_ID = '00000000-0000-0000-0000-000000000001';

function createMockKnowledgeRepo(searchResults?: Partial<SearchResults>): KnowledgeRepository {
  const defaults: SearchResults = {
    learnings: [
      {
        id: 'learn-1',
        teamId: TEAM_ID,
        workItemId: null,
        category: 'testing',
        content: 'Always write tests first using TDD approach for reliable code.',
        filePaths: ['src/tests/'],
        tags: ['tdd', 'testing'],
        createdAt: new Date('2024-01-01'),
        similarity: 0.92,
      },
    ],
    decisions: [
      {
        id: 'dec-1',
        teamId: TEAM_ID,
        workItemId: null,
        title: 'Use pgvector for embeddings',
        context: 'Need semantic search capability',
        decision: 'Use pgvector extension for PostgreSQL',
        rationale: 'Native support, good performance',
        createdAt: new Date('2024-01-02'),
        similarity: 0.85,
      },
    ],
    patterns: [
      {
        id: 'pat-1',
        teamId: TEAM_ID,
        name: 'Repository Pattern',
        description: 'Encapsulate data access logic in repository classes',
        codeExample: 'class UserRepo { async findById(id: string) { ... } }',
        applicability: 'Data access layers',
        createdAt: new Date('2024-01-03'),
        similarity: 0.78,
      },
    ],
  };

  const merged: SearchResults = {
    learnings: searchResults?.learnings ?? defaults.learnings,
    decisions: searchResults?.decisions ?? defaults.decisions,
    patterns: searchResults?.patterns ?? defaults.patterns,
  };

  return {
    search: vi.fn().mockResolvedValue(merged),
    storeLearning: vi.fn(),
    storeDecision: vi.fn(),
    storePattern: vi.fn(),
    getByWorkItem: vi.fn().mockResolvedValue({ learnings: [], decisions: [] }),
    getByTags: vi.fn().mockResolvedValue([]),
  } as unknown as KnowledgeRepository;
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('ContextBuilder', () => {
  describe('without knowledge repository (backward compatibility)', () => {
    let builder: ContextBuilder;

    beforeEach(() => {
      builder = new ContextBuilder();
    });

    it('builds basic task context from params only', async () => {
      const context = await builder.buildTaskContext({
        taskId: 'task-1',
        taskTitle: 'Implement login',
        taskDescription: 'Create login form with validation',
        designDoc: 'Login design doc content',
      });

      expect(context.taskId).toBe('task-1');
      expect(context.taskTitle).toBe('Implement login');
      expect(context.taskDescription).toBe('Create login form with validation');
      expect(context.designDoc).toBe('Login design doc content');
    });

    it('does not include knowledge fields when no repository configured', async () => {
      const context = await builder.buildTaskContext({
        taskId: 'task-1',
        taskTitle: 'Test task',
        taskDescription: 'Test description',
      });

      expect(context.relevantLearnings).toBeUndefined();
      expect(context.relevantDecisions).toBeUndefined();
      expect(context.relevantPatterns).toBeUndefined();
    });
  });

  describe('with knowledge repository', () => {
    let builder: ContextBuilder;
    let mockRepo: KnowledgeRepository;

    beforeEach(() => {
      mockRepo = createMockKnowledgeRepo();
      builder = new ContextBuilder({
        knowledgeRepo: mockRepo,
        teamId: TEAM_ID,
        maxContextTokens: 50000,
      });
    });

    it('queries knowledge repository for relevant context', async () => {
      const context = await builder.buildTaskContext({
        taskId: 'task-1',
        taskTitle: 'Implement search feature',
        taskDescription: 'Add full-text search to the product listing',
      });

      // Should have called search with a query derived from task info
      expect(mockRepo.search).toHaveBeenCalledWith(
        expect.objectContaining({
          teamId: TEAM_ID,
          query: expect.stringContaining('Implement search feature'),
        }),
      );

      // Context should now include knowledge results
      expect(context.relevantLearnings).toBeDefined();
      expect(context.relevantLearnings).toHaveLength(1);
      expect(context.relevantLearnings![0].content).toContain('TDD');

      expect(context.relevantDecisions).toBeDefined();
      expect(context.relevantDecisions).toHaveLength(1);
      expect(context.relevantDecisions![0].title).toBe('Use pgvector for embeddings');

      expect(context.relevantPatterns).toBeDefined();
      expect(context.relevantPatterns).toHaveLength(1);
      expect(context.relevantPatterns![0].name).toBe('Repository Pattern');
    });

    it('includes all basic context fields alongside knowledge', async () => {
      const context = await builder.buildTaskContext({
        taskId: 'task-2',
        taskTitle: 'Add dark mode',
        taskDescription: 'Implement dark mode toggle',
        designDoc: 'Dark mode design doc',
        relatedRequirements: 'REQ-001',
        codingStandards: 'Use CSS variables',
      });

      // Basic fields preserved
      expect(context.taskId).toBe('task-2');
      expect(context.taskTitle).toBe('Add dark mode');
      expect(context.taskDescription).toBe('Implement dark mode toggle');
      expect(context.designDoc).toBe('Dark mode design doc');
      expect(context.relatedRequirements).toBe('REQ-001');
      expect(context.codingStandards).toBe('Use CSS variables');

      // Knowledge fields populated
      expect(context.relevantLearnings).toBeDefined();
      expect(context.relevantDecisions).toBeDefined();
      expect(context.relevantPatterns).toBeDefined();
    });

    it('respects maxContextTokens limit', async () => {
      // Create a repo with lots of content to exceed token limit
      const longContent = 'A'.repeat(10000);
      const manyLearnings = Array.from({ length: 20 }, (_, i) => ({
        id: `learn-${i}`,
        teamId: TEAM_ID,
        workItemId: null,
        category: 'testing',
        content: `${longContent} learning ${i}`,
        filePaths: [],
        tags: [],
        createdAt: new Date(),
        similarity: 0.9 - i * 0.01,
      }));

      const bigRepo = createMockKnowledgeRepo({
        learnings: manyLearnings,
        decisions: [],
        patterns: [],
      });

      const limitedBuilder = new ContextBuilder({
        knowledgeRepo: bigRepo,
        teamId: TEAM_ID,
        maxContextTokens: 1000, // Very small limit
      });

      const context = await limitedBuilder.buildTaskContext({
        taskId: 'task-3',
        taskTitle: 'Test token limits',
        taskDescription: 'Should truncate context',
      });

      // Should have fewer learnings than what the repo returned (truncated by token limit)
      expect(context.relevantLearnings).toBeDefined();
      expect(context.relevantLearnings!.length).toBeLessThan(20);
    });

    it('handles empty search results gracefully', async () => {
      const emptyRepo = createMockKnowledgeRepo({
        learnings: [],
        decisions: [],
        patterns: [],
      });

      const emptyBuilder = new ContextBuilder({
        knowledgeRepo: emptyRepo,
        teamId: TEAM_ID,
      });

      const context = await emptyBuilder.buildTaskContext({
        taskId: 'task-4',
        taskTitle: 'No matches',
        taskDescription: 'Nothing relevant in knowledge base',
      });

      expect(context.relevantLearnings).toEqual([]);
      expect(context.relevantDecisions).toEqual([]);
      expect(context.relevantPatterns).toEqual([]);
    });

    it('handles knowledge repository errors gracefully', async () => {
      const failingRepo = {
        search: vi.fn().mockRejectedValue(new Error('DB connection failed')),
        storeLearning: vi.fn(),
        storeDecision: vi.fn(),
        storePattern: vi.fn(),
        getByWorkItem: vi.fn(),
        getByTags: vi.fn(),
      } as unknown as KnowledgeRepository;

      const failingBuilder = new ContextBuilder({
        knowledgeRepo: failingRepo,
        teamId: TEAM_ID,
      });

      // Should not throw, just return context without knowledge
      const context = await failingBuilder.buildTaskContext({
        taskId: 'task-5',
        taskTitle: 'Error handling',
        taskDescription: 'Should handle errors gracefully',
      });

      expect(context.taskId).toBe('task-5');
      expect(context.relevantLearnings).toBeUndefined();
      expect(context.relevantDecisions).toBeUndefined();
      expect(context.relevantPatterns).toBeUndefined();
    });

    it('uses task title and description as the search query', async () => {
      await builder.buildTaskContext({
        taskId: 'task-6',
        taskTitle: 'Fix authentication bug',
        taskDescription: 'Users cannot log in after password reset',
      });

      expect(mockRepo.search).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'Fix authentication bug: Users cannot log in after password reset',
        }),
      );
    });
  });
});
