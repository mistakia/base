---
title: Entity List CLI Usage
type: guideline
description: Guidelines for using the entity-list CLI tools to query and filter entities
base_uri: sys:system/guideline/entity-list-cli.md
created_at: '2026-01-16T00:00:00.000Z'
entity_id: 905ece35-bb38-411c-b44d-ea8e0c842911
globs:
  - cli/base.mjs
  - cli/base/entity.mjs
  - cli/entity-list.mjs
observations:
  - '[efficiency] Tab-separated output minimizes token usage for agent parsing'
  - '[design] Unified CLI replaces type-specific MCP tools for entity queries'
  - '[usability] Verbose mode provides human-readable multi-line output'
  - '[architecture] Two CLI variants exist for different server states'
relations:
  - implements [[sys:system/text/system-design.md]]
  - replaces list_tasks MCP tool
  - replaces task_get MCP tool
  - replaces list_threads MCP tool
  - replaces thread_read MCP tool
updated_at: '2026-01-27T00:00:00.000Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
---

# Entity List CLI Usage

## Purpose and Distinction

The entity-list CLIs provide unified interfaces for querying entities from the embedded database. They replace type-specific MCP tools (`list_tasks`, `task_get`, `list_threads`, `thread_read`) with flexible command-line tools.

### Preferred: Unified Base CLI

The `base entity list` command is the preferred way to query entities:

```bash
base entity list -t task --status "In Progress"
base entity get "user:task/my-task.md"
```

### Direct CLI Variants

| CLI                | When to Use                    | How It Works           |
| ------------------ | ------------------------------ | ---------------------- |
| `base entity list` | Preferred entry point          | Direct database access |
| `entity-list.mjs`  | Direct alternative when needed | Direct database access |

**Recommendation**: Use `base entity list` as the primary invocation.

**When to use entity-list CLI:**

- Finding tasks by status, priority, or tags
- Searching entities by title or description
- Gathering context about project entities
- Detecting duplicate or related entities
- Querying entities without tags for cleanup

**When NOT to use entity-list CLI:**

- Reading file contents (use Read tool)
- Writing or editing files (use Write/Edit tools)
- Creating new entities (use `entity_create` MCP tool)

## Guidelines

### Command Invocation

- Preferred: `base entity list` (works in all cases)
- Alternative: `node cli/entity-list.mjs` (direct database access)
- All CLIs MUST be invoked from the base repository directory
- Agents SHOULD use the Bash tool to execute CLI commands
- Commands MUST include appropriate filters to limit result sets

### Output Format

- Default output is tab-separated for efficient agent parsing
- The `--verbose` flag SHOULD be used when human-readable output is needed
- The `--json` flag MAY be used when structured data is required
- Fields returned by default: `base_uri`, `title`, `type`, `status`, `priority`

### Filtering Best Practices

- Filters SHOULD be combined to narrow results appropriately
- The `--type` filter MUST be used when querying specific entity types
- The `--limit` option SHOULD be used to prevent overwhelming output
- The `--without-tags` filter identifies entities needing categorization

### Single Entity Lookup

- The `--one` flag MUST be used with either `--base-uri` or `--entity-id`
- Use `--base-uri` when the entity path is known
- Use `--entity-id` when only the UUID is available

## Filter Syntax Reference

### Type Filters

```bash
# Single type
node cli/entity-list.mjs -t task

# Multiple types
node cli/entity-list.mjs -t task -t thread
```

### Status and Priority Filters

```bash
# By status
node cli/entity-list.mjs -t task --status "In Progress"

# By priority
node cli/entity-list.mjs -t task --priority "High"

# Combined
node cli/entity-list.mjs -t task --status "Started" --priority "Critical"
```

### Tag Filters

```bash
# With specific tags
node cli/entity-list.mjs -t task --tags "user:tag/project-a.md"

# Without any tags
node cli/entity-list.mjs -t task --without-tags
```

### Search

```bash
# Search title/description
node cli/entity-list.mjs -t task -s "authentication"
```

### Pagination and Sorting

```bash
# Limit results
node cli/entity-list.mjs -t task -l 10

# Sort by field
node cli/entity-list.mjs -t task --sort created_at

# Ascending order
node cli/entity-list.mjs -t task --sort title --asc
```

## Output Field Options

Use `--fields` to specify which fields to return:

```bash
node cli/entity-list.mjs -t task -f base_uri -f title -f status
```

Available fields: `base_uri`, `entity_id`, `type`, `title`, `description`, `status`, `priority`, `tags`, `created_at`, `updated_at`, `archived`

## Examples

### Finding Active Tasks

```bash
node cli/entity-list.mjs -t task --status "In Progress" -l 20
```

### Getting Task Details

```bash
node cli/entity-list.mjs --one --base-uri "user:task/my-feature.md" --content -v
```

### Searching Across Types

```bash
node cli/entity-list.mjs -s "database migration" -l 10
```

### Finding Untagged Entities

```bash
node cli/entity-list.mjs -t task --without-tags -l 50
```

### JSON Output for Processing

```bash
node cli/entity-list.mjs -t task --status "Completed" --json
```

