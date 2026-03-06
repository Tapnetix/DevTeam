---
name: systematic-debugging
description: Use when tests fail, bugs appear, or behavior is unexpected - before attempting any fix
---

# Systematic Debugging

## Overview

Investigate before you fix. Every time.

**Core principle:** NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST. Random fixes waste time and introduce new problems.

## When to Use

- Tests failing
- Unexpected behavior
- Error messages
- Performance issues
- "It works on my machine"

## The Four Phases

### Phase 1: Root Cause Investigation

1. Read error messages carefully and completely
2. Reproduce the issue consistently
3. Review recent changes (git log, git diff)
4. Gather diagnostic evidence across system boundaries
5. Trace data flow backward to find where things go wrong

**Do NOT propose fixes yet.**

### Phase 2: Pattern Analysis

1. Find working examples in the codebase
2. Study reference implementations thoroughly
3. Identify specific differences between working and broken code
4. Understand dependencies and their state

### Phase 3: Hypothesis and Testing

1. Form ONE testable hypothesis
2. Implement minimal change to test it
3. Verify the result
4. If wrong, form new hypothesis

**Never compound multiple fixes.** One change at a time.

### Phase 4: Implementation

1. Write a failing test that reproduces the bug
2. Apply targeted fix addressing root cause
3. Verify fix works without breaking other tests
4. Clean up any diagnostic code

## Red Flags - STOP and Restart Investigation

- Proposing solutions without investigation
- Making multiple simultaneous changes
- Skipping test verification
- More than 3 fix attempts for same issue

## The Three-Fix Rule

If you've attempted 3 fixes for the same issue and none worked:

**STOP.** You don't understand the problem.

- Question architectural fundamentals
- Look for deeper structural issues
- Consider that your mental model is wrong
- Ask your human partner for context

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "I know what's wrong" | Investigate anyway. Assumptions cause bugs. |
| "Quick fix, just change this" | Quick fixes compound. Find root cause. |
| "Let me try this first" | Try investigating first. |
| "It's probably just..." | "Probably" means you don't know. Investigate. |

## Integration with TDD

Bug found → Write failing test → Investigate root cause → Fix → Verify test passes.

The test proves your fix and prevents regression.
