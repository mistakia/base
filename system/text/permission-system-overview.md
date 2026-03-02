---
title: Permission System Overview
type: text
description: >-
  Comprehensive overview of the permission system including user-based access control, public read
  functionality, and precedence rules
base_uri: sys:system/text/permission-system-overview.md
created_at: '2025-01-20T00:00:00.000Z'
entity_id: ae3b20e9-a091-4da3-a422-f807b3bb67f0
public_read: true
relations:
  - relates_to [[sys:system/text/permission-system-design.md]]
  - relates_to [[sys:system/text/system-design.md]]
  - relates_to [[sys:system/text/identity-and-authentication.md]]
updated_at: '2026-03-02T00:00:00.000Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
visibility_analyzed_at: '2026-02-16T04:37:15.754Z'
---

# Permission System Overview

The Base system implements a comprehensive permission system that controls access to entities, threads, and other resources. The system supports both user-based access control and public read functionality.

## Core Components

### Permission Middleware

The permission system uses middleware components for validation, rule evaluation, and content redaction when access is denied.

### User Registry

User permissions are managed through a registry system where users are identified by public keys and permission rules are stored with pattern-based access control.

## Permission Types

### 1. User-Based Permissions

Access granted based on user identity, resource ownership, and explicit permission rules.

### 2. Public Read Access

Entities and threads can be marked for public read access using the `public_read` field.

#### Entity Public Read

Entities can include a `public_read: true` field in their YAML frontmatter:

```yaml
---
title: Public Document
type: text
public_read: true
created_at: 2025-01-20T00:00:00.000Z
updated_at: 2025-01-20T00:00:00.000Z
user_public_key: owner-public-key
---
This document is publicly readable.
```

#### Thread Public Read

Thread metadata can include a `public_read: true` field:

```json
{
  "thread_id": "example-thread-id",
  "user_public_key": "owner-public-key",
  "session_provider": "base",
  "thread_state": "active",
  "public_read": true,
  "created_at": "2025-01-20T00:00:00.000Z",
  "updated_at": "2025-01-20T00:00:00.000Z"
}
```

## Permission Precedence

The permission system follows a specific precedence order for determining access:

### 1. User-Specific Rules (Highest Precedence for Authenticated Users)

For authenticated users (not the public user):

- **If a user-specific rule matches**: That rule's decision (allow/deny) is respected immediately
- **If no user-specific rule matches**: Continue to check public_read setting

This ensures that explicit user permissions take precedence when they apply.

### 2. Public Read File Permission

If `public_read` is explicitly set on the resource:

- **`public_read: true`**: Read access granted for all users (both authenticated and unauthenticated)
- **`public_read: false`**: Read access denied for all users (both authenticated and unauthenticated)
- **Write operations**: Still subject to ownership/permission rules (public_read only affects read access)

This applies to both signed-in and non-signed-in users when no user-specific rule matched.

### 3. Public User Rules

If neither user-specific rules matched nor `public_read` is explicitly set:

- Evaluate public user rules from users.json
- These rules apply to all users as a fallback
- Falls back to deny by default if no public rules match

### 4. Default Behavior

- Resources default to private access when no rules match
- Access denied unless explicitly permitted

## Implementation Details

### Permission Check Flow

The system follows a multi-stage permission check:

1. **User-Specific Rules Check**: For authenticated users (excluding public user)
   - Evaluate user-specific permission rules from users.json
   - If a rule matches: Return that rule's decision (allow/deny)
   - If no rule matches: Continue to next stage
2. **Public Read Check**: Check if `public_read` is explicitly set on the resource
   - If `public_read: true`: Grant read access immediately
   - If `public_read: false`: Deny read access immediately
   - If not set: Continue to next stage
3. **Public User Rules Check**: Evaluate public user rules from users.json
   - Apply public user permission rules as fallback
   - Return the result (allow/deny based on rule matching)
4. **Default Deny**: If no rules match at any stage, access is denied by default

### Thread Processing

Thread processing prioritizes public_read settings before applying redaction or access controls.

## Management Tools

### Entity Visibility CLI Tool

A command-line tool manages `public_read` settings for entities and threads:

```bash
# Basic usage
base entity visibility set path/to/entity.md true

# Pattern-based batch operations
base entity visibility set "task/**/*.md" true

# Preview mode
base entity visibility set "**/*.md" true --dry-run
```

**Features**: Pattern matching, dry-run mode, validation, batch operations, and support for both entity files and thread metadata.

### Entity Creation Tool

The entity creation tool supports setting `public_read` during entity creation, allowing immediate public access configuration.

## Security Considerations

### Read-Only Public Access

`public_read` only affects read operations. Write, update, and delete operations always require proper authentication and authorization.

### Default Privacy

Entities and threads are private by default. `public_read` must be explicitly set to `true`, with invalid values defaulting to private access.

### Validation

The system validates `public_read` values during parsing, treating non-boolean values as `false`.

### Gradual Adoption

Organizations can selectively enable public read access without impacting existing permission rules or workflows.

## Examples

### Making Documentation Public

Use the CLI tool to batch-update documentation visibility:

```bash
# Preview changes with dry-run
base entity visibility set "text/**/*.md" true --dry-run

# Apply changes after review
base entity visibility set "text/**/*.md" true
```

### Creating Public Knowledge Base

New entities can be created with public read access enabled from the start using the entity creation tool.

### Thread Visibility

Thread metadata files can include `public_read: true` to enable public access to thread content and execution history.

## Testing

Comprehensive test coverage includes integration tests, CLI validation, permission precedence verification, and edge case handling.

## Related Documentation

- [Entity Relations](./entity-relations.md): Understanding entity relationships
- [Thread Metadata Schema](./thread-metadata-schema.json): Thread metadata structure
- [System Design](./system-design.md): Overall system architecture
- [Workflow](./workflow.md): Workflow execution and permissions
