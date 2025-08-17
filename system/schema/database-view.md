---
type: type_definition
title: Database View Schema
description: Database views represent saved configurations of how to display database items
created_at: '2025-08-16T17:56:08.202Z'
entity_id: 2dc0616b-b7b1-40ba-8ee8-aee1568311e7
extends: entity
properties:
  - name: view_name
    type: string
    required: true
    description: Name of the view
  - name: view_description
    type: string
    required: false
    description: Description of this view
  - name: table_name
    type: string
    required: true
    description: Associated table name
  - name: table_state
    type: object
    required: false
    description: JSON configuration of view settings
type_name: database_view
updated_at: '2025-08-16T17:56:09.130Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
---

# Database View

Database views represent saved configurations of how to display database items. They allow different ways of visualizing and working with the same underlying data.

## View Configuration

A database view can define:

- Which fields to display
- Sort order
- Filters
- Grouping
- Visualization type (table, kanban, calendar, etc.)
- Column widths and display settings

## View Types

Common view types include:

- Table view (rows and columns)
- Kanban board (cards in columns)
- Calendar view (items on dates)
- Gallery view (visual grid)
- Timeline view (items on a timeline)
- List view (simplified listing)

## Relations

Database views commonly relate to:

- their parent database
- database_items (content displayed in the view)
- persons (people who created or use the view)
- organizations (groups that use the view)
