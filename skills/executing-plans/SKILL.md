---
name: executing-plans
description: Use when a written implementation plan exists and is ready for execution
---

# Executing Plans

## Overview

Execute implementation plans through batched tasks with review checkpoints.

**Core principle:** Don't skip verifications. Stop when blocked, don't guess.

**Announce at start:** "I'm using the executing-plans skill to implement this plan."

## When to Use

- Written plan exists (from writing-plans skill)
- Ready to implement (design approved)

## The Process

### Step 1: Load and Review

- Read the plan critically
- Raise concerns BEFORE starting
- Verify prerequisites are met

### Step 2: Execute Batch

Work through tasks in batches (default: first 3):

1. Execute each task in sequence
2. Follow TDD for each (test first, verify fail, implement, verify pass)
3. Commit after each task
4. Verify all tests still pass

### Step 3: Report

Present completed work:
- What was done
- Any deviations from plan
- "Ready for feedback"

**Wait for feedback before continuing.**

### Step 4: Continue

Iterate through remaining batches based on feedback.

### Step 5: Complete

Use **finishing-a-development-branch** skill to wrap up.

## Critical Rules

- **Never start on main/master** without explicit consent
- **Stop immediately** when encountering blockers
- **Don't skip verifications** - every task verified before next
- **Stop when blocked** - don't guess, ask for help
- **Report between batches** - wait for feedback

## Integration

- **Requires:** using-git-worktrees (for isolated workspace)
- **Ends with:** finishing-a-development-branch (for cleanup)
