---
title: Sync Notion Entities
type: workflow
description: >-
  Shared base workflow for syncing Notion content to local entity files via CLI and committing
  changes
base_uri: sys:system/workflow/sync-notion-entities.md
created_at: '2026-01-30T18:35:00.000Z'
entity_id: 830aee1e-a3f7-4e5e-ac4e-055b93aa2380
public_read: true
relations:
  - implements [[sys:system/schema/workflow.md]]
  - follows [[sys:system/guideline/write-workflow.md]]
  - references [[user:config/notion-entity-mappings.json]]
updated_at: '2026-01-30T18:35:00.000Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
visibility_analyzed_at: '2026-02-16T04:41:33.129Z'
---

<task>Sync Notion content to local entity files and commit the changes</task>

<context>
After any change is made in Notion (page creation, page update, config change), this workflow handles the sync-review-commit cycle that brings those changes into local entity files.

The sync is performed by `cli/notion/sync-notion-entities.mjs` in the Base repository. Entity file placement is driven entirely by `config/notion-entity-mappings.json` target directories. The TSV cache (`notion-entity-cache.tsv`) is updated automatically by the sync script.
</context>

<instructions>

## Quick Reference

```bash
# 1. Run sync (optionally scoped to a specific database or page)
cd "$USER_BASE_DIRECTORY/repository/active/base"
node cli/notion/sync-notion-entities.mjs [OPTIONS]

# 2. Review changes
cd "$USER_BASE_DIRECTORY"
git diff
git status

# 3. Stage and commit
git add <affected-files>
git commit -m "Sync Notion entities: <brief description>"
```

## Detailed Steps

### Step 1: Run the Sync Script

Navigate to the Base repository and run the sync with appropriate flags:

```bash
cd "$USER_BASE_DIRECTORY/repository/active/base"
```

**Sync all configured databases:**

```bash
node cli/notion/sync-notion-entities.mjs
```

**Sync a specific database:**

```bash
node cli/notion/sync-notion-entities.mjs --database-id <DATABASE_ID>
```

**Sync a specific page:**

```bash
node cli/notion/sync-notion-entities.mjs --page-id <PAGE_ID>
```

**Force re-sync (overwrite local files):**

```bash
node cli/notion/sync-notion-entities.mjs --force
```

**Verbose output for debugging:**

```bash
node cli/notion/sync-notion-entities.mjs --verbose
```

Flags can be combined, e.g. `--database-id <ID> --force --verbose`.

### Step 2: Review Changes

Return to the user-base directory and review the git diff:

```bash
cd "$USER_BASE_DIRECTORY"
git status
git diff
```

Verify:

- New or updated entity files have correct frontmatter (title, type, entity_id, external_id)
- Property values match what was expected from the Notion change
- No unexpected files were modified
- The `notion-entity-cache.tsv` was updated

### Step 3: Stage and Commit

Stage the affected entity files and cache:

```bash
git add <target-directory>/*.md
git add config/notion-entity-cache.tsv
git commit -m "Sync Notion entities: <brief description>"
```

Use a descriptive commit message that indicates what triggered the sync (e.g., "Sync Notion entities: update home_items after adding new kitchen item").

## Error Handling

- **Sync script not found**: Verify you are in `$USER_BASE_DIRECTORY/repository/active/base`
- **Database ID not in config**: Check `config/notion-entity-mappings.json` for valid database IDs. Use [[sys:system/workflow/add-notion-database-mapping.md]] to add new databases
- **Notion API errors**: Verify the Notion MCP connection is active
- **No changes after sync**: The local entities may already be up to date. Use `--force` to overwrite

</instructions>
