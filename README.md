# Base

A human-in-the-loop LLM system built on file primitives. All data is markdown files with YAML frontmatter in git.

## Core Ideas

- **Files + Git** as the source of truth. No database required.
- **Entities** — typed markdown files (task, workflow, guideline, text, tag, etc.) with schemas, relations, and observations forming a knowledge graph.
- **Threads** — standardized session format for any agent runner (Claude Code, Cursor, etc.) in any environment.
- **Workflows** — structured prompts that compose tools into agent behaviors.
- **Two-layer architecture** — this repo is the generic engine; a separate user-base directory provides user-specific config, data, workflows, and guidelines.

## Prerequisites

- Node.js 18+ / Yarn
- Redis (BullMQ job queues)
- `ripgrep` (`rg`)

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
