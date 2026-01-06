---
title: Choose Entity Type
type: guideline
description: Guidelines for selecting the appropriate entity type when creating new entities
base_uri: sys:system/guideline/choose-entity-type.md
created_at: '2023-06-28T10:00:00.000Z'
entity_id: 44f5b239-8c30-4de5-a3a8-f5c983a51f22
globs:
  - '**/*.md'
observations:
  - '[standard] Proper entity type selection ensures data consistency'
  - '[governance] Entity types determine required fields and validation rules'
relations:
  - implements [[sys:system/schema/entity.md]]
  - related_to [[sys:system/guideline/write-entity.md]]
  - related_to [[sys:system/guideline/write-guideline.md]]
  - related_to [[sys:system/guideline/write-task.md]]
updated_at: '2026-01-05T19:25:13.919Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
---

# Choose Entity Type

## Guidelines

### Understanding Entity Types

- When creating a new entity, you MUST select a type that accurately represents the nature and purpose of the entity
- The entity type MUST be one of the predefined types in the `sys:system/schema/` directory
- You MUST understand the specific requirements and properties associated with each entity type
- You SHOULD review the corresponding schema file in `sys:system/schema/` before creating a new entity

### Common Entity Types and Use Cases

- `task`: SHOULD be used for discrete units of work that need to be completed
  - Example: "Implement login feature", "Research database options", "Write documentation"
  - Key properties: status, priority, start/finish dates, assigned_to
- `guideline`: SHOULD be used for standards, procedures, or best practices
  - Example: "JavaScript coding standards", "Documentation guidelines", "Task naming conventions"
  - Key properties: globs
  - Note: Guidelines will be used in prompts to guide system behavior
- `text`: SHOULD be used for general textual content without specialized requirements

  - Example: "Project overview", "Meeting notes", "Research findings"
  - Has minimal additional properties beyond the base schema

- `physical_item`: SHOULD be used for any tangible item in the physical world

  - Example: "Dell XPS Laptop", "Conference room table", "Whiteboard markers"
  - Key properties: manufacturer, model_number, storage_location

- `digital_item`: SHOULD be used for files, software, digital resources, or online services

  - Example: "Monthly Report.pdf", "PostgreSQL Database", "Figma Design Tool"
  - Key properties: version, license_type, access_url

- `person`: SHOULD be used for information about individuals

  - Example: "Jane Doe", "John Smith"
  - Key properties: contact_information, role, organization

- `organization`: SHOULD be used for information about companies or groups

  - Example: "Acme Corporation", "Engineering Team", "Open Source Community"
  - Key properties: website, industry, size

- `physical_location`: SHOULD be used for places and locations
  - Example: "Headquarters Office", "Storage Room B", "Main Conference Room"
  - Key properties: address, capacity, features

### Type Extension and Compatibility

- All entity types extend the `entity` schema with common properties like title, description, and relations
- Entity types MAY have specialized properties that support their specific purpose
- You MUST include all required properties for the chosen entity type
- You SHOULD use the appropriate relation types for the entity type
