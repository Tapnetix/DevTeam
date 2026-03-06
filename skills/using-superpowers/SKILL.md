---
name: using-superpowers
description: Use when any skill might apply to the current task - this is the meta-skill that ensures other skills are invoked
---

# Using Superpowers

## Overview

**Always invoke relevant skills BEFORE any response or action.** This is not negotiable. This is not optional.

**Core principle:** If there's even a 1% chance a skill applies, invoke it first.

## Decision Flow

```dot
digraph skill_check {
    rankdir=TB;
    msg [label="User message received", shape=box];
    check [label="Any skill might apply?", shape=diamond];
    invoke [label="Invoke Skill tool\nAnnounce which & why", shape=box, style=filled, fillcolor="#ccffcc"];
    follow [label="Follow skill exactly", shape=box];
    respond [label="Respond normally", shape=box];

    msg -> check;
    check -> invoke [label="yes (even 1%)"];
    invoke -> follow;
    check -> respond [label="no skill relevant"];
}
```

## Red Flags (Rationalization Patterns)

If you're thinking any of these, STOP and invoke the skill:

- "This is just a simple question"
- "I need more context first"
- "I can check files quickly"
- "The skill doesn't exactly match"
- "I'll use the skill after this step"

All of these are false reasoning that should trigger skill invocation instead.

## Skill Priority

When multiple skills apply:
1. **Process skills first** (brainstorming, debugging) determine *approach*
2. **Implementation skills second** guide *execution*

## Skill Types

**Rigid skills** (like TDD) require exact adherence.
**Flexible skills** (like patterns) allow contextual adaptation.
The skill itself indicates which applies.
