---
title: Orchestrate Task Pipeline
type: workflow
description: >-
  Recursive orchestrator that manages the task pipeline from draft to completion,
  with per-project concurrency control and user verification at each step.
base_uri: sys:system/workflow/orchestrate-task-pipeline.md
entity_id: b8c9d0e1-2f3a-4b5c-6d7e-8f9a0b1c2d3e
created_at: '2026-02-06T18:30:00.000Z'
updated_at: '2026-02-06T18:30:00.000Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
prompt_properties:
  - name: mode
    type: string
    description: Execution mode - 'verify' (default) stops for user approval, 'auto' continues autonomously
    required: false
    default: verify
  - name: iteration
    type: number
    description: Current iteration count for tracking recursive depth
    required: false
    default: 1
relations:
  - follows [[sys:system/guideline/write-workflow.md]]
  - follows [[user:guideline/project-mappings.md]]
  - calls [[sys:system/workflow/triage-draft-task.md]]
  - calls [[sys:system/workflow/analyze-task-dependencies.md]]
  - calls [[sys:system/workflow/select-implementation-batch.md]]
  - calls [[sys:system/workflow/implement-software-task.md]]
  - calls [[sys:system/workflow/implement-general-task.md]]
tools:
  - bash
  - read
  - grep
  - glob
  - edit
observations:
  - '[design] User-first approach - verify mode is default, auto mode is earned'
  - '[design] Prefers stopping/waiting over making assumptions'
  - '[design] Only monitors queued jobs, not started/paused sessions'
  - '[design] Avoids duplicate work - checks before queuing'
---

# Orchestrate Task Pipeline

<task>
Assess the current state of the task pipeline, decide what actions to take, execute those actions through the command queue, and determine whether to continue or stop for user review.
</task>

<context>
This is a recursive, self-managing orchestrator that runs the task pipeline. It operates in two modes:

- **verify** (default): Stops after each phase for user approval before continuing
- **auto**: Continues autonomously, only stopping on errors, ambiguity, or context pressure

The orchestrator never makes assumptions. When uncertain about:
- Which tasks to prioritize
- Whether a task is ready for implementation
- How to resolve conflicts between tasks
- Any ambiguous state

It ALWAYS stops and waits for user input rather than guessing.

**Concurrency Model:**
All workflow executions go through the command queue with tag-based limits configured in `config.json`.

**Workflow Lifecycle:**
- Orchestrator queues workflows and monitors only **queued** (not-yet-started) jobs
- Once a workflow starts, it runs independently in its own session
- Started workflows may pause and wait for user - this is handled separately via base UI
- Orchestrator does NOT wait for or track paused/started sessions
- User handles stuck/paused workflows through base client UI

**Duplicate Prevention:**
Before queuing any workflow, check that no active job exists for the same task/action. Avoid queuing duplicate work.
</context>

<instructions>

## Phase 1: Assess Pipeline State

Query the current state of tasks across all statuses.

### 1.1 Count Tasks by Status

```bash
# Draft tasks (need triage)
base entity list -t task --status "Draft" --json 2>/dev/null | jq length

# Planned tasks (ready for implementation)
base entity list -t task --status "Planned" --json 2>/dev/null | jq length

# In Progress tasks
base entity list -t task --status "In Progress" --json 2>/dev/null | jq length
```

### 1.2 Check Queue Status

```bash
# View current queue state
base queue stats
```

### 1.3 Record Pipeline Snapshot

Document the current state:
- Draft count
- Planned count
- In Progress count
- Active queue jobs
- Queue capacity available

## Phase 2: Decide Actions

Based on the pipeline state, determine what actions to take. Apply these rules IN ORDER:

### 2.1 Check for Blockers

If any of these conditions exist, STOP and report to user:
- Queue errors or worker issues
- Multiple tasks with conflicting changes to same files
- Any ambiguous or unclear state

### 2.2 Determine Priority Actions

Evaluate in this order:

1. **Draft tasks exist** -> Queue triage workflow for oldest draft
2. **Planned tasks with analyzed dependencies** -> Queue implementation batch selection
3. **Planned tasks without dependency analysis** -> Queue dependency analysis
4. **Only In Progress tasks** -> Report status and wait

## Phase 3: Execute Actions

Before queuing any action, verify no duplicate job is already queued or active for the same task/workflow.

```bash
# Check for existing queued jobs
base queue stats
```

If a job already exists for this task/action, skip queuing and proceed to Phase 4.

### 3.1 Queue Triage (for Draft tasks)

```bash
base queue add "cli/run-claude.sh 'Run workflow [[sys:system/workflow/triage-draft-task.md]] with task_path=<path>'" \
  --tags claude-session,draft-triage --priority 5
```

### 3.2 Queue Dependency Analysis

```bash
base queue add "cli/run-claude.sh 'Run workflow [[sys:system/workflow/analyze-task-dependencies.md]] with project_tag=<tag>'" \
  --tags claude-session,dependency-analysis --priority 6
```

### 3.3 Queue Implementation Selection

```bash
base queue add "cli/run-claude.sh 'Run workflow [[sys:system/workflow/select-implementation-batch.md]] with project_tag=<tag>'" \
  --tags claude-session,implementation-selection --priority 7
```

## Phase 4: Continuation Decision

### 4.1 Verify Mode (Default)

If `mode` is `verify` or not specified:

**STOP HERE** and present to user:
- Pipeline snapshot from Phase 1
- Action taken in Phase 3
- Current queue state
- Recommendation for next step

Wait for user to either:
- Approve continuation (user says "continue" or similar)
- Provide different instructions
- Promote to auto mode (user says "auto" or "continue autonomously")

### 4.2 Auto Mode

If `mode` is `auto`:

Check context pressure by examining current conversation length. If approaching context limits:
- Document current state
- Prepare handoff context for successor
- Queue successor orchestrator with iteration+1
- Archive this session

Otherwise, loop back to Phase 1 after a brief delay to allow queued jobs to progress.

### 4.3 Always Stop Conditions

Regardless of mode, ALWAYS stop and wait for user if:
- Any error occurs
- Ambiguous state detected
- Conflicting tasks found
- Queue at capacity for extended period
- iteration count exceeds 10 (safety limit)

## Output Format

Brief status after each iteration:

```
Iteration ${iteration}: [action taken or "no action needed"]
Queue: N jobs | Tasks: N draft, N planned, N in progress
```

Detailed pipeline visibility is available through the base client UI.

</instructions>
