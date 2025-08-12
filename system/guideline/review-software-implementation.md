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

# Review Software Implementation

Standards for reviewing code during implementation reviews.

## Code Comments

### Remove Migration Artifacts

Comments referencing removed functionality MUST be deleted:

- References to replaced systems (e.g., "Removed database transaction")
- Migration notes that provide no ongoing value
- Historical implementation details

Keep migration context in implementation plans and commit messages instead.
