---
name: requesting-code-review
description: Use after completing significant code sections or before merging to main branch
---

# Requesting Code Review

## Overview

Request structured code reviews at key milestones to catch issues early.

## When to Request

**Required:**
- After each task in subagent-driven development
- Before merge to main

**Optional:**
- When stuck on implementation approach
- Before significant refactoring

## The Process

1. Obtain git commit hashes for the work to review
2. Dispatch code-reviewer subagent with:
   - Implementation details
   - Requirements/spec
   - Commit range
3. Handle feedback by severity

## Handling Feedback

| Severity | Action |
|----------|--------|
| Critical | Fix immediately before proceeding |
| Important | Resolve before merge |
| Minor/Suggestions | May defer with justification |

## Pushback

You may respectfully challenge feedback when you have technical evidence. Pushback should be technical, not defensive.

## Integration

- In **subagent-driven development:** review after each task
- In **executing-plans:** review after task batches (~3 tasks)
- In **ad-hoc development:** review before merge or when blocked

## Red Flags

- Skipping review because "it's simple"
- Ignoring critical findings
- Proceeding with unresolved important issues
