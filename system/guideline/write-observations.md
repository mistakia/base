---
title: Write Observations
type: guideline
description: >-
  Standards for when and how to write entity observations -- the decision log and signal capture
  mechanism of the knowledge graph
created_at: '2026-02-24T16:14:56.484Z'
entity_id: 45862edf-edf3-41f8-9f5c-ca0c246df2f1
globs:
  - '**/*.md'
public_read: false
relations:
  - follows [[sys:system/schema/entity.md]]
  - follows [[sys:system/guideline/write-documentation.md]]
updated_at: '2026-02-24T16:14:56.484Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
---

## When to Observe

Observations capture **decisions, signals, and evaluations** -- facts that accumulate over an entity's lifetime without replacing each other. Each observation adds a new data point; none supersedes the others.

**Use observations for:**

- Decisions and their rationale: why X was chosen over Y
- Evaluation results: periodic assessment outcomes with dates
- Signals and friction: navigation difficulty, repeated confusion, unexpected behavior
- Non-adopted alternatives: options considered and rejected, with reasoning

**Use the entity body instead for:**

- Status updates and progress tracking (use task checkboxes or status field)
- Content that replaces previous content (edit the body, do not append observations)
- Detailed analysis that exceeds one sentence (write a text entity and link it)

The test: if the new information makes a previous observation obsolete, it belongs in the body. If both the old and new observations remain independently true, observe.

## Format

Every observation must use the bracket-category format:

```
[category] One sentence capturing the fact.
```

The category enables programmatic filtering and scanning. Choose a category that describes the nature of the observation, not the domain. Common categories that have emerged through usage:

| Category      | Purpose                                   |
| ------------- | ----------------------------------------- |
| `decision`    | A choice made with rationale              |
| `evaluation`  | Periodic assessment result (include date) |
| `not-adopted` | Alternative considered and rejected       |
| `design`      | How something is built or structured      |
| `pattern`     | Recurring behavior or convention          |
| `friction`    | Navigation or usability difficulty        |
| `completed`   | Completion summary of a phase or task     |

This is not a closed taxonomy. New categories are fine when existing ones do not fit. Avoid generic categories like `note` or `info` -- they add no filtering value.

## Length Discipline

One sentence per observation. If the observation requires a paragraph, the content belongs in the entity body or a dedicated text entity.

Evaluation observations may be longer (2-3 sentences) when summarizing periodic assessment results, but should remain scannable. Date-prefix evaluation observations so they sort chronologically: `[evaluation] 2026-02-24 Summary of findings.`

## Consolidation

Long-lived entities (guidelines, workflows) accumulate observations over time. When adding a new observation, review existing ones:

- If two or more observations say essentially the same thing, consolidate into one
- If an older evaluation is fully superseded by a newer one, remove the older one
- Keep decision and not-adopted observations indefinitely -- they prevent re-analysis

The goal is a useful signal log, not a complete history. Thread archives preserve full history if needed.
