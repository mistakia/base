---
title: Thread Archival Evaluation Standards
type: guideline
description: Standards for evaluating thread archive readiness with certainty-based confidence
base_uri: sys:system/guideline/thread-archival-evaluation-standards.md
created_at: '2025-12-31T00:00:00.000Z'
entity_id: f8a2c3d1-9e4b-5f6a-8c7d-2e1f0a3b4c5d
observations:
  - '[safety] Default to human review prevents premature archival of valuable work'
  - '[simplicity] Binary confidence model avoids false precision'
  - '[continuity] Follow-up identification ensures work is not lost even after archival'
relations:
  - related_to [[sys:system/guideline/review-thread.md]]
  - implements [[sys:system/text/thread-metadata-schema.json]]
  - follows [[sys:system/guideline/starting-point-philosophy.md]]
updated_at: '2026-01-05T19:25:17.447Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
---

# Thread Archival Evaluation Standards

## Purpose

Define the criteria for evaluating whether a thread is ready for archival. This guideline prioritizes certainty over efficiency - threads SHOULD only be archived when there is no doubt about completion status.

## Core Principles

1. **Default to human review**: Unless certainty is achieved, recommend human review rather than archival
2. **Read-only evaluation**: Gather information, assess, and report - never modify the thread or execute follow-up actions
3. **Preserve continuity**: Identify potential follow-up work so nothing is lost even after archival
4. **Provide actionable links**: Always output a clickable link (e.g., `http://localhost:8081/thread/<id>`) for threads needing human review

## Scope

This guideline applies to regular user session threads. The following are excluded:

- Sub-agent threads (session_id starting with "agent-")
- System-generated threads without user interaction

## Archive Readiness

A thread is ready to archive when ALL of the following are true:

- At least one completion signal is present
- No blockers are detected
- Thread metadata adequately describes the outcome

If any criterion is not met, the thread requires human review.

## Completion Signals

Indicators suggesting work is complete:

- **Explicit completion**: Final events contain success message, "done", "complete", or "finished"
- **Terminal save/commit**: Last meaningful action is saving files or committing code
- **User confirmation**: User states task is complete, thanks assistant, or acknowledges completion
- **Objectives satisfied**: Stated goals in title/description appear achieved based on timeline
- **Worktree cleaned up**: Worktree path in metadata but directory no longer exists (work was merged)
- **Deliverables verified**: Files created by thread exist in expected locations
- **Related task completed**: Associated task entity marked as Completed
- **Todos completed**: TodoWrite shows all items marked as completed
- **Summary provided**: Assistant provided a summary or recap of work accomplished

A single strong completion signal is sufficient when no blockers are present.

**Workflow execution threads**: Threads initiated by `@workflow/` commands complete when the workflow reaches its defined end state (e.g., "Done.", final output, all todos completed). User acknowledgment is not required - workflows are designed to run autonomously.

## Blockers

Any of the following prevents automatic archival:

### Hard Blockers

- **Active worktree**: Thread-associated worktree directory still exists on disk
- **Error state**: Final timeline events show errors, failures, or exceptions
- **Explicit incomplete work**: TODO, FIXME, "will continue", or "next steps" in final content
- **Missing deliverables**: Expected outputs mentioned but not produced
- **Unanswered questions**: Assistant asked user a question with no response
- **Missing metadata**: Thread lacks title or description

### Soft Blockers (trigger human review)

- **User interruption**: Session contains "Request interrupted by user" events
- **Incomplete review**: PR or code review started but no feedback provided (e.g., PR viewed but not reviewed)
- **Abrupt ending**: Session ended without clear completion signal or user acknowledgment
- **Open PR**: Associated pull request still open or closed without merge
- **Stale branch**: Feature branch exists with no commits in 30+ days and not merged

## Confidence

Evaluation confidence is binary:

- **Certain**: All readiness criteria clearly met, no blockers, no ambiguity
- **Uncertain**: Any doubt about completion status or any blocker detected

Only threads with `certain` confidence SHOULD be recommended for automatic archival.

## Archive Reasons

When recommending archival, use one of:

- `completed`: Thread objectives were achieved
- `user_abandoned`: Thread inactive (>30 days) with no resumption value and no completion signal

## Follow-up Identification

Every evaluation SHOULD note potential follow-up work observed:

- Incomplete tasks that could become new task entities
- Learnings worth documenting elsewhere
- Connections to other entities not yet recorded
- Stale branches that should be cleaned up

These notes are informational only - the evaluation process MUST NOT execute any follow-up actions.
