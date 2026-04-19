---
title: Extension System
type: text
description: Documentation for the convention-based extension system
created_at: '2026-02-24T01:55:49.498Z'
entity_id: 1e8632f8-598a-40dd-ac0b-80fa603f837a
base_uri: sys:system/text/extension-system.md
public_read: true
relations:
  - relates_to [[sys:system/text/system-design.md]]
  - relates_to [[sys:system/text/workflow.md]]
  - relates_to [[sys:system/text/tool-information.md]]
updated_at: '2026-03-02T00:00:00.000Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
---

# Extension System

The extension system enables directories to contribute CLI subcommands and agent skills to Base without modifying core code. Extensions use conventions over configuration -- drop a directory in the right place and it gets discovered.

## What Extensions Are

An extension is a directory that provides any combination of:

- **CLI subcommands** via a Yargs command module (command.mjs)
- **Capability providers** via modules in the provide/ directory
- **Agent skills** via workflow-format markdown files (skill/\*.md or SKILL.md)
- **Supporting code** in lib/ for composition between extensions

Extensions are the right choice for higher-level tooling that composes core operations. Graph analysis, batch maintenance, duplicate detection -- these are opinionated tools that not every Base installation needs.

## When to Create an Extension

Create an extension when you need to:

- Add a new `base <name>` CLI command group
- Package agent skills alongside supporting code
- Import and use libs-server modules directly
- Handle optional infrastructure dependencies (e.g., Ollama)

For pure agent behaviors without code dependencies, a workflow in the workflow/ directory may suffice.

## Directory Structure

```
extension/
  <name>/
    extension.md     # Manifest with entity frontmatter
    command.mjs      # Yargs command module (optional)
    provide/         # Capability provider modules (optional)
      <cap-name>.mjs # One file per capability provided
    skill/           # Agent skills (optional)
      *.md
    SKILL.md         # Consensus spec skill (optional)
    lib/             # Supporting code (optional)
      *.mjs
```

## Writing command.mjs

The command module must export the standard Yargs interface:

```javascript
import { get_config } from '#base/config'

export const command = 'myext <command>'
export const describe = 'My extension description'

export const builder = (yargs) =>
  yargs
    .command('subcommand', 'Description', {}, handle_subcommand)
    .demandCommand(1)

export const handler = () => {}

async function handle_subcommand(argv) {
  // Implementation using libs-server imports
}
```

This is identical to the pattern used by built-in commands in cli/base/.

## Contributing Subcommands to Built-In Groups

Extensions can plug subcommands into an existing built-in command group (for example `base thread`) instead of registering at the top level. This is useful when the implementation is user-specific (needs host/path config the base engine must not hardcode) but the UX belongs alongside a built-in group.

Declare the target group in the manifest:

```yaml
---
name: thread-ops
type: extension
subcommand_of: thread
---
```

Export `subcommand_of` and a `register_subcommands(yargs)` function from `command.mjs` instead of the standard `command`/`builder`/`handler` triple:

```javascript
export const subcommand_of = 'thread'

export function register_subcommands(yargs) {
  return yargs.command(
    'delete <thread_id>',
    'Delete a thread authoritatively from primary and all peers',
    (yargs) =>
      yargs
        .positional('thread_id', { type: 'string' })
        .option('force', { type: 'boolean', default: false })
        .option('dry-run', { type: 'boolean', default: false }),
    handle_delete
  )
}
```

At startup, base pre-loads every contributor module and registers them with the subcommand contributor registry keyed by `subcommand_of`. Built-in command builders call `register_subcommand_extensions(yargs, '<group>')` during their builder phase to mount the contributions. The host built-in must opt in by importing and calling this helper; groups that have not opted in will ignore `subcommand_of` entries.

Contract and limits:

- The target group must exist as a built-in command and must opt in by calling `register_subcommand_extensions` in its builder.
- Command name collisions between contributors are surfaced by yargs at parse time; the contributor's registration is wrapped in a try/catch and logged as a warning without aborting the CLI.
- Only one of (`command`/`builder`/`handler`) or (`subcommand_of`/`register_subcommands`) should be exported per `command.mjs`; the two shapes are mutually exclusive.

## Writing Skills

Skills use the same format as workflows: markdown with YAML frontmatter and task/context/instructions XML.

```markdown
title: My Skill
type: skill
description: What this skill does

---

<task>The task this skill performs</task>
<context>When and why to use this skill</context>
<instructions>Step-by-step instructions for the agent</instructions>
```

Place skills in the extension's skill/ directory, or use a single SKILL.md at the extension root following the consensus spec (agentskills.io).

## Importing libs-server Modules

Extension code imports via package aliases, the same mechanism used by user-base CLI scripts:

```javascript
import config from '#config'
import { some_function } from '#libs-server/module/file.mjs'
```

## Optional Dependencies

Declare optional capabilities in extension.md as a flat array:

```yaml
optional:
  - embedded-index
```

At runtime, check the capability registry or use dynamic import with try/catch for graceful fallback.

## Capability Registration

Extensions can provide subsystem implementations (notifications, queuing, indexing) via the `provide/` directory convention. Core code queries a capability registry instead of hardcoding imports.

### How It Works

1. Each `.mjs` file in `provide/` registers the extension as a provider for the capability named by the filename (e.g., `provide/notification-channel.mjs` provides the `notification-channel` capability)
2. At startup, discovery scans `provide/` directories and records `provided_capabilities` metadata
3. The provider loader imports each provide file and registers it in the capability registry
4. Core code queries the registry at invocation time to find providers

### Capability Naming

Use kebab-case for capability names. The name signals the consumption pattern:

- **Channel/outlet names** (e.g., `notification-channel`): use `get_all()` for fan-out -- all providers fire
- **Service/backend names** (e.g., `queue`, `embedded-index`): use `get()` for first-match -- one provider handles the request

### Invocation-Time Resolution

Providers must not call `registry.get()` or `registry.get_all()` at module load time -- only at function invocation time. This avoids load-order dependence between extensions without requiring topological sorting.

### Writing a Provide Module

Each provide file exports named functions implementing the capability contract:

```javascript
// provide/notification-channel.mjs
import config from '#config'

export async function notify_failure({ job_id, error_message, timestamp }) {
  // Send failure notification via this channel
}

export async function notify_recovery({ job_id, timestamp }) {
  // Send recovery notification
}
```

### Registry API

Consumer code imports from the registry:

```javascript
import {
  get,
  get_all,
  has
} from '#libs-server/extension/capability-registry.mjs'

// Fan-out: notify all channels
const channels = get_all('notification-channel')
for (const channel of channels) {
  await channel.notify_failure({ job_id, error_message, timestamp })
}

// First-match: use the installed queue backend
const queue = get('queue')
if (queue) {
  await queue.enqueue(job)
}

// Graceful absence: empty array when no providers installed
const channels = get_all('notification-channel')
// Loop simply doesn't execute if no providers -- no errors
```

### Graceful Absence

`get_all()` returns an empty array when no provider is installed. Loops over the result don't execute, producing no errors. `get()` returns null. This means core code works correctly whether or not an extension is installed.

### Multi-Provider Capabilities

Multiple extensions can provide the same capability. Registration order follows discovery order (user extensions before system extensions). `get_all()` returns all providers; `get()` returns the first-registered.

### notification-channel Contract

```
@typedef {Object} NotificationChannelProvider
@property {function({job_id: string, error_message: string, timestamp: string}): Promise<string|null>} notify_failure - Required. Send failure alert. Returns message_id or null.
@property {function({job_id: string, timestamp: string}): Promise<string|null>} notify_missed - Required. Send missed-execution alert. Returns message_id or null.
@property {function({job_id: string, timestamp: string}): Promise<string|null>} notify_recovery - Optional. Send recovery notice. Returns message_id or null.
```

### http-route Contract

Extensions can mount Express routers on the core API server by providing an `http-route` capability. The provider file is `provide/http-route.mjs`.

```
@typedef {Object} HttpRouteProvider
@property {HttpRouteDescriptor[]} routes - Required. Array of route descriptors.

@typedef {Object} HttpRouteDescriptor
@property {string} mount_path - Required. Express mount path. Must start with "/api/".
@property {('auth'|'search'|'write'|'read')} [rate_limit_tier='read'] - Rate limit tier. Defaults to "read".
@property {import('express').Router} router - Required. Express Router instance.
```

#### Rate Limit Tiers

| Tier     | Requests per minute | Intended use                       |
| -------- | ------------------- | ---------------------------------- |
| `auth`   | 10                  | Login, token issuance              |
| `search` | 30                  | Query-heavy search endpoints       |
| `write`  | 60                  | POST, PUT, DELETE, PATCH endpoints |
| `read`   | 1000                | GET endpoints (default)            |

Rate limiter instances are created fresh per call to `mount_extension_routes()`, so extension routes have independent counters from built-in routes.

#### Auth Surface

Extension routes inherit the globally-mounted JWT parser middleware. When a valid JWT token is present (via `Authorization: Bearer ...` header or cookie), `req.user` is populated with `user_public_key` and decoded claims, and `req.is_authenticated` is true. Authentication is non-blocking -- routes that require authentication must check `req.user` and return 401 themselves. This matches the behavior of all built-in routes.

#### Mount Order

Extension routes are registered in the middleware stack after all built-in routes (`/api/users`, `/api/search`, `/api/threads`, ..., `/s`) and before the error handler and SPA fallback. The `extension_router` placeholder is installed during `server/index.mjs` module evaluation; actual route descriptors are attached by `mount_extension_routes()` after `load_extension_providers()` completes, before `server.listen()`. All extension routes are resolved before the server accepts any connections.

#### Multi-Provider Behavior

Multiple extensions may provide `http-route`. All providers are mounted in discovery order (user extensions before system extensions). Two providers may register the same `mount_path` -- Express mounts both routers at the same path and dispatches in registration order, so the first matching route wins per HTTP method and sub-path. No deduplication is performed. For collision avoidance, extension authors should use distinct mount paths. The `debug('api:extensions')` namespace logs every mounted descriptor including extension name, mount path, and rate limit tier.

Descriptors whose `mount_path` does not start with `/api/` are skipped with a debug warning to avoid colliding with SPA routes and static file serving.

#### Example Provider

```javascript
// extension/my-feature/provide/http-route.mjs
import express from 'express'

const router = express.Router()

router.get('/status', (req, res) => {
  res.json({ ok: true, user: req.user?.user_public_key || null })
})

router.post('/record', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'unauthorized' })
  // handle write
  res.json({ accepted: true })
})

export const routes = [
  {
    mount_path: '/api/my-feature',
    rate_limit_tier: 'write',
    router
  }
]
```

### Example: Extension with Capability Provider

```
extension/
  discord/
    extension.md
    command.mjs
    provide/
      notification-channel.mjs
    lib/
      discord-client.mjs
```

The `provide/notification-channel.mjs` file exports `notify_failure`, `notify_missed`, and optionally `notify_recovery`. At startup, the extension is discovered, the provide file is imported, and the module is registered under the `notification-channel` capability. Any core code calling `get_all('notification-channel')` will receive this provider.

## Composition Between Extensions

Extensions import each other's lib/ modules via relative paths:

```javascript
import { graph_stats } from '../graph/lib/graph-stats.mjs'
```

This is standard Node.js module resolution -- no framework needed.

## Discovery

Extensions are discovered from:

1. `{USER_BASE_DIRECTORY}/extension/` (user extensions, highest priority)
2. `{BASE_REPO_PATH}/system/extension/` (system extensions, future)

First-match-wins for duplicate names: user extensions override system extensions.

## CLI Commands

- `base extension list` -- show registered extensions with capabilities
- `base extension list --json` -- JSON output with full metadata
- `base skill list` -- show all discovered skills (from extensions and workflows)
- `base skill list --json` -- JSON output

## Example: Creating a Minimal Extension

```bash
mkdir -p extension/hello
```

Create extension/hello/extension.md:

```markdown
name: hello
type: extension
description: Example extension

---

# Hello Extension

A minimal example extension.
```

Create extension/hello/command.mjs:

```javascript
export const command = 'hello'
export const describe = 'Say hello'
export const builder = {}
export const handler = () => console.log('Hello from extension!')
```

Now `base hello` works.
