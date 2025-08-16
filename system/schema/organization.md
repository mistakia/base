---
type: type_definition
type_name: organization
title: Organization
extends: entity
description: Organizations represent companies, departments, teams, or other organizational units
properties:
  - name: website_url
    type: string
    required: false
    description: Organization website
  - name: description
    type: string
    required: false
    description: Detailed description of the organization
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
