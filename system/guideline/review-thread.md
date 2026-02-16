---
title: Review Thread Entity
type: guideline
description: Ensure thread entities comply with thread metadata schema
base_uri: sys:system/guideline/review-thread.md
created_at: '2025-08-24T20:46:00.000Z'
entity_id: 3ca7b197-7d6c-4749-91bb-a502875bdc1d
observations:
  - '[entity] Thread entities require proper metadata management'
  - '[schema] Thread metadata values must comply with the thread metadata schema specification'
  - '[archival] Thread archival must follow proper lifecycle management with appropriate reasons'
public_read: true
relations:
  - applies [[sys:system/text/thread-metadata-schema.json]]
  - related_to [[sys:system/guideline/thread-archival-evaluation-standards.md]]
updated_at: '2026-01-05T19:25:17.996Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
visibility_analyzed_at: '2026-02-16T04:29:09.134Z'
---

# Review Thread Entity

## Purpose

Ensure `thread` entities comply with the thread metadata schema specification during execution and maintain proper lifecycle management from creation through archival.

## Thread Schema Compliance

### Metadata Management

- Thread metadata MUST use only values from schema enumeration where specified
- Required fields (thread_id, user_public_key, session_provider, thread_state, created_at, updated_at) MUST always be present
- When beginning execution, set thread_state to "active" if not already set
- Update metadata throughout execution to reflect current state

### Title and Description Standards

- Thread titles MUST be action-oriented and specific, describing the primary objective (e.g., "Implement user authentication system" not "auth work")
- Titles SHOULD aim to be globally unique across the repository's history (including archived threads) to avoid ambiguity and improve searchability
- Thread descriptions MUST include context about the thread's purpose, expected outcomes, and current status in 1-3 sentences
- Titles SHOULD be updated when thread scope significantly changes or upon completion to reflect actual work done
- Descriptions SHOULD be set at thread creation and MAY be updated during the thread lifecycle; they MUST be updated at least once upon archival to document final outcomes, key decisions, and any incomplete items
- Metadata updates SHOULD preserve historical context while accurately reflecting current state

### Property Validation

- Validate all thread properties against schema
- Ensure datetime fields use proper ISO 8601 format where specified
- Verify enum values (session_provider, thread_state, archive_reason) match schema definitions
- Update `updated_at` timestamp whenever metadata changes
- Set `archived_at` timestamp when thread_state changes to "archived"
- Ensure conditional requirements: Base sessions need `workflow_base_uri`, external sessions need `external_session` object

### Session Provider Compliance

- For `session_provider: "base"`: MUST include `workflow_base_uri` referencing specific workflow
- For external providers (claude, cursor, openai): MUST include `external_session` object with required fields
- Inference provider and model information SHOULD be captured when available
- Tool arrays SHOULD accurately reflect available capabilities

## Thread Archival Standards

For evaluation criteria to determine if a thread is ready for archival, see [[sys:system/guideline/thread-archival-evaluation-standards.md]].

### Archival Process

- All archived threads MUST have their title and description updated to reflect final state and outcomes before archival
- Archive operations MUST preserve thread_id, user_public_key, and created_at fields without modification
- Set `thread_state` to "archived", `archived_at` to current timestamp, and appropriate `archive_reason`
- Final metadata update MUST document completion status, key decisions made, and any incomplete items for future reference

### Data Preservation

- Worktree paths and git references SHOULD be documented if relevant to future work
