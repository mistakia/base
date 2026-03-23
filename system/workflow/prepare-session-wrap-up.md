---
title: Prepare Session Wrap-Up
type: workflow
description: >-
  Token-efficient pre-archive workflow that reflects on session work to identify remaining cleanup
  actions and produces a continuation prompt for follow-up
base_uri: sys:system/workflow/prepare-session-wrap-up.md
created_at: '2026-02-13T00:00:00.000Z'
entity_id: 8aa3705f-52fe-434c-b334-5e90585f92c3
observations:
  - '[efficiency] Designed for minimal token usage near end of context window'
  - '[pattern] Output doubles as continuation prompt for new session'
  - '[principle] Relies on session context rather than prescriptive tool calls'
public_read: true
relations:
  - follows [[sys:system/guideline/write-workflow.md]]
updated_at: '2026-02-13T00:00:00.000Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
visibility_analyzed_at: '2026-02-16T04:41:18.895Z'
---

# Prepare Session Wrap-Up

<task>Reflect on work done in this session and identify any remaining cleanup or follow-up actions before ending.</task>

<context>
Rely on your knowledge of what happened in this session — do not perform exploratory searches or read files unless you need to verify something specific. Be concise.
</context>

<instructions>

This workflow accepts an optional `--continue` flag. When set, uncommitted changes are left in place for the next session. When not set (the default), commit all uncommitted work before ending.

Based on what you know you've done in this session and the tasks you were given, consider whether any of the following apply:

- **Uncommitted changes** — files you created or edited that should be committed. Unless `--continue` is set, commit these now with descriptive messages. Group related changes into logical commits.
- **Temporary artifacts** — scratch files, temp outputs, or debug additions that should be cleaned up
- **Worktree cleanup** — feature branches or worktrees created during the session that should be merged or removed
- **Multi-machine sync** — changes to entities, configs, services, or scheduled commands that need to be pushed or deployed to the storage server
- **Task status** — if this session worked on a task entity (implementation, checklist items, subtasks), evaluate whether the task should be marked Completed. If all required checklist items are done, or remaining items are explicitly optional/deferred/moot, mark the task Completed now. Also check whether completing a subtask means a parent task should be updated. If uncertain, surface it as a follow-up action rather than leaving a stale "In Progress" status.
- **Follow-up tasks** — consider what tasks naturally follow from this session's work, including:
  - Incomplete work that needs to be continued
  - Next steps that the completed work enables or reveals
  - Related improvements or refactors noticed during the session
  - Deferred questions, decisions, or TODOs that were set aside
  - Tests or validation that should be run against changes made

For commits and task status updates: proceed without asking for approval -- the user invoked wrap-up to finalize the session. For other cleanup actions (deleting files, merging worktrees), recommend and execute after confirmation. For anything that cannot be completed now, capture it in the continuation prompt. If everything is clean and no follow-up is needed, omit the continuation prompt section entirely.

</instructions>

<output_format>

Keep the report short. Omit sections that have nothing to report.

```
## Session Wrap-Up

### Actions Recommended
[Bulleted list of specific cleanup/follow-up actions, or "None — session is clean."]

### Continuation Prompt

~~~
[A ready-to-paste prompt for a new session that captures any remaining work. Include specific file paths, task references, and enough context to resume independently. Omit this section entirely if no continuation is needed.]
~~~
```

</output_format>
