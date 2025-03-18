---
type: type_definition
type_name: database
title: Database
extends: base
description: Database represents a collection of related database items
properties:
  - name: fields
    type: array
    items:
      type: object
      properties:
        name:
          type: string
          description: Name of the field
        type:
          type: string
          enum: [string, number, boolean, date, array, object]
          description: Data type of the field
        required:
          type: boolean
          description: Whether the field is required
        enum:
          type: array
          description: List of allowed values for the field
    required: true
    description: Fields that define the database schema
  - name: table_name
    type: string
    required: false
    description: Name of the table
  - name: table_description
    type: string
    required: false
    description: Description of the table
  - name: views
    type: array
    items:
      type: string
    required: false
    description: Views defined for this database
---

# Database

Database represents a collection of related database items with a defined schema. Databases allow for structured organization of multiple similar items.

## Database Structure

A database defines:

- A schema (set of fields with types and requirements)
- Metadata (name, description)
- Optional views (saved configurations for displaying data)

## Database Items

Database items are content that belongs to a database and follows its schema. Each database item refers to its parent database and includes values for the fields defined in that database.

## Dynamic Properties

Database items have dynamic properties determined by their parent database:

1. Each database defines fields in its schema
2. Database items must reference their parent database
3. The system validates that all required fields from the parent are included
4. Additional properties beyond the required set are allowed

## Relations

Databases commonly relate to:

- database_items (content that belongs to the database)
- database_views (saved display configurations)
- tasks (work that involves managing the database)
- activities (processes that create or use database items)
