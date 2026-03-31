---
title: Extension Schema
type: type_definition
description: Convention-based extension providing CLI subcommands and agent skills
created_at: '2026-02-24T01:51:01.996Z'
entity_id: 43a01a50-b718-4673-8631-efc9d1fb3643
extends: entity
properties:
  - name: requires
    type: array
    description: >-
      Capability names that must be provided by another installed extension.
      Extension providers will not load if unmet.
    optional: true
    items:
      type: string
  - name: optional
    type: array
    description: >-
      Capability names that enable additional features when available.
      Extension loads normally without them.
    optional: true
    items:
      type: string
public_read: false
type_name: extension
updated_at: '2026-02-24T01:51:01.996Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
---

# Extension

Extensions are convention-based packages that contribute CLI subcommands, agent skills, or both to the Base system. Each extension is a directory discovered at startup from configured extension paths.

## Directory Structure

An extension directory contains:

- **extension.md** (manifest): Entity frontmatter with metadata. Fields: name, description, requires, optional.
- **command.mjs** (optional): Yargs command module exporting command, describe, builder, handler.
- **provide/** (optional): Capability provider modules. Each `{capability-name}.mjs` file registers the extension as a provider for that capability.
- **skill/** (optional): Directory of workflow-format markdown skills.
- **SKILL.md** (optional): Single skill file following the consensus spec (agentskills.io).
- **lib/** (optional): Supporting code importable by other extensions.

## Command Module Contract

command.mjs must export the standard Yargs command module interface:

- `command` (string): Command name and positional args (e.g., 'graph <command>')
- `describe` (string): One-line description
- `builder` (function): Accepts yargs instance, returns configured yargs with subcommands/options
- `handler` (function): Handler for the parent command (typically empty for command groups)

## Discovery

Extensions are discovered by scanning configured directories for subdirectories. User extensions take priority over system extensions (first-match-wins for duplicate names).

## Import Access

Extension code imports libs-server modules via package aliases (#libs-server, #config) -- the same mechanism used by user-base CLI scripts.

## Graceful Degradation

Optional capabilities are declared as flat arrays in the `optional` field. At runtime, use dynamic import() with try/catch or check the capability registry for graceful fallback when dependencies are unavailable.
