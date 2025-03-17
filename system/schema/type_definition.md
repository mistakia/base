---
title: Type Definition
type: type_definition
description: Type definitions define the structure of content types
properties:
  - name: extends
    type: string
    required: false
    description: The base type this type extends
  - name: properties
    type: array
    items:
      type: object
      properties:
        name:
          type: string
          description: Name of the property
        type:
          type: string
          enum: [string, number, boolean, date, datetime, array, object]
          description: Data type of the property
        items:
          type: object
          description: For array types, defines the item structure
        required:
          type: boolean
          description: Whether the property is required
        enum:
          type: array
          description: List of allowed values for the property
        description:
          type: string
          description: Description of the property
        auto_generated:
          type: boolean
          description: Whether the property is automatically generated
    required: false
    description: Properties that define this type
---

# Type Definition

Type definitions define the structure of content types in the knowledge base. They specify the properties, requirements, and relationships for each type of content.

## System vs User Types

Type definitions exist in two categories:

- System types (in the `system/schema/` directory)
- User-defined types (in the `data/schema/` directory)

User-defined types can extend system types to create customized content structures.

## Defining Types

A type definition includes:

- The type's name and description
- What base type it extends (if any)
- Properties specific to this type
- Property constraints (type, requirements, enum values)

## Example

```yaml
---
title: My Custom Type
type: type_definition
extends: task
properties:
  - name: completion_percentage
    type: number
    required: false
    description: Percentage of completion
  - name: review_cycle
    type: string
    enum: [daily, weekly, monthly]
    required: false
    description: How often the item is reviewed
---
```

## Inheritance

Types inherit all properties from their parent types. The inheritance chain can be multiple levels deep (e.g., a user type might extend a system type that itself extends the base type).
