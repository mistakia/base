---
title: Triage Draft Task
type: workflow
description: >-
  Triage a draft task for duplicates, staleness, and clarity. Auto-queue planning when confident, or surface findings interactively when issues are found.
base_uri: sys:system/workflow/triage-draft-task.md
entity_id: d9e83f27-4a61-4c89-b5d2-8f6c3a9e0b12
created_at: '2026-01-28T02:30:00.000Z'
updated_at: '2026-01-31T00:00:00.000Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
observations:
  - '[triage] Interactive when issues found, auto-queues when all checks pass'
  - '[staleness] Evaluates relevance, not just age - checks if work has been done elsewhere'
  - '[context] Discovers related entities through tag, keyword, and codebase search'
  - '[graduation] Tasks with existing complete plans get graduated to Planned directly'
prompt_properties:
  - name: task_path
    type: string
    description: Path to the draft task file (e.g., task/base/example.md)
    required: true
  - name: orchestrator_managed
    type: boolean
    description: When true, prefix observations with [orchestrator] for tracking
    required: false
    default: false
relations:
  - follows [[sys:system/guideline/task-implementation-plan-standards.md]]
  - follows [[user:guideline/project-mappings.md]]
  - follows [[sys:system/guideline/write-workflow.md]]
  - calls [[sys:system/workflow/write-software-implementation-plan.md]]
  - calls [[sys:system/workflow/write-general-implementation-plan.md]]
tools:
  - read
  - bash
  - grep
  - glob
  - edit
  - skill
---

# Triage Draft Task

<task>
Triage a single draft task by checking for duplicates, staleness/completion, and clarity. When all checks pass with high confidence, queue the planning workflow with enriched context and auto-archive. When issues are found, present findings to the user and work interactively to resolve them.
</task>

<context>
This workflow operates in two modes:

- **Auto-queue path** (no user interaction): All checks pass with high confidence. Queue the enriched planning prompt and auto-archive the session.
- **Interactive path** (user discussion): Duplicates found, task is stale, or clarity gaps exist. Present findings and work with the user before proceeding.

**Project Mappings:** See [[user:guideline/project-mappings.md]] for tag-to-directory and tag-to-repository mappings, including directory-based inference rules.

**Queue Integration:**

When auto-queuing planning workflows, use:

```bash
base queue add "command" --tags tag1,tag2 --priority N
# or: node /Users/trashman/user-base/repository/active/base/cli/queue-command.mjs \
#   "command" --tags tag1,tag2 --priority N
```

- **Priority**: Lower number = higher priority (default: 10, use 5 for planning)
- **Tags**: Control concurrency limits configured in `config.json` under `cli_queue.tag_limits`
- **Planning tags**: `claude-session,task-planning`
</context>

<instructions>

## Phase 1: Duplicate Check

### 1.1 Read Task File

Read the task at `${task_path}` and extract from frontmatter:
- `title`, `description`, `tags`, `relations`
- `created_at` (for --since queries)
- `status` (verify it is Draft)

Extract keywords from title, description, and body for search queries.

### 1.2 Search for Duplicate Tasks

Search the `task/` directory for tasks with overlapping titles, keywords, and tags.

**Find tasks with same tags:**
```bash
rg -l "<tag>" /Users/trashman/user-base/task/ 2>/dev/null || true
```

**Find tasks with similar keywords (from title and description):**
```bash
rg -l "<keyword>" /Users/trashman/user-base/task/ 2>/dev/null || true
```

For each candidate match, read the task file and compare:
- Title similarity
- Description overlap
- Whether one task's scope is a subset of the other
- Status of the potential duplicate (Draft, Planned, In Progress, Completed)

**If potential duplicates are found**: Record them and proceed to Phase 4 (interactive path). Do not continue to Phase 2.

## Phase 2: Staleness and Completion Check

### 2.1 Check Related Task Status

Check if related tasks (from relations or discovered in Phase 1) are already Completed:
```bash
rg "^status: (Completed|In Progress)" /Users/trashman/user-base/task/<related-file> 2>/dev/null || true
```

### 2.2 Repository Search (Software Tasks)

Map tags or directory to repository, then search for evidence the work is already done:

**Recent commits since task creation:**
```bash
git -C /Users/trashman/user-base/repository/active/<repo> \
  log --since="<created_at>" --oneline --grep="<keyword>" 2>/dev/null || true
```

**GitHub issues:**
```bash
gh issue list --repo <owner>/<repo> --state all --search "<keyword>" --limit 10 2>/dev/null || true
```

**GitHub PRs:**
```bash
gh pr list --repo <owner>/<repo> --state all --search "<keyword>" --limit 10 2>/dev/null || true
```

### 2.3 Evaluate Staleness

Staleness is about relevance, not age. The task is stale if:
- Related tasks have been completed that address this need
- PRs have been merged that implement this feature
- The underlying requirement has changed or been superseded

**If stale or already completed**: Record evidence and proceed to Phase 4 (interactive path). Do not continue to Phase 3.

## Phase 3: Clarity and Context Assessment

### 3.1 Evaluate Readiness Criteria

- **Clear objective**: Does the title clearly describe what needs to be done? Does the description explain purpose or motivation?
- **Defined scope**: Are boundaries clear? Is the task appropriately sized?
- **Identifiable type**: Can the task be classified as software or general?

### 3.2 Determine Task Type

**Software task** - Use `write-software-implementation-plan.md` if ANY of:
- Task directory maps to a repository (e.g., `task/league/` -> league repo)
- Task references specific code files or modules
- Task requires reading/analyzing codebase to complete
- Task will produce code changes or implementation subtasks

**General task** - Use `write-general-implementation-plan.md` only if ALL of:
- No repository association (directory or tags)
- No codebase analysis required
- Deliverables are purely documentation, processes, or non-code artifacts

### 3.3 Lightweight Codebase/Context Research

For software tasks, do targeted research in the mapped repository:
- Search for files, patterns, or existing implementations related to the task
- Identify key files that a planning workflow would need to examine
- Note any existing implementations that inform the approach

For general tasks, search for related guidelines, workflows, or documentation.

Collect high-confidence findings as enrichment context for the planning prompt.

### 3.4 Identify Clarity Gaps

Determine if there are specific ambiguities or information gaps that would block effective planning:
- Missing specifications or parameters
- Unclear deliverables
- Ambiguous scope boundaries
- Missing context about the current state

**If clarity gaps exist**: Record the specific gaps and proceed to Phase 4 (interactive path).

### 3.5 Check for Existing Complete Plan

If the task body already contains a complete implementation plan (has `## Tasks` section with checkbox items, design section, etc.), validate it against `guideline/task-implementation-plan-standards.md` standards.

If the plan is complete and meets standards:
- This is the **plan-complete graduation path** (handled in Phase 4)

## Phase 4: Decision and Action

Based on the findings from Phases 1-3, take the appropriate action:

### Duplicates Found (Interactive)

Present the duplicates to the user with:
- Paths and current status of each duplicate
- Key overlaps and differences
- Recommendation (merge, close one, keep both with narrowed scopes)

Work with the user to resolve before proceeding. After resolution, re-evaluate or close.

### Stale or Already Completed (Interactive)

Present the evidence to the user:
- Which PRs, commits, or tasks address the same work
- Current state of the implementation

Discuss whether to close the task, update it with new scope, or keep as-is.

### Clarity Gaps (Interactive)

Present the specific gaps to the user:
- What information is missing
- What questions need answers before planning can proceed

Work with the user to fill gaps. Once resolved, continue to queue planning.

### Plan Already Complete and Ready (Auto-queue path)

If Phase 3.5 found a complete, valid plan:
- Update task frontmatter: `status: Planned`
- Update `updated_at` timestamp
- Record observation: `[draft-triaged] <date> graduated (plan complete)`
- Run `/archive` to auto-archive the session

### All Clear, High Confidence (Auto-queue path)

Task is clear, not stale, no duplicates, no clarity gaps.

**Record observation** on the task file:
```yaml
observations:
  - '[draft-triaged] <date> queued (<enrichment summary>)'
```

Update `updated_at` timestamp.

**Build enriched planning prompt** with context discovered during triage:

```
claude-session "use [[sys:system/workflow/write-software-implementation-plan.md]] to build a plan for [[user:${task_path}]]
- project: [[user:repository/active/<project>]]
- related tasks: [[user:task/path/related.md]]
- key files: path/to/relevant/file.js
- notes: <any other high-confidence context>"
```

Adjust workflow reference to `write-general-implementation-plan.md` for general tasks. Only include bullet points for which high-confidence context was discovered.

**Queue the planning workflow:**
```bash
node /Users/trashman/user-base/repository/active/base/cli/queue-command.mjs \
  "claude-session \"use [[sys:system/workflow/write-software-implementation-plan.md]] to build a plan for [[user:${task_path}]]\n- project: [[user:repository/active/<project>]]\n- related tasks: [[user:task/path/related.md]]\n- key files: path/to/relevant/file.js\n- notes: <context>\"" \
  --tags claude-session,task-planning --priority 5
```

After successfully queuing, run `/archive` to auto-archive the session.

## Recording Observations

For all paths, add an observation to the task frontmatter using the Edit tool.

**Observation format:**
```yaml
observations:
  # If orchestrator_managed is false (default):
  - '[draft-triaged] <date> <status> (<brief reason>)'

  # If orchestrator_managed is true:
  - '[orchestrator][draft-triaged] <date> <status> (<brief reason>)'
```

Status values:
- `queued` - All checks passed, planning workflow queued
- `graduated` - Existing plan validated, status updated to Planned
- `stale` - Task superseded or no longer relevant
- `completed` - Work already done elsewhere
- `duplicate` - Overlaps with existing task
- `needs-clarity` - Ambiguities block planning, discussed with user

Examples:
- `[draft-triaged] 2026-01-31 queued (software task, key files: src/api/auth.mjs)`
- `[orchestrator][draft-triaged] 2026-01-31 queued (software task, key files: src/api/auth.mjs)`
- `[draft-triaged] 2026-01-31 graduated (plan complete)`
- `[draft-triaged] 2026-01-31 stale (superseded by PR #123)`
- `[draft-triaged] 2026-01-31 duplicate (overlaps with task/base/existing-task.md)`
- `[draft-triaged] 2026-01-31 needs-clarity (missing scope definition)`

Update task `updated_at` timestamp.

</instructions>
