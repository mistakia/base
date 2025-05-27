---
type: type_definition
type_name: type_extension
title: Type Extension
extends: base
description: Type extensions allow adding new properties to existing types
properties:
  - name: extends
    type: string
    required: true
    description: The base type being extended
---

# Type Extension

Type extensions allow adding new properties to existing types in the user knowledge base. This enables customization of the schema without modifying the core system types.

## Extending Types

Users can extend system types by:

1. Creating a type_extension document
2. Specifying which type to extend
3. Adding custom properties directly in the frontmatter

## Example

```yaml
---
title: My Task Extension
type: type_extension
extends: task

# Custom user properties
completion_percentage: 75
review_cycle: weekly
---
```

## Usage

Type extensions should be stored in the `user/schema/` directory to maintain separation from content items. This keeps schema extensions organized and discoverable.

Example path: `user/schema/custom_task_extension.md`

All extensions maintain compatibility with the base system while allowing flexibility for specific use cases.
