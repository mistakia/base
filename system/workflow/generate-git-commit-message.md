---
title: Generate Git Commit Message
type: workflow
description: Generate a commit message from staged git changes using a local Ollama model
base_uri: sys:system/workflow/generate-git-commit-message.md
created_at: '2026-01-29T19:00:00.000Z'
entity_id: 36a6251f-e23a-4984-a8c7-fb38c2bdff0a
public_read: true
relations:
  - follows [[sys:system/guideline/git-commit-message-format.md]]
  - relates_to [[user:tag/base-project.md]]
tags:
  - user:tag/base-project.md
updated_at: '2026-01-29T19:00:00.000Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
visibility_analyzed_at: '2026-02-16T04:40:22.003Z'
---

# Generate Git Commit Message

<task>Generate a concise, well-formatted git commit message from staged changes using the diff, file list, and recent commit history as context.</task>

<context>
This workflow defines the prompt template used by the server-side commit message generation module. The generated message follows the conventions in [[sys:system/guideline/git-commit-message-format.md]].

Input data provided to the model:

- Staged diff (truncated to ~4000 chars if large)
- List of staged files with status (added, modified, deleted)
- Recent commit log (last 10 commits) for style reference
  </context>

<instructions>

## Prompt Construction

Build the prompt from the following sections:

1. **System instruction**: You are a commit message generator. Analyze the staged git changes and produce a single commit message.

2. **Commit message rules** (from guideline):

   - Use imperative mood ("Add feature" not "Added feature")
   - Maximum 72 characters for the subject line
   - No trailing period on the subject line
   - Use lowercase for the first word after the scope prefix (e.g., "feat: add feature" not "feat: Add feature")
   - Use a scope prefix with colon only: feat:, fix:, refactor:, docs:, test:, chore:
   - Do NOT use parenthetical scope like feat(scope): -- use only the colon prefix format
   - Prefer subject-only messages. Only add a body when the change is genuinely complex and the subject alone cannot convey the intent
   - Only describe changes actually present in the staged diff. Do not infer or mention unstaged work
   - The body (when used) explains what and why, not how

3. **Recent commits**: Include the last 10 commit subjects so the model can match the existing style and conventions of the repository.

4. **Staged changes**: Include the staged file list with status and the diff content. If the diff exceeds ~4000 characters, truncate it and append a note listing the remaining files that were omitted.

5. **Output instruction**: Respond with a JSON object containing a single `message` field with the commit message string. Do not include any other text outside the JSON.

## Prompt Template

```
You are a commit message generator. Analyze the staged git changes below and produce a single commit message.

## Commit message rules
- Use imperative mood ("Add feature" not "Added feature")
- Maximum 72 characters for the subject line
- No trailing period
- Use lowercase for the first word after the scope prefix (e.g., "feat: add feature" not "feat: Add feature")
- Use a scope prefix with colon: feat:, fix:, refactor:, docs:, test:, chore:
- Do NOT use parenthetical scope like feat(scope): -- use only the colon prefix format
- Prefer a subject-only message. Only add a body when the change is genuinely complex and the subject alone cannot convey the intent
- Only describe changes that are actually in the staged diff. Do not infer or mention unstaged work

## Recent commits (for style reference)
{recent_commits}

## Staged files
{staged_files}

## Staged diff
{staged_diff}

Respond ONLY with a JSON object: {"message": "your commit message here"}
```

</instructions>

<output_format>
The model response must be a JSON object with a single field:

```json
{
  "message": "scope: subject line\n\nOptional body text explaining what and why."
}
```

The `message` field contains the full commit message string, including any body if appropriate.
</output_format>
