// ── Knowledge Repository ──────────────────────────────────────────────
//
// Provides CRUD + semantic search over the learnings, decisions, and
// patterns tables using Drizzle ORM and pgvector cosine similarity.

import { sql } from 'drizzle-orm';
import { learnings, decisions, patterns } from '../db/schema.js';
import type { EmbeddingService } from './embeddings.js';

// ── Types ────────────────────────────────────────────────────────────────

export interface StoreLearningInput {
  teamId: string;
  workItemId?: string;
  category: string;
  content: string;
  filePaths?: string[];
  tags?: string[];
}

export interface StoreDecisionInput {
  teamId: string;
  workItemId?: string;
  title: string;
  context?: string;
  decision: string;
  rationale?: string;
}

export interface StorePatternInput {
  teamId: string;
  name: string;
  description?: string;
  codeExample?: string;
  applicability?: string;
}

export interface SearchOptions {
  teamId: string;
  query: string;
  limit?: number;
  minSimilarity?: number;
}

export interface ScoredLearning {
  id: string;
  teamId: string;
  workItemId: string | null;
  category: string;
  content: string;
  filePaths: string[];
  tags: string[];
  createdAt: Date;
  similarity: number;
}

export interface ScoredDecision {
  id: string;
  teamId: string;
  workItemId: string | null;
  title: string;
  context: string | null;
  decision: string;
  rationale: string | null;
  createdAt: Date;
  similarity: number;
}

export interface ScoredPattern {
  id: string;
  teamId: string;
  name: string;
  description: string | null;
  codeExample: string | null;
  applicability: string | null;
  createdAt: Date;
  similarity: number;
}

export interface SearchResults {
  learnings: ScoredLearning[];
  decisions: ScoredDecision[];
  patterns: ScoredPattern[];
}

// ── Repository ───────────────────────────────────────────────────────────

export class KnowledgeRepository {
  constructor(
    private readonly db: unknown,
    private readonly embeddingService: EmbeddingService,
  ) {}

  // ── Store operations ──────────────────────────────────────────────────

  async storeLearning(input: StoreLearningInput) {
    const embedding = await this.embeddingService.embed(input.content);

    const db = this.db as {
      insert: (table: typeof learnings) => {
        values: (row: Record<string, unknown>) => {
          returning: () => Promise<Array<{ id: string }>>;
        };
      };
    };

    const [result] = await db
      .insert(learnings)
      .values({
        teamId: input.teamId,
        workItemId: input.workItemId ?? null,
        category: input.category,
        content: input.content,
        filePaths: input.filePaths ?? [],
        tags: input.tags ?? [],
        embedding,
      })
      .returning();

    return result;
  }

  async storeDecision(input: StoreDecisionInput) {
    const textToEmbed = `${input.title}: ${input.decision}`;
    const embedding = await this.embeddingService.embed(textToEmbed);

    const db = this.db as {
      insert: (table: typeof decisions) => {
        values: (row: Record<string, unknown>) => {
          returning: () => Promise<Array<{ id: string }>>;
        };
      };
    };

    const [result] = await db
      .insert(decisions)
      .values({
        teamId: input.teamId,
        workItemId: input.workItemId ?? null,
        title: input.title,
        context: input.context ?? null,
        decision: input.decision,
        rationale: input.rationale ?? null,
        embedding,
      })
      .returning();

    return result;
  }

  async storePattern(input: StorePatternInput) {
    const textToEmbed = `${input.name}: ${input.description ?? ''}`;
    const embedding = await this.embeddingService.embed(textToEmbed);

    const db = this.db as {
      insert: (table: typeof patterns) => {
        values: (row: Record<string, unknown>) => {
          returning: () => Promise<Array<{ id: string }>>;
        };
      };
    };

    const [result] = await db
      .insert(patterns)
      .values({
        teamId: input.teamId,
        name: input.name,
        description: input.description ?? null,
        codeExample: input.codeExample ?? null,
        applicability: input.applicability ?? null,
        embedding,
      })
      .returning();

    return result;
  }

  // ── Semantic search ───────────────────────────────────────────────────

  /**
   * Performs semantic search across learnings, decisions, and patterns
   * using pgvector cosine similarity (`<=>` operator).
   */
  async search(options: SearchOptions): Promise<SearchResults> {
    const { teamId, query, limit = 5, minSimilarity = 0.0 } = options;

    // Generate embedding for the search query
    const queryEmbedding = await this.embeddingService.embed(query);
    const vectorLiteral = `[${queryEmbedding.join(',')}]`;

    const db = this.db as {
      execute: (query: unknown) => Promise<unknown[]>;
    };

    // Search learnings
    const learningsResults = await db.execute(
      sql`SELECT *, 1 - (embedding <=> ${vectorLiteral}::vector) as similarity
          FROM learnings
          WHERE team_id = ${teamId}
            AND embedding IS NOT NULL
            AND 1 - (embedding <=> ${vectorLiteral}::vector) >= ${minSimilarity}
          ORDER BY embedding <=> ${vectorLiteral}::vector
          LIMIT ${limit}`,
    );

    // Search decisions
    const decisionsResults = await db.execute(
      sql`SELECT *, 1 - (embedding <=> ${vectorLiteral}::vector) as similarity
          FROM decisions
          WHERE team_id = ${teamId}
            AND embedding IS NOT NULL
            AND 1 - (embedding <=> ${vectorLiteral}::vector) >= ${minSimilarity}
          ORDER BY embedding <=> ${vectorLiteral}::vector
          LIMIT ${limit}`,
    );

    // Search patterns
    const patternsResults = await db.execute(
      sql`SELECT *, 1 - (embedding <=> ${vectorLiteral}::vector) as similarity
          FROM patterns
          WHERE team_id = ${teamId}
            AND embedding IS NOT NULL
            AND 1 - (embedding <=> ${vectorLiteral}::vector) >= ${minSimilarity}
          ORDER BY embedding <=> ${vectorLiteral}::vector
          LIMIT ${limit}`,
    );

    return {
      learnings: learningsResults as ScoredLearning[],
      decisions: decisionsResults as ScoredDecision[],
      patterns: patternsResults as ScoredPattern[],
    };
  }

  // ── Query by work item ────────────────────────────────────────────────

  /**
   * Retrieves all learnings and decisions associated with a specific work item.
   */
  async getByWorkItem(workItemId: string) {
    const db = this.db as {
      select: () => {
        from: (table: unknown) => {
          where: (condition: unknown) => Promise<unknown[]>;
        };
      };
    };

    const workItemLearnings = await db
      .select()
      .from(learnings)
      .where(sql`${learnings.workItemId} = ${workItemId}`);

    const workItemDecisions = await db
      .select()
      .from(decisions)
      .where(sql`${decisions.workItemId} = ${workItemId}`);

    return {
      learnings: workItemLearnings,
      decisions: workItemDecisions,
    };
  }

  // ── Query by tags ─────────────────────────────────────────────────────

  /**
   * Retrieves learnings that match any of the specified tags.
   */
  async getByTags(teamId: string, tags: string[]) {
    const db = this.db as {
      select: () => {
        from: (table: unknown) => {
          where: (condition: unknown) => Promise<unknown[]>;
        };
      };
    };

    const taggedLearnings = await db
      .select()
      .from(learnings)
      .where(
        sql`${learnings.teamId} = ${teamId} AND ${learnings.tags}::jsonb ?| array[${sql.join(
          tags.map((t) => sql`${t}`),
          sql`,`,
        )}]`,
      );

    return taggedLearnings;
  }
}
