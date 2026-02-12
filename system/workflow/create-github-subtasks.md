---
title: Create GitHub Subtasks
type: workflow
description: Workflow for creating and linking GitHub subtasks using GraphQL API
base_uri: sys:system/workflow/create-github-subtasks.md
created_at: '2025-08-16T17:56:08.552Z'
entity_id: 579e1bc3-3509-46c2-859d-9b726bbc3f1a
observations:
  - '[workflow] GraphQL API required for proper sub-issue relationships'
  - '[efficiency] CLI with GraphQL mutations provides reliable sub-issue linking'
  - '[structure] Parent-child relationships improve task organization'
relations:
  - related_to [[sys:system/guideline/create-github-subtasks.md]]
  - follows [[sys:system/guideline/write-workflow.md]]
updated_at: '2026-01-05T19:24:56.454Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
---

<task>
Create proper sub-issue relationships in GitHub using the GraphQL API to link issues as parent-child tasks.
</task>

<context>
The GitHub CLI's standard commands do not support linking issues as subtasks. This workflow enables proper sub-issue relationships using GitHub's GraphQL API.

Prerequisites:

- GitHub CLI (`gh`) installed and authenticated
- Access to both parent and sub-issue repositories
- Parent and subtask issues must be created before linking
  </context>

<instructions>
## Step 1: Create Issues

Create all required issues using standard GitHub CLI commands:

```bash
# Create parent issue
gh issue create --repo OWNER/REPO --title "Parent Issue" --body "Description"

# Create subtask issues
gh issue create --repo OWNER/SUBTASK_REPO --title "Subtask 1" --body "Description"
```

## Step 2: Retrieve Issue Node IDs

Get the GraphQL node IDs for both parent and subtask issues:

```bash
# Get parent issue node ID
gh issue view ISSUE_NUMBER --repo OWNER/REPO --json id,number,title

# Get subtask issue node ID
gh issue view SUBTASK_NUMBER --repo OWNER/SUBTASK_REPO --json id,number,title
```

Note: Node IDs will be in format `I_kwDO...` for issues

## Step 3: Link Subtasks to Parent

Use the `addSubIssue` mutation to establish the parent-child relationship:

```bash
gh api graphql -f query='
mutation {
  addSubIssue(input: {
    issueId: "PARENT_ISSUE_NODE_ID"
    subIssueId: "SUBTASK_ISSUE_NODE_ID"
  }) {
    issue {
      id
      title
    }
    subIssue {
      id
      title
    }
  }
}'
```

## Step 4: Verify Relationships

Confirm that subtasks were properly linked:

```bash
gh api graphql -f query='
query {
  repository(owner: "OWNER", name: "REPO") {
    issue(number: PARENT_ISSUE_NUMBER) {
      subIssues(first: 10) {
        totalCount
        nodes {
          id
          title
          number
        }
      }
    }
  }
}'
```

## Handling Multiple Subtasks

For multiple subtasks, repeat Step 3 for each subtask using the same parent ID with different subtask IDs.

## Cross-Repository Subtasks

When linking issues across different repositories:

```bash
gh api graphql -f query='
mutation {
  addSubIssue(input: {
    issueId: "I_kwDOJSupcM67eVMm"  # Parent in properties repo
    subIssueId: "I_kwDOJSvRxM67eZDL"  # Subtask in personal repo
  }) {
    issue { id title }
    subIssue { id title }
  }
}'
```

## Error Handling

- **Authentication Issues**: If mutations fail, refresh authentication:
  ```bash
  gh auth refresh -s project --hostname github.com
  ```
- **Invalid IDs**: Ensure node IDs are in correct format (`I_kwDO...`)
- **Common Mistake**: Do NOT use issue numbers - always use node IDs from GraphQL
  </instructions>

<output_format>
Successfully linked subtasks should return:

- Confirmation of parent issue ID and title
- Confirmation of each linked subtask ID and title
- Verification query showing all linked subtasks under the parent issue
  </output_format>
