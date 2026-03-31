---
title: Base
type: text
description: >-
  Human-in-the-loop LLM system built on file primitives with markdown entities, git version control,
  and agent orchestration
base_uri: user:repository/active/base/README.md
created_at: '2026-03-06T19:51:48.678Z'
entity_id: 3f9c752d-0a8d-4ea9-bf4f-619f3d2433b0
public_read: true
updated_at: '2026-03-06T19:51:48.678Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
---

# Base

A human-in-the-loop LLM system built on file primitives. All data is markdown files with YAML frontmatter in git.

## Core Ideas

- **Files + Git** as the source of truth. No database required.
- **Entities** — typed markdown files (task, workflow, guideline, text, tag, etc.) with schemas, relations, and observations forming a knowledge graph.
- **Threads** — standardized session format for any agent runner (Claude Code, Cursor, etc.) in any environment.
- **Workflows** — structured prompts that compose tools into agent behaviors.
- **Two-layer architecture** — this repo is the generic engine; a separate user-base directory provides user-specific config, data, workflows, and guidelines.

## Quick Start

```bash
# Clone and install
git clone https://github.com/mistakia/base.git && cd base
yarn install

# Initialize a user-base directory
base init --user-base-directory ~/my-knowledge-base

# Create your first entity
export USER_BASE_DIRECTORY=~/my-knowledge-base
base entity create "user:task/hello.md" --type task --title "Hello World"
base entity list -t task
```

## Prerequisites

- Node.js 18+ / Yarn
- git
- `ripgrep` (`rg`)
- Redis (optional, required for job queue and scheduling)

## Documentation

| Topic                                                         | Description                                             |
| ------------------------------------------------------------- | ------------------------------------------------------- |
| [System Design](system/text/system-design.md)                 | Architecture, primitives, design principles, deployment |
| [Directory Structure](system/text/directory-structure.md)     | Code and data organization                              |
| [Knowledge Base Schema](system/text/knowledge-base-schema.md) | Entity types and data models                            |
| [Execution Threads](system/text/execution-threads.md)         | Thread format and lifecycle                             |
| [Workflows](system/text/workflow.md)                          | Workflow definitions and composition                    |
| [Configuration](system/text/configuration-system.md)          | Two-tier config loading and machine registry            |
| [Extension System](system/text/extension-system.md)           | CLI extensions and agent skills                         |
| [Background Services](system/text/background-services.md)     | PM2 services and scheduling                             |

## License

MIT — see [LICENSE](LICENSE).
