---
title: Add Notion Database Mapping
type: workflow
description: Add a new Notion database to the entity mapping configuration and perform initial sync
base_uri: sys:system/workflow/add-notion-database-mapping.md
created_at: '2026-01-30T18:35:00.000Z'
entity_id: 2fb2cb59-2f18-45b3-94eb-3f856212b8a8
public_read: true
relations:
  - implements [[sys:system/schema/workflow.md]]
  - follows [[sys:system/guideline/write-workflow.md]]
  - references [[user:config/notion-entity-mappings.json]]
  - calls [[sys:system/workflow/sync-notion-entities.md]]
updated_at: '2026-01-30T18:35:00.000Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
visibility_analyzed_at: '2026-02-16T04:39:04.477Z'
---

<task>Add a new Notion database to the entity mapping configuration and perform initial sync</task>

<context>
This workflow adds a new Notion database to `config/notion-entity-mappings.json`, enabling the sync script to import its pages as local entity files. After updating the config, it calls [[sys:system/workflow/sync-notion-entities.md]] to perform the initial import.

The mapping configuration structure is documented alongside existing examples in `config/notion-entity-mappings.json`.
</context>

<instructions>

## Step 1: Retrieve Database Schema

Use the MCP tool to query the Notion database and discover its properties:

```
mcp__notion__API-query-data-source(database_id=DATABASE_ID, page_size=3)
```

This returns the database schema with property names, types, and select options, plus sample entries to understand the data shape.

If the database ID is unknown, use the Notion search to find it:

```
mcp__notion__API-post-search(query="database name", filter={"value": "database", "property": "object"})
```

## Step 2: Determine Mapping Configuration

Based on the database schema, determine these configuration values:

| Field               | Description                                               | Example                           |
| ------------------- | --------------------------------------------------------- | --------------------------------- |
| `name`              | Short identifier for the database                         | `home_items`                      |
| `entity_type`       | Entity type for synced files                              | `physical_item`, `text`, `task`   |
| `target_directory`  | Directory for entity files (relative to user-base)        | `text/home/area`                  |
| `property_mappings` | Map from local field names to Notion property names       | `{"name": "Name"}`                |
| `type_conversions`  | Notion property type for each mapped field                | `{"Name": "title"}`               |
| `relation_mappings` | Map from Notion relation property names to relation types | `{"related_items": "relates_to"}` |

**Guidelines for property mappings:**

- Keys are the local entity field names (snake_case)
- Values are the exact Notion property names (case-sensitive)
- The title property must be mapped (every database has one)
- Skip computed/formula properties unless they contain useful read-only data

**Guidelines for type conversions:**

- Keys are the Notion property names (must match values in property_mappings)
- Values are the conversion type strings
- Standard types: `title`, `rich_text`, `number`, `url`, `date`, `select`, `multi_select`, `checkbox`, `formula`, `files`
- Custom conversions: `select_to_boolean`, `select_to_number_boolean`, `select_to_enum_importance`, `select_to_enum_frequency`

**Guidelines for relation mappings:**

- Keys are the Notion relation property names
- Values are the relation type (e.g., `relates_to`, `contains`, `part_of`, `uses_item`, `has_attribute`)
- Only include relations that link to other configured Notion databases

## Step 3: Confirm Configuration with User

Present the proposed mapping for confirmation:

- Database: DATABASE_NAME (DATABASE_ID)
- Entity type: ENTITY_TYPE
- Target directory: TARGET_DIRECTORY
- Property mappings: (table of local field -> Notion property)
- Type conversions: (table of Notion property -> conversion type)
- Relation mappings: (table of relation property -> relation type, or "none")

Wait for user confirmation before modifying the config file.

## Step 4: Update Configuration File

Read the current `config/notion-entity-mappings.json` and add the new database entry under the `databases` key. The key is the Notion database ID.

```json
{
  "databases": {
    "EXISTING_ENTRIES": "...",
    "NEW_DATABASE_ID": {
      "name": "database_name",
      "entity_type": "entity_type",
      "target_directory": "target/directory",
      "property_mappings": {
        "local_field": "Notion Property Name"
      },
      "type_conversions": {
        "Notion Property Name": "conversion_type"
      },
      "relation_mappings": {}
    }
  }
}
```

Ensure the target directory exists:

```bash
mkdir -p "$USER_BASE_DIRECTORY/TARGET_DIRECTORY"
```

## Step 5: Initial Sync

Follow [[sys:system/workflow/sync-notion-entities.md]] to perform the initial import:

```bash
cd "$USER_BASE_DIRECTORY/repository/active/base"
node cli/notion/sync-notion-entities.mjs --database-id DATABASE_ID --verbose
```

## Step 6: Review and Commit

```bash
cd "$USER_BASE_DIRECTORY"
git status
git diff config/notion-entity-mappings.json
git add config/notion-entity-mappings.json
git add TARGET_DIRECTORY/*.md
git add config/notion-entity-cache.tsv
git commit -m "Add Notion database mapping: database_name"
```

## Error Handling

- **Database not accessible**: Verify the Notion integration has been shared with the database in Notion settings
- **Duplicate database ID**: Check if the database is already configured in `config/notion-entity-mappings.json`
- **Sync produces no files**: Verify the database has pages and the property mappings are correct (especially the title property)
- **Relation mapping fails**: The related database must also be configured in the mappings for relations to resolve

</instructions>
