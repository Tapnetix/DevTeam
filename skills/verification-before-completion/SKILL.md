---
name: verification-before-completion
description: Use before any completion claim, commit, push, or PR - ensures evidence exists for all claims
---

# Verification Before Completion

## Overview

Evidence before claims, always.

**Core principle:** NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE.

## When to Apply

Before:
- Claiming work is done
- Committing code
- Creating pull requests
- Pushing to remote
- Reporting task completion

## The Verification Process

1. **Identify** the command that proves your claim
2. **Execute** the full command (fresh execution required)
3. **Read** complete output and check exit codes
4. **Verify** the output confirms the claim
5. **Only then** make the claim with supporting evidence

## Forbidden Patterns

- Making claims with "should", "probably", "seems to"
- Expressing satisfaction before verification
- Proceeding toward commits without fresh verification
- Accepting agent success reports without independent verification
- Relying on memory of previous test runs

## Red Flags

If you catch yourself thinking:
- "I'm pretty sure the tests pass"
- "It should work because..."
- "I tested this earlier"
- "This is a minor change, no need to verify"

**STOP. Run the verification command. Read the output. Then claim.**

## The Rule

```
CLAIM → requires → EVIDENCE (fresh, complete, verified)
No evidence → no claim
```

No exceptions for fatigue, confidence, or partial checks.
