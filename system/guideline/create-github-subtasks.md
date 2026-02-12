---
title: Create GitHub Subtasks
type: guideline
description: Standards for creating and linking GitHub subtasks using GraphQL API
base_uri: sys:system/guideline/create-github-subtasks.md
created_at: '2025-06-14T03:23:56.076Z'
entity_id: 6931e7f9-4088-42fb-af97-64e00ecce85e
globs:
  - .claude/commands/**/*.md
  - workflow/**/*github*.md
observations:
  - '[standard] GraphQL API required for proper sub-issue relationships #github'
  - '[principle] CLI with GraphQL mutations provides reliable sub-issue linking #automation'
  - '[convention] Parent-child relationships improve task organization #hierarchy'
relations:
  - related_to [[sys:system/workflow/create-github-subtasks.md]]
  - follows [[sys:system/guideline/write-guideline.md]]
tags:
  - user:tag/base-project.md
updated_at: '2025-08-16T18:28:11.390Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
---

# Create GitHub Subtasks

## Purpose

This guideline defines standards for creating and linking GitHub subtasks using the GraphQL API, which enables proper parent-child issue relationships not available through standard GitHub CLI commands.

## Standards

### API Requirements

- GitHub subtasks MUST be created using the GraphQL API
- The `addSubIssue` mutation MUST be used to establish parent-child relationships
- Standard GitHub CLI commands MUST NOT be used for linking as they do not support sub-issue relationships

### Issue Creation Standards

- Parent and subtask issues MUST be created before linking
- Issues MAY be in different repositories
- Cross-repository subtasks MUST use proper repository owner and name identification

### Node ID Requirements

- GraphQL node IDs MUST be retrieved using `gh issue view --json id`
- Node IDs MUST be in format `I_kwDO...` for issues
- Issue numbers MUST NOT be used in place of node IDs
- Each subtask MUST be linked individually using its unique node ID

### Authentication Requirements

- GitHub CLI MUST be authenticated with appropriate permissions
- Project scope MUST be included in authentication for GraphQL mutations
- Failed mutations SHOULD trigger authentication refresh using `gh auth refresh -s project --hostname github.com`

### Verification Standards

- Sub-issue relationships MUST be verified after creation
- Verification queries SHOULD return total count and node details
- Failed linkages MUST be identified and corrected

## Principles

### Hierarchical Organization

- Parent-child relationships improve task organization and tracking
- Complex tasks SHOULD be broken down into manageable subtasks
- Subtask completion SHOULD contribute to parent issue progress

### Cross-Repository Support

- Subtasks MAY span multiple repositories when logically related
- Repository boundaries MUST NOT prevent proper task organization
- Proper identification MUST be maintained across repository boundaries

## Quality Criteria

### Successful Implementation

- All specified subtasks are properly linked to parent issue
- Verification queries return expected relationships
- No authentication or permission errors occur
- Cross-repository links function correctly when applicable

### Acceptable Standards

- Link creation completes without GraphQL errors
- Parent issue displays connected subtasks
- Individual subtasks reference parent relationship
- All node IDs resolve correctly in API responses
