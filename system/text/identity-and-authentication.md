---
title: Identity and Authentication
type: text
description: >-
  Reference for the authentication and identity system covering JWT auth flow, Ed25519 key
  management, user registry, identity entities, role-based permissions, and nonce replay protection
created_at: '2026-03-02T06:35:46.540Z'
entity_id: 1be2748c-d02f-4393-ac28-009562fbeb32
base_uri: sys:system/text/identity-and-authentication.md
public_read: true
relations:
  - relates_to [[sys:system/text/system-design.md]]
  - relates_to [[sys:system/text/permission-system-design.md]]
  - relates_to [[sys:system/text/permission-system-overview.md]]
  - relates_to [[sys:system/schema/identity.md]]
  - relates_to [[sys:system/schema/role.md]]
updated_at: '2026-03-02T06:35:46.540Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
---

# Identity and Authentication

The identity and authentication system provides cryptographic authentication via Ed25519 signatures, JWT session tokens, and a file-based identity/role model for permission management.

## Authentication Flow

1. Client sends POST to `/api/users` with `data` and `signature` fields
2. `data` contains: `user_public_key` (hex), `timestamp` (ms), `nonce` (UUID)
3. Server hashes `data` with `ed25519.hash()` and verifies signature against public key
4. Server validates timestamp freshness (within 5-minute window)
5. Server checks nonce has not been used (replay protection)
6. Server verifies identity entity exists for the public key
7. Server issues JWT token signed with `config.jwt.secret` (HS256)
8. Client uses JWT in subsequent requests via `Authorization: Bearer <token>`

## Ed25519 Key Management

The system uses the `@trashman/ed25519-blake2b` library for asymmetric cryptography:

- **Private keys**: 32-byte random values (`crypto.randomBytes(32)`)
- **Public keys**: Derived from private key, stored as hex strings in identity entities
- **Signatures**: Hex-encoded Ed25519 signatures over Blake2b hashes

Key operations:

- `ed25519.publicKey(private_key)` -- Derive public key
- `ed25519.hash(data)` -- Blake2b hash for signing
- `ed25519.sign(hash, private_key, public_key)` -- Create signature
- `ed25519.verify(signature, hash, public_key)` -- Verify signature

No credentials are stored server-side. Authentication is purely signature-based with the public key as the identity anchor.

## Replay Protection

A nonce cache prevents signature replay attacks:

- In-memory Map tracks used nonces with expiration timestamps
- Default TTL: 5 minutes (matches timestamp validation window)
- Cleanup interval: 60 seconds
- Max cache size: 10,000 entries
- Nonce marked as used immediately after validation check (prevents TOCTOU races)

## Identity Entities

Identity entities are stored in `{USER_BASE_DIRECTORY}/identity/` as markdown files.

### Required Fields

| Field               | Type       | Description                           |
| ------------------- | ---------- | ------------------------------------- |
| `type`            | string     | Must be `identity`                  |
| `auth_public_key` | hex string | Ed25519 public key for authentication |
| `username`        | string     | Unique username identifier            |

### Permission Fields

| Field                          | Type    | Description                                       |
| ------------------------------ | ------- | ------------------------------------------------- |
| `permissions.create_threads` | boolean | Can create execution threads                      |
| `permissions.global_write`   | boolean | Write access to any resource                      |
| `rules`                      | array   | User-specific permission rules (highest priority) |

### Thread Configuration

Identity entities can include per-user thread execution configuration:

| Field                      | Description                                      |
| -------------------------- | ------------------------------------------------ |
| `tools`                  | Allowlist of available tools                     |
| `disallowed_tools`       | Denylist patterns                                |
| `permission_mode`        | Claude CLI permission mode                       |
| `mounts`                 | Volume mount allowlist with source, mode, target |
| `deny_paths`             | Gitignore-style path denial patterns             |
| `max_concurrent_threads` | Concurrency limit (default: 1)                   |
| `session_timeout_ms`     | Session timeout (default: 30 min)                |
| `network_policy`         | Domain allowlist and network blocking            |

## Role Entities

Role entities are stored in `{USER_BASE_DIRECTORY}/role/` and provide reusable permission rule sets.

### Structure

```yaml
type: role
rules:

- action: allow
  pattern: 'user:\*\*'
  reason: 'Full access to user resources'
- action: deny
  pattern: 'sys:system/schema/\*\*'
  reason: 'Cannot modify system schemas'
  ```

### Role Assignment

Identities link to roles via relations:
```yaml
relations:

- 'has_role [[user:role/admin.md]]'
- 'has_role [[user:role/public-reader.md]]'
  ```

## Permission Rule Evaluation

Rules use glob patterns (via picomatch) matched against resource base_uris. First matching rule wins.

### Resolution Order

1. User-specific rules from identity entity (highest priority)
2. Role rules from `has_role` relations (in declaration order)
3. Default: deny

### Read Permission Priority

1. Ownership check (user owns the resource)
2. User-specific rules
3. `public_read` setting on resource
4. Public user rules (fallback)

### Write Permission

1. Ownership (user owns resource)
2. `global_write: true` in identity permissions
3. Default: deny

## User Registry

The `user-registry.mjs` singleton manages user lookups and permission resolution:

- `find_by_public_key()` -- Look up identity entity, return user with resolved permissions
- `find_by_username()` -- Look up by username
- `user_has_access()` -- Check identity entity exists
- `get_user_rules()` -- Return resolved rules from identity and roles
- `list_users()` -- Return all identities

Identity and role entities are cached with file mtime-based invalidation. A scan-in-progress promise prevents cache stampede under concurrent requests.

## User Creation

`create_user()` generates an identity entity:

1. Derive public key from provided private key
2. Generate entity_id and timestamps
3. Write identity file with default rules: allow `user:**` and `sys:**`
4. Clear identity cache

## API Middleware

Request processing chain:

1. **JWT Parser**: Extract and validate JWT from Authorization header, set `req.user`
2. **Permission Context**: Create per-request permission context with resolved user rules
3. **Route Handlers**: Check permissions via `req.permission_context.check_permission()`
4. **Redaction Interceptor**: Strip response data the user lacks read access to

## Key Modules

| Module                                                  | Purpose                                         |
| ------------------------------------------------------- | ----------------------------------------------- |
| `libs-server/auth/nonce-cache.mjs`                    | Nonce-based replay protection                   |
| `libs-server/users/user-registry.mjs`                 | User lookup and permission resolution           |
| `libs-server/users/identity-loader.mjs`               | Identity entity caching with mtime invalidation |
| `libs-server/users/role-loader.mjs`                   | Role entity caching                             |
| `libs-server/users/permission-resolver.mjs`           | Rule resolution from identities and roles       |
| `libs-server/users/create-user.mjs`                   | Identity entity creation                        |
| `server/routes/users.mjs`                             | Authentication API endpoints                    |
| `server/middleware/jwt-parser.mjs`                    | JWT token extraction and validation             |
| `server/middleware/permission/permission-service.mjs` | Permission checking API                         |
| `server/middleware/rule-engine.mjs`                   | Glob-based rule evaluation                      |
| `system/schema/identity.md`                           | Identity entity type definition                 |
| `system/schema/role.md`                               | Role entity type definition                     |
