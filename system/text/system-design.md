---
title: System Design
type: text
description: Architecture and design principles for the human-in-the-loop LLM system
base_uri: sys:system/text/system-design.md
created_at: '2025-05-27T18:10:20.246Z'
entity_id: b75fe9b3-4a83-427c-9e62-3105019df96c
observations:
  - '[design] Human-in-the-loop system built on file primitives with git version control'
  - '[principle] Agnostic to model, session runner, and execution environment'
public_read: true
relations:
  - relates_to [[sys:system/text/directory-structure.md]]
  - relates_to [[sys:system/text/knowledge-base-schema.md]]
  - relates_to [[sys:system/text/tool-information.md]]
  - relates_to [[sys:system/text/workflow.md]]
  - relates_to [[sys:system/schema/database.md]]
updated_at: '2026-01-05T19:25:18.031Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
visibility_analyzed_at: '2026-02-16T04:38:15.994Z'
---

# Base System Design

A human-in-the-loop LLM system that works alongside a user to manage and build a knowledge base, manage data, complete tasks as the user would, and build itself — designed for maximum flexibility, sovereignty, independence, and simplicity.

### 1. System Overview

The system is built on a small set of primitives. Complex capabilities -- composability, change tracking, knowledge graphs, self-improvement -- emerge from these primitives rather than being implemented as separate features.

#### Primitives

- **Files + Git**: All data is markdown files with YAML frontmatter in a git repository. This is the source of truth. Git provides version history, change review, branching, and multi-machine sync.
- **Entities**: Markdown files follow a typed entity model defined by schemas (see [[sys:system/schema/entity.md]]). Every entity has a type, properties, relations to other entities, and observations. The system's core types -- task, workflow, guideline, text, tag, person, and others (see [[sys:system/text/knowledge-base-schema.md]]) -- are all instances of this single primitive. Schemas are themselves entities, making the system self-describing.
- **Base URIs**: A URI scheme (`sys:`, `user:`, `ssh://`, `git://`, `https://`) that provides location-independent resource identification across local repositories, remote servers, and external systems. Entities reference each other through base URIs. See [[sys:system/text/base-uri.md]].
- **Threads**: The standardized session representation for conversations and agentic loops. Every thread has metadata, a timeline, and analysis data regardless of which session runner produced it or where it ran. Threads capture all agent work and are the bridge between external session runners and the entity system. See [[sys:system/text/execution-threads.md]].

#### Key Entity Types

Several entity types carry special behavioral significance:

- **Workflows**: Define agent behavior through structured prompts with inputs, outputs, and tool specifications. Composability, looping, and nesting emerge from workflows referencing each other. See [[sys:system/text/workflow.md]].
- **Guidelines**: Shape agent behavior based on user preferences. Agents access guidelines during sessions.
- **Tasks**: Discrete units of work with status, priority, and dependency tracking.
- **Tags**: Classification and organization labels that form a taxonomy across entities.
- **Schemas**: Type definitions (stored as `type_definition` entities) that govern the structure of all other entity types.

#### Design Principles

- **Agnostic**: Model agnostic, session runner agnostic, and execution environment agnostic. Base manages and standardizes sessions from any runner (Claude Code, Cursor, etc.) in any environment (host, container, cloud sandbox) using any model.
- **Human-in-the-loop**: The user reviews, approves, and directs agent work. Agents operate within the user's repository.
- **Sovereignty**: All data is local, user-owned, and portable. No external dependencies required for core operation.
- **Self-describing**: The system describes itself using its own primitives. Schemas, documentation, guidelines, and workflows are all entities -- subject to the same versioning, relations, and tooling as any other content.
- **Emergence over implementation**: Complex capabilities (knowledge graphs, composability, self-improvement) arise from the interaction of simple primitives rather than being built as discrete features.

### 2. Content Storage System

#### 2.1 Structured Data

In addition to file-based content, structured datasets can live in any storage system (PostgreSQL, SQLite, CSV/Parquet, embedded databases, HTTP APIs, etc.). Each structured dataset is registered with a companion `<dataset_name>.md` entity file that defines its schema and how to connect/access it.

- The `<dataset_name>.md` file follows the `database` schema (see [[sys:system/schema/database.md]]) and typically includes:
  - `fields`: typed columns and constraints
  - `table_name`: logical name for the dataset
  - `storage_config` (optional): connection details such as `connection_string`, `schema_name`, and `indexes`. When omitted, data is stored as local files and indexed via embedded databases
  - `views` (optional): predefined `database_view` identifiers for display/filtering

The system uses the `<dataset_name>.md` definition to connect to the underlying store through a unified API. Records are represented as `database_item` entities that reference their parent database and are validated against its schema.

#### 2.2 Indexing

There is flexibility to use any indexing or vector database, but the preference is to use embedded databases like sqlite and [DuckDB](https://duckdb.org/).

#### 2.3 Filesystem Architecture

The system separates knowledge into two types:

- **System Knowledge Base**

  - Located in the `system/` directory of the base project codebase
  - Contains core system definitions, schemas, and documentation
  - Relevant to core system functionality and relevant to all users

- **User Knowledge Base**

  - A git repository belonging to a single user
  - Contains user-specific data, content, guidelines, workflows, and configurations
  - Configured via `config.user_base_directory` or runtime registration

The relationship between these knowledge bases is hierarchical - the system knowledge base defines the core schema and behavior, while user knowledge bases extend and implement it for specific use cases. This separation allows for a robust core system while allowing flexibility to adjust to multiple users' preferences and workflows.

### 3. Deployment Architecture

The system supports multi-machine deployment where the Base API and background services run on multiple machines simultaneously, each operating on its own clone of the user-base repository.

#### 3.1 Execution Contexts

- **Host Sessions**: Interactive sessions run directly on the user's machine with full terminal access. User-driven with real-time interaction.
- **Container Sessions**: Interactive agent sessions (Claude Code, OpenCode) run in Docker containers on the server. Containers provide isolation and a consistent Linux environment. Sessions are initiated by the user.

#### 3.2 Multi-Machine Operation

Multiple machines can run Base services concurrently against their own user-base clones. Machine identity is resolved automatically via hostname matching against the `machine_registry` in config, with platform-based fallback. This drives machine-specific configuration (SSL, ports, service selection).

- **Machine identity**: `base machine` shows the current machine ID, hostname, platform, and registry config. Machine ID is resolved by `libs-server/schedule/machine-identity.mjs`.
- **Scheduled commands**: Support a `run_on_machines` field to restrict execution to specific machines. Commands without this field run on all machines.
- **Service configuration**: `pm2.config.js` reads machine registry to inject machine-specific environment variables (SSL, ports) before services start.

#### 3.3 Data Synchronization

All execution contexts share data through git synchronization. Each machine maintains its own working copy and syncs via scheduled push/pull commands with rebase-based conflict resolution.

- **User-base**: The main repository syncs via scheduled push/pull commands. Submodule updates (excluding independently-synced submodules) run after pull.
- **Thread submodule** (`thread/`): Isolated git repository for high-churn session data. Has its own push/pull cycle with file locking and auto-commit on session end.
- **Import-history submodule** (`import-history/`): Isolated git repository for historical import data. Has its own push/pull cycle.
- **Other submodules** (e.g., `base`, `base-ios`): Updated as part of the main user-base pull.

See [[sys:system/text/background-services.md]] for service details and scheduling.

### 4. Glossary

- **Entity**: A markdown file with YAML frontmatter that follows a typed schema. The universal unit of content in the system.
- **Thread**: The standardized session representation for conversations and agentic loops. See [[sys:system/text/execution-threads.md]].
- **Tool**: A capability exposed to agents during sessions (e.g., file access, shell, APIs). See [[sys:system/text/tool-information.md]].
- **Relation**: A typed link between two entities (e.g., `blocked_by`, `subtask_of`, `relates_to`). See [[sys:system/text/entity-relations.md]].
- **Observation**: A structured fact attached to an entity in the format `[category] text`.
- **Schema**: A `type_definition` entity that defines the properties and constraints for an entity type.
- **Trigger**: An event or condition that activates a workflow.

## Related System Documentation

### Core Architecture

- [[sys:system/text/directory-structure.md]] - File organization and structure
- [[sys:system/text/knowledge-base-schema.md]] - Entity schemas and data models
- [[sys:system/text/entity-relations.md]] - Entity relationship system
- [[sys:system/text/base-uri.md]] - URI system for entity references
- [[sys:system/text/configuration-system.md]] - Two-tier config loading and machine registry

### Execution and Sessions

- [[sys:system/text/execution-threads.md]] - Thread data format and lifecycle
- [[sys:system/text/session-orchestrator.md]] - Session spawning and provider adapters
- [[sys:system/text/session-lifecycle-reference.md]] - WebSocket events and state transitions
- [[sys:system/text/cross-machine-sessions.md]] - Multi-machine session management
- [[sys:system/text/workflow.md]] - Workflow definitions and execution
- [[sys:system/text/tool-information.md]] - Tool capabilities and usage

### Infrastructure

- [[sys:system/text/background-services.md]] - PM2 services overview
- [[sys:system/text/scheduled-command-system.md]] - Schedule types and processor architecture
- [[sys:system/text/cli-queue-system.md]] - BullMQ queue with tag concurrency control
- [[sys:system/text/database-and-indexing.md]] - DuckDB index and storage backends
- [[sys:system/text/git-operations.md]] - Worktrees, sync, and git utility library

### Security and Organization

- [[sys:system/text/permission-system-design.md]] - ABAC permission model and rule evaluation
- [[sys:system/text/permission-system-overview.md]] - Permission system summary
- [[sys:system/text/identity-and-authentication.md]] - JWT auth, Ed25519 keys, and roles
- [[sys:system/text/tag-system.md]] - Tag entities and taxonomy management
- [[sys:system/text/search-system-design.md]] - Unified search architecture
- [[sys:system/text/extension-system.md]] - Convention-based CLI extensions and skills

### Other

- [[sys:system/text/external-data-sync.md]] - External system integrations
- [[sys:system/text/mcp-server.md]] - Model Context Protocol server (removed)
