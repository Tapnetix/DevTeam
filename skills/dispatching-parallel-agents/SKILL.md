---
name: dispatching-parallel-agents
description: Use when facing 2+ independent tasks that can be worked on without shared state or sequential dependencies
---

# Dispatching Parallel Agents

## Overview

When you have multiple unrelated failures or tasks, investigating them sequentially wastes time. Each investigation is independent and can happen in parallel.

**Core principle:** Dispatch one agent per independent problem domain. Let them work concurrently.

## When to Use

- 3+ test files failing with different root causes
- Multiple subsystems broken independently
- Each problem can be understood without context from others
- No shared state between investigations

## When NOT to Use

- Failures are related (fix one might fix others)
- Need to understand full system state
- Agents would interfere with each other (editing same files)
- Exploratory debugging (you don't know what's broken yet)

## The Pattern

### 1. Identify Independent Domains

Group failures by what's broken. Each domain should be independent - fixing one doesn't affect the others.

### 2. Create Focused Agent Tasks

Each agent gets:
- **Specific scope:** One test file or subsystem
- **Clear goal:** Make these tests pass
- **Constraints:** Don't change other code
- **Expected output:** Summary of what you found and fixed

### 3. Dispatch in Parallel

Launch all agents concurrently.

### 4. Review and Integrate

When agents return:
- Read each summary
- Verify fixes don't conflict
- Run full test suite
- Integrate all changes

## Good Agent Prompts

1. **Focused** - One clear problem domain
2. **Self-contained** - All context needed to understand the problem
3. **Specific about output** - What should the agent return?

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Too broad scope | One file/subsystem per agent |
| No context in prompt | Paste error messages and test names |
| No constraints | Specify what NOT to change |
| Vague output request | "Return summary of root cause and changes" |
