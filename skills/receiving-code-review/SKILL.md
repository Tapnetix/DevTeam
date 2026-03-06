---
name: receiving-code-review
description: Use when processing code review feedback - ensures technical rigor over performative agreement
---

# Receiving Code Review

## Overview

Verify before implementing. Ask before assuming. Technical correctness over social comfort.

## The Process

1. **Read** feedback completely
2. **Restate** requirements in your own words
3. **Check** against actual codebase conditions
4. **Evaluate** technical soundness for your specific context
5. **Respond** with technical acknowledgment or reasoned objection
6. **Implement** one item at a time with testing

## Forbidden Responses

- "You're absolutely right!"
- "Great point!"
- "Thanks for catching that!"

Instead: Restate the technical requirement, or proceed directly to implementation.

## Handling Unclear Feedback

Stop and request clarification before proceeding. Items may be related. Partial understanding = wrong implementation.

## When to Push Back

- Suggestion would break existing functionality
- Reviewer lacks full context
- Suggestion violates YAGNI
- Contradicts documented architectural decisions

Pushback must be technical, not defensive.

## Acknowledgment Pattern

When feedback is correct: "Fixed. [Brief description]"

Actions speak. Just fix it.
