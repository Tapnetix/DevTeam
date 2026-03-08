import type {
  KnowledgeRepository,
  ScoredLearning,
  ScoredDecision,
  ScoredPattern,
} from '@devteam/shared';

// ── Interfaces ───────────────────────────────────────────────────────────

export interface TaskContext {
  taskId: string;
  taskTitle: string;
  taskDescription: string;
  designDoc?: string;
  relatedRequirements?: string;
  codingStandards?: string;
  relevantFiles?: string[];
  recentChanges?: string;
  inProgressWork?: Array<{ id: string; title: string; assignee: string }>;
  blockers?: string[];
  /** Relevant learnings from the knowledge base, ranked by similarity. */
  relevantLearnings?: ScoredLearning[];
  /** Relevant decisions from the knowledge base, ranked by similarity. */
  relevantDecisions?: ScoredDecision[];
  /** Relevant patterns from the knowledge base, ranked by similarity. */
  relevantPatterns?: ScoredPattern[];
}

export interface ContextBuilderOptions {
  /** Knowledge repository for semantic search. */
  knowledgeRepo?: KnowledgeRepository;
  /** Team ID for scoping knowledge queries. */
  teamId?: string;
  /** Maximum tokens for the assembled context. Default: 50000. */
  maxContextTokens?: number;
}

// ── Rough token estimation ───────────────────────────────────────────────

/**
 * Rough token estimate: ~4 characters per token on average.
 * This is a conservative heuristic used to enforce the maxContextTokens budget.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ── Context Builder ──────────────────────────────────────────────────────

export class ContextBuilder {
  private readonly knowledgeRepo?: KnowledgeRepository;
  private readonly teamId?: string;
  private readonly maxContextTokens: number;

  constructor(options?: ContextBuilderOptions) {
    this.knowledgeRepo = options?.knowledgeRepo;
    this.teamId = options?.teamId;
    this.maxContextTokens = options?.maxContextTokens ?? 50000;
  }

  async buildTaskContext(params: {
    taskId: string;
    taskTitle: string;
    taskDescription: string;
    designDoc?: string;
    relatedRequirements?: string;
    codingStandards?: string;
  }): Promise<TaskContext> {
    // Start with the basic context (backward compatible)
    const context: TaskContext = {
      taskId: params.taskId,
      taskTitle: params.taskTitle,
      taskDescription: params.taskDescription,
      designDoc: params.designDoc,
      relatedRequirements: params.relatedRequirements,
      codingStandards: params.codingStandards,
    };

    // If no knowledge repo is configured, return basic context
    if (!this.knowledgeRepo || !this.teamId) {
      return context;
    }

    try {
      // Build a search query from task title and description
      const searchQuery = `${params.taskTitle}: ${params.taskDescription}`;

      // Query the knowledge repository for relevant context
      const results = await this.knowledgeRepo.search({
        teamId: this.teamId,
        query: searchQuery,
        limit: 10,
      });

      // Calculate token budget remaining after basic context
      const basicContextText = [
        params.taskTitle,
        params.taskDescription,
        params.designDoc ?? '',
        params.relatedRequirements ?? '',
        params.codingStandards ?? '',
      ].join(' ');

      let remainingTokens = this.maxContextTokens - estimateTokens(basicContextText);

      // Add learnings (highest priority), respecting token budget
      const learnings: ScoredLearning[] = [];
      for (const learning of results.learnings) {
        const tokens = estimateTokens(learning.content);
        if (remainingTokens - tokens < 0 && learnings.length > 0) {
          break;
        }
        learnings.push(learning);
        remainingTokens -= tokens;
      }

      // Add decisions
      const decisions: ScoredDecision[] = [];
      for (const decision of results.decisions) {
        const tokens = estimateTokens(
          `${decision.title} ${decision.decision} ${decision.rationale ?? ''}`,
        );
        if (remainingTokens - tokens < 0 && decisions.length > 0) {
          break;
        }
        decisions.push(decision);
        remainingTokens -= tokens;
      }

      // Add patterns
      const patterns: ScoredPattern[] = [];
      for (const pattern of results.patterns) {
        const tokens = estimateTokens(
          `${pattern.name} ${pattern.description ?? ''} ${pattern.codeExample ?? ''}`,
        );
        if (remainingTokens - tokens < 0 && patterns.length > 0) {
          break;
        }
        patterns.push(pattern);
        remainingTokens -= tokens;
      }

      context.relevantLearnings = learnings;
      context.relevantDecisions = decisions;
      context.relevantPatterns = patterns;
    } catch {
      // If knowledge retrieval fails, return context without knowledge
      // (graceful degradation)
    }

    return context;
  }
}
