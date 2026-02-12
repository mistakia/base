---
title: Create Notion Database Page
type: workflow
description: >-
  Create a new page in a Notion database via MCP tools, then sync the new entity locally
base_uri: sys:system/workflow/create-notion-database-page.md
created_at: '2026-01-30T18:35:00.000Z'
entity_id: 2fbde3e7-43c5-4cea-abf0-21d97a788ad0
public_read: false
relations:
  - implements [[sys:system/schema/workflow.md]]
  - follows [[sys:system/guideline/write-workflow.md]]
  - references [[user:config/notion-entity-mappings.json]]
  - calls [[sys:system/workflow/sync-notion-entities.md]]
updated_at: '2026-01-30T18:35:00.000Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
---

<task>Create a new page in a Notion database and sync it to a local entity file</task>

<context>
This workflow creates a new page in a configured Notion database using MCP tools, then syncs the new page to a local entity file via [[sys:system/workflow/sync-notion-entities.md]].

Target databases and their properties are configured in `config/notion-entity-mappings.json`. The sync script handles entity file creation and placement based on the mapping configuration.
</context>

<instructions>

## Step 1: Identify Target Database

Determine which Notion database the new page should be created in. Check `config/notion-entity-mappings.json` for configured database IDs and their property mappings.

If the target database is unclear from the user's request, present the relevant options from the database summary table and ask the user to confirm.

## Step 2: Gather Property Values

Based on the target database's configured properties, collect values from the user. At minimum, a title property is required.

To discover the full database schema and available select options:

```
mcp__notion__API-query-data-source(database_id=DATABASE_ID, page_size=1)
```

This returns the database schema and a sample entry showing available property types and select options.

## Step 3: Confirm with User

Present the page details for confirmation:

- Database: DATABASE_NAME (DATABASE_ID)
- Title: PAGE_TITLE
- Properties:
  - PROPERTY_NAME: VALUE
  - ...

Wait for user confirmation before creating.

## Step 4: Create the Page

Use the MCP tool to create a new page with the database as parent:

```
mcp__notion__API-post-page(
  parent={"database_id": "DATABASE_ID"},
  properties=PROPERTIES_OBJECT
)
```

The properties object must include the title property and any additional properties. Format each property according to its type:

**Title (required):**
```json
{"Property Name": {"title": [{"text": {"content": "Page Title"}}]}}
```

**Rich Text:**
```json
{"Property Name": {"rich_text": [{"text": {"content": "Text content"}}]}}
```

**Number:**
```json
{"Property Name": {"number": 42}}
```

**Select:**
```json
{"Property Name": {"select": {"name": "Option Name"}}}
```

**Multi-Select:**
```json
{"Property Name": {"multi_select": [{"name": "Option 1"}, {"name": "Option 2"}]}}
```

**Date:**
```json
{"Property Name": {"date": {"start": "2026-01-30"}}}
```

**Checkbox:**
```json
{"Property Name": {"checkbox": true}}
```

**URL:**
```json
{"Property Name": {"url": "https://example.com"}}
```

Note the returned page ID from the response -- it will be needed for the sync step.

## Step 5: Sync Locally

Follow [[sys:system/workflow/sync-notion-entities.md]] to sync the new page:

```bash
cd ~/user-base/repository/active/base
node cli/notion/sync-notion-entities.mjs --page-id PAGE_ID --force
```

Alternatively, sync the entire database:

```bash
node cli/notion/sync-notion-entities.mjs --database-id DATABASE_ID
```

## Step 6: Review and Commit

```bash
cd ~/user-base
git status
git diff
git add <new-entity-file> config/notion-entity-cache.tsv
git commit -m "Add Notion page: <brief description>"
```

## Error Handling

- **Database not in config**: The database must be configured in `config/notion-entity-mappings.json` before syncing. Use [[sys:system/workflow/add-notion-database-mapping.md]] to add it first
- **Required property missing**: Notion databases may have required properties beyond the title. Query the database schema to discover them
- **Select option not found**: New select options can be created by Notion automatically when used in a page creation, or may need to be added manually in the Notion UI depending on database settings
- **Sync creates no file**: Verify the database ID is in `config/notion-entity-mappings.json` and the target directory exists

</instructions>
