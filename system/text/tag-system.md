---
title: Tag System
type: text
description: >-
  Reference for the tag entity system covering tag structure, CLI operations, stats and threshold
  management, tag-based queries, shorthand resolution, and taxonomy conventions
created_at: '2026-03-02T06:36:13.558Z'
entity_id: 67abbca4-549c-4181-8b86-56afd4558ecc
base_uri: sys:system/text/tag-system.md
public_read: true
relations:
  - relates_to [[sys:system/text/system-design.md]]
  - relates_to [[sys:system/schema/tag.md]]
updated_at: '2026-03-02T06:36:13.558Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
---

# Tag System

Tags are a core organizational primitive for categorizing entities and threads. Tag entities are stored in the `tag/` directory and referenced via the `tags` array in any entity's frontmatter.

## Tag Entity Structure

Tags extend the base entity schema with one additional property:

| Field   | Type   | Description                              |
| ------- | ------ | ---------------------------------------- |
| `type`  | string | Must be `tag`                            |
| `title` | string | Human-readable tag name (required)       |
| `color` | string | Hex color code for UI display (optional) |

Standard entity fields (entity_id, base_uri, description, created_at, etc.) apply. Tags use the base_uri format `user:tag/tag-name.md`.

## Tag Assignment

Tags are referenced in entity frontmatter as an array of base_uri strings:

```yaml
tags:
  - user:tag/base-project.md
  - user:tag/javascript.md
```

Tags are indexed in the SQLite embedded index via junction tables (`entity_tags` and `thread_tags`) for fast tag-based queries.

## CLI Interface

All commands are under `base tag`:

### List Tags

```bash
base tag list # All tags
base tag list -s "feature" # Search by title
base tag list --json # JSON output
```

### Tag Statistics

```bash
base tag stats # All tags with entity counts
base tag stats --below-threshold 15 # Tags with fewer than 15 entities
base tag stats --include-zero-count # Include unused tags
base tag stats --json
```

Statistics are queried from the SQLite index and sorted by entity count (descending), then title.

### Batch Add Tags

```bash
base tag add -t javascript -i "task/*.md"
base tag add -t feature,bug -i "**/*.md" -e "thread/**" --dry-run
```

Options:

- `--tag, -t` (required): Comma-separated tags (shorthand or full base_uri)
- `--include-path-patterns, -i` (default: `*.md`): Glob patterns to include
- `--exclude-path-patterns, -e`: Glob patterns to exclude
- `--dry-run, -n`: Preview without applying

Validates all tags exist before processing. Deduplicates and skips already-present tags. Skips type_definition entities.

### Batch Remove Tags

```bash
base tag remove -t legacy -i "**/*.md" --dry-run
```

Same options as add. Reports which tags were removed vs. not found.

## Shorthand Resolution

The CLI supports shorthand tag input that resolves to full base_uri format:

| Input                      | Resolved                                 |
| -------------------------- | ---------------------------------------- |
| `base-project`             | `user:tag/base-project.md`               |
| `user:tag/base-project.md` | `user:tag/base-project.md` (passthrough) |
| `javascript, feature`      | Array of resolved base_uris              |

## Tag-Based Queries

### Entity Queries

Filter entities by tag in SQLite:

```javascript
query_entities_from_sqlite({
  filters: [{ column_id: 'tags', operator: 'IN', value: [tag_base_uri] }]
})
```

### Thread Queries

Filter threads by tag:

```javascript
query_threads_from_sqlite({ tags: [tag_base_uri] })
```

### Tag Detail API

`GET /api/tags?base_uri=<tag_uri>` returns:

- Tag entity properties
- Tagged entities (paginated)
- Tagged threads
- Active and completed task counts
- Permission-based redaction flag

## Taxonomy Conventions

### Project Tags

Collect all content related to a project:

- Format: `base-project`, `league-project`
- Enables project-wide views via `base entity list --tags user:tag/base-project.md`

### Proper Noun Tags

Track mentions of specific tools, clients, or systems:

- `github`, `docker`, `kubernetes`

### Hierarchical Organization

Tags can relate to other tags through the relation system for parent-child taxonomies.

### Tag Lifecycle

- **Creation**: Tags are entities in `tag/` directory
- **Assignment**: Referenced in entity `tags` array
- **Monitoring**: Use `base tag stats --below-threshold` to find underutilized tags
- **Archival**: Set `archived_at` to exclude from active listings

## Key Modules

| Module                                                 | Purpose                          |
| ------------------------------------------------------ | -------------------------------- |
| `system/schema/tag.md`                                 | Tag entity type definition       |
| `cli/base/tag.mjs`                                     | CLI command implementation       |
| `libs-server/tag/filesystem/`                          | Tag filesystem CRUD operations   |
| `libs-server/tag/filesystem/resolve-tag-shorthand.mjs` | Shorthand to base_uri conversion |
| `libs-server/tag/filesystem/add-tags-to-entity.mjs`    | Add tags to entity frontmatter   |
| `libs-server/tag/filesystem/process-tag-batch.mjs`     | Batch add/remove across files    |
| `server/routes/tags.mjs`                               | Tag detail API endpoint          |
