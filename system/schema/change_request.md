---
title: Change Request
type: type_definition
description: Defines the structure for a change request to the knowledge base.
extends: base
tags: [system, workflow, git]
properties:
  - name: change_request_id
    type: string
    format: uuid
    required: true
    description: Unique identifier for the change request.
  - name: status
    type: string
    enum:
      - Draft
      - PendingReview
      - NeedsRevision
      - Approved
      - Rejected
      - Merged
      - Closed
    required: true
    description: The current lifecycle status of the change request.
  - name: creator_id
    type: string
    required: true
    description: Identifier for the user or system process that created the request.
  - name: target_branch
    type: string
    required: true
    description: The name of the Git branch the changes are intended for (e.g., 'main').
  - name: feature_branch
    type: string
    required: true
    description: The name of the Git feature branch containing the proposed changes.
  - name: github_pr_url
    type: string
    format: url
    required: false
    description: URL of the associated GitHub Pull Request, if any.
  - name: github_pr_number
    type: integer
    required: false
    description: Number of the associated GitHub Pull Request, if any.
  - name: github_repo
    type: string
    required: false
    description: The GitHub repository associated with the PR (format 'owner/repo').
  - name: related_thread_id
    type: string
    format: uuid
    required: false
    description: ID of the worker thread that generated this request, if applicable.
  - name: merged_at
    type: string
    format: date-time
    required: false
    description: Timestamp when the change request was merged.
  - name: closed_at
    type: string
    format: date-time
    required: false
    description: Timestamp when the change request was closed (if not merged).
observations:
  - '[design] Represents a proposed set of changes to knowledge base files.'
  - '[workflow] Integrates with Git branching and optionally GitHub Pull Requests.'
  - '[storage] Stored as both a DB record and a Markdown file for discoverability.'
relations:
  - 'relates_to [[System Design]]'
  - 'relates_to [[Knowledge Base Schema]]'
---

# Change Request Schema

This schema defines the structure for `change_request` items within the knowledge base. Change requests are used to propose, track, and manage modifications to files stored under version control (Git).

## Purpose

- **Track Changes:** Provides a record of proposed modifications.
- **Review Workflow:** Facilitates review and approval processes, potentially integrating with GitHub Pull Requests.
- **Atomicity:** Associates a set of file changes with a specific Git feature branch.

## Usage

Change request items are typically created automatically by tools or worker threads when proposing modifications to knowledge base files. They are stored as Markdown files in `data/change_requests/` and have corresponding records in the `change_requests` database table for status tracking and querying.

### Example Frontmatter

```yaml
---
title: 'Update JavaScript Guidelines for Async/Await'
type: change_request
change_request_id: 'a1b2c3d4-e5f6-7890-1234-567890abcdef'
status: 'PendingReview'
creator_id: 'user-uuid-or-system-id'
created_at: '2025-04-06T14:30:00Z'
updated_at: '2025-04-06T14:30:00Z'
target_branch: 'main'
feature_branch: 'cr/a1b2c3d4-e5f6-7890-1234-567890abcdef'
description: 'Proposes updates to the async/await section of the JS guidelines.'
tags: [guideline, javascript, refactor]
# Optional GitHub fields if PR was created
# github_pr_url: "https://github.com/owner/repo/pull/123"
# github_pr_number: 123
# github_repo: "owner/repo"
---
Detailed description of the changes can go here in the Markdown body...
```
