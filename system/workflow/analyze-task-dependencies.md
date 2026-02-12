---
title: Analyze Task Dependencies
type: workflow
description: >-
  Analyze Planned tasks for a project to identify shared files, potential conflicts,
  and establish dependency relations between tasks.
base_uri: sys:system/workflow/analyze-task-dependencies.md
entity_id: c9d0e1f2-3a4b-5c6d-7e8f-9a0b1c2d3e4f
created_at: '2026-02-06T18:45:00.000Z'
updated_at: '2026-02-06T18:45:00.000Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
prompt_properties:
  - name: project_tag
    type: string
    description: Project tag to filter tasks (e.g., user:tag/base-project.md)
    required: true
relations:
  - follows [[sys:system/guideline/write-workflow.md]]
  - follows [[user:guideline/project-mappings.md]]
  - supports [[sys:system/workflow/orchestrate-task-pipeline.md]]
  - supports [[sys:system/workflow/select-implementation-batch.md]]
tools:
  - bash
  - read
  - grep
  - glob
  - edit
observations:
  - '[design] Conservative approach - flags potential conflicts for user review'
---

# Analyze Task Dependencies

<task>
Analyze all Planned tasks for a given project to identify file overlaps, potential merge conflicts, and establish dependency ordering between tasks.
</task>

<context>
This workflow examines implementation plans to understand which files each task will modify. When multiple tasks touch the same files, they may conflict and should be sequenced rather than run in parallel.

**Dependency Types:**
- `blocked_by` - Hard dependency: task cannot start until blocker completes
- `precedes` - Soft dependency: recommended ordering to reduce conflicts

**Conservative Approach:**
When uncertain whether tasks conflict, assume they do and flag for user review. It is better to serialize tasks unnecessarily than to create merge conflicts.

**Project Mappings:** See [[user:guideline/project-mappings.md]] for tag-to-directory and tag-to-repository mappings.
</context>

<instructions>

## Phase 1: Gather Planned Tasks

### 1.1 Query Tasks for Project

Query both Planned and In Progress tasks - In Progress tasks represent active file locks that new tasks must respect.

```bash
# Planned tasks (candidates for implementation)
base entity list -t task --status "Planned" --tags "${project_tag}" --json

# In Progress tasks (active file locks)
base entity list -t task --status "In Progress,Started" --tags "${project_tag}" --json
```

If no Planned tasks found, report and exit - nothing to analyze.

In Progress tasks are treated as blockers: any Planned task that overlaps with an In Progress task's files should be marked as `blocked_by` that task.

### 1.2 Read Implementation Plans

For each Planned task, read the file and extract:
- Task title and path
- Files mentioned in the implementation plan (look for file paths in task items)
- Modules or directories that will be modified

Build a map: `task_path -> [files_to_modify]`

## Phase 2: Identify Overlaps

### 2.1 Find Shared Files

Compare the file lists across all tasks. Identify:
- **Direct overlaps**: Same file modified by multiple tasks
- **Directory overlaps**: Multiple tasks modifying files in the same directory
- **Module overlaps**: Tasks touching related modules (e.g., both modify auth system)

### 2.2 Assess Conflict Potential

For each overlap, assess:
- **High conflict**: Same file, same sections likely modified
- **Medium conflict**: Same file, different sections
- **Low conflict**: Same directory, different files

When uncertain, classify as high conflict.

## Phase 3: Determine Dependencies

### 3.1 Establish Ordering

For tasks with overlaps:
1. Check if one task is foundational (adds infrastructure others depend on)
2. Check task priority (High > Medium > Low)
3. Check task creation date (older tasks first)

The task that should run first becomes a `precedes` relation for the other.

### 3.2 Flag Ambiguous Cases

If ordering cannot be clearly determined:
- Do NOT add relations automatically
- Record the conflict for user review
- Mark both tasks with observation noting the potential conflict

## Phase 4: Update Task Relations

### 4.1 Add Dependency Relations

For clear dependencies, update task frontmatter:

```yaml
relations:
  - precedes [[user:task/path/dependent-task.md]]
  # or
  - blocked_by [[user:task/path/blocking-task.md]]
```

Use `blocked_by` only when one task literally cannot proceed without the other completing (e.g., task B modifies code that task A creates).

Use `precedes` for soft ordering to reduce conflicts.

### 4.2 Record Analysis Observation

Add observation to each analyzed task:

```yaml
observations:
  - '[dependencies-analyzed] 2026-02-06 (<summary>)'
```

Summary examples:
- `no conflicts detected`
- `precedes task/base/other-task.md (shared: src/api/auth.mjs)`
- `potential conflict with task/base/other-task.md - needs user review`

Update `updated_at` timestamp.

## Phase 5: Report Results

Present analysis summary:

```
## Dependency Analysis: ${project_tag}

**Tasks Analyzed:** N

**Dependencies Established:**
- task/path/a.md precedes task/path/b.md (shared: file.js)

**Potential Conflicts (Need User Review):**
- task/path/c.md and task/path/d.md both modify src/module/

**No Conflicts:**
- task/path/e.md (no shared files)

**Recommendation:**
[Summary of safe execution order or request for user input on conflicts]
```

If any conflicts need user review, STOP and wait for input before the orchestrator proceeds with implementation selection.

</instructions>
