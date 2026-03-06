# DevTeam - Superpowers Skills Framework

This repository contains a curated set of development skills adapted from the [superpowers](https://github.com/obra/superpowers) framework by Jesse Vincent.

## Skills

The `skills/` directory contains structured development methodologies that enforce discipline, TDD, systematic debugging, and professional best practices into AI coding workflows.

### Core Skills

| Skill | Purpose |
|-------|---------|
| `using-superpowers` | Meta-skill: always invoke relevant skills before responding |
| `test-driven-development` | RED-GREEN-REFACTOR TDD enforcement |
| `systematic-debugging` | 4-phase root cause analysis before fixes |
| `brainstorming` | Interactive design refinement before coding |
| `writing-plans` | Create detailed implementation plans with bite-sized tasks |
| `executing-plans` | Execute plans in batches with review checkpoints |
| `verification-before-completion` | Evidence before claims, always |
| `dispatching-parallel-agents` | Concurrent agent workflows for independent tasks |
| `subagent-driven-development` | Fresh subagent per task with two-stage reviews |
| `requesting-code-review` | Pre-review checklist before submitting work |
| `receiving-code-review` | Technical rigor when integrating feedback |
| `using-git-worktrees` | Isolated workspace setup for feature work |
| `finishing-a-development-branch` | Structured branch completion workflow |
| `writing-skills` | TDD-based methodology for creating new skills |

### Slash Commands

| Command | Purpose |
|---------|---------|
| `/brainstorm` | Interactive design refinement before coding |
| `/write-plan` | Create a detailed implementation plan |
| `/execute-plan` | Execute plan in batches with review checkpoints |

## Conventions

- Plans are saved to `docs/plans/YYYY-MM-DD-<feature-name>.md`
- Skills are in `skills/<skill-name>/SKILL.md`
- Follow TDD: write failing test first, then implement, then refactor
- Verify all claims with fresh evidence before completion
