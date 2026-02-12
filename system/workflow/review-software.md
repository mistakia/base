---
title: Review Software
type: workflow
description: Local software review workflow for unstaged changes with compliance checking, bug scanning, performance analysis, and simplification analysis
created_at: '2026-01-13T18:52:17.630Z'
entity_id: cb60c5e8-ab86-4793-90a8-6279c838ce1e
guidelines:
  - sys:system/guideline/review-software.md
  - sys:system/guideline/simplify-software-implementation.md
  - sys:system/guideline/write-software.md
  - sys:system/guideline/write-javascript.md
observations:
  - '[automation] Parallel agent reviews maximize coverage and efficiency'
  - '[quality] High-confidence filtering reduces false positives'
  - '[context] Documentation discovery ensures relevant standards are applied'
prompt_properties:
  - name: task_plan
    type: string
    required: false
    description: Path to task plan file containing worktree path and implementation context
  - name: path
    type: string
    required: false
    description: Direct path to worktree or repository. Used when task_plan is not provided.
  - name: staged
    type: boolean
    required: false
    description: Review staged changes instead of unstaged. Defaults to false.
    default: false
public_read: true
relations:
  - follows [[sys:system/guideline/review-software.md]]
  - follows [[sys:system/guideline/simplify-software-implementation.md]]
  - implements [[sys:system/guideline/write-software.md]]
  - implements [[sys:system/guideline/write-javascript.md]]
updated_at: '2026-02-04T00:00:00.000Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
---

# Review Software

<task>Perform automated software review on unstaged changes with compliance checking, bug scanning, performance analysis, and simplification analysis</task>

<context>This workflow reviews unstaged software changes in a worktree or repository. The target can be specified via a task plan file (which contains the worktree path) or directly as a path. It uses parallel agent analysis to check compliance with CLAUDE.md and guidelines, scan for bugs, analyze performance, and identify simplification opportunities. Only high-confidence issues (score 80+) are reported. This is a local review workflow - no GitHub or pull request integration.</context>

<instructions>

Before starting, read these guidelines:

- [[sys:system/guideline/review-software.md]]
- [[sys:system/guideline/simplify-software-implementation.md]]

## Phase 1: Setup and Discovery

### 1.1 Determine Target Directory

**If `task_plan` is provided:**

1. Read the task plan file
2. Extract the worktree path from the **Working Directory** or **Worktree Path** field
   - Look for patterns like: `**Worktree Path**: /path/to/worktree`
   - Or: `**Working Directory**: /path/to/worktree`
3. Navigate to the extracted worktree directory

**If `path` is provided (no task plan):**

1. Use the provided path directly
2. Navigate to that directory

**Default (neither provided):**

1. Use current working directory

After determining the target directory:

- Verify this is a git repository
- Verify there are changes to review

### 1.2 Identify Changes

Identify files with changes to review:

```bash
# For unstaged changes (default)
git diff --name-only

# For staged changes (if staged parameter is true)
git diff --cached --name-only
```

If no changes found, report "No changes to review" and exit.

### 1.3 Documentation Discovery

Compile relevant documentation files for compliance checking:

1. **Find CLAUDE.md files**:

   - Root CLAUDE.md in the repository
   - CLAUDE.md files in directories containing changed files
   - Parent directory CLAUDE.md files up to repository root

2. **Find relevant guidelines**:

   - Match changed file extensions against guideline globs
   - Include referenced guidelines from CLAUDE.md files

3. **Find relevant specs/docs**:
   - README files in changed directories
   - Schema files if entity types are modified
   - API documentation if endpoints are changed

Document the discovered files for agent reference.

**Checkpoint**: Phase 1 Complete - Changes identified, documentation discovered

## Phase 2: Parallel Agent Analysis

Launch four agents in parallel using the Task tool. Each agent receives:

- List of changed files
- Relevant documentation paths from discovery phase
- The diff content for review

### Agent Summary

| Agent       | Model  | Purpose                                          |
| ----------- | ------ | ------------------------------------------------ |
| Compliance  | haiku  | Check CLAUDE.md and guideline adherence          |
| Bug Scanner | sonnet | Scan for logic errors and security issues        |
| Performance | sonnet | Identify performance bottlenecks and resource leaks |
| Simplicity  | sonnet | Identify complexity and YAGNI violations         |

### 2.1 Compliance Agent

Use Task tool with `model: haiku` and `subagent_type: general-purpose`:

```
Task: Check compliance with project documentation

Read and apply these guidelines:
- [List discovered CLAUDE.md files]
- [[sys:system/guideline/review-software.md]]
- [[sys:system/guideline/write-software.md]]
- [[sys:system/guideline/write-javascript.md]] (for JS/MJS files)

For each changed file, verify:
1. Naming conventions match CLAUDE.md specifications
2. Code patterns follow documented standards
3. Import organization matches guidelines
4. File structure adheres to project conventions

Return findings with:
- file:line reference
- Violation description
- Source documentation reference
- Confidence score (0-100)
```

### 2.2 Bug Scanner Agent

Use Task tool with `model: sonnet` and `subagent_type: general-purpose`:

```
Task: Scan for obvious bugs in changed software

Read the diff and check for:
1. Logic errors in conditionals and loops
2. Null/undefined access without guards
3. Incorrect function signatures or return values
4. Race conditions or state management issues
5. Security vulnerabilities (injection, auth issues)
6. API contract violations

Focus ONLY on modified lines.
Do NOT flag:
- Issues that linters/compilers would catch
- Pre-existing issues in unchanged software
- Style preferences or nitpicks

Return findings with:
- file:line reference
- Bug description
- Impact assessment
- Confidence score (0-100)
```

### 2.3 Performance Agent

Use Task tool with `model: sonnet` and `subagent_type: general-purpose`:

```
Task: Analyze performance of changed software

Read and apply the Performance Analysis section of [[sys:system/guideline/review-software.md]]

For each changed file, check for:
1. Synchronous I/O in async paths (readFileSync, execSync in handlers)
2. Unbounded growth (Maps, arrays, caches without eviction or size limits)
3. Missing timeouts or abort controllers on network/DB/process operations
4. N+1 patterns (repeated queries or file reads inside loops)
5. Unnecessary recomputation (expensive operations without memoization)
6. Resource leaks (unclosed handles, streams, listeners on error paths)
7. Missing pagination (unbounded result sets loaded into memory)
8. Client rendering issues (missing memoization, unstable references, large unvirtualized lists)

Focus ONLY on modified lines.
Do NOT flag:
- Micro-optimizations with negligible impact
- Pre-existing performance issues in unchanged software
- Theoretical scaling concerns without evidence in the code

Return findings with:
- file:line reference
- Performance issue description
- Impact assessment (latency, memory, CPU, or user experience)
- Confidence score (0-100)
```

### 2.4 Simplicity Agent

Use Task tool with `model: sonnet` and `subagent_type: general-purpose`:

```
Task: Review software for simplification opportunities

Read and apply [[sys:system/guideline/simplify-software-implementation.md]]

For each changed file, evaluate:
1. YAGNI violations - speculative or unused code
2. Unnecessary complexity - overly nested logic
3. Redundancy - duplicate patterns that could consolidate
4. Over-abstraction - wrappers/interfaces without clear benefit
5. Dead code - unreachable paths or unused declarations

Return findings with:
- file:line reference
- Simplification opportunity description
- Lines of code that could be removed/simplified
- Confidence score (0-100)
```

**Checkpoint**: Phase 2 Complete - Agent analysis finished

## Phase 3: Confidence Filtering

### 3.1 Collect Agent Results

Gather findings from all four agents into a unified list.

### 3.2 Filter by Confidence

Apply confidence threshold:

- **Keep**: Issues scoring 80 or above
- **Discard**: Issues scoring below 80

### 3.3 Deduplicate

Remove duplicate findings that overlap across agents.

### 3.4 Categorize

Group remaining issues:

- **Critical** (90-100): Must address before commit
- **Important** (80-89): Should address, may defer with justification

**Checkpoint**: Phase 3 Complete - Issues filtered and categorized

## Phase 4: Output

### 4.1 Generate Review Report

Format output following the structure below.

### 4.2 Provide Actionable Guidance

For each issue, include:

- Clear description of the problem
- Why it matters (impact)
- How to fix it (concrete suggestion)
- Source citation (guideline or documentation)

</instructions>

<output_format>

## Software Review Summary

**Task Plan**: [Path to task plan file, or "N/A" if direct path used]
**Worktree**: [Target directory path]
**Target**: [Unstaged changes / Staged changes]
**Files Reviewed**: [Count]
**Documentation Applied**: [List of CLAUDE.md and guideline files used]

---

## Critical Issues (Must Address)

### Issue 1: [Brief title]

- **Location**: `path/to/file.mjs:42`
- **Confidence**: [Score]/100
- **Category**: [Compliance / Bug / Performance / Simplification]
- **Description**: [Clear explanation of the issue]
- **Impact**: [Why this matters]
- **Suggestion**: [How to fix]
- **Source**: [Guideline or documentation reference]

---

## Important Issues (Should Address)

### Issue 1: [Brief title]

- **Location**: `path/to/file.mjs:85`
- **Confidence**: [Score]/100
- **Category**: [Compliance / Bug / Performance / Simplification]
- **Description**: [Clear explanation of the issue]
- **Impact**: [Why this matters]
- **Suggestion**: [How to fix]
- **Source**: [Guideline or documentation reference]

---

## Review Statistics

| Category       | Critical | Important | Total |
| -------------- | -------- | --------- | ----- |
| Compliance     | [N]      | [N]       | [N]   |
| Bugs           | [N]      | [N]       | [N]   |
| Performance    | [N]      | [N]       | [N]   |
| Simplification | [N]      | [N]       | [N]   |
| **Total**      | [N]      | [N]       | [N]   |

---

**Review Complete**: [Timestamp]

---

## Review Complete - Awaiting Confirmation

The above issues have been identified. Before proceeding:

**Do you have any amendments to these findings?**

If no amendments, I will:

1. Gather additional context for each issue to verify it exists and determine the best fix approach
2. Address all identified issues

---

</output_format>
