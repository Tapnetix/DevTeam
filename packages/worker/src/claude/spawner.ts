import { spawn } from 'node:child_process';
import type { SpawnerConfig, SpawnResult } from './types.js';

/**
 * Spawns Claude Code CLI sessions with configurable system prompts and options.
 *
 * SECURITY: Uses spawn() with argument arrays — never exec() or string interpolation.
 */
export class ClaudeCodeSpawner {
  constructor(private config: SpawnerConfig) {}

  /**
   * Build the CLI argument array for a claude invocation.
   *
   * Structure: ['--print', '--system-prompt', <prompt>, ...options, <task>]
   */
  buildArgs(task: string): string[] {
    const args: string[] = ['--print', '--system-prompt', this.config.systemPrompt];

    if (this.config.maxTurns !== undefined) {
      args.push('--max-turns', String(this.config.maxTurns));
    }

    if (this.config.model !== undefined) {
      args.push('--model', this.config.model);
    }

    if (this.config.allowedTools !== undefined && this.config.allowedTools.length > 0) {
      for (const tool of this.config.allowedTools) {
        args.push('--allowedTools', tool);
      }
    }

    // Task string is always the last argument
    args.push(task);

    return args;
  }

  /**
   * Execute a Claude Code session with the given task.
   *
   * Spawns the `claude` CLI as a child process, collects stdout/stderr,
   * and resolves with the exit code and output.
   */
  async execute(task: string): Promise<SpawnResult> {
    const args = this.buildArgs(task);

    return new Promise<SpawnResult>((resolve, reject) => {
      const child = spawn('claude', args, {
        cwd: this.config.workingDirectory,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutChunks.push(chunk);
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderrChunks.push(chunk);
      });

      child.on('error', (err: Error) => {
        reject(err);
      });

      child.on('close', (code: number | null) => {
        resolve({
          exitCode: code ?? 1,
          stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
          stderr: Buffer.concat(stderrChunks).toString('utf-8'),
        });
      });
    });
  }
}
