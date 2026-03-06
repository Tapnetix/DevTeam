# Skill Authoring Best Practices

## Core Principles

**Conciseness matters.** The context window is a public good shared with system prompts, conversation history, and other Skills. While metadata loads upfront, SKILL.md tokens compete directly with conversation context once loaded.

Claude already knows a lot. Each addition should justify its token cost. Ask: Does Claude genuinely need this explanation?

**Degrees of freedom** should match task fragility:
- **High freedom** (text instructions): Multiple valid approaches exist
- **Medium freedom** (pseudocode): Preferred patterns with acceptable variation
- **Low freedom** (specific scripts): Error-prone operations requiring exact sequences

Test Skills across all intended models—what works for Opus may need clarity adjustments for Haiku.

## Skill Structure

### Naming and Descriptions

Use **gerund form** (verb + -ing): "Processing PDFs," "Analyzing spreadsheets." Descriptions must be written in **third person** to avoid discovery problems when injected into system prompts.

Effective descriptions specify both functionality and triggering contexts: "Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDFs or when the user mentions forms or document extraction."

Avoid vague descriptions like "Helps with documents" or "Processes data."

### Progressive Disclosure

SKILL.md functions as a table of contents directing Claude to detailed materials only when relevant. Structure longer reference files with table of contents; reference files should link one level deep from SKILL.md to prevent Claude from partially reading nested references.

**Pattern 1**: High-level guide with references (SKILL.md points to advanced.md, reference.md, examples.md)

**Pattern 2**: Domain-specific organization (separate finance.md, sales.md, product.md files)

**Pattern 3**: Conditional details (show basics, link to advanced content via expandable sections)

## Workflows and Feedback Loops

### Complex Task Workflows

Break operations into sequential steps with optional checklists Claude can copy and track. This applies equally to non-code skills (research synthesis) and code-based skills (PDF form filling).

**Validation loops** greatly improve quality: Run validator → fix errors → repeat. Examples include style guide compliance checking or document editing with immediate validation.

### Iterative Development with Claude

Most effective approach involves two Claude instances:
1. **Claude A** (expert): Creates and refines the Skill based on your domain knowledge
2. **Claude B** (agent): Tests the Skill on real tasks, revealing gaps

Develop by:
1. Completing tasks without Skills to identify reusable patterns
2. Requesting Claude A create a Skill capturing those patterns
3. Testing with Claude B on similar use cases
4. Observing Claude B's behavior and refining with Claude A
5. Repeating based on real-world usage

## Content Guidelines

### Avoid Time-Sensitive Information

Don't include information with expiration dates. Instead, use "old patterns" sections with expandable details for deprecated approaches.

### Consistent Terminology

Choose single terms and use consistently throughout. Inconsistency (mixing "API endpoint," "URL," "API route," "path") confuses Claude.

### Common Patterns

**Template pattern**: Provide output format templates matching strictness requirements (strict for APIs/data formats; flexible for adaptable analyses).

**Examples pattern**: Provide input/output pairs showing desired style and detail level.

**Conditional workflow pattern**: Guide through decision points directing Claude to different workflows based on task type.

## Anti-Patterns to Avoid

- **Windows-style paths**: Always use forward slashes (`scripts/helper.py`, not `scripts\helper.py`)
- **Too many options**: Provide defaults with escape hatches rather than overwhelming choices
- **Deeply nested references**: Keep references one level deep from SKILL.md
- **Time-sensitive content**: Use "old patterns" sections instead

## Advanced: Executable Code

### Solve, Don't Punt

Handle error conditions in scripts rather than leaving problems for Claude. Justify configuration parameters—magic numbers without documentation create confusion.

### Utility Scripts

Pre-made scripts offer advantages: greater reliability than generated code, token savings, consistent execution. Make clear whether Claude should **execute** the script (most common) or **read it as reference** (for complex logic).

### Verifiable Intermediate Outputs

For complex operations like batch updates, use "plan-validate-execute" pattern: Claude creates a structured plan file, a script validates it, then execution proceeds. This catches errors early.

### Runtime Environment

Skills run in a filesystem-accessible environment where:
- Metadata pre-loads at startup
- Files load on-demand via bash reads
- Scripts execute without loading full contents
- No context penalty for large unaccessed files

Structure directories descriptively using forward slashes. Claude navigates like a filesystem—organized, named directories enable discovery.

### MCP Tool References

Use fully qualified names: `ServerName:tool_name` (e.g., `BigQuery:bigquery_schema`).

## Evaluation and Iteration

### Build Evaluations First

Create evaluations **before** extensive documentation. Establish baseline performance without Skills, write minimal instructions addressing actual gaps, then iterate.

Evaluation structure includes queries, expected files, and specific behaviors to verify.

### Build Iteratively with Claude

The process of working with Claude A to create Skills (who then test with Claude B) leverages both model expertise and domain knowledge, refining based on observed behavior rather than assumptions.

## Technical Requirements

- YAML frontmatter: `name` (64 chars max), `description` (1024 chars max)
- SKILL.md body: Keep under 500 lines
- Required packages: List explicitly and verify availability
- File structure: Organize by domain/feature with descriptive names

## Quality Checklist

**Core quality**: Specific descriptions, under 500 lines, appropriate progressive disclosure, consistent terminology, concrete examples, single-level references

**Code and scripts**: Explicit error handling, justified constants, listed packages, documentation, forward-slash paths, validation steps

**Testing**: Three evaluations minimum, tested across Haiku/Sonnet/Opus, real usage scenarios, team feedback incorporated
