---
title: Prompt Schema
type: type_definition
extends: base
type_name: prompt
description: Schema for prompt entities used in the system
relations:
  - 'implements [[system/text/knowledge-base-schema.md]]'
  - 'extends [[system/schema/base.md]]'
---

# Prompt Schema

Prompt is a first-class content type in the knowledge base. It inherits all fields from the Base Schema.

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
