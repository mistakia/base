---
type: type_definition
type_name: organization
title: Organization
extends: base
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

Organizations represent companies, departments, teams, or other organizational units that may be involved in tasks, activities, or other aspects of the knowledge base.

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
- `executes`: Activities the organization participates in
- `follows`: Guidelines the organization follows
- `requires`: Physical or digital assets owned by the organization

Example:

```yaml
relations:
  - 'has_member [[Person Name]]'
  - 'part_of [[Parent Organization]]'
  - 'contains [[Department Name]]'
  - 'involves [[Task Name]]'
  - 'executes [[Activity Name]]'
  - 'follows [[Guideline Name]]'
  - 'requires [[Physical Item]]'
```
