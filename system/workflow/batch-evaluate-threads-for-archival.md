---
title: Batch Evaluate Threads for Archival
type: workflow
description: Evaluate multiple threads for archival readiness in a single batch with token-efficient triage
base_uri: sys:system/workflow/batch-evaluate-threads-for-archival.md
created_at: '2025-12-31T00:00:00.000Z'
entity_id: b2c3d4e5-6f7a-489c-ad1e-2f3a4b5c6d7e
observations:
  - '[efficiency] Metadata triage reduces token usage by 80% for simple cases'
  - '[accuracy] User interruption detection prevents premature archival'
prompt_properties:
  - name: thread_ids
    type: array
    description: List of thread UUIDs to evaluate (10-20 recommended)
    required: true
  - name: auto_archive_certain
    type: boolean
    description: Automatically archive threads with certain confidence
    default: false
relations:
  - follows [[sys:system/guideline/thread-archival-evaluation-standards.md]]
  - calls [[sys:system/workflow/evaluate-thread-for-archival.md]]
  - uses [[sys:system/workflow/read-thread.md]]
tools:
  - read
  - bash
  - grep
updated_at: '2026-01-05T19:25:18.065Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
---

# Batch Evaluate Threads for Archival

<task>
Evaluate multiple threads for archival readiness using a tiered approach that minimizes token usage while maintaining accuracy. Produce a summary with clickable links for human review.
</task>

<context>
This workflow processes batches of 10-20 threads efficiently by:
1. Using metadata-only triage for quick categorization
2. Applying light timeline analysis for completion/blocker detection
3. Reserving full evaluation for complex cases only

Refer to [[sys:system/guideline/thread-archival-evaluation-standards.md]] for completion signals and blockers.
</context>

<instructions>

## Phase 1: Metadata Triage

For each thread_id, read only metadata.json:

```bash
jq '{
  thread_id, title, short_description, thread_state, message_count,
  updated_at, system_worktree_path, user_worktree_path,
  session_id: .external_session.session_id
}' "$USER_BASE_DIRECTORY/thread/${thread_id}/metadata.json"
```

**Skip if**:

- Already archived (thread_state = "archived")
- Agent session (session_id starts with "agent-")

**Categorize**:

- **Category A (Quick)**: <=10 messages, >60 days old, no worktrees, has title
- **Category B (Likely)**: 11-50 messages, >30 days old, no worktrees
- **Category C (Full)**: >50 messages, has worktrees, or <30 days old

## Phase 2: Light Timeline Analysis (Category A & B)

Read final 5-10 events (see [[sys:system/workflow/read-thread.md]] for more extraction options):

```bash
tail -10 "$USER_BASE_DIRECTORY/thread/${thread_id}/timeline.jsonl" | jq -s '.'
```

**Check for completion signals**:

- "complete", "done", "finished" in assistant message
- User thanks or acknowledgment
- TodoWrite with all items completed
- Summary of work provided

**Check for blockers**:

- Error messages or failures
- "Request interrupted by user"
- TODO, FIXME, "next steps"
- Unanswered questions
- PR viewed but no review provided

**Result**:

- Completion signal + no blockers → Ready to archive (certain)
- Blocker found → Human review needed
- Unclear → Move to Category C

## Phase 3: Full Evaluation (Category C only)

Apply complete evaluation workflow including:

- Worktree existence check
- File state verification
- Related entity search
- PR/branch status if applicable

## Phase 4: Compile Results

Organize into result categories with clickable links.

</instructions>

<output_format>

## Batch Evaluation Summary

**Batch processed**: [timestamp]
**Threads evaluated**: [count]

### Ready to Archive (Certain) - [count]

| Title   | Age  | Link                                      | Reason                 |
| ------- | ---- | ----------------------------------------- | ---------------------- |
| [Title] | [X]d | [View](http://localhost:8081/thread/uuid) | Completed with summary |

```bash
# Archive command
thread_ids=("uuid-1" "uuid-2")
for tid in "${thread_ids[@]}"; do
  jq --arg now "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)" \
     '.thread_state = "archived" | .archive_reason = "completed" |
      .archived_at = $now | .updated_at = $now' \
    "$USER_BASE_DIRECTORY/thread/${tid}/metadata.json" > /tmp/m.json \
    && mv /tmp/m.json "$USER_BASE_DIRECTORY/thread/${tid}/metadata.json"
  echo "Archived: $tid"
done
```

### Human Review Required - [count]

| Title   | Age  | Link                                      | Review Reason              |
| ------- | ---- | ----------------------------------------- | -------------------------- |
| [Title] | [X]d | [View](http://localhost:8081/thread/uuid) | User interrupted session   |
| [Title] | [X]d | [View](http://localhost:8081/thread/uuid) | PR viewed but not reviewed |

### Keep Active - [count]

| Title   | Age  | Link                                      | Reason          |
| ------- | ---- | ----------------------------------------- | --------------- |
| [Title] | [X]d | [View](http://localhost:8081/thread/uuid) | Recent activity |

### Processing Notes

- Threads skipped (archived): [count]
- Threads skipped (agent): [count]
- Category A: [count], Category B: [count], Category C: [count]

</output_format>

<token_efficiency>

**Estimated tokens per tier**:

- Tier 1 (metadata): ~500 tokens/thread
- Tier 2 (+ light timeline): ~1,500 tokens/thread
- Tier 3 (full evaluation): ~5,000 tokens/thread

**Batch of 20 threads**:

- Best case: ~10K tokens (all Category A, quick archive)
- Typical: ~25K tokens (mixed categories)
- Worst case: ~80K tokens (all Category C)

</token_efficiency>
