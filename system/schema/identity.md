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
  - name: thread_config
    type: object
    required: false
    description: Per-user thread execution configuration for container isolation
    properties:
      - name: tools
        type: array
        required: false
        description: >-
          Available built-in tools, maps to Claude CLI --tools flag (e.g. ["Read", "Glob", "Grep",
          "Bash", "Edit", "Write"])
        items:
          type: string
      - name: disallowed_tools
        type: array
        required: false
        description: >-
          Tool patterns to remove, maps to Claude CLI --disallowedTools flag (e.g. ["Bash(rm *)",
          "Bash(sudo *)"])
        items:
          type: string
      - name: permission_mode
        type: string
        required: false
        description: >-
          Maps to Claude CLI --permission-mode (e.g. "plan" for read-only). When unset, uses
          --dangerously-skip-permissions
      - name: mcp_config
        type: object
        required: false
        description: MCP server configuration passed via --mcp-config + --strict-mcp-config
      - name: mounts
        type: array
        required: false
        description: >-
          Volume mount allowlist. Each entry specifies a user-base directory to mount. Working
          directories are derived from rw mounts.
        items:
          type: object
          properties:
            - name: source
              type: string
              required: true
              description: Path relative to user-base root
            - name: mode
              type: string
              required: true
              enum:
                - ro
                - rw
              description: Mount mode (read-only or read-write)
            - name: target
              type: string
              required: false
              description: Override container mount path
      - name: deny_paths
        type: array
        required: false
        description: >-
          Gitignore-style patterns for sub-paths within mounted directories to deny via Claude Code
          permissions.deny rules (e.g. ["league/private/**", "league/config.*.js"])
        items:
          type: string
      - name: max_concurrent_threads
        type: number
        required: false
        description: Maximum concurrent sessions per user
      - name: session_timeout_ms
        type: number
        required: false
        description: Per-session timeout in milliseconds
      - name: append_system_prompt
        type: string
        required: false
        description: Additional system prompt text via --append-system-prompt
      - name: network_policy
        type: object
        required: false
        description: Network isolation settings
        properties:
          - name: allowed_domains
            type: array
            required: false
            description: Domain allowlist for sandbox network
            items:
              type: string
          - name: block_network_tools
            type: boolean
            required: false
            description: Block common network tools (curl, wget, etc.). Default true
      - name: base_cli
        type: object
        required: false
        description: Base CLI availability and permissions in user container
        properties:
          - name: enabled
            type: boolean
            required: false
            description: Whether base CLI is available. Default false
          - name: deny_commands
            type: array
            required: false
            description: >-
              Bash deny patterns for specific base subcommands. Default blocks write operations
              (entity create, entity update, schedule, queue). Read operations (entity list, entity
              get, search, thread list) are allowed.
            items:
              type: string
      - name: skills
        type: array
        required: false
        description: >-
          Claude Code skills to provision into the user's claude-home. Set to ["*"] for all
          skills or an explicit list of skill names. When absent, no skills are provisioned.
        items:
          type: string
      - name: browser
        type: object
        required: false
        description: >-
          CloakBrowser runtime configuration. When enabled, mounts host CloakBrowser
          infrastructure (venv, Chromium, profiles, daemon state) and sets PYTHONPATH.
        properties:
          - name: enabled
            type: boolean
            required: false
            description: Whether to mount CloakBrowser runtime. Default false
          - name: container_python_version
            type: string
            required: false
            description: Container system Python version for PYTHONPATH. Default '3.11'
          - name: venv_python_version
            type: string
            required: false
            description: Host venv Python version for PYTHONPATH. Default '3.12'
  - name: preferences
    type: object
    required: false
    description: User preference settings for the web client
    properties:
      - name: notification_sound_enabled
        type: boolean
        required: false
        description: Whether to play a sound when a thread session transitions from active to idle
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
  - name: tag_rules
    type: array
    required: false
    description: User-specific tag-based permission rules
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
        - name: tag
          type: string
          required: true
          description: Base URI of a tag entity (exact match)
        - name: pattern
          type: string
          required: false
          description: Optional resource path glob to scope the rule
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

## Thread Configuration

Identities with `permissions.create_threads: true` can have a `thread_config` object that controls how their threads execute in isolated Docker containers. This enables three-layer defense-in-depth:

1. **Volume mounts** (`mounts`): Control which user-base directories are visible in the container
2. **Claude Code permissions** (`deny_paths`): Block Read/Edit/Bash access to sensitive sub-paths within mounted directories
3. **PreToolUse hooks**: Runtime validation scripts baked into the container image

Tool availability is controlled via `tools` (allowlist), `disallowed_tools` (denylist), and `permission_mode`. Working directories are derived from `rw` mounts rather than configured separately.

The `base_cli` sub-config controls whether the base CLI is available in user containers. When enabled, the base submodule is mounted read-only and write operations are blocked by default.

The `skills` array controls which Claude Code skills are provisioned into the user's claude-home directory during bootstrap. The `browser` sub-config enables CloakBrowser runtime access by mounting host infrastructure and injecting `CLOAKBROWSER_HOME` and `PYTHONPATH` environment variables.

## Preferences

The `preferences` object stores user-specific settings for the web client. These are persisted to the identity entity file via the `PUT /api/users/preferences` endpoint with auto-commit. Currently supported:

- `notification_sound_enabled` (boolean): Play a sound when a session transitions from active to idle. Defaults to true when not set.

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
