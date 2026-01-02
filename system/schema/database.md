---
type: type_definition
title: Database Schema
description: Structured data collection with defined schema and configurable storage
created_at: '2025-08-16T17:56:08.202Z'
entity_id: 086d9bd6-cc0a-4949-ad5a-eabfabdf0cbe
extends: entity
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
          enum:
            - string
            - number
            - boolean
            - datetime
            - array
            - object
          description: Data type of the field
        required:
          type: boolean
          description: Whether the field is required
        enum:
          type: array
          description: List of allowed values for the field
        primary_key:
          type: boolean
          description: Whether this field is a primary key
    required: true
    description: Fields that define the database schema
  - name: table_name
    type: string
    required: true
    description: Name of the table
  - name: table_description
    type: string
    required: false
    description: Description of the table
  - name: storage_config
    type: object
    required: false
    properties:
      connection_string:
        type: string
        description: Connection string for external database storage
      schema_name:
        type: string
        default: public
        description: Database schema name
      indexes:
        type: array
        items:
          type: object
          properties:
            fields:
              type: array
              items:
                type: string
            unique:
              type: boolean
        description: Database indexes to create for performance
    description: Configuration for external database storage
  - name: views
    type: array
    items:
      type: string
    required: false
    description: Views defined for this database
type_name: database
updated_at: '2025-08-16T17:56:09.130Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
---

# Database

A database defines a structured data collection with a schema that governs how data is stored and accessed. Databases support both local file-based storage and external storage in separate databases for large datasets.

## What is a Database

In this system, a database is:

- A schema definition with typed fields and validation rules
- A collection of related data items that follow the schema
- A storage configuration that determines where data lives
- A set of views for displaying and filtering data

## Storage Approach

**Local Storage** (default):

- Items stored as markdown files with YAML frontmatter
- Indexed via embedded databases (DuckDB for SQL queries, Kuzu for graph queries)
- No external database configuration required
- Full integration with entity system features

**External Storage**:

- Items stored in external database tables
- Activated by providing `storage_config` with connection details
- Supports large datasets
- Maintains same API and functionality

## Schema Definition

Each database defines:

- **Fields**: Data structure with types, validation, and constraints
- **Table Name**: Identifier for the data collection
- **Storage Configuration**: Connection details for external databases
- **Performance Settings**: Indexes and optimization hints

## Database Items

Database items are records that:

- Follow the parent database's schema
- Have dynamic properties based on field definitions
- Support validation against required fields and data types
- Reference their parent database via `database_table_id`

## Relations

Databases commonly relate to the following entities:

- database_items (records within the database)
- database_views (display configurations)
- tasks
