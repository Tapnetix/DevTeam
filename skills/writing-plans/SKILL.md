---
name: writing-plans
description: Use when creating implementation plans for multi-step development tasks after design is approved
---

# Writing Plans

## Overview

Create detailed implementation plans that enable developers unfamiliar with the codebase to execute work systematically.

**Core principle:** DRY. YAGNI. TDD. Frequent commits.

**Announce at start:** "I'm using the writing-plans skill to create a detailed implementation plan."

## When to Use

- After design approval (from brainstorming)
- Multi-step implementation tasks
- Features requiring coordination across files
- Work that will be executed by subagents

## Plan Structure

### Header

- Goal (one sentence)
- Architecture overview
- Tech stack and dependencies

### Tasks (Bite-Sized)

Each task should take 2-5 minutes and follow this pattern:

1. Write failing test
2. Verify test fails
3. Implement minimal code
4. Verify test passes
5. Commit

### Task Requirements

- **One action per step** - no compound tasks
- **Exact file paths** - no "find the relevant file"
- **Complete code examples** - not vague descriptions
- **Expected outputs** - what success looks like
- **Verification steps** - how to confirm it works

## Save Location

Save plan to: `docs/plans/YYYY-MM-DD-<feature-name>.md`

## Execution Handoff

After saving the plan, offer two paths:

1. **Subagent-driven** (same session) - Fresh subagent per task with reviews
2. **Parallel session** (separate session) - Using executing-plans skill

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Vague steps ("update the handler") | Specific steps with exact code |
| Giant tasks (30+ min) | Break into 2-5 min chunks |
| No verification | Every task has verification step |
| Missing file paths | Exact paths for every file touched |
| Skipping test steps | Every task starts with failing test |
