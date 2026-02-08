# Permission System Design

This document describes the permission system architecture in the Base system, providing guidance for developers integrating permission checks into new features.

## 1. Overview

### Purpose

The permission system controls access to resources (entities, threads, files) in the Base system. It determines who can read and write resources based on ownership, user-specific rules, and public access settings.

### Design Principles

The system follows three core principles:

1. **Default Deny**: If no rule explicitly allows access, access is denied
2. **Owner Override**: Resource owners always have full read/write access to their resources
3. **First Match Wins**: Permission rules are evaluated in order; the first matching rule determines the outcome

### Access Control Model

The system implements Attribute-Based Access Control (ABAC) with role-like elements:

- **User attributes**: `user_public_key` (identity), `create_threads`, `global_write`
- **Resource attributes**: `owner_public_key`, `public_read`
- **Pattern-based rules**: Glob patterns for fine-grained path matching

### Intended Audience

This document is for developers who need to:

- Add permission checks to new API routes
- Understand how permission decisions are made
- Configure user or resource permissions

## 2. Core Concepts

### 2.1 Authentication

Authentication identifies the user making a request via JWT tokens.

**Token Flow:**

1. Client includes JWT in `Authorization: Bearer {token}` header
2. `parse_jwt_token()` middleware extracts and verifies the token
3. On success, `req.user` is set with decoded payload including `user_public_key`
4. On failure or missing token, `req.user` is set to `null` (public access)

**Key characteristics:**

- Non-blocking: Requests proceed even without valid tokens (enables public access)
- Token verification uses `config.jwt.secret`
- User identity is the hex-encoded public key

```javascript
// Token payload structure
{
  user_public_key: "10ba842b1307...",  // Hex public key
  // ... additional claims
}
```

### 2.2 Authorization Model

Authorization determines what an authenticated (or public) user can do.

**Permission Types:**

| Type                 | Scope      | Description                                                     |
| -------------------- | ---------- | --------------------------------------------------------------- |
| User permissions     | Per-user   | Stored in `users.json`, defines what a user can access          |
| Resource permissions | Per-entity | Stored in entity frontmatter (`public_read`, `user_public_key`) |
| Permission rules     | Per-user   | Pattern-based rules for fine-grained access control             |

**User Permission Flags:**

| Flag             | Type    | Description                                             |
| ---------------- | ------- | ------------------------------------------------------- |
| `create_threads` | boolean | Allows user to create new threads                       |
| `global_write`   | boolean | Grants write access to all owned resources (admin-like) |
| `rules`          | array   | Pattern-based permission rules                          |

**Resource Permission Fields:**

| Field             | Type    | Description                                                               |
| ----------------- | ------- | ------------------------------------------------------------------------- |
| `user_public_key` | string  | Owner's public key (required on all entities)                             |
| `public_read`     | boolean | If `true`, anyone can read; if `false`, only authenticated users or owner |

### 2.3 Permission Rules

Rules define pattern-based access control for users.

**Rule Structure:**

```javascript
{
  "action": "allow" | "deny",
  "pattern": "glob-pattern" | "is_owner"
}
```

**Pattern Matching:**

- Uses `picomatch` library for glob matching
- Patterns match against base-URI paths (e.g., `user:task/**`, `sys:system/**`)
- Special pattern `is_owner` checks resource ownership dynamically

**Implicit Parent Access:**

When an `allow` rule grants access to a nested path, parent directories are implicitly accessible for navigation:

```javascript
// Rule: { "action": "allow", "pattern": "user:repository/active/base/**" }
// Implicitly allows read access to:
//   - user:repository
//   - user:repository/active
//   - user:repository/active/base
```

**Example Rules:**

```javascript
{
  "rules": [
    { "action": "allow", "pattern": "is_owner" },           // Allow access to owned resources
    { "action": "deny", "pattern": "user:workflow/secret.md" },  // Deny specific file
    { "action": "allow", "pattern": "user:task/**" },       // Allow all tasks
    { "action": "allow", "pattern": "sys:system/**" }       // Allow system resources
  ]
}
```

## 3. Permission Decision Flow

### 3.1 Read Permission Priority

Read permissions are checked in this order (first match wins):

1. **Ownership Check**

   - If `user_public_key === resource.owner_public_key` → ALLOW
   - Reason: "User is owner of the resource"

2. **User-Specific Rules** (authenticated users only)

   - Load user's rules from `users.json`
   - Evaluate rules using rule engine
   - If match found → use rule's action (allow/deny)

3. **Explicit public_read Setting**

   - If `public_read === true` → ALLOW ("Resource has public_read explicitly enabled")
   - If `public_read === false` → DENY ("Resource has public_read explicitly disabled")

4. **Public User Rules** (fallback)

   - Load rules for the "public" user entry
   - Evaluate rules using rule engine
   - If match found → use rule's action

5. **Default** → DENY ("No matching permission rules")

### 3.2 Write Permission Priority

Write permissions are more restrictive:

1. **Authentication Required**

   - If no `user_public_key` or user is "public" → DENY
   - Reason: "Write access requires authentication"

2. **Ownership Check**

   - If `user_public_key === resource.owner_public_key` → ALLOW
   - Reason: "User is owner of the resource"

3. **Global Write Check**

   - If user has `global_write: true` → ALLOW
   - Reason: "User has global write permission"

4. **Default** → DENY ("Only resource owner has write access")

### 3.3 Decision Flowcharts

**Read Permission Flow:**

```
┌─────────────────────────────────────┐
│ Is user authenticated and owner?    │
└─────────────────┬───────────────────┘
                  │
        YES ──────┴────── NO
         │                 │
         ▼                 ▼
      ALLOW     ┌─────────────────────────────┐
                │ Check user-specific rules    │
                │ (if authenticated)           │
                └─────────────┬───────────────┘
                              │
                    MATCH ────┴──── NO MATCH
                      │                │
                      ▼                ▼
                 Use rule      ┌─────────────────────────┐
                 action        │ Is public_read explicit? │
                               └───────────┬─────────────┘
                                           │
                              YES ─────────┴───────── NO
                               │                      │
                       ┌───────┴───────┐              ▼
                       │               │    ┌─────────────────────┐
                 true: ALLOW    false: DENY │ Check public rules   │
                                            └──────────┬──────────┘
                                                       │
                                            MATCH ─────┴───── NO MATCH
                                              │                  │
                                              ▼                  ▼
                                         Use rule             DENY
                                         action            (default)
```

**Write Permission Flow:**

```
┌───────────────────────────┐
│ Is user authenticated?    │
└───────────┬───────────────┘
            │
   NO ──────┴────── YES
    │                │
    ▼                ▼
  DENY    ┌─────────────────────────┐
          │ Is user resource owner?  │
          └───────────┬─────────────┘
                      │
            YES ──────┴────── NO
             │                 │
             ▼                 ▼
          ALLOW    ┌─────────────────────────┐
                   │ Has global_write flag?   │
                   └───────────┬─────────────┘
                               │
                     YES ──────┴────── NO
                      │                 │
                      ▼                 ▼
                   ALLOW              DENY
```

## 4. Architecture

### 4.1 Module Organization

The permission system is organized in `/server/middleware/permission/`:

```
server/middleware/permission/
├── index.mjs              # Public exports
├── permission-service.mjs # Main API functions
├── permission-context.mjs # Request-scoped caching and engine
├── middleware.mjs         # Express middleware functions
└── resource-metadata.mjs  # Metadata loading for threads/entities

server/middleware/
├── jwt-parser.mjs         # JWT token parsing
└── rule-engine.mjs        # Permission rule evaluation
```

**Module Responsibilities:**

| Module                   | Responsibility                                                                                                             |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `permission-service.mjs` | High-level API: `check_permission()`, `check_permissions_batch()`, `check_thread_permission()`                             |
| `permission-context.mjs` | Request-scoped caching, implements permission checking logic                                                               |
| `middleware.mjs`         | Express middleware: `attach_permission_context()`, `check_thread_permission_middleware()`, `check_filesystem_permission()` |
| `resource-metadata.mjs`  | Loads metadata from threads (`metadata.json`) and entities (frontmatter)                                                   |
| `rule-engine.mjs`        | Evaluates permission rules using picomatch glob matching                                                                   |

### 4.2 Request Lifecycle

A typical permission-checked request flows through these stages:

```
1. Request arrives
        │
        ▼
2. parse_jwt_token() middleware
   - Extracts JWT from Authorization header
   - Sets req.user (or null for public)
        │
        ▼
3. attach_permission_context() middleware
   - Creates PermissionContext with user_public_key
   - Attaches to req.permission_context
        │
        ▼
4. Route-specific permission middleware
   - check_thread_permission_middleware() for threads
   - check_filesystem_permission() for filesystem
   - Sets req.access with read_allowed, write_allowed
        │
        ▼
5. Route handler
   - Checks req.access.read_allowed / write_allowed
   - Returns 403 or proceeds with operation
        │
        ▼
6. Response (with optional redaction if access denied)
```

### 4.3 Key Components

**PermissionContext Class** (`permission-context.mjs`)

Request-scoped class that caches permission data to avoid duplicate reads:

```javascript
class PermissionContext {
  constructor({ user_public_key })

  // Caching methods
  async get_resource_metadata(resource_path)  // Cached metadata loading
  async get_user_rules()                       // Cached user rules
  async get_public_rules()                     // Cached public rules
  async get_global_write_permission()          // Cached global_write check

  // Permission checking
  async check_permission({ resource_path, metadata })  // Returns { read, write }

  clear_cache()  // Reset all cached data
}
```

**Rule Engine** (`rule-engine.mjs`)

Evaluates permission rules against resource paths:

```javascript
// Main function
evaluate_permission_rules({ rules, resource_path, user_public_key })
// Returns: { allowed: boolean, reason: string, matching_rule: object|null }

// Helper functions
generate_parent_directory_patterns(pattern) // For implicit parent access
validate_permission_rule(rule) // Validates rule structure
validate_permission_rules(rules) // Validates array of rules
```

**Resource Metadata** (`resource-metadata.mjs`)

Loads metadata from different resource types:

```javascript
load_resource_metadata({ resource_path }) // Unified loader (auto-detects type)
load_thread_metadata({ thread_id }) // Thread-specific
load_entity_metadata({ resource_path }) // Entity-specific
map_thread_id_to_base_uri(thread_id) // Converts thread ID to base-uri
```

## 5. Integration Guide

### 5.1 Adding Permission Checks to Routes

**Step 1: Apply JWT parsing (usually global)**

```javascript
import { parse_jwt_token } from '#server/middleware/jwt-parser.mjs'

// In server setup (typically already done globally)
app.use(parse_jwt_token())
```

**Step 2: Attach permission context to route**

```javascript
import { attach_permission_context } from '#server/middleware/permission/index.mjs'

router.use(attach_permission_context())
```

**Step 3: Check permissions in handler**

```javascript
router.get('/:resource_id', async (req, res) => {
  const context = req.permission_context
  const resource_path = `user:myresource/${req.params.resource_id}.md`

  const result = await context.check_permission({ resource_path })

  if (!result.read.allowed) {
    return res.status(403).json({ error: result.read.reason })
  }

  // Proceed with operation...
})
```

### 5.2 Common Patterns

**Single Resource Permission Check:**

```javascript
import { check_permission } from '#server/middleware/permission/index.mjs'

const result = await check_permission({
  user_public_key: req.user?.user_public_key,
  resource_path: 'user:task/my-task.md'
})

if (result.read.allowed) {
  // Can read
}
if (result.write.allowed) {
  // Can write
}
```

**Batch Permission Checking:**

```javascript
import { check_permissions_batch } from '#server/middleware/permission/index.mjs'

const results = await check_permissions_batch({
  user_public_key: req.user?.user_public_key,
  resource_paths: [
    'user:task/task-1.md',
    'user:task/task-2.md',
    'user:task/task-3.md'
  ]
})

// results['user:task/task-1.md'].read.allowed === true/false
```

**Thread-Specific Permission Check:**

```javascript
import { check_thread_permission } from '#server/middleware/permission/index.mjs'

const result = await check_thread_permission({
  user_public_key: req.user?.user_public_key,
  thread_id: 'abc123-def456'
})
```

**Using Middleware for Thread Routes:**

```javascript
import {
  attach_permission_context,
  check_thread_permission_middleware
} from '#server/middleware/permission/index.mjs'

router.use(attach_permission_context())
router.use(check_thread_permission_middleware())

router.put('/:thread_id/state', async (req, res) => {
  if (!req.access?.write_allowed) {
    return res.status(403).json({ error: req.access?.reason })
  }
  // Proceed with update...
})
```

### 5.3 Code Examples

**Example: Protected Entity Route**

```javascript
import express from 'express'
import { parse_jwt_token } from '#server/middleware/jwt-parser.mjs'
import {
  attach_permission_context,
  check_permission
} from '#server/middleware/permission/index.mjs'

const router = express.Router()

router.use(parse_jwt_token())
router.use(attach_permission_context())

router.get('/entity/:type/:name', async (req, res) => {
  const resource_path = `user:${req.params.type}/${req.params.name}.md`
  const context = req.permission_context

  const { read, write } = await context.check_permission({ resource_path })

  if (!read.allowed) {
    return res.status(403).json({
      error: 'Access denied',
      reason: read.reason
    })
  }

  // Load and return entity...
  res.json({
    entity: loadedEntity,
    permissions: { can_read: true, can_write: write.allowed }
  })
})

router.put('/entity/:type/:name', async (req, res) => {
  const resource_path = `user:${req.params.type}/${req.params.name}.md`
  const context = req.permission_context

  const { write } = await context.check_permission({ resource_path })

  if (!write.allowed) {
    return res.status(403).json({
      error: 'Write access denied',
      reason: write.reason
    })
  }

  // Update entity...
})
```

**Example: Checking Create Permission**

```javascript
import { check_create_threads_permission } from '#server/middleware/permission/index.mjs'

router.post('/threads', async (req, res) => {
  const user_public_key = req.user?.user_public_key

  if (!user_public_key) {
    return res.status(401).json({ error: 'Authentication required' })
  }

  const can_create = await check_create_threads_permission(user_public_key)

  if (!can_create) {
    return res.status(403).json({ error: 'User cannot create threads' })
  }

  // Create thread...
})
```

## 6. Configuration

### 6.1 User Permissions

User permissions can be stored using either entity-based storage (preferred) or the legacy `users.json` file. The system loads from entities first and falls back to `users.json` if no matching entity is found.

#### Entity-Based Storage (Preferred)

User accounts are stored as **identity entities** in the `identity/` directory, with reusable permission sets defined as **role entities** in the `role/` directory. See Section 10 for full details on the entity-based system.

```
user-base/
  identity/                    # User account entities
    trashman.md
    arrin.md
    _public.md                 # Special: fallback for unauthenticated
  role/                        # Role definition entities
    admin.md
    public-reader.md
```

#### Legacy JSON Storage (Fallback)

For backward compatibility, the system also supports `users.json` in the user base directory.

**File Structure:**

```json
{
  "users": {
    "<user_public_key>": {
      "username": "string",
      "created_at": "ISO timestamp",
      "permissions": {
        "create_threads": true,
        "global_write": false,
        "rules": [{ "action": "allow", "pattern": "pattern" }]
      }
    },
    "public": {
      "username": "public",
      "permissions": {
        "rules": [{ "action": "allow", "pattern": "user:task/**" }]
      }
    }
  }
}
```

**Special "public" User / `_public` Identity:**

The `public` entry in `users.json` (or `_public.md` identity entity) defines default rules for unauthenticated access. Its rules are evaluated as the final fallback when:

- User is not authenticated, OR
- Authenticated user's rules don't match, AND
- Resource doesn't have explicit `public_read` setting

### 6.2 Entity Permissions

Entity-level permissions are set in the YAML frontmatter.

**Required Fields:**

```yaml
---
user_public_key: '10ba842b1307...' # Owner's public key (required)
---
```

**Optional Fields:**

```yaml
---
user_public_key: '10ba842b1307...'
public_read: true # Explicitly allow public read access
---
```

**Setting public_read:**

- `public_read: true` - Anyone can read (overrides rules)
- `public_read: false` - Only owner or users with matching rules can read
- Omitted - Falls back to rule evaluation (default private behavior)

## 7. Security Considerations

### Token Validation

- JWT tokens are verified against `config.jwt.secret`
- Invalid or expired tokens result in `req.user = null` (public access)
- Token tampering is detected by signature verification

### Path Traversal Prevention

- Resource paths use base-URI format (`user:`, `sys:`) not filesystem paths
- `resolve_base_uri()` converts base-URIs to safe absolute paths
- Direct filesystem path access is validated against user base directory

### Privilege Escalation Protection

- Write access requires authentication AND (ownership OR global_write)
- `global_write` should only be granted to trusted admin users
- Ownership is determined by `user_public_key` stored in resource metadata

### Information Leakage Prevention

- Response redaction masks sensitive content when access is denied (see Section 8)
- Redacted responses use block characters (`█`) to indicate hidden content
- Structural information is preserved for navigation and UI rendering

### Best Practices

1. Always check permissions before returning resource content
2. Use `check_permissions_batch()` for listing operations to avoid N+1 queries
3. Set `public_read: false` explicitly on sensitive entities
4. Review `public` user rules to understand default access
5. Use DEBUG=permission:\* to troubleshoot permission issues

## 8. Content Redaction System

When a user lacks read permission for a resource, the system does not simply hide or omit the content. Instead, it returns a **redacted version** that preserves structure while masking sensitive information. This approach allows users to see that content exists and navigate the system, while preventing access to the actual data.

### Design Philosophy

**Show redacted content rather than nothing at all.** This principle enables:

- Users can see directory structures and know files exist
- UI can render lists and navigation without gaps
- Structural metadata (types, counts, timestamps shapes) remain visible
- Clear visual indication that access is restricted, not that content is missing

### Redaction Character

All redacted content uses the Unicode block character:

```javascript
const REDACT_CHAR = '█'
```

### Content Type Strategies

The redaction system applies different strategies based on content type:

**Text Content:**

```javascript
// Input:  "This is secret content"
// Output: "████ ██ ██████ ███████"
// Preserves: word boundaries, line structure, length approximation
```

**Code Content:**

```javascript
// Input:  "  const secret = 'value'"
// Output: "  █████ ██████ █ ███████"
// Preserves: indentation, line structure
```

**Markdown Content:**

- Parses AST using `unified` + `remark`
- Redacts text nodes, code blocks, links, images
- Preserves: headings, lists, formatting structure

**Filenames:**

```javascript
// Input:  "secret-document.md"
// Output: "███████████████.md"
// Preserves: file extension
```

**Paths:**

```javascript
// Input:  "/home/user/private/file.txt"
// Output: "/████/████/███████/████.txt"
// Preserves: directory structure, extension
```

**Base URIs:**

```javascript
// Input:  "user:task/my-secret-task.md"
// Output: "████:████/██-██████-████.██"
// Preserves: hyphen positions (for visual structure)
```

**Relations:**

```javascript
// Input:  "follows [[user:task/secret.md]]"
// Output: "follows [[████:████/██████.██]]"
// Preserves: relation type, bracket structure
```

### Type-Aware Property Redaction

Properties are redacted based on their semantic type:

| Property Pattern    | Redacted Format                        |
| ------------------- | -------------------------------------- |
| `*_at` (timestamps) | `████-██-██T██:██:██.███Z`             |
| `entity_id`, `*_id` | `████████-████-████-████-████████████` |
| `user_public_key`   | 64 `█` characters                      |
| Numbers             | `9999`                                 |
| Booleans            | `false`                                |

### Sensitive Property Patterns

These properties are always redacted when access is denied:

```javascript
const SENSITIVE_PROPERTY_PATTERNS = [
  'title',
  'description',
  'content',
  'content_preview',
  'user_public_key',
  'assigned_to',
  'name',
  'summary'
]
```

### Response Interceptor

The redaction system integrates via Express middleware that intercepts responses:

```javascript
// server/middleware/permissions.mjs
export const apply_redaction_interceptor = () => {
  return (req, res, next) => {
    const original_json = res.json
    res.json = function (data) {
      const processed_data = apply_response_redaction(req, data)
      res.json = original_json
      return original_json.call(this, processed_data)
    }
    next()
  }
}
```

**Usage in routes:**

```javascript
import { apply_redaction_interceptor } from '#server/middleware/permissions.mjs'

router.use(check_filesystem_permission())
router.use(apply_redaction_interceptor()) // Must come after permission check

router.get('/file', async (req, res) => {
  // Response automatically redacted if req.access.read_allowed === false
  res.json(file_data)
})
```

### Redaction Decision Flow

```
Permission check sets req.access
            │
            ▼
   req.access.read_allowed?
            │
    YES ────┴──── NO
     │             │
     ▼             ▼
  Return      Apply redaction
  original    based on content type
  data              │
                    ▼
              Set is_redacted: true
                    │
                    ▼
              Return redacted data
```

### The `is_redacted` Flag

All redacted objects include an `is_redacted: true` property:

```javascript
{
  "title": "██████ ████████",
  "description": "████████████████████",
  "type": "task",           // Preserved
  "entity_type": "task",    // Preserved
  "is_redacted": true       // Added by redaction
}
```

Clients can check this flag to render appropriate UI (e.g., greyed out, with access indicator).

### Thread Timeline Redaction

Thread timelines receive specialized redaction by entry type:

| Entry Type      | Redaction Behavior                                                        |
| --------------- | ------------------------------------------------------------------------- |
| `message`       | Content text redacted                                                     |
| `tool_call`     | Parameters redacted (preserving structural params like `limit`, `offset`) |
| `tool_result`   | Result content and error messages redacted                                |
| `thinking`      | Thinking content and signatures redacted                                  |
| `human_request` | Prompt and response redacted                                              |
| `state_change`  | Reason and metadata redacted                                              |

### Client-Side Rendering

The client provides a `RedactedContent` component for consistent rendering:

```javascript
// client/views/components/primitives/styled/RedactedContent.js
<RedactedContent content_type='filename'>{item.name}</RedactedContent>
```

**Supported content types:** `text`, `filename`, `file_size`, `date`, `path`, `content`

**Styling:**

- Greyed out color with subtle background
- `cursor: not-allowed`
- `user-select: none`
- Tooltip: "Access restricted - {type} content redacted"

### Redaction Rules Engine

For fine-grained control, particularly in timeline parameters, a rule engine evaluates what to redact:

```javascript
const rules = [
  { pattern: 'limit', action: 'preserve' }, // Keep structural params
  { pattern: 'offset', action: 'preserve' },
  { pattern: 'timeout', action: 'preserve' },
  { pattern: 'status', action: 'preserve' },
  { pattern: 'todos.*.status', action: 'preserve' }, // Glob patterns
  { pattern: 'all_strings', action: 'redact' } // Default for strings
]

const result = evaluate_redaction_rules({ rules, key_path, value })
// Returns: { should_redact: boolean, reason: string, matching_rule: object }
```

### Key Functions

| Function                                 | Purpose                           |
| ---------------------------------------- | --------------------------------- |
| `redact_text_content(content)`           | Replace non-whitespace with `█`   |
| `redact_code_content(code)`              | Preserve indentation, redact code |
| `redact_markdown_content(md)`            | AST-aware markdown redaction      |
| `redact_file_info({ file_info })`        | Redact directory listing items    |
| `redact_file_content_response(response)` | Redact file read responses        |
| `redact_entity_object(entity)`           | Redact entity with properties     |
| `redact_thread_data(thread)`             | Redact thread with timeline       |
| `redact_session_data(session)`           | Redact active session records     |
| `apply_response_redaction(req, data)`    | Route-aware response redaction    |

## 9. File Reference

### Permission System Files

| File                                                  | Lines | Description                                  |
| ----------------------------------------------------- | ----- | -------------------------------------------- |
| `server/middleware/permission/index.mjs`              | ~43   | Public API exports                           |
| `server/middleware/permission/permission-service.mjs` | ~249  | High-level permission checking functions     |
| `server/middleware/permission/permission-context.mjs` | ~338  | Request-scoped caching and permission engine |
| `server/middleware/permission/middleware.mjs`         | ~135  | Express middleware for routes                |
| `server/middleware/permission/resource-metadata.mjs`  | ~174  | Metadata loading for threads and entities    |

### Authentication Files

| File                                  | Lines | Description                           |
| ------------------------------------- | ----- | ------------------------------------- |
| `server/middleware/jwt-parser.mjs`    | ~44   | JWT token parsing middleware          |
| `libs-server/users/user-registry.mjs` | ~170  | User registry with file-based storage |

### Rule Engine Files

| File                                | Lines | Description                               |
| ----------------------------------- | ----- | ----------------------------------------- |
| `server/middleware/rule-engine.mjs` | ~246  | Permission rule evaluation with picomatch |

### Content Redaction Files

| File                                                           | Lines | Description                                                   |
| -------------------------------------------------------------- | ----- | ------------------------------------------------------------- |
| `server/middleware/content-redactor.mjs`                       | ~862  | Core redaction functions for all content types                |
| `server/middleware/permissions.mjs`                            | ~98   | Response interceptor applying redaction based on `req.access` |
| `client/views/components/primitives/styled/RedactedContent.js` | ~160  | React component for rendering redacted content                |

### Configuration Files

| File                     | Description                        |
| ------------------------ | ---------------------------------- |
| `config/config.json`     | JWT secret and user base directory |
| `<user_base>/users.json` | User permissions and rules         |

### Test Files

| File                                                 | Description                                |
| ---------------------------------------------------- | ------------------------------------------ |
| `tests/integration/public-read-permissions.test.mjs` | Integration tests for permission scenarios |
| `tests/integration/entity-visibility-cli.test.mjs`   | CLI visibility management tests            |

### Debugging

Enable debug logging with:

```bash
DEBUG=permission:*,redaction:* yarn start:api
```

Available debug namespaces:

- `permission:context` - PermissionContext operations
- `permission:service` - Service-level operations
- `permission:middleware` - Middleware execution
- `permission:resource-metadata` - Metadata loading
- `permission:rule-engine` - Rule evaluation
- `redaction:rule-engine` - Redaction rule evaluation

## 10. Entity-Based User and Role System

The entity-based system replaces the monolithic `users.json` with individual markdown entities for users (identities) and reusable permission sets (roles). This approach provides version control, eliminates rule duplication, and enables CLI-based management.

### 10.1 Identity Entities

Identity entities represent user accounts and are stored in the `identity/` directory.

**Directory:** `user-base/identity/`

**Entity Structure:**

```yaml
---
title: username
type: identity
auth_public_key: 'hex-encoded-public-key'
username: username
permissions:
  create_threads: true
  global_write: false
rules: [] # User-specific rules (optional)
relations:
  - has_role [[user:role/admin.md]]
---
```

**Required Fields:**

| Field             | Type   | Description                                 |
| ----------------- | ------ | ------------------------------------------- |
| `auth_public_key` | string | Hex-encoded public key for authentication   |
| `username`        | string | Unique username identifier                  |

**Optional Fields:**

| Field         | Type   | Description                                          |
| ------------- | ------ | ---------------------------------------------------- |
| `permissions` | object | Permission flags (`create_threads`, `global_write`)  |
| `rules`       | array  | User-specific permission rules (evaluated first)     |
| `relations`   | array  | Role assignments via `has_role` relation             |

**Special `_public` Identity:**

The `identity/_public.md` file defines the fallback identity for unauthenticated requests. It typically has a `has_role` relation to the `public-reader` role.

```yaml
---
title: _public
type: identity
username: _public
relations:
  - has_role [[user:role/public-reader.md]]
---
```

### 10.2 Role Entities

Role entities define reusable permission rule sets that can be assigned to multiple identities.

**Directory:** `user-base/role/`

**Entity Structure:**

```yaml
---
title: Role Name
type: role
rules:
  - action: allow
    pattern: 'user:task/**'
  - action: deny
    pattern: 'user:private/**'
    reason: private content
---
```

**Required Fields:**

| Field   | Type  | Description                     |
| ------- | ----- | ------------------------------- |
| `rules` | array | Array of permission rule objects |

**Rule Object Structure:**

| Field     | Type   | Required | Description                          |
| --------- | ------ | -------- | ------------------------------------ |
| `action`  | string | Yes      | `allow` or `deny`                    |
| `pattern` | string | Yes      | Glob pattern or `is_owner`           |
| `reason`  | string | No       | Human-readable reason for deny rules |

**Common Roles:**

| Role             | Purpose                                           |
| ---------------- | ------------------------------------------------- |
| `admin.md`       | Full access: `{ action: allow, pattern: **/* }`   |
| `public-reader.md` | Read access to public resources                 |

### 10.3 Permission Resolution Order

When checking permissions, rules are evaluated in this order:

1. **User-specific rules** from the identity entity's `rules` array
2. **Role rules** from `has_role` relations, in the order relations appear
3. **Default deny** if no matching rule is found

```
┌─────────────────────────────────────┐
│ Load identity by public_key         │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│ Evaluate identity.rules (if any)    │
└─────────────────┬───────────────────┘
                  │
         MATCH ───┴─── NO MATCH
           │            │
           ▼            ▼
      Use rule   ┌─────────────────────────────────────┐
      action     │ Load roles from has_role relations  │
                 │ (in order)                          │
                 └─────────────────┬───────────────────┘
                                   │
                                   ▼
                 ┌─────────────────────────────────────┐
                 │ Evaluate role rules sequentially    │
                 └─────────────────┬───────────────────┘
                                   │
                          MATCH ───┴─── NO MATCH
                            │            │
                            ▼            ▼
                       Use rule        DENY
                       action        (default)
```

### 10.4 Identity and Role Loaders

The entity-based system uses dedicated loaders with caching:

**Identity Loader** (`libs-server/users/identity-loader.mjs`)

```javascript
import {
  load_identity_by_public_key,
  load_identity_by_username,
  load_all_identities,
  clear_identity_cache
} from '#libs-server/users/identity-loader.mjs'

// Load by public key
const identity = await load_identity_by_public_key({ public_key: 'abc123...' })

// Load by username
const identity = await load_identity_by_username({ username: 'trashman' })

// List all identities
const identities = await load_all_identities()
```

**Role Loader** (`libs-server/users/role-loader.mjs`)

```javascript
import {
  load_role,
  load_all_roles,
  clear_role_cache
} from '#libs-server/users/role-loader.mjs'

// Load role by base_uri
const role = await load_role({ base_uri: 'user:role/admin.md' })

// List all roles
const roles = await load_all_roles()
```

**Permission Resolver** (`libs-server/users/permission-resolver.mjs`)

```javascript
import {
  resolve_user_rules,
  get_identity_permissions,
  convert_identity_to_user
} from '#libs-server/users/permission-resolver.mjs'

// Resolve all rules for an identity (user + role rules)
const rules = await resolve_user_rules({ identity })
// Returns: [{ action, pattern, source, source_uri }, ...]

// Get permission flags
const permissions = get_identity_permissions({ identity })
// Returns: { create_threads: boolean, global_write: boolean }

// Convert identity to legacy user object format
const user = await convert_identity_to_user({ identity })
```

### 10.5 CLI Commands

The following CLI commands are available for managing identities, roles, and permissions:

**Identity Commands:**

```bash
# List all identity entities
base identity list
base identity list --json

# Get identity details
base identity get <username>
base identity get trashman --json
```

**Role Commands:**

```bash
# List all role entities
base role list
base role list --json

# Get role details
base role get <name>
base role get admin --json
```

**Permission Commands:**

```bash
# Check permission for user on resource
base permission check <username> <resource>
base permission check trashman user:task/my-task.md
```

## 11. Migration from users.json

### 11.1 Overview

The migration script converts the legacy `users.json` file to entity-based storage, creating identity and role entities while preserving all permissions.

### 11.2 Running the Migration

```bash
# Preview migration (dry run)
node cli/migrate-users-to-entities.mjs --dry-run

# Execute migration
node cli/migrate-users-to-entities.mjs
```

### 11.3 What the Migration Does

1. **Backs up `users.json`** to `users.json.backup`
2. **Creates role entities:**
   - `role/admin.md` - For users with global_write or `**/*` pattern
   - `role/public-reader.md` - Extracted from the `public` user's rules
3. **Creates identity entities:**
   - One per user in `identity/<username>.md`
   - Maps public key, username, permissions
   - Adds `has_role` relations based on rule analysis
   - Preserves user-specific rules that don't match common roles

### 11.4 Migration Examples

**Before (`users.json`):**

```json
{
  "users": {
    "abc123...": {
      "username": "admin",
      "permissions": {
        "create_threads": true,
        "global_write": true,
        "rules": [{ "action": "allow", "pattern": "**/*" }]
      }
    },
    "public": {
      "username": "public",
      "permissions": {
        "rules": [
          { "action": "allow", "pattern": "sys:system/**" },
          { "action": "allow", "pattern": "user:workflow/**" }
        ]
      }
    }
  }
}
```

**After (entities):**

`role/admin.md`:
```yaml
---
title: Admin
type: role
rules:
  - action: allow
    pattern: '**/*'
---
```

`role/public-reader.md`:
```yaml
---
title: Public Reader
type: role
rules:
  - action: allow
    pattern: 'sys:system/**'
  - action: allow
    pattern: 'user:workflow/**'
---
```

`identity/admin.md`:
```yaml
---
title: admin
type: identity
auth_public_key: 'abc123...'
username: admin
permissions:
  create_threads: true
  global_write: true
relations:
  - has_role [[user:role/admin.md]]
---
```

`identity/_public.md`:
```yaml
---
title: _public
type: identity
username: _public
relations:
  - has_role [[user:role/public-reader.md]]
---
```

### 11.5 Post-Migration Verification

After migration, verify the system works correctly:

```bash
# List migrated identities
base identity list

# Verify admin user
base identity get admin

# Test permission resolution
base permission check admin user:task/test.md
base permission check _public user:workflow/test.md

# Run permission tests
yarn test:file tests/integration/migrate-users-to-entities.test.mjs
```

### 11.6 Rollback

If migration fails or causes issues:

1. Restore backup: `cp users.json.backup users.json`
2. Remove created entities: `rm -rf identity/ role/`
3. Clear caches by restarting the API server

The system will automatically fall back to `users.json` when entity files don't exist.

## 12. Entity-Based System Files

### Identity and Role Files

| File                                         | Lines | Description                          |
| -------------------------------------------- | ----- | ------------------------------------ |
| `libs-server/users/identity-loader.mjs`      | ~120  | Identity entity loading with caching |
| `libs-server/users/role-loader.mjs`          | ~100  | Role entity loading with caching     |
| `libs-server/users/permission-resolver.mjs`  | ~150  | Permission resolution from roles     |

### Schema Files

| File                          | Description                           |
| ----------------------------- | ------------------------------------- |
| `system/schema/identity.md`   | JSON Schema for identity entities     |
| `system/schema/role.md`       | JSON Schema for role entities         |

### CLI Files

| File                                    | Description                        |
| --------------------------------------- | ---------------------------------- |
| `cli/base/identity.mjs`                 | Identity list/get commands         |
| `cli/base/role.mjs`                     | Role list/get commands             |
| `cli/base/permission.mjs`               | Permission check command           |
| `cli/migrate-users-to-entities.mjs`     | Migration script                   |

### Test Files

| File                                                              | Description                     |
| ----------------------------------------------------------------- | ------------------------------- |
| `tests/unit/libs-server/users/identity-loader.test.mjs`           | Identity loader unit tests      |
| `tests/unit/libs-server/users/role-loader.test.mjs`               | Role loader unit tests          |
| `tests/unit/libs-server/users/permission-resolver.test.mjs`       | Permission resolver unit tests  |
| `tests/integration/migrate-users-to-entities.test.mjs`            | Migration integration tests     |
