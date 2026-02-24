---
title: Extension System
type: text
description: Documentation for the convention-based extension system
created_at: '2026-02-24T01:55:49.498Z'
entity_id: 1e8632f8-598a-40dd-ac0b-80fa603f837a
public_read: false
updated_at: '2026-02-24T01:55:49.498Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
---

# Extension System

The extension system enables directories to contribute CLI subcommands and agent skills to Base without modifying core code. Extensions use conventions over configuration -- drop a directory in the right place and it gets discovered.

## What Extensions Are

An extension is a directory that provides any combination of:

- **CLI subcommands** via a Yargs command module (command.mjs)
- **Agent skills** via workflow-format markdown files (skill/\*.md or SKILL.md)
- **Supporting code** in lib/ for composition between extensions

Extensions are the right choice for higher-level tooling that composes core operations. Graph analysis, batch maintenance, duplicate detection -- these are opinionated tools that not every Base installation needs.

## When to Create an Extension

Create an extension when you need to:

- Add a new \`base <name>\` CLI command group
- Package agent skills alongside supporting code
- Import and use libs-server modules directly
- Handle optional infrastructure dependencies (e.g., Ollama)

For pure agent behaviors without code dependencies, a workflow in the workflow/ directory may suffice.

## Directory Structure

\`\`\`
extension/
<name>/
extension.md # Manifest with entity frontmatter
command.mjs # Yargs command module (optional)
skill/ # Agent skills (optional)
_.md
SKILL.md # Consensus spec skill (optional)
lib/ # Supporting code (optional)
_.mjs
\`\`\`

## Writing command.mjs

The command module must export the standard Yargs interface:

\`\`\`javascript
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
\`\`\`

This is identical to the pattern used by built-in commands in cli/base/.

## Writing Skills

Skills use the same format as workflows: markdown with YAML frontmatter and task/context/instructions XML.

## \`\`\`markdown

title: My Skill
type: skill
description: What this skill does

---

<task>The task this skill performs</task>
<context>When and why to use this skill</context>
<instructions>Step-by-step instructions for the agent</instructions>
\`\`\`

Place skills in the extension's skill/ directory, or use a single SKILL.md at the extension root following the consensus spec (agentskills.io).

## Importing libs-server Modules

Extension code imports via package aliases, the same mechanism used by user-base CLI scripts:

\`\`\`javascript
import config from '#config'
import { some_function } from '#libs-server/module/file.mjs'
\`\`\`

## Optional Dependencies

Declare optional services in extension.md for documentation:

\`\`\`yaml
optional:
services: [ollama]
\`\`\`

At runtime, use dynamic import with try/catch:

\`\`\`javascript
let ollama_available = false
try {
const { embed_texts } = await import('#libs-server/integrations/ollama-client.mjs')
ollama_available = true
} catch {
console.warn('Ollama not available, semantic features disabled')
}
\`\`\`

## Composition Between Extensions

Extensions import each other's lib/ modules via relative paths:

\`\`\`javascript
import { graph_stats } from '../graph/lib/graph-stats.mjs'
\`\`\`

This is standard Node.js module resolution -- no framework needed.

## Discovery

Extensions are discovered from:

1. \`{USER_BASE_DIRECTORY}/extension/\` (user extensions, highest priority)
2. \`{BASE_REPO_PATH}/system/extension/\` (system extensions, future)

First-match-wins for duplicate names: user extensions override system extensions.

## CLI Commands

- \`base extension list\` -- show registered extensions with capabilities
- \`base extension list --json\` -- JSON output with full metadata
- \`base skill list\` -- show all discovered skills (from extensions and workflows)
- \`base skill list --json\` -- JSON output

## Example: Creating a Minimal Extension

\`\`\`bash
mkdir -p extension/hello
\`\`\`

Create extension/hello/extension.md:

## \`\`\`markdown

name: hello
type: extension
description: Example extension

---

# Hello Extension

A minimal example extension.
\`\`\`

Create extension/hello/command.mjs:

\`\`\`javascript
export const command = 'hello'
export const describe = 'Say hello'
export const builder = {}
export const handler = () => console.log('Hello from extension!')
\`\`\`

Now \`base hello\` works.
