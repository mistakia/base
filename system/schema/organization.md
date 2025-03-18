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
  - name: members
    type: array
    items:
      type: string
    required: false
    description: People who are part of this organization
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
- Members (represented through the members property)

## Relations

Organizations commonly relate to:

- persons (members of the organization)
- tasks (work the organization is responsible for)
- activities (processes the organization participates in)
- guidelines (procedures the organization follows)
- physical_items (assets owned by the organization)
- digital_items (files owned by the organization)
- other organizations (partners, parent/child relationships)
