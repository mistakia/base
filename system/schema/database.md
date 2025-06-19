---
type: type_definition
type_name: database
title: Database
extends: base
description: Structured data collection with defined schema and configurable storage
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
          enum: [string, number, boolean, datetime, array, object]
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
        description: PostgreSQL connection string for external storage
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
---

# Database

A database defines a structured data collection with a schema that governs how data is stored and accessed. Databases support both local storage within the system's PostgreSQL instance and external storage in separate databases for large datasets.

## What is a Database

In this system, a database is:

- A schema definition with typed fields and validation rules
- A collection of related data items that follow the schema
- A storage configuration that determines where data lives
- A set of views for displaying and filtering data

## Storage Approach

**Local Storage** (default):

- Items stored as JSONB in system PostgreSQL database
- No configuration required
- Full integration with entity system features

**External Storage**:

- Items stored in dedicated PostgreSQL tables
- Activated by providing `storage_config`
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
