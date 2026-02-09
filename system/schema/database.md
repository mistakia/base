---
title: Database Schema
type: type_definition
description: Structured data collection with defined schema and configurable storage
base_uri: sys:system/schema/database.md
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
      backend:
        type: string
        enum:
          - duckdb
          - tsv
          - postgres
          - markdown
        default: duckdb
        description: Storage backend type
      table:
        type: string
        description: Table name for duckdb backend (defaults to table_name)
      database:
        type: string
        description: File path for duckdb backend (absolute path to .duckdb file)
      path:
        type: string
        description: File path for tsv backend (relative to user-base)
      directory:
        type: string
        description: Directory for markdown backend (relative to user-base)
      connection_string:
        type: string
        description: Connection string for postgres backend
      host:
        type: string
        description: SSH config host alias where database file resides (for remote access)
      schema_name:
        type: string
        default: public
        description: Database schema name for postgres backend
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
    description: Configuration for storage backend and location
  - name: import_cli
    type: string
    required: false
    description: Path to CLI script for importing data into this database
  - name: import_schedule
    type: string
    required: false
    description: Cron expression for scheduled imports (e.g., '0 0 * * *' for daily)
  - name: views
    type: array
    items:
      type: string
    required: false
    description: Views defined for this database
type_name: database
updated_at: '2026-01-05T19:25:18.021Z'
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

## Storage Backends

**DuckDB** (default):

- Embedded SQL database for structured queries
- Tables created dynamically from schema fields
- Ideal for medium datasets (thousands to millions of records)
- No external dependencies

**TSV** (file-based):

- Tab-separated values stored in plain text files
- Easy to inspect and edit manually
- Good for smaller datasets or data exchange
- Uses `path` in storage_config

**PostgreSQL** (external):

- External PostgreSQL database connection
- For large datasets or shared access
- Uses `connection_string` in storage_config
- Supports schema isolation

**Markdown** (entity system):

- Items stored as markdown files with YAML frontmatter
- Full integration with entity system features
- Uses `directory` in storage_config

## Schema Definition

Each database defines:

- **Fields**: Data structure with types, validation, and constraints
- **Table Name**: Identifier for the data collection
- **Storage Configuration**: Backend type and connection details
- **Performance Settings**: Indexes and optimization hints
- **Import Configuration**: CLI script path and cron schedule for data imports

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
