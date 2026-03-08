import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClaudeCodeSpawner } from '../claude/index.js';
import type { SpawnerConfig } from '../claude/index.js';

// Mock child_process
vi.mock('node:child_process', () => {
  return {
    spawn: vi.fn(),
  };
});

import { spawn } from 'node:child_process';

const mockedSpawn = vi.mocked(spawn);

function makeConfig(overrides?: Partial<SpawnerConfig>): SpawnerConfig {
  return {
    workingDirectory: '/tmp/work',
    systemPrompt: 'You are a helpful developer.',
    ...overrides,
  };
}

describe('ClaudeCodeSpawner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('constructs claude command with correct arguments', () => {
    const spawner = new ClaudeCodeSpawner(makeConfig());
    const args = spawner.buildArgs('Implement the login feature');

    expect(args).toContain('--print');
    expect(args).toContain('--system-prompt');
    expect(args).toContain('You are a helpful developer.');
    expect(args.indexOf('--system-prompt')).toBe(args.indexOf('You are a helpful developer.') - 1);
  });

  it('includes task context in the prompt', () => {
    const spawner = new ClaudeCodeSpawner(makeConfig());
    const task = 'Implement the login feature with OAuth2 support';
    const args = spawner.buildArgs(task);

    // Task should be the last argument
    expect(args[args.length - 1]).toBe(task);
  });

  it('includes optional args when configured', () => {
    const spawner = new ClaudeCodeSpawner(
      makeConfig({
        maxTurns: 10,
        model: 'claude-sonnet-4-20250514',
        allowedTools: ['Read', 'Write', 'Bash'],
      }),
    );
    const args = spawner.buildArgs('Fix the bug');

    expect(args).toContain('--max-turns');
    expect(args).toContain('10');
    expect(args).toContain('--model');
    expect(args).toContain('claude-sonnet-4-20250514');
    expect(args).toContain('--allowedTools');
    expect(args.filter((a) => a === '--allowedTools')).toHaveLength(3);
    expect(args).toContain('Read');
    expect(args).toContain('Write');
    expect(args).toContain('Bash');
  });

  it('does not include optional args when not configured', () => {
    const spawner = new ClaudeCodeSpawner(makeConfig());
    const args = spawner.buildArgs('Do something');

    expect(args).not.toContain('--max-turns');
    expect(args).not.toContain('--model');
    expect(args).not.toContain('--allowedTools');
  });

  it('executes claude via spawn with correct cwd', async () => {
    const { EventEmitter } = await import('node:events');
    const { PassThrough } = await import('node:stream');

    const childProcess = new EventEmitter() as any;
    childProcess.stdout = new PassThrough();
    childProcess.stderr = new PassThrough();

    mockedSpawn.mockReturnValue(childProcess);

    const spawner = new ClaudeCodeSpawner(makeConfig({ workingDirectory: '/my/project' }));
    const resultPromise = spawner.execute('Do the thing');

    // Allow the event listeners to be attached before pushing data
    await new Promise((r) => setTimeout(r, 0));

    // Simulate output
    childProcess.stdout.write('Task completed successfully');
    childProcess.stdout.end();
    childProcess.stderr.write('');
    childProcess.stderr.end();
    childProcess.emit('close', 0);

    const result = await resultPromise;

    expect(mockedSpawn).toHaveBeenCalledWith(
      'claude',
      expect.arrayContaining(['--print', '--system-prompt']),
      expect.objectContaining({ cwd: '/my/project' }),
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('Task completed successfully');
  });
});
