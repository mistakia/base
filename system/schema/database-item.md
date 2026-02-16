---
title: Database Item Schema
type: type_definition
description: Database items represent records within a database
base_uri: sys:system/schema/database-item.md
created_at: '2025-08-16T17:56:08.201Z'
entity_id: b556b705-14e2-4797-8ef5-9c6af518f085
extends: entity
properties:
  - name: database_table_id
    type: string
    required: true
    description: Reference to the parent database table
public_read: true
type_name: database_item
updated_at: '2025-08-16T17:56:09.130Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
visibility_analyzed_at: '2026-02-16T04:33:26.010Z'
---

# Database Item

Database items represent records within a database. They follow the schema defined by their parent database and can have dynamic properties based on that schema.

## Dynamic Properties

The properties of a database item are determined by the parent database:

- The `database_table_id` property points to the parent database table
- Required fields from the parent database schema must be included
- Additional fields beyond the required set are allowed

## Example

For a database with this schema:

```yaml
fields:
  - name: project_code
    type: string
    required: true
  - name: start_date
    type: datetime
    required: true
  - name: budget
    type: number
    required: false
  - name: status
    type: string
    enum: [Not Started, In Progress, Completed, On Hold]
    required: true
```

A valid database item would be:

```yaml
---
title: Project Alpha
type: database_item
database_table_id: project_database_entity_id # Example assumes the parent database entity ID is used here
project_code: PRJ-001
start_date: 2023-01-15
budget: 50000
status: In Progress
---
```

## Schema Validation

Database items undergo validation to ensure they conform to their parent database's schema:

- All required fields must be present
- Field values must match the specified data types
- Enum fields must have values from the allowed list

## Relations

Database items commonly relate to:

- their parent database
- tasks (work related to the item)
- persons (people related to the item)
- organizations (groups related to the item)

Example:

```yaml
relations:
  - 'belongs_to [[sys:database/database-name]]'
  - 'related_task [[user:task/task-name]]'
  - 'related_person [[user:person/jane-doe]]'
  - 'related_organization [[sys:organization/org-name]]'
```
