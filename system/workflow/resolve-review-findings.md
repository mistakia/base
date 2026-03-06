---
title: Resolve Review Findings
type: workflow
description: >-
  Work through codebase review findings by grouping issues by proximity, applying fixes in a worktree,
  running tests after batches, and marking findings resolved. Supports chaining across context windows
  for large finding sets.
base_uri: sys:system/workflow/resolve-review-findings.md
created_at: '2026-03-06T00:00:00.000Z'
entity_id: c3d4e5f6-7890-4cde-bf01-234567890123
guidelines:
  - sys:system/guideline/review-software.md
  - sys:system/guideline/simplify-software-implementation.md
  - sys:system/guideline/write-software.md
  - sys:system/guideline/write-javascript.md
observations:
  - '[pattern] Findings entity checkboxes serve as shared progress state across context windows'
  - '[design] File proximity grouping minimizes context switching and enables related fixes together'
  - '[automation] Chaining via nohup claude enables autonomous resolution of large finding sets'
prompt_properties:
  - name: findings
    type: string
    required: true
    description: Absolute file path to the findings task entity created by review-codebase workflow
  - name: batch-size
    type: number
    required: false
    description: >-
      Maximum number of findings to resolve per context window. Defaults to 20. Reduce for complex
      codebases or increase for simple fixes.
    default: 20
  - name: test-command
    type: string
    required: false
    description: >-
      Command to run tests after each batch. Defaults to auto-detection from package.json or Makefile.
  - name: skip-worktree
    type: boolean
    required: false
    description: >-
      If true, apply fixes directly on the current branch instead of creating a worktree. Useful when
      already working in a worktree.
    default: false
public_read: true
relations:
  - follows [[sys:system/guideline/review-software.md]]
  - follows [[sys:system/guideline/simplify-software-implementation.md]]
  - follows [[sys:system/guideline/write-software.md]]
  - follows [[sys:system/guideline/write-javascript.md]]
  - supports [[sys:system/workflow/review-codebase.md]]
  - follows [[sys:system/guideline/write-workflow.md]]
---

<task>Resolve codebase review findings by applying fixes grouped by file proximity, running tests, and marking findings complete</task>

<context>This workflow processes findings from a codebase review (produced by review-codebase and continue-review-codebase workflows). Findings are stored as checkbox items in a task entity. The workflow reads unresolved findings, groups them by file/directory proximity for efficient fixing, applies changes in a worktree, runs tests after batches, and marks checkboxes as resolved. For large finding sets, it chains to a new context window after processing a batch.</context>

<instructions>

Before starting, read these guidelines to understand code quality standards:

- [[sys:system/guideline/write-software.md]]
- [[sys:system/guideline/write-javascript.md]]
- [[sys:system/guideline/review-software.md]]
- [[sys:system/guideline/simplify-software-implementation.md]]

## Phase 1: Load State

### 1.1 Read Findings Entity

1. Read the findings entity file at the provided `findings` path
2. Extract:
   - **Target**: the codebase path that was reviewed
   - **Review path**: the review entity base URI (from the **Review** field)
   - All finding items (lines matching `- [ ] **...`)
   - All resolved items (lines matching `- [x] **...`) for progress tracking

### 1.2 Count and Assess

1. Count total findings, resolved, and unresolved
2. If no unresolved findings remain, skip to Phase 6 (Finalize)
3. Log progress: `<resolved>/<total> findings resolved, <unresolved> remaining`

### 1.3 Read Project Documentation

1. Read the review entity (resolve from the **Review** base URI -- it is in the same `task/<project>/` directory)
2. Extract the **Documentation** list from the review entity
3. Read the target repository's CLAUDE.md and any referenced guidelines
4. Identify the test command:
   - Use the provided `test-command` parameter if given
   - Otherwise check `package.json` for `test`, `test:all`, or `test:unit` scripts
   - Otherwise check for `Makefile` test targets
   - If no test command found, log a warning and continue without automated testing

## Phase 2: Group Findings by Proximity

### 2.1 Parse Unresolved Findings

For each unresolved finding, extract:
- Section name (from the parent `## Section:` heading)
- Title
- File path and line number (from the backtick-wrapped `file:line` reference)
- Confidence score
- Description
- Source guideline

### 2.2 Group by File and Directory

1. Group findings by exact file path
2. Then cluster file groups by directory proximity (files in the same directory or parent directory)
3. Order groups by:
   - Critical findings first (confidence 90-100)
   - Then by directory depth (foundational/shared code before dependent code)
4. Select the first `batch-size` findings from the ordered groups as the current batch

## Phase 3: Set Up Worktree

Skip this phase if `skip-worktree` is true.

### 3.1 Create Worktree

1. Navigate to the target codebase directory
2. Determine the repository root (may differ from target if target is a subdirectory)
3. Create a worktree for the fix branch:

```bash
git worktree add -b fix/review-findings-<date-slug> ../<repo>-worktrees/fix-review-findings-<date-slug>
```

4. Navigate to the worktree directory for all subsequent file operations

### 3.2 Verify Clean State

1. Run `git status` to confirm clean working tree
2. If uncommitted changes exist, abort and ask the user

## Phase 4: Apply Fixes

### 4.1 Iterate Through Batch

For each finding in the current batch:

1. **Read the file** at the referenced path and line number
2. **Understand the context** -- read surrounding code, imports, and related files as needed
3. **Apply the fix**:
   - For dead code / YAGNI findings: remove the code
   - For bug fixes: correct the logic
   - For performance issues: optimize the pattern
   - For security issues: apply the safe alternative
   - For simplification: refactor to the simpler form
   - For compliance: align with the documented standard
4. **Verify the fix** makes sense in context -- do not blindly apply changes
5. **Skip findings** that:
   - Reference code that has already been modified by a prior fix in this batch (re-check the current file state)
   - Require architectural changes beyond a single-file fix (note these for later)
   - Are ambiguous or the finding description does not match current code (may have been fixed by a prior finding)

### 4.2 Commit After Each File Group

After fixing all findings in a file group (same directory cluster):

1. Stage the changed files
2. Commit with a descriptive message:

```bash
git commit -m "$(cat <<'EOF'
fix: resolve review findings in <directory>

- <brief description of each fix>
EOF
)"
```

### 4.3 Run Tests After Batch

After all findings in the current batch are committed:

1. Run the test command identified in Phase 1
2. If tests pass, continue
3. If tests fail:
   - Read the test output to identify which fix caused the failure
   - Fix the failing test or revert the problematic change
   - Re-run tests to confirm resolution
   - Commit the test fix

## Phase 5: Update Findings Entity

### 5.1 Mark Resolved Findings

For each finding that was successfully fixed, update the findings entity by changing its checkbox:

```
- [ ] **finding title** ...
```
to:
```
- [x] **finding title** ...
```

Read the findings entity file before editing to get the current state (other context windows may have modified it).

### 5.2 Note Skipped Findings

For findings that were skipped (architectural scope, already modified, ambiguous), add an observation to the findings entity using `base entity observe`:

```bash
base entity observe "<findings-base-uri>" "[resolution] Skipped <N> findings requiring manual review: <brief reasons>"
```

## Phase 6: Continue or Finalize

### 6.1 Check for Remaining Findings

Re-read the findings entity to count remaining unresolved findings.

### 6.2 If More Findings Remain

Trigger the next context window. Run `claude` directly (this workflow runs inside the container). Use `nohup` with background execution. Unset `CLAUDECODE` to allow the nested session to launch.

```bash
nohup env -u CLAUDECODE claude --print --dangerously-skip-permissions \
  "Run workflow [[sys:system/workflow/resolve-review-findings.md]] with findings: <absolute path to findings entity file>" \
  > /tmp/resolve-findings-<project>-<target-name>-<date-slug>-batch-<N>.log 2>&1 &
```

Where `<project>` is the parent directory of the findings entity, `<target-name>` and `<date-slug>` are extracted from the findings filename, and `<N>` is the batch number.

### 6.3 If All Findings Resolved (Finalize)

1. If a worktree was created, present the branch for merge:
   - Log the worktree path and branch name
   - Suggest running `/merge-worktree` or manual merge

2. Update the findings entity status to `Resolved`:

```bash
base entity update "<findings-base-uri>" --status "Resolved"
```

3. Add a final observation:

```bash
base entity observe "<findings-base-uri>" "[resolution] All findings resolved. Branch: fix/review-findings-<date-slug>"
```

</instructions>

<output_format>

**Findings Resolution Progress**

**Findings Entity**: [findings entity path]
**Target**: [codebase path]
**Progress**: [resolved]/[total] findings resolved

**This Batch**: [batch-size] findings processed
- Fixed: [count]
- Skipped: [count] ([reasons])
- Tests: [pass/fail]

**Commits**:
- [commit hash] [commit message]

**Next**: [Triggering next batch / All findings resolved - merge branch]

</output_format>
