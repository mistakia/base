---
title: Update GitHub Issue
type: workflow
description: >-
  Workflow for updating GitHub issue status, priority, and other project fields, then syncing
  changes to local task entities
created_at: '2026-01-28T18:35:11.326Z'
entity_id: 4a302041-5bc9-48ac-a014-cb277a846981
public_read: true
updated_at: '2026-01-28T18:35:11.326Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
relations:
  - references [[user:text/github-project-reference.md]]
---

<task>Update a GitHub issue's project fields (status, priority) and sync the changes to the local task entity</task>

<context>
When a task's status or priority changes, the GitHub project item fields should be updated and the local task entity should be synced to reflect the changes.

See [[user:text/github-project-reference.md]] for project IDs, field IDs, and option IDs.
</context>

<instructions>

## Quick Reference

```bash
# 1. Verify current state
gh issue view <NUMBER> --repo <OWNER>/<REPO> --json state,title,projectItems

# 2. Get project item ID
ITEM_ID=$(gh issue view <NUMBER> --repo <OWNER>/<REPO> --json projectItems --jq '.projectItems[0].id')

# 3. Update field (see field/option IDs in github-project-reference.md)
gh project item-edit \
  --project-id <PROJECT_ID> \
  --id "$ITEM_ID" \
  --field-id <FIELD_ID> \
  --single-select-option-id <OPTION_ID>

# 4. Sync to local task
cd "$USER_BASE_DIRECTORY/repository/active/base"
node cli/github/import-github-issues.mjs --owner <OWNER> --repo <REPO> --force
# If the issue is part of a project, also run the project import to sync project field values (status, priority)
node cli/github/import-github-project-issues.mjs --username <USERNAME> --project <PROJECT_NUMBER> --force

# 5. Review and commit changes
cd "$USER_BASE_DIRECTORY"
git diff task/github/<OWNER>/<REPO>/
git add task/github/<OWNER>/<REPO>/<ISSUE_NUMBER>-*.md
git commit -m "Update <OWNER>/<REPO>#<NUMBER> <field>: <value>"
```

## Detailed Steps

### Step 1: Verify Current State

Check the issue's current state and project fields:

```bash
gh issue view <NUMBER> --repo <OWNER>/<REPO> --json state,title,projectItems
```

This shows:

- Current issue state (OPEN/CLOSED)
- Project item status and other field values

### Step 2: Get Project Item ID

Extract the project item ID needed for field updates:

```bash
ITEM_ID=$(gh issue view <NUMBER> --repo <OWNER>/<REPO> --json projectItems --jq '.projectItems[0].id')
echo "Item ID: $ITEM_ID"
```

### Step 3: Determine Target Project

Select the correct project based on repository:

| Repository        | Project               | Project ID             |
| ----------------- | --------------------- | ---------------------- |
| `mistakia/league` | xo.football           | `PVT_kwHOABvSe84AnvdN` |
| All others        | Trashman Task Manager | `PVT_kwHOABvSe84AEC2_` |

### Step 4: Update Project Fields

#### Update Status

**Trashman Task Manager:**

```bash
gh project item-edit \
  --project-id PVT_kwHOABvSe84AEC2_ \
  --id "$ITEM_ID" \
  --field-id PVTSSF_lAHOABvSe84AEC2_zgCVGU8 \
  --single-select-option-id <STATUS_OPTION_ID>
```

Status options:

- `c375e804` - Planned
- `b51ad221` - Started
- `a02071b2` - In Progress
- `79238c70` - Waiting
- `bf9f1438` - Paused
- `771cc6b4` - Blocked
- `ba6df36d` - Completed
- `79d53ec0` - Cancelled
- `ddc8ec73` - Abandoned

#### Update Priority

**Trashman Task Manager:**

```bash
gh project item-edit \
  --project-id PVT_kwHOABvSe84AEC2_ \
  --id "$ITEM_ID" \
  --field-id PVTSSF_lAHOABvSe84AEC2_zgJLWuI \
  --single-select-option-id <PRIORITY_OPTION_ID>
```

Priority options:

- `9d9c8fcb` - 1 none
- `bb44ba6a` - 2 low
- `3b8ed815` - 3 medium
- `708e84f9` - 4 high
- `28108358` - 5 critical

### Step 5: Verify Update

Confirm the field was updated:

```bash
gh issue view <NUMBER> --repo <OWNER>/<REPO> --json projectItems
```

### Step 6: Sync Local Task Entity

First, run the repo import to sync basic issue data (title, description, state, labels, comments):

```bash
cd "$USER_BASE_DIRECTORY/repository/active/base"
node cli/github/import-github-issues.mjs --owner <OWNER> --repo <REPO> --force
```

If the issue is part of a project, also run the project import to sync project field values (status, priority, dates). The project import uses GraphQL and is the only path that captures project-specific fields.

Project number mapping:

- Trashman Task Manager = project `1` (username: `mistakia`)
- xo.football = project `2` (username: `mistakia`)

```bash
node cli/github/import-github-project-issues.mjs --username <USERNAME> --project <PROJECT_NUMBER> --force
```

### Step 7: Review and Commit Changes

Review the changes:

```bash
cd "$USER_BASE_DIRECTORY"
git diff task/github/<OWNER>/<REPO>/
```

Commit the sync:

```bash
git add task/github/<OWNER>/<REPO>/<ISSUE_NUMBER>-*.md
git commit -m "Update <OWNER>/<REPO>#<NUMBER> <field>: <value>"
```

## Common Update Scenarios

### Mark as In Progress

```bash
ITEM_ID=$(gh issue view 42 --repo mistakia/nano-community --json projectItems --jq '.projectItems[0].id')
gh project item-edit --project-id PVT_kwHOABvSe84AEC2_ --id "$ITEM_ID" \
  --field-id PVTSSF_lAHOABvSe84AEC2_zgCVGU8 --single-select-option-id a02071b2
```

### Increase Priority to High

```bash
ITEM_ID=$(gh issue view 42 --repo mistakia/nano-community --json projectItems --jq '.projectItems[0].id')
gh project item-edit --project-id PVT_kwHOABvSe84AEC2_ --id "$ITEM_ID" \
  --field-id PVTSSF_lAHOABvSe84AEC2_zgJLWuI --single-select-option-id 708e84f9
```

### Update Multiple Fields

Run multiple `item-edit` commands sequentially:

```bash
ITEM_ID=$(gh issue view 42 --repo mistakia/nano-community --json projectItems --jq '.projectItems[0].id')

# Set status to In Progress
gh project item-edit --project-id PVT_kwHOABvSe84AEC2_ --id "$ITEM_ID" \
  --field-id PVTSSF_lAHOABvSe84AEC2_zgCVGU8 --single-select-option-id a02071b2

# Set priority to High
gh project item-edit --project-id PVT_kwHOABvSe84AEC2_ --id "$ITEM_ID" \
  --field-id PVTSSF_lAHOABvSe84AEC2_zgJLWuI --single-select-option-id 708e84f9
```

## Error Handling

- **Item not found**: Ensure issue is added to the project first
- **Field ID invalid**: Verify field IDs from [[user:text/github-project-reference.md]]
- **Auth errors**: Run `gh auth refresh -s project --hostname github.com`

</instructions>
