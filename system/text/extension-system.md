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
