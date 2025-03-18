---
type: type_definition
type_name: database_view
title: Database View
extends: base
description: Database views represent saved configurations of how to display database items
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
