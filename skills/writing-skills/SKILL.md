---
name: writing-skills
description: Use when creating new skills, editing existing skills, or verifying skills work before deployment
---

# Writing Skills

## Overview

**Writing skills IS Test-Driven Development applied to process documentation.**

You write test cases (pressure scenarios with subagents), watch them fail (baseline behavior), write the skill (documentation), watch tests pass (agents comply), and refactor (close loopholes).

**Core principle:** If you didn't watch an agent fail without the skill, you don't know if the skill teaches the right thing.

## What is a Skill?

A skill is a reference guide for proven techniques, patterns, or tools.

**Skills are:** Reusable techniques, patterns, tools, reference guides
**Skills are NOT:** Narratives about how you solved a problem once

## When to Create

**Create when:**
- Technique wasn't intuitively obvious
- You'd reference this again across projects
- Pattern applies broadly (not project-specific)

**Don't create for:**
- One-off solutions
- Standard practices well-documented elsewhere
- Project-specific conventions (put in CLAUDE.md)

## SKILL.md Structure

```markdown
---
name: skill-name-with-hyphens
description: Use when [specific triggering conditions and symptoms]
---

# Skill Name

## Overview
Core principle in 1-2 sentences.

## When to Use
Symptoms and use cases. When NOT to use.

## Core Pattern
Before/after comparison or step-by-step process.

## Quick Reference
Table or bullets for scanning.

## Common Mistakes
What goes wrong + fixes.
```

## The Iron Law

```
NO SKILL WITHOUT A FAILING TEST FIRST
```

Write skill before testing? Delete it. Start over.

## RED-GREEN-REFACTOR for Skills

### RED: Baseline Test
Run pressure scenario WITHOUT the skill. Document what agents do wrong.

### GREEN: Write Minimal Skill
Address those specific failures. Run same scenarios WITH skill.

### REFACTOR: Close Loopholes
Agent found new rationalization? Add explicit counter. Re-test.

## Naming Conventions

- Use letters, numbers, and hyphens only
- Active voice, verb-first: `creating-skills` not `skill-creation`
- Gerunds work well: `testing-skills`, `debugging-with-logs`

## Description Rules

- Start with "Use when..."
- Describe triggering conditions, NOT what the skill does
- Never summarize the skill's workflow in the description
- Keep under 500 characters
