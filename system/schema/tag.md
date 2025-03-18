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

## Relations

Tags commonly relate to:

- Any entity type (through tagging relationships)
- Other tags (through parent-child relationships)
- Tasks (for task categorization)
- Activities (for activity categorization)

## Observations

- [design] Tags provide cross-cutting organization capability #organization
- [feature] Tags can be referenced both in frontmatter and with hashtag syntax #usability
- [architecture] Tag hierarchy allows for more sophisticated organization #organization
