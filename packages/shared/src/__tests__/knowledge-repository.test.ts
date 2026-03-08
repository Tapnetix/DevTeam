import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KnowledgeRepository } from '../knowledge/repository.js';
import type { EmbeddingService } from '../knowledge/embeddings.js';

// ── Helpers ──────────────────────────────────────────────────────────────

function fakeVector(seed = 0): number[] {
  return Array.from({ length: 1536 }, (_, i) => (i + seed) * 0.001);
}

const TEAM_ID = '00000000-0000-0000-0000-000000000001';
const WORK_ITEM_ID = '00000000-0000-0000-0000-000000000002';
const LEARNING_ID = '00000000-0000-0000-0000-000000000010';
const DECISION_ID = '00000000-0000-0000-0000-000000000020';
const PATTERN_ID = '00000000-0000-0000-0000-000000000030';

// ── Mocks ────────────────────────────────────────────────────────────────

function createMockEmbeddingService(): EmbeddingService {
  return {
    embed: vi.fn().mockResolvedValue(fakeVector()),
    embedBatch: vi.fn().mockResolvedValue([fakeVector(), fakeVector()]),
  } as unknown as EmbeddingService;
}

/**
 * Creates a mock Drizzle database object that tracks calls to
 * insert / select / update / delete and the cosine similarity raw query.
 */
function createMockDb() {
  // Track what gets inserted
  const insertedRows: Record<string, unknown[]> = {
    learnings: [],
    decisions: [],
    patterns: [],
  };

  // Simulate stored data for queries
  const storedLearnings = [
    {
      id: LEARNING_ID,
      teamId: TEAM_ID,
      workItemId: WORK_ITEM_ID,
      category: 'testing',
      content: 'Always write tests first using TDD',
      filePaths: ['src/tests/'],
      tags: ['tdd', 'testing'],
      embedding: fakeVector(1),
      createdAt: new Date('2024-01-01'),
    },
  ];

  const storedDecisions = [
    {
      id: DECISION_ID,
      teamId: TEAM_ID,
      workItemId: WORK_ITEM_ID,
      title: 'Use pgvector for embeddings',
      context: 'Need semantic search',
      decision: 'Use pgvector extension',
      rationale: 'Native PostgreSQL support',
      embedding: fakeVector(2),
      createdAt: new Date('2024-01-02'),
    },
  ];

  const storedPatterns = [
    {
      id: PATTERN_ID,
      teamId: TEAM_ID,
      name: 'Repository Pattern',
      description: 'Encapsulate data access logic',
      codeExample: 'class UserRepo { ... }',
      applicability: 'Data access layers',
      embedding: fakeVector(3),
      createdAt: new Date('2024-01-03'),
    },
  ];

  // Build a chainable mock for Drizzle's query builder pattern
  function createChainableMock(resolveValue: unknown) {
    const chain: Record<string, unknown> = {};

    const methods = ['from', 'where', 'orderBy', 'limit', 'leftJoin', 'innerJoin'];
    for (const method of methods) {
      chain[method] = vi.fn().mockReturnValue(chain);
    }

    // The final call returns a promise
    chain['then'] = (resolve: (v: unknown) => void) => resolve(resolveValue);

    return chain;
  }

  // insert().values().returning()
  function createInsertMock(tableName: string) {
    return vi.fn().mockImplementation(() => ({
      values: vi.fn().mockImplementation((row: unknown) => {
        insertedRows[tableName]?.push(row);
        return {
          returning: vi.fn().mockResolvedValue([{ id: `new-${tableName}-id`, ...row as object }]),
        };
      }),
    }));
  }

  // For raw SQL semantic search queries
  const executeRaw = vi.fn();

  const db = {
    insert: vi.fn().mockImplementation((table: { _: { name: string } } | unknown) => {
      const tableName = (table as { _?: { name?: string } })?._?.name;
      if (tableName && insertedRows[tableName]) {
        return createInsertMock(tableName)();
      }
      return createInsertMock('unknown')();
    }),
    select: vi.fn().mockImplementation(() => createChainableMock([])),
    execute: executeRaw,
    _insertedRows: insertedRows,
    _storedLearnings: storedLearnings,
    _storedDecisions: storedDecisions,
    _storedPatterns: storedPatterns,
    _executeRaw: executeRaw,
  };

  return db;
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('KnowledgeRepository', () => {
  let repo: KnowledgeRepository;
  let mockDb: ReturnType<typeof createMockDb>;
  let mockEmbedding: EmbeddingService;

  beforeEach(() => {
    mockDb = createMockDb();
    mockEmbedding = createMockEmbeddingService();
    repo = new KnowledgeRepository(mockDb as never, mockEmbedding);
  });

  // ── Store operations ──────────────────────────────────────────────────

  describe('storeLearning', () => {
    it('stores a learning with auto-generated embedding', async () => {
      const learning = {
        teamId: TEAM_ID,
        workItemId: WORK_ITEM_ID,
        category: 'testing',
        content: 'Always write tests first',
        filePaths: ['src/tests/'],
        tags: ['tdd', 'testing'],
      };

      const result = await repo.storeLearning(learning);

      // Should have called embed with the content
      expect(mockEmbedding.embed).toHaveBeenCalledWith('Always write tests first');

      // Should have called db.insert
      expect(mockDb.insert).toHaveBeenCalled();

      // The result should include the generated id
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
    });
  });

  describe('storeDecision', () => {
    it('stores a decision with auto-generated embedding', async () => {
      const decision = {
        teamId: TEAM_ID,
        workItemId: WORK_ITEM_ID,
        title: 'Use pgvector for embeddings',
        context: 'Need semantic search',
        decision: 'Use pgvector extension',
        rationale: 'Native PostgreSQL support',
      };

      const result = await repo.storeDecision(decision);

      // Should embed using title + decision combined
      expect(mockEmbedding.embed).toHaveBeenCalledWith(
        'Use pgvector for embeddings: Use pgvector extension',
      );

      expect(mockDb.insert).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
    });
  });

  describe('storePattern', () => {
    it('stores a pattern with auto-generated embedding', async () => {
      const pattern = {
        teamId: TEAM_ID,
        name: 'Repository Pattern',
        description: 'Encapsulate data access logic',
        codeExample: 'class UserRepo { ... }',
        applicability: 'Data access layers',
      };

      const result = await repo.storePattern(pattern);

      // Should embed using name + description combined
      expect(mockEmbedding.embed).toHaveBeenCalledWith(
        'Repository Pattern: Encapsulate data access logic',
      );

      expect(mockDb.insert).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
    });
  });

  // ── Semantic search ───────────────────────────────────────────────────

  describe('search', () => {
    it('performs semantic search across learnings, decisions, and patterns', async () => {
      const searchResults = {
        learnings: [
          { ...mockDb._storedLearnings[0], similarity: 0.92 },
        ],
        decisions: [
          { ...mockDb._storedDecisions[0], similarity: 0.85 },
        ],
        patterns: [
          { ...mockDb._storedPatterns[0], similarity: 0.78 },
        ],
      };

      // Mock the execute for raw SQL queries (cosine similarity)
      mockDb._executeRaw
        .mockResolvedValueOnce(searchResults.learnings)
        .mockResolvedValueOnce(searchResults.decisions)
        .mockResolvedValueOnce(searchResults.patterns);

      const results = await repo.search({
        teamId: TEAM_ID,
        query: 'How to write tests',
        limit: 5,
      });

      // Should have embedded the query
      expect(mockEmbedding.embed).toHaveBeenCalledWith('How to write tests');

      // Should return all three types of results
      expect(results.learnings).toHaveLength(1);
      expect(results.decisions).toHaveLength(1);
      expect(results.patterns).toHaveLength(1);

      // Should include similarity scores
      expect(results.learnings[0].similarity).toBe(0.92);
      expect(results.decisions[0].similarity).toBe(0.85);
      expect(results.patterns[0].similarity).toBe(0.78);
    });

    it('filters by minimum similarity threshold', async () => {
      mockDb._executeRaw
        .mockResolvedValueOnce([
          { ...mockDb._storedLearnings[0], similarity: 0.92 },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const results = await repo.search({
        teamId: TEAM_ID,
        query: 'testing patterns',
        limit: 10,
        minSimilarity: 0.8,
      });

      expect(results.learnings).toHaveLength(1);
      expect(results.decisions).toHaveLength(0);
      expect(results.patterns).toHaveLength(0);
    });

    it('respects the limit parameter', async () => {
      mockDb._executeRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await repo.search({
        teamId: TEAM_ID,
        query: 'anything',
        limit: 3,
      });

      // embed should have been called with the query
      expect(mockEmbedding.embed).toHaveBeenCalledWith('anything');
      // execute should have been called 3 times (one per table type)
      expect(mockDb._executeRaw).toHaveBeenCalledTimes(3);
    });
  });

  // ── Query by work item ────────────────────────────────────────────────

  describe('getByWorkItem', () => {
    it('retrieves learnings and decisions for a specific work item', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockDb._storedLearnings[0]]),
        }),
      });
      mockDb.select = mockSelect;

      const results = await repo.getByWorkItem(WORK_ITEM_ID);

      expect(results).toBeDefined();
      expect(mockDb.select).toHaveBeenCalled();
    });
  });

  // ── Query by tags ─────────────────────────────────────────────────────

  describe('getByTags', () => {
    it('retrieves learnings matching specified tags', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockDb._storedLearnings[0]]),
        }),
      });
      mockDb.select = mockSelect;

      const results = await repo.getByTags(TEAM_ID, ['tdd', 'testing']);

      expect(results).toBeDefined();
      expect(mockDb.select).toHaveBeenCalled();
    });
  });
});
