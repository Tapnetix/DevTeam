---
name: using-git-worktrees
description: Use when starting feature work that needs isolation from current workspace or before executing implementation plans
---

# Using Git Worktrees

## Overview

Git worktrees create isolated workspaces sharing the same repository, allowing work on multiple branches simultaneously without switching.

**Core principle:** Systematic directory selection + safety verification = reliable isolation.

**Announce at start:** "I'm using the using-git-worktrees skill to set up an isolated workspace."

## Directory Selection Process

### 1. Check Existing Directories

```bash
ls -d .worktrees 2>/dev/null     # Preferred (hidden)
ls -d worktrees 2>/dev/null      # Alternative
```

If found, use that directory. If both exist, `.worktrees` wins.

### 2. Check CLAUDE.md

```bash
grep -i "worktree.*director" CLAUDE.md 2>/dev/null
```

If preference specified, use it without asking.

### 3. Ask User

If no directory exists and no CLAUDE.md preference, ask.

## Safety Verification

For project-local directories, verify the directory is in `.gitignore`:

```bash
git check-ignore -q .worktrees 2>/dev/null
```

If NOT ignored: add to `.gitignore`, commit, then proceed.

## Creation Steps

1. **Create worktree** with new branch
2. **Run project setup** (auto-detect: npm install, cargo build, pip install, etc.)
3. **Verify clean baseline** - run tests
4. **Report location** and test results

## Quick Reference

| Situation | Action |
|-----------|--------|
| `.worktrees/` exists | Use it (verify ignored) |
| `worktrees/` exists | Use it (verify ignored) |
| Neither exists | Check CLAUDE.md, then ask user |
| Directory not ignored | Add to .gitignore + commit |
| Tests fail during baseline | Report failures + ask |

## Integration

- **Called by:** brainstorming, subagent-driven-development, executing-plans
- **Pairs with:** finishing-a-development-branch (for cleanup)
