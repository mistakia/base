---
title: Prepare Session Wrap-Up
type: workflow
description: >-
  Token-efficient pre-archive workflow that reflects on session work to identify remaining cleanup
  actions and produces a continuation prompt for follow-up
base_uri: sys:system/workflow/prepare-session-wrap-up.md
created_at: '2026-02-13T00:00:00.000Z'
entity_id: f7a1b2c3-4d5e-6f78-9a0b-c1d2e3f4a5b6
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

Based on what you know you've done in this session and the tasks you were given, consider whether any of the following apply:

- **Uncommitted changes** — files you created or edited that should be committed or staged
- **Temporary artifacts** — scratch files, temp outputs, or debug additions that should be cleaned up
- **Worktree cleanup** — feature branches or worktrees created during the session that should be merged or removed
- **Multi-machine sync** — changes to entities, configs, services, or scheduled commands that need to be pushed or deployed to the storage server
- **Follow-up tasks** — consider what tasks naturally follow from this session's work, including:
  - Incomplete work that needs to be continued
  - Next steps that the completed work enables or reveals
  - Related improvements or refactors noticed during the session
  - Deferred questions, decisions, or TODOs that were set aside
  - Tests or validation that should be run against changes made

If any apply, recommend specific actions. If the user agrees, execute what can be done in this session. For anything that cannot be completed now, capture it in the continuation prompt. If everything is clean and no follow-up is needed, omit the continuation prompt section entirely.

</instructions>

<output_format>

Keep the report short. Omit sections that have nothing to report.

```
## Session Wrap-Up

### Actions Recommended
[Bulleted list of specific cleanup/follow-up actions, or "None — session is clean."]

### Continuation Prompt
> [A ready-to-paste prompt for a new session that captures any remaining work. Include specific file paths, task references, and enough context to resume independently. Omit this section entirely if no continuation is needed.]
```

</output_format>
