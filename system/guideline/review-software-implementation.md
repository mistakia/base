---
title: 'Review Software Implementation'
type: 'guideline'
description: |
  Standards for reviewing software implementations during code review process
created_at: '2025-08-02T00:00:00.000Z'
entity_id: 'b3c4d5e6-7f8g-9012-bcde-345678901234'
workflows:
  - 'sys:system/workflow/review-software-implementation.md'
relations:
  - 'supports [[sys:system/workflow/review-software-implementation.md]]'
  - 'related_to [[sys:system/guideline/write-javascript.md]]'
tags:
  - code-review
  - quality
updated_at: '2025-08-02T00:00:00.000Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
---

Standards for reviewing code during implementation reviews.

### Development Artifacts

- Debug scripts and exploration files MUST be removed from production branches
- Temporary test files MUST be cleaned up before code review completion
- Sample data files SHOULD be removed unless specifically needed for documentation
- Files with naming patterns like debug-_, test-_, explore-\* require review for necessity
- comments referencing removed functionality MUST be deleted
  - keep migration context in implementation plans and commit messages instead

### Code Duplication Prevention

- Duplicate code MUST be identified and eliminated before completion
- New implementations MUST be checked against existing codebase for overlap
- Similar functionality SHOULD be consolidated into reusable components
- Code patterns SHOULD leverage existing utilities rather than reimplementing

### Readability and Maintainability

- Code SHOULD be reviewed for opportunities to improve clarity and understanding
- Complex logic SHOULD be broken down into smaller, well-named functions
- Comments SHOULD explain the "why" not just the "what" for non-obvious code
- Function and variable names SHOULD clearly communicate their purpose
