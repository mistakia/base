---
type: type_definition
title: Organization Schema
description: Organizations represent companies, departments, teams, or other organizational units
created_at: '2025-08-16T17:56:08.204Z'
entity_id: 35757f6c-4c1c-4f0b-8f3a-c5cd5124ae72
extends: entity
properties:
  - name: website_url
    type: string
    required: false
    description: Organization website
  - name: description
    type: string
    required: false
    description: Detailed description of the organization
type_name: organization
updated_at: '2025-08-16T17:56:09.132Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
---

# Organization

Organizations represent companies, departments, teams, or other organizational units that may be involved in tasks, or other aspects of the knowledge base.

## Organization Types

Organizations can represent various groupings:

- Companies
- Departments
- Teams
- Committees
- Working groups
- Professional associations
- Community groups

## Organization Hierarchy

Organizations can have hierarchical relationships:

- Parent organizations (represented through relations)
- Departments or sub-teams (represented through relations)
- Members (represented through relations)

## Relations

Organizations commonly use these relation types:

- `has_member`: Persons who are members of the organization (formerly members)
- `part_of`: Parent organizations this organization belongs to
- `contains`: Sub-organizations or departments
- `involves`: Tasks the organization is responsible for
- `follows`: Guidelines the organization follows
- `requires`: Physical or digital assets owned by the organization

Example:

```yaml
relations:
  - 'has_member [[user:person/jane-doe]]'
  - 'part_of [[sys:organization/parent-org]]'
  - 'contains [[sys:organization/department-name]]'
  - 'involves [[user:tasks/task-name]]'
  - 'follows [[sys:system/guideline/guideline-name]]'
  - 'requires [[sys:physical_item/item-name]]'
```
