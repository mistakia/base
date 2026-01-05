---
title: Tag Schema
type: type_definition
description: A tag type for categorizing and organizing content
base_uri: user:repository/active/base/system/schema/tag.md
created_at: '2025-08-16T17:56:08.206Z'
entity_id: 2cbaaa75-cac5-4228-b08f-7aa9e5705761
extends: entity
observations:
  - '[design] Tags provide cross-cutting organization capability'
  - '[feature] Tags can be referenced both in frontmatter and with tag property'
  - '[architecture] Tag hierarchy allows for more sophisticated organization'
  - '[usage] Proper noun tags help track project-specific content'
properties:
  - name: color
    type: string
    required: false
    description: Optional color code for the tag (e.g., hex code)
type_name: tag
updated_at: '2026-01-05T19:24:58.796Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
---

# Tag

Tags provide a flexible way to categorize and organize knowledge items across the system. They enable cross-cutting classification that spans multiple content types.

## Usage

Tags can be attached to any entity in the system, allowing for flexible categorization and improved discoverability. Tags can be referenced in the frontmatter with the `tags` array property.

## Graphical Organization

Tags can be organized graphically by specifying relations between tags.

## Tag Properties

Beyond basic categorization, tags can have additional properties:

- **Color**: Visual identification in UIs

## Relations

Tags commonly relate to:

- Any entity type
- Other tags (through parent-child relationships)
- Tasks
- Workflows

## Proper Noun Representation

Tags can effectively represent proper nouns such as specific projects, products, or entities:

- **Project Tags**: Create dedicated tags for projects (e.g., project_alpha) to collect all related content
- **Entity Tags**: Use tags to track mentions of specific clients, tools, or systems
- **Conventions**: Consider prefixing proper noun tags for clarity (e.g., proj_alpha, client_acme)

These proper noun tags enable:

- Aggregating all content related to a specific entity
- Creating project-specific knowledge collections
- Tracking mentions and references across the knowledge base
