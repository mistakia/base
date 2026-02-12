---
title: Review Codebase
type: workflow
description: >-
  Orchestrate a multi-context-window codebase review by decomposing the codebase into sections,
  creating task entities for tracking and findings, and triggering the first section review
created_at: '2026-02-03T00:00:00.000Z'
entity_id: a1b2c3d4-5678-4abc-9def-012345678901
public_read: true
guidelines:
  - sys:system/guideline/review-software.md
  - sys:system/guideline/simplify-software-implementation.md
  - sys:system/guideline/review-for-secret-information.md
observations:
  - '[architecture] Multi-context-window design works around token limits by reviewing one section per session'
  - '[pattern] Review task entity serves as shared state across context windows'
  - '[automation] Detached nohup claude triggers enable fully autonomous continuation without blocking the parent session'
  - '[entity] Review output stored as task entities in user-base rather than files in the target repo'
prompt_properties:
  - name: path
    type: string
    required: true
    description: Path to the codebase directory to review
  - name: scope
    type: string
    required: false
    description: >-
      Glob patterns or directory paths to limit review scope (comma-separated).
      Defaults to full codebase review.
  - name: project
    type: string
    required: false
    description: >-
      Project subdirectory name for task entity placement (e.g., "base", "league").
      Defaults to the repository directory name.
relations:
  - follows [[sys:system/guideline/review-software.md]]
  - follows [[sys:system/guideline/simplify-software-implementation.md]]
  - follows [[sys:system/guideline/review-for-secret-information.md]]
  - calls [[sys:system/workflow/continue-review-codebase.md]]
  - follows [[sys:system/guideline/write-workflow.md]]
updated_at: '2026-02-04T00:00:00.000Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
---

<task>Analyze a codebase directory structure, decompose it into reviewable sections, create task entities for review tracking and findings, then trigger the first section review</task>

<context>This workflow is the entry point for full or partial codebase reviews. It works around context window limitations by breaking the codebase into logical sections that are each reviewed in their own context window. Two task entities are created: a review task that defines sections and tracks progress, and a findings task that accumulates issues. Both entities live in the user-base task directory (not in the target repository). After setup, this workflow triggers the first section review and archives itself.</context>

<instructions>

## Phase 1: Setup

### 1.1 Validate Target Directory

1. Navigate to the `path` directory
2. Verify it is a git repository
3. If `scope` is provided, validate the glob patterns or directories exist
4. Determine `project` name:
   - Use the provided value, or default to the repository directory name (e.g., `base` for `/path/to/base`)
5. Generate a date slug for entity naming: `YYYY-MM-DD` format using today's date

### 1.2 Discover Review Guidelines

Read these guidelines to understand review standards:

- [[sys:system/guideline/review-software.md]]
- [[sys:system/guideline/simplify-software-implementation.md]]
- [[sys:system/guideline/review-for-secret-information.md]]

Also discover project-specific documentation:

1. Find all CLAUDE.md files in the repository
2. Identify any additional guidelines referenced by CLAUDE.md
3. Record the full list of documentation paths for agent reference

### 1.3 Search for Related Task Context

**Tip**: Search for related `task` files in the user-base (`task/` directory) that reference this codebase or project. Task files often contain implementation plans, design decisions, and context that can resolve ambiguities about why code is structured a certain way. When a reviewer encounters unclear patterns or questionable decisions, checking related tasks can prevent false positives.

```bash
# Example: find tasks related to a project
grep -rl "project-name\|repository-name" "$USER_BASE_DIRECTORY/task/"
```

Record any relevant task file paths for inclusion in the review entity.

## Phase 2: Directory Analysis and Section Decomposition

### 2.1 Analyze Directory Structure

1. Map the full directory tree (excluding common non-code directories: `node_modules`, `.git`, `dist`, `build`, `vendor`, etc.)
2. Count files and approximate line counts per directory
3. Identify the separation of concerns boundaries (e.g., server routes, entity system, client components, tools, tests)

### 2.2 Define Sections

Apply the section decomposition strategy:

- **Directory-based grouping** aligned with separation of concerns
- **Size-aware splitting**: target roughly 2,000-4,000 lines per section
- **Large directories subdivided**: split into logical sub-sections
- **Small related directories combined**: merge into a single section
- **Dependency ordering**: foundational modules first, dependent modules later

If `scope` is provided, only include directories and files matching the scope patterns.

For each section, define:

- Section name (descriptive, based on purpose)
- Directory paths included
- File count
- Approximate line count
- Focus areas (what to pay attention to during review)
- Relevant documentation paths (CLAUDE.md files, guidelines specific to this section)

## Phase 3: Create Task Entities

### 3.1 Create Review Task Entity

Use the `mcp__base__entity_create` tool to create the review task entity:

- **Base URI**: `user:task/<project>/codebase-review-<date-slug>.md`
- **Title**: `Codebase Review: <project> (<date-slug>)`
- **Type**: `task`
- **Status**: `In Progress`
- **Description**: `Codebase review for <path>. Defines section decomposition and tracks review progress.`

The entity body should contain:

```markdown
# Codebase Review

**Target**: <path>
**Scope**: <scope or "Full codebase">
**Generated**: <ISO 8601 timestamp>
**Findings**: user:task/<project>/codebase-review-findings-<date-slug>.md

## Documentation

- <list of all discovered CLAUDE.md files and guidelines>

## Related Tasks

- <list of related task file paths, or "None found">

## Sections

- [ ] **Section 1: <name>** -- <directory paths> -- ~<line count> lines -- <file count> files
  - Focus: <focus areas>
  - Docs: <relevant documentation for this section>
- [ ] **Section 2: <name>** -- <directory paths> -- ~<line count> lines -- <file count> files
  - Focus: <focus areas>
  - Docs: <relevant documentation for this section>
    ...
```

Record the absolute file path of the created review entity for use in Phase 4.

### 3.2 Create Findings Task Entity

Use the `mcp__base__entity_create` tool to create the findings task entity:

- **Base URI**: `user:task/<project>/codebase-review-findings-<date-slug>.md`
- **Title**: `Codebase Review Findings: <project> (<date-slug>)`
- **Type**: `task`
- **Status**: `In Progress`
- **Description**: `Accumulated review findings for <path>. Issues organized by section with confidence scoring.`

The entity body should contain:

```markdown
# Codebase Review Findings

**Target**: <path>
**Scope**: <scope or "Full codebase">
**Started**: <ISO 8601 timestamp>
**Review**: user:task/<project>/codebase-review-<date-slug>.md

---
```

## Phase 4: Trigger and Exit

### 4.1 Archive Session

Run `/archive` to archive the current session thread.

### 4.2 Trigger First Section Review

Execute the continuation command to start reviewing the first section. The command runs `claude` directly (not via `docker exec`) since this workflow is already running inside the container. Use `nohup` with background execution so the current session can exit without waiting for the child to complete.

Pass the absolute file path of the review entity (not the base URI):

```bash
nohup claude --print --dangerously-skip-permissions \
  "Run workflow [[sys:system/workflow/continue-review-codebase.md]] with review: <absolute path to review entity file>" \
  > /tmp/review-codebase-section-1.log 2>&1 &
```

</instructions>

<output_format>

**Codebase Review Initiated**

**Target**: [path]
**Scope**: [scope or "Full codebase"]
**Project**: [project name]
**Sections**: [count] sections defined
**Estimated Lines**: [total line count across all sections]

**Task Entities Created**:

- Review: [review entity base URI] ([absolute file path])
- Findings: [findings entity base URI] ([absolute file path])

**Documentation Discovered**:

- [List of CLAUDE.md files and guidelines]

**Related Tasks**:

- [List of related task files, or "None found"]

**Next**: Triggering first section review.

</output_format>
