---
title: Git Commit Message Format
type: guideline
description: Standards for writing clear, consistent git commit messages
base_uri: sys:system/guideline/git-commit-message-format.md
created_at: '2026-01-29T18:30:00.000Z'
entity_id: a009b096-7997-4157-93f9-8d24a38fc4fd
public_read: true
relations:
  - relates_to [[sys:system/guideline/write-software.md]]
updated_at: '2026-01-29T18:30:00.000Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
---

# Git Commit Message Format

## Subject Line

- Use imperative mood ("Add feature" not "Added feature" or "Adds feature")
- Maximum 72 characters
- No trailing period
- Capitalize the first word
- Be specific about what changed

## Body (optional)

- Separate from subject with a blank line
- Wrap at 72 characters
- Explain what and why, not how
- Use when the subject alone is insufficient to convey the change

## Scope Indicators

Use lowercase prefix words to indicate the area of change:

- `feat:` -- new functionality
- `fix:` -- bug fix
- `refactor:` -- code restructuring without behavior change
- `docs:` -- documentation only
- `test:` -- adding or updating tests
- `chore:` -- build, tooling, or maintenance tasks

## Examples

Good:

- `feat: add commit message generation endpoint`
- `fix: correct staged file count in commit section`
- `refactor: extract diff truncation into shared utility`

Bad:

- `updated stuff` (vague, no scope)
- `Fix bug.` (trailing period, no specifics)
- `Added the new feature for generating commit messages using AI models` (too long, past tense)
