---
title: Fix Entity Validation Errors
type: workflow
description: >-
  Diagnose and fix structural entity validation errors reported by validate-filesystem-markdown.mjs:
  schema compliance, reference integrity, enum values, and required fields
base_uri: sys:system/workflow/fix-entity-validation-errors.md
created_at: '2026-01-13T16:30:00.000Z'
entity_id: eebd75c2-64ed-42c3-8283-e21af7323b92
public_read: true
relations:
  - implements [[sys:system/schema/workflow.md]]
  - follows [[sys:system/guideline/write-workflow.md]]
  - uses [[sys:cli/validate-filesystem-markdown.mjs]]
  - uses [[sys:cli/update-entity-fields.mjs]]
updated_at: '2026-03-14T00:00:00.000Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
visibility_analyzed_at: '2026-02-16T04:40:07.174Z'
---

<task>Fix structural entity validation errors reported by the filesystem markdown validator</task>

<context>

**Validation Command:**

```bash
base entity validate --exclude-path-patterns "repository/**"
```

**Scope:** This workflow covers structural schema errors caught by the generic validator: missing required fields, invalid enums, broken references, malformed relations. For type-specific content quality checks (description quality, guideline-required fields, relation cardinality), use the appropriate type-specific validation workflow instead (e.g., [[user:workflow/validate-physical-item.md]] for physical items).

**Key References:**

- [[sys:system/schema/entity.md]] - Base entity schema (entity_id must be UUID format)
- [[sys:system/schema/task.md]] - Task schema with status/priority enum values
- [[sys:system/schema/physical-item.md]] - Physical item schema with enum fields (importance, frequency_of_use)
- [[user:repository/active/base/cli/update-entity-fields.mjs]] - Auto-fix missing required fields
- [[user:repository/active/base/cli/move-entity.mjs]] - Rename/move entities with reference updates

</context>

<instructions>

## Error Categories and Fixes

### Invalid Enum Values (status, priority)

**Task status values** (Title Case required):
`No status`, `Waiting`, `Paused`, `Planned`, `Started`, `In Progress`, `Completed`, `Abandoned`, `Blocked`

**Task priority values** (Title Case required):
`None`, `Low`, `Medium`, `High`, `Critical`

**Fix:** Edit frontmatter to use exact case from schema.

### Missing Required Fields

**Required fields:** `entity_id` (UUID), `user_public_key`, `created_at`, `updated_at`

**Fix:** Run `node cli/update-entity-fields.mjs` to auto-populate missing fields.

### Invalid entity_id Pattern

**Requirement:** entity_id must be valid UUID format (e.g., `a1b2c3d4-e5f6-7890-abcd-ef1234567890`)

**Fix:** Generate UUID with `uuidgen | tr '[:upper:]' '[:lower:]'` and update frontmatter.

### Reference/Relation Not Found

**Symptoms:**

- `Reference not found: user:text/some-file.md`
- `Relation target entity not found: user:task/some-task.md`
- `property tag not found: user:tag/some-tag.md`

**Diagnosis - Extensive Search Required:**

1. Extract filename from reference (e.g., `some-file.md` from `user:text/some-file.md`)
2. Search with multiple glob patterns:
   - `**/*some-file*.md` - partial filename match
   - `**/*some*file*.md` - word variations
   - Search parent directories of expected path
3. Search for similar names that may indicate rename
4. Check git history if file may have been deleted: `git log --all --full-history -- "**/filename*"`

**Resolution (existing files only):**

- If found at different path: update reference to correct path
- If tag missing: find closest existing tag in `tag/*.md` directory
- If file confirmed deleted: remove the stale reference and report it

**Never create new files to resolve validation errors.** All resolutions must point to existing entities.

### Remote URI Resolution Errors

**Symptom:** `Cannot resolve remote URI to local path: git://github.com/...`

**Fix:** Replace with local repository path (e.g., `user:repository/active/league`)

### Invalid Enum Values (physical_item)

**Physical item importance values:**
`Core`, `Standard`, `Premium`, `Potential`

**Physical item frequency_of_use values:**
`Daily`, `Weekly`, `Infrequent`

**Fix:** Edit frontmatter to use exact case from schema.

## Resolution Process

1. Run `base entity validate --exclude-path-patterns "repository/**"` to get error list
2. Group errors by category
3. Fix enum values first (simple edits)
4. Run `update-entity-fields.mjs` for missing fields
5. For missing references, perform extensive search:
   - Multiple glob patterns with partial matches
   - Check all subdirectories of expected location
   - Search git history for deleted files
6. Update paths for files found at different locations
7. For confirmed missing files: remove stale reference and document in report
8. Re-run validation to verify fixes
9. Present stale references report to user for awareness

**After structural validation is clean**, run type-specific content quality workflows for guideline compliance (e.g., [[user:workflow/validate-physical-item.md]]).

## Decision Standards

| Scenario                   | Resolution                                                          |
| -------------------------- | ------------------------------------------------------------------- |
| Tag doesn't exist          | Find and use closest existing tag from `tag/*.md`                   |
| File reference not found   | Extensive search; if confirmed missing, remove reference and report |
| Remote git:// URI          | Convert to local `user:repository/active/...` path                  |
| Multiple valid enum values | Follow schema exactly (case-sensitive)                              |
| Stale reference confirmed  | Remove from file, add to stale references report                    |

**Principle:** Never create files to fix validation errors. Resolve only to existing entities or remove stale references.

</instructions>

<output_format>

**Validation Results:**

- Initial errors: [count]
- Final errors: [count]

**Fixes Applied:**

| Category          | Count | Files               |
| ----------------- | ----- | ------------------- |
| Enum case         | N     | file1.md, file2.md  |
| Missing fields    | N     | (auto-fixed by CLI) |
| Updated paths     | N     | file3.md, file4.md  |
| Invalid entity_id | N     | file5.md            |

**Stale References Removed:**

| Source File | Removed Reference       | Search Performed             | Reason                  |
| ----------- | ----------------------- | ---------------------------- | ----------------------- |
| file.md     | `user:text/old-file.md` | `**/*old-file*`, git history | File deleted, not moved |
| file2.md    | `user:tag/old-tag.md`   | `tag/*.md` listing           | Tag never existed       |

**Remaining Issues:** (if any)

- [Issue and reason it cannot be auto-fixed]

</output_format>
