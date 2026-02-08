---
title: Identity Schema
type: type_definition
description: User account entity with authentication credentials and permissions
base_uri: sys:system/schema/identity.md
created_at: '2026-02-07T21:00:00.000Z'
entity_id: a1c2e4f6-8a0b-4c2d-8e0f-2a4b6c8d0e2f
extends: entity
properties:
  - name: auth_public_key
    type: string
    required: true
    description: Hex-encoded public key for authentication
  - name: username
    type: string
    required: true
    description: Unique username identifier
  - name: permissions
    type: object
    required: false
    description: Permission flags for the identity
    properties:
      - name: create_threads
        type: boolean
        required: false
        description: Whether the identity can create threads
      - name: global_write
        type: boolean
        required: false
        description: Whether the identity has write access to all resources
  - name: rules
    type: array
    required: false
    description: User-specific permission rules
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
type_name: identity
updated_at: '2026-02-07T21:00:00.000Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
---

# Identity

Identity entities represent user accounts in the system. Each identity has authentication credentials and can be assigned roles for permission management.

## Authentication

Identities use public key cryptography for authentication. The `auth_public_key` property contains the hex-encoded public key used to verify signatures.

## Permission Model

Permissions are resolved in order:

1. User-specific rules from the identity entity
2. Role rules from `has_role` relations in order
3. Default deny

## Special Identities

- `_public.md`: Fallback identity for unauthenticated requests

## Relations

Identities commonly use these relation types:

- `has_role`: Roles assigned to the identity

Example:

```yaml
relations:
  - 'has_role [[user:role/admin.md]]'
  - 'has_role [[user:role/public-reader.md]]'
```
