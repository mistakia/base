---
title: Continue Review Codebase
type: workflow
description: >-
  Recursive continuation workflow that reviews one codebase section per context window, appends
  findings, and triggers the next iteration or finalizes the review
base_uri: sys:system/workflow/continue-review-codebase.md
created_at: '2026-02-03T00:00:00.000Z'
entity_id: b2c3d4e5-6789-4bcd-aef0-123456789012
guidelines:
  - sys:system/guideline/review-software.md
  - sys:system/guideline/simplify-software-implementation.md
  - sys:system/guideline/review-for-secret-information.md
observations:
  - >-
    [pattern] Each context window is self-contained: reads state from review entity, reviews one
    section, persists results
  - >-
    [automation] Detached nohup claude calls chain context windows until all sections are reviewed
    without blocking the parent session
  - '[quality] Four parallel agents maximize coverage while confidence filtering reduces noise'
  - '[entity] Review and findings are task entities in the user-base, not files in the target repo'
  - >-
    [fix] Slash commands like /archive are unavailable in --print mode -- removed from continuation
    workflow
  - '[fix] Tool references corrected from Task tool to Agent tool'
prompt_properties:
  - name: review
    type: string
    required: true
    description: Absolute file path to the review task entity created by review-codebase workflow
public_read: true
relations:
  - follows [[sys:system/guideline/review-software.md]]
  - follows [[sys:system/guideline/simplify-software-implementation.md]]
  - follows [[sys:system/guideline/review-for-secret-information.md]]
  - supports [[sys:system/workflow/review-codebase.md]]
  - follows [[sys:system/guideline/write-workflow.md]]
updated_at: '2026-03-06T16:16:11.764Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
---

<task>Review the next unchecked section from the review entity using parallel agents, append findings, and trigger the next iteration or finalize</task>

<context>This workflow runs once per codebase section. It reads the review task entity to identify the next unchecked section, reviews all files in that section using four parallel agents (compliance, bug scanner, performance, simplicity), filters and deduplicates findings, appends them to the findings task entity, marks the section complete in the review entity, and either triggers the next iteration or writes a final summary. Each invocation is a self-contained context window that reads its state from disk and persists results before exiting.</context>

<instructions>

Before starting, read these guidelines:

- [[sys:system/guideline/review-software.md]]
- [[sys:system/guideline/simplify-software-implementation.md]]
- [[sys:system/guideline/review-for-secret-information.md]]

## Phase 1: Read State

### 1.1 Load Review Entity

1. Read the review entity file at the provided `review` path
2. Extract:
   - **Target**: the codebase path being reviewed
   - **Findings path**: the findings entity file path (resolve the base URI from the **Findings** field to an absolute file path; it will be in the same `task/<project>/` directory as the review entity)
   - **Documentation list**: CLAUDE.md files and guidelines discovered during setup
   - **Related tasks**: task file paths listed in the review entity
   - **Sections list**: all sections with their completion status

### 1.2 Identify Next Section

1. Find the first unchecked section (line starting with `- [ ]`)
2. Extract its name, directory paths, file count, focus areas, and relevant documentation
3. If no unchecked sections remain, skip to Phase 5 (Final Summary)

### 1.3 Resolve Ambiguities with Task Context

**Tip**: If the review entity lists related task files, read them before starting the section review. Task files contain implementation plans, design decisions, and rationale that explain why code is structured a certain way. When reviewing code that seems unusual or questionable, check related tasks first -- this prevents false positives from flagging intentional design decisions as bugs.

Additionally, when any ambiguity arises during the review about purpose or intent of code patterns, search for related `task` files:

```bash
grep -rl "keyword\|module-name" "$USER_BASE_DIRECTORY/task/"
```

## Phase 2: Read Section Files

### 2.1 Gather File Contents

1. Navigate to the target codebase directory
2. Read all files within the section's directory scope
3. Also read the relevant documentation files listed for this section

### 2.2 Prepare Agent Context

Compile for each agent:

- The full file contents for the section
- The list of documentation and guidelines to apply
- The section's focus areas

## Phase 3: Parallel Agent Analysis

Launch four agents in parallel using the Agent tool. Each agent receives the section file contents, documentation paths, and focus areas.

| Agent       | Model  | Purpose                                             |
| ----------- | ------ | --------------------------------------------------- |
| Compliance  | haiku  | Check CLAUDE.md and guideline adherence             |
| Bug Scanner | sonnet | Scan for logic errors and security issues           |
| Performance | sonnet | Identify performance bottlenecks and resource leaks |
| Simplicity  | sonnet | Identify complexity and YAGNI violations            |

### 3.1 Compliance Agent

Use Agent tool with `model: haiku` and `subagent_type: general-purpose`:

```
Task: Check compliance with project documentation for section "<section name>"

Read and apply these guidelines:
- [List discovered CLAUDE.md files and section-specific docs]
- [[sys:system/guideline/review-software.md]]
- [[sys:system/guideline/review-for-secret-information.md]]

For each file in the section, verify:
1. Naming conventions match CLAUDE.md specifications
2. Code patterns follow documented standards
3. Import organization matches guidelines
4. File structure adheres to project conventions
5. No secrets, credentials, or API keys are present in code

Focus areas for this section: [section focus areas]

Return findings as a list. Each finding must include:
- file:line reference
- Violation description
- Source documentation reference
- Confidence score (0-100)
```

### 3.2 Bug Scanner Agent

Use Agent tool with `model: sonnet` and `subagent_type: general-purpose`:

```
Task: Scan for bugs in section "<section name>"

Read all files in the section and check for:
1. Logic errors in conditionals and loops
2. Null/undefined access without guards
3. Incorrect function signatures or return values
4. Race conditions or state management issues
5. Security vulnerabilities (injection, auth issues)
6. API contract violations

Focus areas for this section: [section focus areas]

Do NOT flag:
- Issues that linters/compilers would catch
- Style preferences or nitpicks

Return findings as a list. Each finding must include:
- file:line reference
- Bug description
- Impact assessment
- Confidence score (0-100)
```

### 3.3 Performance Agent

Use Agent tool with `model: sonnet` and `subagent_type: general-purpose`:

```
Task: Analyze performance of section "<section name>"

Read and apply the Performance Analysis section of [[sys:system/guideline/review-software.md]]

For each file in the section, check for:
1. Synchronous I/O in async paths (readFileSync, execSync in handlers)
2. Unbounded growth (Maps, arrays, caches without eviction or size limits)
3. Missing timeouts or abort controllers on network/DB/process operations
4. N+1 patterns (repeated queries or file reads inside loops)
5. Unnecessary recomputation (expensive operations without memoization)
6. Resource leaks (unclosed handles, streams, listeners on error paths)
7. Missing pagination (unbounded result sets loaded into memory)
8. Client rendering issues (missing memoization, unstable references, large unvirtualized lists)

Focus areas for this section: [section focus areas]

Do NOT flag:
- Micro-optimizations with negligible impact
- Theoretical scaling concerns without evidence in the code

Return findings as a list. Each finding must include:
- file:line reference
- Performance issue description
- Impact assessment (latency, memory, CPU, or user experience)
- Confidence score (0-100)
```

### 3.4 Simplicity Agent

Use Agent tool with `model: sonnet` and `subagent_type: general-purpose`:

```
Task: Review section "<section name>" for simplification opportunities

Read and apply [[sys:system/guideline/simplify-software-implementation.md]]

For each file in the section, evaluate:
1. YAGNI violations - speculative or unused code
2. Unnecessary complexity - overly nested logic
3. Redundancy - duplicate patterns that could consolidate
4. Over-abstraction - wrappers/interfaces without clear benefit
5. Dead code - unreachable paths or unused declarations

Focus areas for this section: [section focus areas]

Return findings as a list. Each finding must include:
- file:line reference
- Simplification opportunity description
- Lines of code that could be removed/simplified
- Confidence score (0-100)
```

## Phase 4: Filter, Deduplicate, and Append

### 4.1 Collect Agent Results

Gather findings from all four agents into a unified list.

### 4.2 Filter by Confidence

- **Keep**: Issues scoring 80 or above
- **Discard**: Issues scoring below 80

### 4.3 Deduplicate

Remove findings that reference the same file:line and describe the same issue across agents. When duplicates exist, keep the finding with the higher confidence score.

### 4.4 Categorize

Group remaining issues:

- **Critical** (90-100): Must address
- **Important** (80-89): Should address, may defer with justification

### 4.5 Append to Findings Entity

Read the findings task entity file, then append the following block to the entity body:

```markdown
## Section: <section name>

**Reviewed**: <ISO 8601 timestamp>
**Files**: <file count>
**Issues Found**: <count>

### Critical Issues

- [ ] **[title]** (`file:line`) [confidence] -- [description] -- Source: [guideline reference]

### Important Issues

- [ ] **[title]** (`file:line`) [confidence] -- [description] -- Source: [guideline reference]

---
```

If no issues found for a category, write "None" under that heading.

### 4.6 Update Review Entity

Read the review task entity file, then mark the section complete by changing its checkbox and appending metadata:

```
- [x] **Section N: <name>** -- <paths> -- ~<lines> lines -- <files> files -- <issue count> issues -- <date>
```

## Phase 5: Continue or Finalize

### 5.1 Check for Remaining Sections

Re-read the review entity to check if unchecked sections remain.

### 5.2 If More Sections Remain

1. Trigger the next section review. Run `claude` directly (this workflow already runs inside the container). Use `nohup` with background execution so the current session can exit without waiting. Unset `CLAUDECODE` to allow the nested session to launch.

```bash
nohup env -u CLAUDECODE claude --print --dangerously-skip-permissions \
  "Run workflow [[sys:system/workflow/continue-review-codebase.md]] with review: <review entity file path>" \
  > /tmp/review-<project>-<date-slug>-section-<N>.log 2>&1 &
```

Where `<project>` and `<date-slug>` are extracted from the review entity filename (e.g., `codebase-review-2026-03-06.md` in `task/league/` yields `league` and `2026-03-06`), and `<N>` is the next section number. This prevents log file collisions when multiple codebase reviews run concurrently.

### 5.3 If All Sections Complete (Final Summary)

Append the final summary to the findings task entity:

```markdown
## Final Summary

**Completed**: <ISO 8601 timestamp>
**Sections Reviewed**: <count>
**Total Files Reviewed**: <count>

### Aggregate Statistics

| Category       | Critical | Important | Total |
| -------------- | -------- | --------- | ----- |
| Compliance     | [N]      | [N]       | [N]   |
| Bugs           | [N]      | [N]       | [N]   |
| Performance    | [N]      | [N]       | [N]   |
| Simplification | [N]      | [N]       | [N]   |
| Secrets        | [N]      | [N]       | [N]   |
| **Total**      | [N]      | [N]       | [N]   |

### Cross-Cutting Concerns

[Issues or patterns that appear across multiple sections]

### Recommendations

[Prioritized list of recommended actions based on findings]
```

Update the review task entity status to `Completed` in the YAML frontmatter.
Update the findings task entity status to `Completed` in the YAML frontmatter.

</instructions>

<output_format>

**Section Review Complete**: [section name]

**Files Reviewed**: [count]
**Issues Found**: [critical count] critical, [important count] important
**Findings Appended**: [findings entity path]
**Review Updated**: [review entity path]

**Progress**: [completed sections] / [total sections] sections complete

**Next**: [Triggering next section review / Review complete - final summary appended]

</output_format>
