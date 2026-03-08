import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'node:path';
import { WorktreeManager } from '../worktree.js';

// Mock child_process spawnSync
vi.mock('node:child_process', () => {
  return {
    spawnSync: vi.fn().mockReturnValue({
      status: 0,
      stdout: '',
      stderr: '',
    }),
    spawn: vi.fn(),
  };
});

import { spawnSync } from 'node:child_process';

const mockedSpawnSync = vi.mocked(spawnSync);

describe('WorktreeManager', () => {
  const repoPath = '/repos/my-project';
  const worktreeBase = '/tmp/worktrees';

  let manager: WorktreeManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockedSpawnSync.mockReturnValue({
      status: 0,
      stdout: '',
      stderr: '',
      pid: 0,
      output: ['', '', ''],
      signal: null,
    });
    manager = new WorktreeManager(repoPath, worktreeBase);
  });

  it('generates worktree path from work item ID', () => {
    const result = manager.getWorktreePath('wi-123');
    expect(result).toBe(path.join(worktreeBase, 'wi-123'));
  });

  it('builds git worktree add command args', () => {
    const args = manager.buildCreateCommand('wi-456', 'feature/login');

    expect(args).toEqual([
      'worktree',
      'add',
      path.join(worktreeBase, 'wi-456'),
      '-b',
      'feature/login',
    ]);
  });

  it('calls spawnSync with correct args on create', () => {
    const result = manager.create('wi-789', 'feature/signup');

    expect(mockedSpawnSync).toHaveBeenCalledWith(
      'git',
      ['worktree', 'add', path.join(worktreeBase, 'wi-789'), '-b', 'feature/signup'],
      expect.objectContaining({ cwd: repoPath }),
    );
    expect(result).toBe(path.join(worktreeBase, 'wi-789'));
  });

  it('throws on create failure', () => {
    mockedSpawnSync.mockReturnValue({
      status: 1,
      stdout: '',
      stderr: 'fatal: branch already exists',
      pid: 0,
      output: ['', '', ''],
      signal: null,
    });

    expect(() => manager.create('wi-err', 'bad-branch')).toThrow('Failed to create worktree');
  });

  it('calls spawnSync for remove with force flag', () => {
    manager.remove('wi-cleanup');

    expect(mockedSpawnSync).toHaveBeenCalledWith(
      'git',
      ['worktree', 'remove', path.join(worktreeBase, 'wi-cleanup'), '--force'],
      expect.objectContaining({ cwd: repoPath }),
    );
  });

  it('parses worktree list output', () => {
    mockedSpawnSync.mockReturnValue({
      status: 0,
      stdout: 'worktree /repos/my-project\nHEAD abc123\nbranch refs/heads/main\n\nworktree /tmp/worktrees/wi-1\nHEAD def456\nbranch refs/heads/feature/a\n\n',
      stderr: '',
      pid: 0,
      output: ['', '', ''],
      signal: null,
    });

    const worktrees = manager.list();
    expect(worktrees).toEqual(['/repos/my-project', '/tmp/worktrees/wi-1']);
  });
});
