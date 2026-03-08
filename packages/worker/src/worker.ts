import type { TeamMember, EventBus } from '@devteam/shared';
import { WorktreeManager } from './worktree.js';
import { ClaudeCodeSpawner } from './claude/index.js';
import { buildSystemPrompt } from './roles/index.js';
import type { PromptContext } from './roles/index.js';

export interface WorkerConfig {
  member: TeamMember;
  repoPath: string;
  worktreeBase: string;
  eventBus: EventBus;
  projectName: string;
  repository: string;
  codingStandards?: string;
}

export interface TaskDefinition {
  id: string;
  title: string;
  description: string;
  branchName: string;
}

export interface TaskResult {
  success: boolean;
  output: string;
}

/**
 * Worker manages the lifecycle of a role-based agent executing a task.
 *
 * Lifecycle:
 * 1. Publish worker.started event
 * 2. Create git worktree for isolation
 * 3. Spawn Claude Code session with role-specific system prompt
 * 4. Publish worker.completed or worker.failed event
 * 5. Return result
 */
export class Worker {
  readonly role: string;
  readonly name: string;
  readonly handle: string;

  private readonly worktreeManager: WorktreeManager;
  private readonly eventBus: EventBus;
  private readonly member: TeamMember;
  private readonly promptContext: PromptContext;

  constructor(private config: WorkerConfig) {
    this.member = config.member;
    this.role = config.member.role;
    this.name = config.member.name;
    this.handle = config.member.handle;
    this.worktreeManager = new WorktreeManager(config.repoPath, config.worktreeBase);
    this.eventBus = config.eventBus;
    this.promptContext = {
      projectName: config.projectName,
      repository: config.repository,
      codingStandards: config.codingStandards,
    };
  }

  /**
   * Execute a task through the full worker lifecycle.
   */
  async executeTask(task: TaskDefinition): Promise<TaskResult> {
    // 1. Publish worker.started event
    await this.eventBus.publish({
      type: 'worker.started',
      actor: this.handle,
      taskId: task.id,
      payload: {
        role: this.role,
        title: task.title,
        branchName: task.branchName,
      },
    });

    let worktreePath: string | undefined;

    try {
      // 2. Create worktree
      worktreePath = this.worktreeManager.create(task.id, task.branchName);

      // 3. Spawn Claude Code session
      const systemPrompt = buildSystemPrompt(this.member, this.promptContext);
      const spawner = new ClaudeCodeSpawner({
        workingDirectory: worktreePath,
        systemPrompt,
      });

      const taskPrompt = `Task: ${task.title}\n\n${task.description}`;
      const result = await spawner.execute(taskPrompt);

      const success = result.exitCode === 0;
      const output = result.stdout || result.stderr;

      // 4. Publish completion event
      await this.eventBus.publish({
        type: success ? 'worker.completed' : 'worker.failed',
        actor: this.handle,
        taskId: task.id,
        payload: {
          role: this.role,
          exitCode: result.exitCode,
          output: output.slice(0, 10000), // Truncate very large outputs
        },
      });

      // 5. Return result
      return { success, output };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // 4. Publish failure event
      await this.eventBus.publish({
        type: 'worker.failed',
        actor: this.handle,
        taskId: task.id,
        payload: {
          role: this.role,
          error: errorMessage,
        },
      });

      return { success: false, output: errorMessage };
    } finally {
      // Clean up worktree if it was created
      if (worktreePath) {
        try {
          this.worktreeManager.remove(task.id);
        } catch {
          // Best effort cleanup — don't mask the original error
        }
      }
    }
  }
}
