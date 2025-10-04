---
title: Permission System Overview
type: text
description: >-
  Comprehensive overview of the permission system including user-based access control,
  public read functionality, and precedence rules
created_at: 2025-01-20T00:00:00.000Z
updated_at: 2025-01-20T00:00:00.000Z
entity_id: permission-system-overview
user_public_key: 0000000000000000000000000000000000000000000000000000000000000000
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

The permission system follows a specific precedence order:

### 1. Public Read (Highest Precedence)

If a resource has `public_read` explicitly set:

- **`public_read: true`**: Read operations granted immediately, bypassing all other permission checks
- **`public_read: false`**: Read operations denied immediately, bypassing all other permission checks
- **Write operations**: Still subject to ownership/permission rules (public_read only affects read access)

### 2. User-Based Rules

If `public_read` is not explicitly set (undefined):

- Normal permission evaluation through rule engine
- Checks user ownership and explicit permission rules
- Falls back to deny by default

### 3. Default Behavior

- Resources default to private access when `public_read` is not specified
- Access denied unless explicitly permitted through user-based rules

## Implementation Details

### Permission Check Flow

The system follows a two-stage permission check:

1. **Public Read Check**: For read operations, check if `public_read` is explicitly set
   - If `public_read: true`: Grant access immediately
   - If `public_read: false`: Deny access immediately
2. **Rule-Based Check**: If `public_read` is not explicitly set, evaluate user-based permission rules

### Thread Processing

Thread processing prioritizes public_read settings before applying redaction or access controls.

## Management Tools

### Entity Visibility CLI Tool

A command-line tool manages `public_read` settings for entities and threads:

```bash
# Basic usage
./cli/entity-visibility.sh set path/to/entity.md true

# Pattern-based batch operations
./cli/entity-visibility.sh set "task/**/*.md" true

# Preview mode
./cli/entity-visibility.sh set "**/*.md" true --dry-run
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
./cli/entity-visibility.sh set "text/**/*.md" true --dry-run

# Apply changes after review
./cli/entity-visibility.sh set "text/**/*.md" true
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
