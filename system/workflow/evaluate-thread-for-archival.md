---
title: Evaluate Thread for Archival
type: workflow
description: Evaluate a thread's archive readiness and produce a structured evaluation report
base_uri: sys:system/workflow/evaluate-thread-for-archival.md
created_at: '2025-12-31T00:00:00.000Z'
entity_id: a1b2c3d4-5e6f-4a8b-9c0d-1e2f3a4b5c6d
observations:
  - '[accuracy] File verification confirms completion signals with evidence'
  - '[efficiency] References guideline for criteria to avoid duplication'
prompt_properties:
  - name: thread_id
    type: string
    description: UUID of the thread to evaluate
    required: true
relations:
  - follows [[sys:system/guideline/thread-archival-evaluation-standards.md]]
  - applies [[sys:system/text/thread-metadata-schema.json]]
  - uses [[sys:system/workflow/read-thread.md]]
tools:
  - read
  - bash
  - grep
  - glob
updated_at: '2026-01-05T19:25:18.066Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
---

# Evaluate Thread for Archival

<task>
Evaluate a thread to determine if it is ready for archival. Verify completion by checking actual file states, identify related entities, and output a structured evaluation report as a message.
</task>

<context>
This workflow applies the standards defined in [[sys:system/guideline/thread-archival-evaluation-standards.md]]. Refer to that guideline for:
- Completion signals (what indicates work is done)
- Blockers (what prevents archival)
- Confidence levels (certain vs uncertain)
- Archive reasons (completed vs user_abandoned)

The workflow is read-only - it gathers information and reports findings without modifying anything. Output the evaluation report as a message; do not save it to a file.
</context>

<instructions>

## 0. Verify Thread is in Scope

```bash
session_id=$(jq -r '.external_session.session_id // ""' \
  "/Users/trashman/user-base/thread/${thread_id}/metadata.json")
```

Skip if session_id starts with "agent-" (sub-agent thread).

## 1. Load Thread Context

```bash
jq '{thread_id, title, short_description, thread_state, message_count,
    tool_call_count, created_at, updated_at, system_worktree_path,
    user_worktree_path}' "/Users/trashman/user-base/thread/${thread_id}/metadata.json"
```

Calculate age in days and days since last update.

## 2. Check for Blockers

### 2.1 Worktree Status

If worktree paths exist in metadata, check if directories exist on disk.

### 2.2 Timeline Analysis

```bash
tail -20 "/Users/trashman/user-base/thread/${thread_id}/timeline.jsonl" | jq -s '.'
```

Check final events for blockers per guideline (errors, incomplete work, unanswered questions, user interruptions).

### 2.3 Metadata Completeness

Verify title and short_description exist and reflect actual work.

## 3. Verify File States

Extract files mentioned in timeline and verify they exist:

```bash
jq -r '.content.tool_parameters | .file_path? // .path? // empty' \
  "/Users/trashman/user-base/thread/${thread_id}/timeline.jsonl" | sort -u
```

## 4. Search for Related Entities

```bash
# References to this thread
rg -l "${thread_id}" /Users/trashman/user-base/task/ 2>/dev/null || true
```

### 4.1 GitHub PR Status (if applicable)

```bash
gh pr view <PR_NUMBER> --json state,mergedAt,closedAt,headRefName 2>/dev/null || true
```

### 4.2 Stale Branches (if applicable)

```bash
git -C /Users/trashman/user-base/repository/active/<repo> branch -a | grep "<branch>" || true
```

## 5. Determine Recommendation

Apply criteria from guideline:

- **ready_to_archive (certain)**: Completion signal present, no blockers, metadata adequate
- **human_review_needed (uncertain)**: Any blocker, ambiguity, or missing signals

## 6. Generate Thread Link

Include link for human review: `http://localhost:8081/thread/${thread_id}`

## 7. Output Evaluation Report

Output the evaluation report as a message using the format below. Do not write it to a file.

</instructions>

<output_format>

Output the evaluation report in the following YAML format as a message:

```yaml
evaluation:
  thread_id: <uuid>
  thread_link: http://localhost:8081/thread/<uuid>
  recommendation: <ready_to_archive|human_review_needed>
  confidence: <certain|uncertain>

summary:
  title: '<title>'
  short_description: '<description>'
  age_days: <number>
  message_count: <number>

blockers: []
completion_signals: []

file_verification:
  files_checked: <number>
  files_exist: <number>
  notes: '<observations>'

follow_up_notes: '<potential follow-up work>'

if_archiving:
  suggested_reason: <completed|user_abandoned>
  suggested_title: '<if update needed>'
  suggested_description: '<if update needed>'

human_review_reasons: []
```

</output_format>

<archival_commands>

**Archive as completed**:

```bash
jq --arg now "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)" \
   '.thread_state = "archived" | .archive_reason = "completed" |
    .archived_at = $now | .updated_at = $now' \
  "/Users/trashman/user-base/thread/${thread_id}/metadata.json" > /tmp/m.json \
  && mv /tmp/m.json "/Users/trashman/user-base/thread/${thread_id}/metadata.json"
```

**Archive as user_abandoned**:

```bash
jq --arg now "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)" \
   '.thread_state = "archived" | .archive_reason = "user_abandoned" |
    .archived_at = $now | .updated_at = $now' \
  "/Users/trashman/user-base/thread/${thread_id}/metadata.json" > /tmp/m.json \
  && mv /tmp/m.json "/Users/trashman/user-base/thread/${thread_id}/metadata.json"
```

</archival_commands>
