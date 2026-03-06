# Testing Anti-Patterns

**Load this reference when:** writing or changing tests, adding mocks, or tempted to add test-only methods to production code.

## Overview

Tests must verify real behavior, not mock behavior. Mocks are a means to isolate, not the thing being tested.

**Core principle:** Test what the code does, not what the mocks do.

**Following strict TDD prevents these anti-patterns.**

## The Iron Laws

```
1. NEVER test mock behavior
2. NEVER add test-only methods to production classes
3. NEVER mock without understanding dependencies
```

## Anti-Pattern 1: Testing Mock Behavior

**The violation:** Asserting on mock elements (e.g., `getByTestId('sidebar-mock')`) instead of real component behavior.

**The fix:** Test real component or don't mock it. If sidebar must be mocked for isolation, don't assert on the mock - test the parent's behavior with sidebar present.

### Gate Function

```
BEFORE asserting on any mock element:
  Ask: "Am I testing real component behavior or just mock existence?"
  IF testing mock existence: STOP - Delete the assertion or unmock the component
```

## Anti-Pattern 2: Test-Only Methods in Production

**The violation:** Adding methods like `destroy()` to production classes that are only called in tests.

**The fix:** Put cleanup logic in test utilities, not production classes.

### Gate Function

```
BEFORE adding any method to production class:
  Ask: "Is this only used by tests?"
  IF yes: STOP - Put it in test utilities instead
```

## Anti-Pattern 3: Mocking Without Understanding

**The violation:** Over-mocking to "be safe" which breaks actual behavior the test depends on.

**The fix:** Understand dependencies first. Mock at the correct (lowest necessary) level.

### Gate Function

```
BEFORE mocking any method:
  1. Ask: "What side effects does the real method have?"
  2. Ask: "Does this test depend on any of those side effects?"
  3. IF depends on side effects: Mock at lower level, NOT the high-level method
```

## Anti-Pattern 4: Incomplete Mocks

**The violation:** Partial mocks that only include fields you think you need, missing fields downstream code uses.

**The fix:** Mirror real API response completely. Include ALL fields the real response contains.

## Anti-Pattern 5: Integration Tests as Afterthought

**The violation:** Claiming implementation is complete without tests.

**The fix:** TDD cycle: write failing test → implement to pass → refactor → THEN claim complete.

## Quick Reference

| Anti-Pattern | Fix |
|--------------|-----|
| Assert on mock elements | Test real component or unmock it |
| Test-only methods in production | Move to test utilities |
| Mock without understanding | Understand dependencies first, mock minimally |
| Incomplete mocks | Mirror real API completely |
| Tests as afterthought | TDD - tests first |
| Over-complex mocks | Consider integration tests |

## Red Flags

- Assertion checks for `*-mock` test IDs
- Methods only called in test files
- Mock setup is >50% of test
- Test fails when you remove mock
- Can't explain why mock is needed
- Mocking "just to be safe"
