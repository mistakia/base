---
title: Update Notion Database Page
type: workflow
description: >-
  Update properties on an existing Notion database page via MCP tools, then sync changes to local
  entity files
base_uri: sys:system/workflow/update-notion-database-page.md
created_at: '2026-01-30T18:35:00.000Z'
entity_id: 530a73c1-4727-4f3c-8f46-0025597a24cf
public_read: true
relations:
  - implements [[sys:system/schema/workflow.md]]
  - follows [[sys:system/guideline/write-workflow.md]]
  - references [[user:config/notion-entity-mappings.json]]
  - calls [[sys:system/workflow/sync-notion-entities.md]]
updated_at: '2026-01-30T18:35:00.000Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
visibility_analyzed_at: '2026-02-16T04:42:12.931Z'
---

<task>Update properties on an existing Notion database page and sync the changes locally</task>

<context>
This workflow updates an existing page in a Notion database using MCP tools, then syncs the changes to local entity files via [[sys:system/workflow/sync-notion-entities.md]].

The page ID can be obtained from the local entity's `external_id` frontmatter field (format: `notion:database:DB_ID:PAGE_ID` or `notion:page:PAGE_ID`), or provided directly by the user. Property names and types are configured in `config/notion-entity-mappings.json`.
</context>

<instructions>

## Step 1: Identify the Page

Determine the Notion page ID from one of these sources:

**From a local entity file** -- extract the page ID from the `external_id` field:

```
external_id: notion:database:DB_ID:PAGE_ID
```

The `PAGE_ID` is the last segment after the final colon.

**From user input** -- use a page ID or URL provided directly.

### Step 2: Retrieve Current Properties

Use the MCP tool to fetch the page and inspect its current properties:

```
mcp__notion__API-retrieve-a-page(page_id=PAGE_ID)
```

Review the response to understand:

- Which properties exist and their current values
- Property types (title, rich_text, number, select, multi_select, date, checkbox, url, relation)
- Available select/multi-select options

### Step 3: Determine Changes

Based on the user's request, identify which properties need to be updated. Cross-reference with `config/notion-entity-mappings.json` to understand:

- The Notion property name (may differ from the local entity field name)
- The property type and expected format

### Step 4: Confirm Changes with User

Present the planned changes for confirmation:

- Page: PAGE_TITLE
- Database: DATABASE_NAME
- Changes:
  - PROPERTY_NAME: OLD_VALUE -> NEW_VALUE
  - ...

Wait for user confirmation before proceeding.

### Step 5: Update the Page

Use the MCP tool to patch the page properties:

```
mcp__notion__API-patch-page(page_id=PAGE_ID, properties=PROPERTIES_OBJECT)
```

The properties object format depends on the property type:

**Title:**

```json
{ "Property Name": { "title": [{ "text": { "content": "New Title" } }] } }
```

**Rich Text:**

```json
{ "Property Name": { "rich_text": [{ "text": { "content": "New text" } }] } }
```

**Number:**

```json
{ "Property Name": { "number": 42 } }
```

**Select:**

```json
{ "Property Name": { "select": { "name": "Option Name" } } }
```

**Multi-Select:**

```json
{
  "Property Name": {
    "multi_select": [{ "name": "Option 1" }, { "name": "Option 2" }]
  }
}
```

**Date:**

```json
{ "Property Name": { "date": { "start": "2026-01-30" } } }
```

**Checkbox:**

```json
{ "Property Name": { "checkbox": true } }
```

**URL:**

```json
{ "Property Name": { "url": "https://example.com" } }
```

### Step 6: Sync Locally

Follow [[sys:system/workflow/sync-notion-entities.md]] to sync the updated page:

```bash
cd "$USER_BASE_DIRECTORY/repository/active/base"
node cli/notion/sync-notion-entities.mjs --page-id PAGE_ID --force
```

### Step 7: Review and Commit

```bash
cd "$USER_BASE_DIRECTORY"
git diff
git add <affected-entity-file> config/notion-entity-cache.tsv
git commit -m "Update Notion page: <brief description>"
```

## Error Handling

- **Page not found**: Verify the page ID is correct. Check if the page has been archived in Notion
- **Property type mismatch**: Check the property type in `config/notion-entity-mappings.json` and format the value accordingly
- **Select option not found**: The option may need to be created first in Notion, or check for exact spelling/casing
- **Permission denied**: Verify the Notion integration has access to the database

</instructions>
