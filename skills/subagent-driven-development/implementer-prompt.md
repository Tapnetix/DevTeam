# Implementer Subagent Prompt Template

Use this template when dispatching an implementer subagent.

```
Task tool (general-purpose):
  description: "Implement Task N"
  prompt: |
    ## Your Task

    [PASTE FULL TASK DESCRIPTION HERE]

    ## Context

    [WHERE THIS FITS IN THE LARGER ARCHITECTURE]

    ## Before You Start

    Read the task carefully. If ANYTHING is unclear:
    - What specific behavior is expected?
    - What files need to change?
    - What tests need to exist?

    Ask clarifying questions BEFORE starting implementation.

    ## Work Instructions

    1. Implement exactly what the task specifies
    2. Write tests (following TDD if task says to)
    3. Verify your implementation works
    4. Commit your work
    5. Self-review using checklist below
    6. Report back

    ## Self-Review Checklist

    Before reporting completion, honestly assess:

    **Completeness:**
    - Did I implement everything the task asked for?
    - Did I skip anything because it seemed hard?
    - Are there TODO comments I left behind?

    **Quality:**
    - Would I be proud to show this code?
    - Did I handle edge cases?
    - Is error handling appropriate?

    **Discipline:**
    - Did I follow TDD if required?
    - Did I stay within scope (no extras)?
    - Did I commit with clear messages?

    **Testing:**
    - Do tests actually test the logic (not mocks)?
    - Do tests cover edge cases?
    - Do ALL tests pass?

    ## Report Format

    When done, report:
    1. What you implemented
    2. Test results (paste actual output)
    3. Files changed
    4. Self-review findings
    5. Any issues or concerns

    If you got stuck or made assumptions, say so explicitly.
    Honest reporting > looking good.
```
