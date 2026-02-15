---
title: Select Implementation Batch
type: workflow
description: >-
  Select ready tasks for implementation based on dependencies, priority, and
  execution characteristics. Queues implementation workflows with appropriate tags.
base_uri: sys:system/workflow/select-implementation-batch.md
entity_id: e1f2a3b4-5c6d-7e8f-9a0b-1c2d3e4f5a6b
created_at: '2026-02-06T19:15:00.000Z'
updated_at: '2026-02-06T19:15:00.000Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
prompt_properties:
  - name: project_tag
    type: string
    description: Project tag to filter tasks (e.g., user:tag/base-project.md)
    required: true
  - name: max_batch
    type: number
    description: Maximum tasks to queue (default 1 for safety)
    required: false
    default: 1
relations:
  - follows [[sys:system/guideline/write-workflow.md]]
  - follows [[user:guideline/project-mappings.md]]
  - supports [[sys:system/workflow/orchestrate-task-management.md]]
  - calls [[sys:system/workflow/implement-software-task.md]]
  - calls [[sys:system/workflow/implement-general-task.md]]
tools:
  - bash
  - read
  - grep
  - glob
  - edit
observations:
  - '[design] Conservative batch size default of 1 for safety'
  - '[design] Multiple ordering factors beyond just file conflicts'
---

# Select Implementation Batch

<task>
Select Planned tasks that are ready for implementation (no unresolved blockers) and queue them for execution, respecting concurrency limits and task ordering.
</task>

<context>
This workflow selects from Planned tasks that have been through dependency analysis. It considers multiple factors to determine the best execution order, not just file conflicts.

**Readiness Criteria:**
A task is ready for implementation when:

- Status is "Planned"
- Has `[dependencies-analyzed]` observation
- No unresolved `blocked_by` relations (blocker not yet Completed)
- No In Progress tasks modifying the same files

**Project Mappings:** See [[user:guideline/project-mappings.md]] for tag-to-queue-tag mappings.
</context>

<instructions>

## Phase 1: Gather Ready Tasks

### 1.1 Query Planned Tasks

```bash
base entity list -t task --status "Planned" --tags "${project_tag}" --json
```

### 1.2 Filter for Readiness

For each Planned task, check:

1. Has `[dependencies-analyzed]` observation in frontmatter
2. Check all `blocked_by` relations - verify blocker status is "Completed"
3. No In Progress task with overlapping files

Tasks that pass all checks are "ready" candidates.

### 1.3 Check Active Implementations

```bash
base entity list -t task --status "In Progress,Started" --tags "${project_tag}" --json
```

If any In Progress tasks exist for this project, the batch size should be 0 (wait for completion) unless the ready tasks have no file overlap.

## Phase 2: Score and Rank Tasks

Score each ready task on multiple factors. Higher total score = higher priority.

### 2.1 Priority Score (0-30 points)

- High priority: 30 points
- Medium priority: 20 points
- Low priority: 10 points
- No priority set: 15 points

### 2.2 Complexity Score (0-25 points)

Estimate from implementation plan:

- Few tasks (1-3 items): 25 points (quick win)
- Moderate tasks (4-7 items): 15 points
- Many tasks (8+ items): 5 points
- Cannot determine: 10 points

### 2.3 Dependency Score (0-20 points)

- No dependencies: 20 points
- Only soft dependencies (precedes): 15 points
- Has completed blockers: 10 points
- Has pending soft dependencies: 5 points

### 2.4 Age Score (0-15 points)

Based on task creation date:

- Over 30 days old: 15 points
- 14-30 days old: 10 points
- 7-14 days old: 5 points
- Under 7 days: 0 points

### 2.5 Enablement Score (0-10 points)

Does this task unblock other tasks?

- Unblocks 3+ other tasks: 10 points
- Unblocks 1-2 other tasks: 5 points
- Unblocks nothing: 0 points

### 2.6 Non-Software Task Factors

For general (non-software) tasks, additional considerations:

- **External dependencies**: Does task require user input, external approvals, or third-party actions? (Deprioritize if blocked externally)
- **Time sensitivity**: Does task have a deadline or event date? (Prioritize approaching deadlines)
- **Batch opportunity**: Can this task be batched with similar tasks? (Prioritize if batching possible)

## Phase 3: Select Batch

### 3.1 Rank by Total Score

Sort ready tasks by total score (descending).

### 3.2 Apply Batch Limit

Select top N tasks where N = min(max_batch, available capacity).

Default max_batch is 1 for safety - prefer sequential execution to reduce risk.

### 3.3 Verify No Conflicts in Batch

If selecting multiple tasks, verify they don't conflict with each other (shared files). If conflict exists, only take the highest-scored task.

## Phase 4: Queue Implementation

### 4.1 Determine Workflow Type

For each selected task:

- Check if task has associated repository (from tags or directory) -> software task
- Check if implementation plan references code files -> software task
- Otherwise -> general task

### 4.2 Build Queue Commands

For software tasks:

```bash
base queue add "cli/run-claude.sh 'use [[sys:system/workflow/implement-software-task.md]] to implement [[user:${task_path}]]'" \
  --tags claude-session,project-${project_name} --priority 8
```

For general tasks:

```bash
base queue add "cli/run-claude.sh 'use [[sys:system/workflow/implement-general-task.md]] to implement [[user:${task_path}]]'" \
  --tags claude-session,project-${project_name} --priority 8
```

### 4.3 Record Selection

Add observation to each queued task:

```yaml
observations:
  - '[implementation-queued] 2026-02-06 score:N job:<job-id>'
```

Update `updated_at` timestamp.

## Phase 5: Report Results

```
## Implementation Selection: ${project_tag}

**Ready Tasks:** N of M Planned tasks are ready

**Scoring Summary:**
| Task | Priority | Complexity | Deps | Age | Enablement | Total |
|------|----------|------------|------|-----|------------|-------|
| task/path/a.md | 30 | 25 | 20 | 10 | 5 | 90 |

**Selected for Implementation:**
- task/path/a.md (score: 90, job: <job-id>)

**Not Selected (Reasons):**
- task/path/b.md: blocked by task/path/c.md (In Progress)
- task/path/d.md: missing dependency analysis

**Queue Status:**
[Current queue stats]
```

If no tasks were selected, explain why and what conditions need to change.

</instructions>
