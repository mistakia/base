---
title: Close GitHub Issue
type: workflow
description: Workflow for closing GitHub issues and syncing project status to local task entities
base_uri: sys:system/workflow/close-github-issue.md
created_at: '2026-01-28T17:28:53.536Z'
entity_id: 5f5fd370-70e8-4593-84c8-6e28acd27978
public_read: true
relations:
  - references [[user:text/github-project-reference.md]]
updated_at: '2026-01-28T17:32:00.000Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
visibility_analyzed_at: '2026-02-16T04:39:19.909Z'
---

<task>Close a GitHub issue and sync the changes to the local task entity</task>

<context>
When a task linked to a GitHub issue is completed, the GitHub issue should be closed and the local task entity should be updated to reflect the completion. GitHub Projects automatically update item status to "Completed" when issues are closed.
</context>

<instructions>

## Quick Reference

```bash
# 1. Verify current state
gh issue view <NUMBER> --repo <OWNER>/<REPO> --json state,projectItems

# 2. Close the issue (project status auto-updates to Completed)
gh issue close <NUMBER> --repo <OWNER>/<REPO> --comment "Completion message"

# 3. Sync to local task (required)
cd "$USER_BASE_DIRECTORY/repository/active/base"
node cli/github/import-github-issues.mjs --owner <OWNER> --repo <REPO> --force

# 4. Review and commit changes
cd "$USER_BASE_DIRECTORY"
git diff task/github/<OWNER>/<REPO>/
git add task/github/<OWNER>/<REPO>/<ISSUE_NUMBER>-*.md
git commit -m "Close <OWNER>/<REPO>#<NUMBER>"
```

## Detailed Steps

### Step 1: Verify Current State

Before closing, check the issue state and project status:

```bash
gh issue view <NUMBER> --repo <OWNER>/<REPO> --json state,title,projectItems
```

This confirms the issue is open and shows current project item status.

### Step 2: Close the GitHub Issue

Close with a completion comment:

```bash
gh issue close <NUMBER> --repo <OWNER>/<REPO> --comment "Completed - brief description of what was done"
```

**Note**: GitHub Projects configured with automation will automatically update the project item status to "Completed" when the issue is closed.

### Step 3: Verify Project Status Updated

Confirm the project item status changed:

```bash
gh issue view <NUMBER> --repo <OWNER>/<REPO> --json state,projectItems
```

Expected output shows `state: CLOSED` and project status `Completed`.

### Step 4: Sync Local Task Entity

Run the import script to sync GitHub state to local task:

```bash
cd "$USER_BASE_DIRECTORY/repository/active/base"
node cli/github/import-github-issues.mjs --owner <OWNER> --repo <REPO> --force
```

This updates the local task entity with:

- `status: Completed`
- `finished_at` timestamp
- Closing comment in `github_comments`

### Step 5: Review and Commit Changes

Review the changes to verify the sync updated correctly:

```bash
cd "$USER_BASE_DIRECTORY"
git diff task/github/<OWNER>/<REPO>/
```

Verify the diff shows expected changes (status, finished_at, github_comments). Then commit:

```bash
git add task/github/<OWNER>/<REPO>/<ISSUE_NUMBER>-*.md
git commit -m "Close <OWNER>/<REPO>#<NUMBER>"
```

### Step 6: Update Local Observations (Optional)

Add any noteworthy completion details to the task's `observations` field. These are non-linked fields that won't be overwritten by future syncs.

## Key Context

For project IDs, field IDs, and option IDs, see [[user:text/github-project-reference.md]].

### Task Entity Fields

**Linked fields** (managed via import script - do not edit directly):

- `status`, `external_id`, `finished_at`
- `github_*` fields

**Non-linked fields** (safe to edit manually):

- `observations`, `tags`, custom notes in content

### Manual Project Status Update (if needed)

If project status does not auto-update, use the IDs from [[user:text/github-project-reference.md]]:

```bash
gh project item-edit \
  --project-id <PROJECT_ID> \
  --id <ITEM_ID> \
  --field-id <STATUS_FIELD_ID> \
  --single-select-option-id <COMPLETED_OPTION_ID>
```

Get `<ITEM_ID>` from the task's `github_project_item_id` field.

</instructions>
