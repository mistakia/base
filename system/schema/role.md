---
title: Role Schema
type: type_definition
description: Permission role entity with reusable rule sets
base_uri: sys:system/schema/role.md
created_at: '2026-02-07T21:00:00.000Z'
entity_id: b2d4f608-9b1c-4d3e-9f1a-3b5c7d9e1f3a
extends: entity
properties:
  - name: rules
    type: array
    required: true
    description: Permission rules for this role
    items:
      type: object
      properties:
        - name: action
          type: string
          enum:
            - allow
            - deny
          required: true
          description: Whether to allow or deny access
        - name: pattern
          type: string
          required: true
          description: Glob pattern to match resource paths
        - name: reason
          type: string
          required: false
          description: Explanation for the rule
public_read: true
type_name: role
updated_at: '2026-02-07T21:00:00.000Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
visibility_analyzed_at: '2026-02-16T04:34:21.599Z'
---

# Role

Roles define reusable sets of permission rules that can be assigned to identities. This eliminates rule duplication across users and simplifies permission management.

## Rule Evaluation

Rules are evaluated in array order. The first matching rule determines the permission outcome.

## Rule Structure

Each rule contains:

- `action`: Either `allow` or `deny`
- `pattern`: Glob pattern to match resource paths (uses picomatch)
- `reason`: Optional explanation for the rule

## Common Roles

- `admin`: Full access to all resources
- `public-reader`: Base read permissions for public content

## Example

```yaml
---
title: Admin
type: role
rules:
  - action: allow
    pattern: '**/*'
---
```
