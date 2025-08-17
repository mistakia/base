---
type: type_definition
title: Prompt Schema
description: Schema for prompt entities used in the system
created_at: '2025-08-16T17:56:08.205Z'
entity_id: e4ac31d5-f140-48a6-a122-4855426f91b8
extends: entity
relations:
  - implements [[sys:system/text/knowledge-base-schema.md]]
  - extends [[sys:system/schema/entity.md]]
type_name: prompt
updated_at: '2025-08-16T17:56:09.133Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
---

# Prompt Schema

Prompt is a first-class content type in the knowledge base. It inherits all fields from the Entity Schema.

## Content Structure

Prompt content is the markdown body after the frontmatter.

## Example

```yaml
---
title: Example Prompt
type: prompt
description: Example prompt for demonstration
---
Prompt content goes here.
```
