import { spawnSync } from 'node:child_process';
import * as path from 'node:path';

/**
 * Manages git worktrees for isolated work item execution.
 *
 * SECURITY: Uses spawnSync() with argument arrays — never exec() or string interpolation.
 */
export class WorktreeManager {
  constructor(
    private repoPath: string,
    private worktreeBase: string,
  ) {}

  /**
   * Get the filesystem path for a work item's worktree.
   */
  getWorktreePath(workItemId: string): string {
    return path.join(this.worktreeBase, workItemId);
  }

  /**
   * Build the argument array for `git worktree add`.
   */
  buildCreateCommand(workItemId: string, branchName: string): string[] {
    const worktreePath = this.getWorktreePath(workItemId);
    return ['worktree', 'add', worktreePath, '-b', branchName];
  }

  /**
   * Create a new worktree for a work item on a new branch.
   * Returns the worktree path.
   */
  create(workItemId: string, branchName: string): string {
    const args = this.buildCreateCommand(workItemId, branchName);
    const result = this.runGitSync(args);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to create worktree: ${result.stderr}`);
    }
    return this.getWorktreePath(workItemId);
  }

  /**
   * Remove a worktree for a work item.
   */
  remove(workItemId: string): void {
    const worktreePath = this.getWorktreePath(workItemId);
    const result = this.runGitSync(['worktree', 'remove', worktreePath, '--force']);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to remove worktree: ${result.stderr}`);
    }
  }

  /**
   * List all worktrees in porcelain format.
   */
  list(): string[] {
    const result = this.runGitSync(['worktree', 'list', '--porcelain']);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to list worktrees: ${result.stderr}`);
    }
    return result.stdout
      .split('\n')
      .filter((line) => line.startsWith('worktree '))
      .map((line) => line.replace('worktree ', ''));
  }

  /**
   * Run a git command synchronously using spawnSync.
   * SECURITY: Uses argument arrays, not shell strings.
   */
  private runGitSync(args: string[]): { exitCode: number; stdout: string; stderr: string } {
    const result = spawnSync('git', args, {
      cwd: this.repoPath,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return {
      exitCode: result.status ?? 1,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    };
  }
}
