---
title: Manage Task Drafts
type: workflow
description: >-
  Audit task statuses, validate Planned tasks have implementation plans, and queue Draft tasks for
  readiness evaluation
base_uri: sys:system/workflow/manage-task-drafts.md
entity_id: c7d94e38-5b72-4f90-a6c1-9e8d7f2a3b45
created_at: '2026-01-28T02:30:00.000Z'
updated_at: '2026-01-28T04:50:00.000Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
observations:
  - '[autonomy] Runs to completion without human review stops'
  - '[deduplication] Observation-based tracking prevents duplicate queue entries'
  - '[integration] Uses queue-command for background evaluation processing'
prompt_properties:
  - name: max_drafts
    type: number
    description: Maximum number of draft tasks to queue for evaluation
    required: false
    default: 10
relations:
  - follows [[sys:system/guideline/task-implementation-plan-standards.md]]
  - follows [[sys:system/guideline/write-workflow.md]]
  - calls [[sys:system/workflow/triage-draft-task.md]]
tools:
  - read
  - bash
  - grep
  - glob
  - edit
---

# Manage Task Drafts

<task>
Audit task statuses across the user-base, validate that Planned tasks have proper implementation plans, and queue Draft and No Status tasks for readiness evaluation. Run autonomously to completion.
</task>

<context>
This workflow runs autonomously without human review stops. It:

1. **Validates Planned tasks**: Ensures tasks with `status: Planned` have valid implementation plans
2. **Auto-demotes invalid tasks**: Changes invalid Planned tasks to Draft status
3. **Queues Draft triage**: Sends Draft and No Status tasks to the triage-draft-task workflow
4. **Prevents duplicates**: Uses observations to track queued/evaluated drafts

**Implementation Plan Validation Criteria** (per [[sys:system/guideline/task-implementation-plan-standards.md]]):

A task has a **valid implementation plan** if ALL of these are true:

1. Contains a Tasks section heading
2. Contains at least one checkbox item (`- [ ]` or `- [x]`)

**Detection Patterns:**

| Check          | Regex Pattern                                       |
| -------------- | --------------------------------------------------- |
| Tasks section  | `^##\s+(Implementation\s+)?Tasks` or `^###\s+Tasks` |
| Checkbox items | `^-\s+\[([ x])\]\s+.+`                              |

**Invalid Plan Indicators:**

- No Tasks section heading exists
- No checkbox items exist
- Only prose description without actionable items

**Observation Tracking:**

- `[triage-queued] <date>` - Draft has been queued for triage
- `[draft-triaged] <date> <status>` - Draft has been triaged
- `[plan-completed] <date>` - Planning workflow finished and wrote the implementation plan

Drafts with recent observations (within 7 days) are skipped to prevent re-queuing.

**Queue Integration:**

The CLI queue system enables background processing of evaluation workflows:

```bash
node cli/queue-command.mjs "command" --tags tag1,tag2 --priority N
```

- **Priority**: Lower number = higher priority (default: 10, use 5 for draft evaluation)
- **Tags**: Control concurrency limits configured in `config.json` under `cli_queue.tag_limits`
- **Common tags**:
  - `claude-session` - Limits concurrent Claude CLI sessions
  - `draft-triage` - Identifies draft triage jobs
  - `task-planning` - Identifies planning workflow jobs

The triage-draft-task workflow may further queue planning workflows when it determines a draft is ready with high confidence.
</context>

<instructions>

## Phase 1: Validate and Demote Invalid Planned Tasks

### 1.1 Find All Planned Tasks

```bash
rg -l "^status: Planned" "$USER_BASE_DIRECTORY/task/" 2>/dev/null || true
```

### 1.2 Validate and Demote Each Invalid Task

For each task file found, check for valid implementation plan:

**Check for Tasks section:**

```bash
rg "^##\s+(Implementation\s+)?Tasks" "<task_file>" 2>/dev/null || true
```

**Check for checkbox items:**

```bash
rg "^-\s+\[([ x])\]" "<task_file>" 2>/dev/null || true
```

A task is **valid** if BOTH checks pass (has Tasks section AND has checkbox items).

**For invalid tasks, immediately demote:**

- Update `status: Planned` to `status: Draft` in frontmatter
- Update `updated_at` timestamp

Track counts: valid_count, demoted_count

---

## Phase 2: Queue Draft Tasks for Evaluation

### 2.1 Find All Draft and No Status Tasks

```bash
rg -l "^status: (Draft|No Status)" "$USER_BASE_DIRECTORY/task/" 2>/dev/null || true
```

### 2.2 Filter by Recent Observations

For each draft, check if already queued or evaluated recently:

```bash
rg "\[(triage-queued|draft-triaged|plan-completed)\]" "<task_file>" 2>/dev/null || true
```

**Skip if:**

- Has `[triage-queued]` observation within last 7 days
- Has `[draft-triaged]` observation within last 7 days
- Has `[plan-completed]` observation within last 7 days

### 2.3 Queue Eligible Drafts (up to max_drafts)

For each eligible draft:

**Add observation to task:**

```yaml
observations:
  - '[triage-queued] 2026-01-28'
```

Use Edit tool to add observation and update `updated_at`.

**Queue the evaluation:**

```bash
base queue add "claude-session \"Run [[sys:system/workflow/triage-draft-task.md]] for task_path=<relative_path>\"" \
  --tags claude-session,draft-triage --priority 5
```

Track: queued_count, skipped_count, job_ids

---

## Phase 3: Summary Report

Present final summary with all actions taken.

</instructions>

<output_format>

Output a single summary report after all phases complete:

```
## Manage Task Drafts - Summary

### Planned Tasks Audit
| Status | Count |
|--------|-------|
| Valid | X |
| Demoted to Draft | Y |

### Draft Evaluation Queue
| Status | Count |
|--------|-------|
| Queued for evaluation | A |
| Skipped (recently processed) | B |
| Remaining (exceeded max_drafts) | C |

### Queue Jobs Created
| Job ID | Task |
|--------|------|
| <uuid> | task/base/example.md |

### Next Steps
- Evaluation workflows will run in background via queue
- Results will be recorded as observations on each task
- Tasks marked `queued` will have planning workflows auto-queued
- Run workflow again to process remaining drafts

Check queue: `base queue stats`
```

</output_format>
