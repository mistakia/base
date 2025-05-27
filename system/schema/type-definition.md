---
type: type_definition
type_name: type_definition
title: Type Definition
description: Type definitions define the structure of content types
properties:
  - name: type_name
    type: string
    required: true
    description: The name of the type
  - name: extends
    type: string
    optional: true
    description: The base type this type extends
  - name: properties
    type: array
    description: The properties of the type
    optional: true
    items:
      type: object
      properties:
        name:
          type: string
          description: Name of the property
        type:
          type: string
          enum: [string, number, boolean, date, datetime, array, object, enum]
          description: Data type of the property
        required:
          type: boolean
          description: Whether the property is required
          optional: true
        optional:
          type: boolean
          description: Whether the property is optional
          optional: true
        description:
          type: string
          description: Description of the property
---

# Type Definition

Type definitions define the structure of content types in the knowledge base. They specify the properties, requirements, and relationships for each type of content.

## System vs User Types

Type definitions exist in two categories:

- System types (in the `system/schema/` directory)
- User-defined types (in the `user/schema/` directory)

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
type_name: my_custom_type
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

## Extending Types

To extend an existing type:

1. Create a type_definition document
2. Set the `extends` property to the name of the type you want to extend
3. Add your custom properties

When a type extends another type, it automatically inherits all properties from the parent type. You can also override properties by redefining them with the same name.

## Usage

Type definitions should be stored in:

- System types: `system/schema/` directory
- User types: `user/schema/` directory

This keeps schema definitions organized and discoverable.
