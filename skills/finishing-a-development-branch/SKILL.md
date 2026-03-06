---
name: finishing-a-development-branch
description: Use when development work on a branch is complete and ready for merge, PR, or cleanup
---

# Finishing a Development Branch

## Overview

Structured verification → options → execution → cleanup for completing branch work.

## The Process

### Step 1: Verify Tests Pass

Run the full test suite. If tests fail, stop and fix them.

### Step 2: Determine Base Branch

Identify whether the branch splits from main or master.

### Step 3: Present Options

Offer exactly these choices:
1. **Merge** back to base branch locally
2. **Push and create PR**
3. **Keep branch** as-is for later
4. **Discard** this work

### Step 4: Execute and Cleanup

Handle the chosen option, then clean up worktree (except for option 3).

## Critical Rules

- Always verify tests before offering options
- Never merge with failing tests
- Re-verify after merge on the merged result
- Require typed "discard" confirmation for option 4
- Only clean up worktrees for options 1 and 4

## Integration

- **Called by:** subagent-driven-development, executing-plans
- **Pairs with:** using-git-worktrees (for cleanup)
