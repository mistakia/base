---
title: Write Entity Relations
type: guideline
description: >-
  Canonical string format for entity relations in YAML frontmatter -- rejects object-format
  relations
base_uri: sys:system/guideline/write-entity-relations.md
created_at: '2026-03-23T21:22:46.249Z'
entity_id: 884d4fc4-7048-44d0-a44d-72ddff44c144
globs:
  - task/**/*.md
  - text/**/*.md
  - workflow/**/*.md
  - guideline/**/*.md
  - tag/**/*.md
public_read: false
relations:
  - implements [[sys:system/schema/entity.md]]
  - relates [[sys:system/guideline/create-task-relationships.md]]
updated_at: '2026-03-23T21:22:46.249Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
---

## Relation String Format

Every entry in the `relations` array MUST be a plain string. The system validates this at write time and rejects object-format relations.

Required format:

```
relation_type [[base_uri]] (optional context)
```

Correct:

```yaml
relations:
  - subtask_of [[user:task/parent-task.md]]
  - relates [[user:text/reference-doc.md]]
  - blocked_by [[user:task/prerequisite.md]]
```

Wrong -- these object formats cause silent data loss or validation errors:

```yaml
# WRONG: {predicate, target_uri} objects
relations:
  - predicate: subtask_of
    target_uri: user:task/parent-task.md

# WRONG: {type, target} objects
relations:
  - type: relates
    target: user:text/reference-doc.md
```

## When Writing Entity Files

Always use the `base entity create` CLI command rather than writing YAML frontmatter directly. The CLI enforces schema compliance including relation format. If you must write frontmatter directly, use the string format shown above.

See [[sys:system/guideline/create-task-relationships.md]] for which relation types to choose.
