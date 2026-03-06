---
name: brainstorming
description: Use when starting new features, making design decisions, or when requirements need exploration before implementation
---

# Brainstorming

## Overview

Design before you build. Every time.

**Core principle:** No coding, scaffolding, or implementation until design is presented and approved.

**Announce at start:** "I'm using the brainstorming skill to explore this design before implementation."

## When to Use

- New features or components
- Architecture decisions
- Significant behavior changes
- When requirements are unclear
- Even "simple" projects (to catch unexamined assumptions)

## The Process

### Step 1: Explore Context

- Read existing code, docs, and configuration
- Understand current architecture
- Identify constraints and dependencies

### Step 2: Ask Clarifying Questions

- **One question per message** to avoid overwhelming
- **Multiple choice preferred** when possible
- Understand purpose, constraints, and non-functional requirements

### Step 3: Propose Approaches

- Present 2-3 approaches with trade-offs
- Include a recommendation with reasoning
- Ruthlessly apply YAGNI - remove unnecessary features

### Step 4: Present Design Incrementally

- Show design in digestible sections
- Seek approval at each stage
- Don't dump the entire design at once

### Step 5: Document the Design

Save validated design to `docs/plans/YYYY-MM-DD-<topic>-design.md`

### Step 6: Transition to Planning

After design approval, invoke the **writing-plans** skill to create implementation details.

## Hard Gate

```
NO IMPLEMENTATION BEFORE DESIGN APPROVAL
```

This includes:
- No code files created
- No scaffolding
- No "let me just set up the project structure"
- No "I'll start with the basics while we discuss"

## Red Flags

- Writing code before design approval
- Skipping questions because "it's obvious"
- Presenting one approach without alternatives
- Jumping to implementation details during design
