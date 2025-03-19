---
type: type_definition
type_name: tag
title: Tag
extends: base
description: A tag type for categorizing and organizing content
properties:
  - name: color
    type: string
    required: false
    description: Optional color code for the tag (e.g., hex code)
  - name: parent_tag
    type: string
    required: false
    description: Optional reference to a parent tag for hierarchical organization
observations:
  - '[design] Tags provide cross-cutting organization capability #organization'
  - '[feature] Tags can be referenced both in frontmatter and with hashtag syntax #usability'
  - '[architecture] Tag hierarchy allows for more sophisticated organization #organization'
  - '[usage] Proper noun tags help track project-specific content #project_management'
---

# Tag

Tags provide a flexible way to categorize and organize knowledge items across the system. They enable cross-cutting classification that spans multiple content types.

## Usage

Tags can be attached to any entity in the system, allowing for flexible categorization and improved discoverability. Tags can be referenced in two ways:

1. In frontmatter with the `tags` array property
2. Inline in markdown content with hashtag syntax (#tag_name)

## Hierarchical Organization

Tags can be organized hierarchically by specifying a parent tag, allowing for more sophisticated organization and navigation.

## Tag Properties

Beyond basic categorization, tags can have additional properties:

- **Color**: Visual identification in UIs
- **Parent Tag**: Reference to a parent tag for hierarchical organization

## Relations

Tags commonly relate to:

- Any entity type (through tagging relationships)
- Other tags (through parent-child relationships)
- Tasks (for task categorization)
- Activities (for activity categorization)

## Proper Noun Representation

Tags can effectively represent proper nouns such as specific projects, products, or entities:

- **Project Tags**: Create dedicated tags for projects (e.g., #project_alpha) to collect all related content
- **Entity Tags**: Use tags to track mentions of specific clients, tools, or systems
- **Conventions**: Consider prefixing proper noun tags for clarity (e.g., #proj_alpha, #client_acme)

These proper noun tags enable:

- Aggregating all content related to a specific entity
- Creating project-specific knowledge collections
- Tracking mentions and references across the knowledge base
