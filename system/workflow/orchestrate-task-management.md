---
title: Orchestrate Task Management
type: workflow
description: >-
  Interactive daily management workflow that gathers task and thread state, presents structured
  briefings, and executes admin-directed actions for task lifecycle management.
created_at: '2026-02-15T19:42:26.696Z'
entity_id: f4673adf-d962-4188-b453-a943b5a92635
observations:
  - '[design] Collaboration-first: gathers state, presents findings, waits for admin direction'
  - '[design] Uses CLI commands for token-efficient data gathering'
  - '[design] Admin homepage variant consumes same data sources'
prompt_properties:
  - name: project_tag
    type: string
    description: Optional project tag to scope the review (e.g., user:tag/base-project.md)
    required: false
  - name: include_threads
    type: boolean
    description: Include active thread summary in the briefing
    required: false
    default: true
public_read: false
relations:
  - implements [[sys:system/schema/workflow.md]]
  - follows [[sys:system/guideline/write-workflow.md]]
  - calls [[sys:system/workflow/triage-draft-task.md]]
  - calls [[sys:system/workflow/analyze-task-dependencies.md]]
  - calls [[sys:system/workflow/select-implementation-batch.md]]
tools:
  - bash
  - read
  - grep
  - glob
  - edit
updated_at: '2026-02-15T19:42:26.696Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
---

<![CDATA[# Orchestrate Task Management

<task>
Gather the current state of tasks and threads, present a structured briefing, and execute admin-directed actions to manage the task lifecycle collaboratively.
</task>

<context>
This is a collaborative orchestration workflow. It does NOT make autonomous decisions. It gathers state, presents findings, and waits for the admin to direct actions at each step.

**Operating model:**
1. Gather -- use CLI commands to collect task/thread state efficiently
2. Present -- structured briefing of current state
3. Collaborate -- present candidates and recommendations, wait for admin decisions
4. Execute -- carry out directed actions (status changes, relation additions, queue triage, etc.)
5. Memorialize -- record decisions as observations, relations, status changes

**Available CLI commands for data gathering:**
```bash
# Task queries
base entity list -t task --status "Draft,Planned,In Progress,Blocked" --json
base entity list -t task --status "Draft" --json
base entity list -t task --tags <project_tag> --json

# Thread queries
base thread list --state active --json
base thread stale --days 7 --json

# Relations and dependencies
base relation list <base_uri>
base entity tree <base_uri>

# Thread context
base thread status <thread_id>
base thread messages <thread_id> --role assistant --last 3
```

**Available CLI commands for actions:**
```bash
# Entity updates
base entity update <base_uri> --status "In Progress"
base entity update <base_uri> --priority High
base entity observe <base_uri> "[category] observation text"

# Relation management
base relation add <source> <type> <target>
base relation remove <source> <type> <target>

# Thread management
base thread archive <thread_id> --completed

# Queue workflows for background execution
base queue add "cli/run-claude.sh 'Run workflow [[sys:system/workflow/triage-draft-task.md]] with task_path=<path>'" \
  --tags claude-session,draft-triage --priority 5
```
</context>

<instructions>

## Phase 1: Gather Pipeline State

Collect task and thread data using CLI commands. Present results as a structured briefing.

### 1.1 Task Pipeline Summary

```bash
# Count tasks by status
base entity list -t task --status "Draft" --json 2>/dev/null | jq length
base entity list -t task --status "Planned" --json 2>/dev/null | jq length
base entity list -t task --status "In Progress" --json 2>/dev/null | jq length
base entity list -t task --status "Blocked" --json 2>/dev/null | jq length
```

If `project_tag` is provided, add `--tags <project_tag>` to scope queries.

### 1.1b In Progress Task Thread Context

For each in-progress task, query reverse relations to find recent threads that worked on it:

```bash
# Get threads related to a task (filter for thread source_type, sort by updated_at)
base relation reverse "<task_base_uri>" --json 2>/dev/null | \
  jq '[.reverse[] | select(.source_type == "thread") | {thread_id: .entity_id, title, updated_at, thread_state, relation_type}] | sort_by(.updated_at) | reverse | .[0:3]'
```

Include the most recent 1-2 threads per task in the briefing, showing thread ID (full, not truncated), title, state, and recency. This helps the admin understand where work left off.

### 1.2 Active Threads Summary (if include_threads is true)

```bash
# Active threads with age
base thread list --state active --json 2>/dev/null | jq '[.[] | {thread_id, title, updated_at}]'

# Stale threads
base thread stale --days 7 --json 2>/dev/null
```

### 1.3 Present Briefing

Format and present the collected data:

```
## Task Pipeline
| Status      | Count |
|-------------|-------|
| Draft       | X     |
| Planned     | Y     |
| In Progress | Z     |
| Blocked     | W     |

## Active Threads (N total, M stale)
[List stale threads first, then recent active threads. Always output full thread IDs (not truncated) so they can be opened in the web client or used for archival commands.]

## In Progress Tasks
[List each in-progress task with priority and latest related thread(s). Include full thread IDs.]

## Draft Tasks (candidates for triage)
[List draft tasks, noting any with recent triage observations to skip]

## Planned Tasks (ready for implementation)
[List planned tasks that have completed plans and no unresolved blockers]

## Blocked Tasks
[List blocked tasks with their blockers, noting if blockers may be resolved]
```

**STOP and wait for admin review.** Ask what actions to take.

## Phase 2: Execute Directed Actions

Based on admin direction, execute any combination of these actions:

### Status Updates
```bash
base entity update <base_uri> --status "<new_status>"
```

### Add/Remove Relations
```bash
base relation add <source> blocked_by <target>
base relation remove <source> blocked_by <target>
```

### Add Observations
```bash
base entity observe <base_uri> "[category] observation text"
```

### Queue Draft Triage
```bash
base queue add "cli/run-claude.sh 'Run workflow [[sys:system/workflow/triage-draft-task.md]] with task_path=<relative_path>'" \
  --tags claude-session,draft-triage --priority 5
```

After executing each action, report what was done.

### Archive Threads
```bash
base thread archive <thread_id> --completed
```

### Create Draft Tasks
Use `mcp__base__entity_create` to create new draft task entities based on observations during the review.

## Phase 3: Review Thread Context (on request)

If the admin wants to understand where a specific thread stands:

```bash
# Quick context
base thread status <thread_id>

# Recent assistant messages
base thread messages <thread_id> --role assistant --last 3

# Full dependency tree for related task
base entity tree <task_base_uri>
```

Present findings and wait for direction.

## Phase 4: Wrap Up

After the admin indicates the review is complete:

- Summarize all actions taken
- Note any follow-up items that were deferred
- If the admin wants, record a summary observation on any relevant task entities

## Key Rules

- NEVER make autonomous decisions -- always present and wait for direction
- Use CLI commands for data gathering to minimize token usage
- Execute actions one at a time, confirming each result
- Record decisions as observations for future reference
- If any action fails, report the error and wait for direction

</instructions>

<output_format>
Start with the briefing, then present an action menu:

```
## Briefing Complete

What would you like to do?
- Review specific threads or tasks in detail
- Update task statuses or priorities
- Add blockers or dependencies
- Queue drafts for triage
- Archive completed threads
- Create new draft tasks
- End review
```
</output_format>
]]>
