---
title: Base URI Specification
type: text
description: Universal resource identifier scheme for distributed knowledge systems across local and remote infrastructure
user_id: '00000000-0000-0000-0000-000000000000'
created_at: '2025-06-06T20:45:00.000Z'
updated_at: '2025-06-06T20:45:00.000Z'
relations:
  - 'implements [[sys:text/system-design.md]]'
  - 'relates_to [[sys:text/knowledge-base-schema.md]]'
---

# Base URI Specification

## Design Rationale

Knowledge management systems require references to resources across distributed infrastructure including local repositories, remote servers, cloud services, and external systems. This URI scheme provides location-independent resource identification that remains valid as infrastructure evolves.

## URI Scheme Format

Standard RFC 3986 format: `scheme:[//authority]path[?query][#fragment]`

Where:

- `scheme`: Defines the access protocol and resource type
- `authority`: Specifies the server, service, or context (optional for some schemes)
- `path`: Location within the authority's namespace
- `query`: Optional parameters for resource access
- `fragment`: Optional reference to specific content within resource

**Note**: Custom schemes (`sys`, `user`) are private-use schemes for internal system operation and are not registered with IANA.

## Core Schemes

### `sys:` - System Repository

References to core schemas, workflows, and system configuration. Uses path-only format without authority component.

Examples:

- `sys:system/schema/task.md`
- `sys:system/workflow/default-workflow.md`
- `sys:system/text/system-design.md`

### `user:` - User Repository

References to user-specific content and configuration. Uses path-only format without authority component.

Examples:

- `user:task/project-alpha/feature-implementation.md`
- `user:workflow/daily-standup.md`
- `user:text/user-directory-structure.md`

### `ssh://` - Remote Server Access

References to resources on remote servers accessible via SSH configuration.

Examples:

- `ssh://database/etc/postgresql/config.md`
- `ssh://league/var/www/api/documentation.md`
- `ssh://storage.localdomain/mnt/backup/user-data/tasks.md`
- `ssh://nano-dev/opt/applications/docs/api.md`

Authority maps directly to SSH config host entries for seamless connection.

### `git://` - Version Control Repositories

References to files within git repositories with optional branch specification using query parameters.

Examples:

- `git://github.com/mistakia/league/docs/api.md`
- `git://gitlab.com/company/project/specs/feature.md?branch=develop`
- `git://internal.example.com/project.git/docs/deployment.md?branch=main`

For repositories accessed via SSH, use the ssh scheme separately:

- `ssh://league/var/git/internal.git` (repository access)
- Reference specific files through application logic

### `https://` - Web Resources

Standard HTTP/HTTPS for web-accessible resources following RFC 3986.

Examples:

- `https://api.league.com/documentation/endpoints.md`
- `https://storage.localdomain:8080/files/shared-notes.md`

## RFC 3986 Compliance Notes

- Custom schemes (`sys`, `user`) are private-use and not IANA registered
- All URIs follow standard RFC 3986 syntax rules
- Branch/version information uses query parameters (`?branch=name`)
- Authority components are properly formatted where required
- Path components use forward slashes as separators
