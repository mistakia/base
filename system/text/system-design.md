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
relations:
  - relates_to [[sys:system/text/directory-structure.md]]
  - relates_to [[sys:system/text/knowledge-base-schema.md]]
  - relates_to [[sys:system/text/tool-information.md]]
  - relates_to [[sys:system/text/workflow.md]]
  - relates_to [[sys:system/schema/database.md]]
updated_at: '2026-01-05T19:25:18.031Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
---

# Base System Design

A human-in-the-loop LLM system that works alongside a user to manage and build a knowledge base, manage data, complete tasks as the user would, and build itself — designed for maximum flexibility, sovereignty, independence, and simplicity.

### 1. System Overview

The system is built on a small set of primitives. Most capabilities (composability, change tracking, knowledge graphs, self-improvement) emerge from these primitives rather than being implemented as separate features.

#### Primitives

- **Files + Git**: All data is markdown files with YAML frontmatter in a git repository. This is the source of truth. Git provides version history, change review, branching, and multi-machine sync.
- **Entities**: Files follow a typed entity model (task, workflow, guideline, etc.) with frontmatter properties and relations between entities.
- **Workflows**: Text documents that define agent behavior through structured prompts. Because they are files, they can reference other workflows, be versioned, and be edited by both users and agents.
- **Tools**: Capabilities exposed to agents during sessions (file access, shell, APIs). Tools have configurable permission levels.
- **Guidelines**: Text documents that shape agent behavior based on user preferences. Agents access guidelines during sessions.

#### Design Principles

- **Agnostic**: Model agnostic, session runner agnostic, and execution environment agnostic. Base manages and standardizes sessions from any runner (Claude Code, Cursor, etc.) in any environment (host, container, cloud sandbox) using any model.
- **Human-in-the-loop**: The user reviews, approves, and directs agent work. Agents operate within the user's repository.
- **Sovereignty**: All data is local, user-owned, and portable. No external dependencies required for core operation.

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

#### 2.4 External Connections

Each external data connection has bidirectional sync:

- Google Drive
- Notion
- Apple Notes
- Ubuntu servers
- Github Projects
- Other git repos

### 3. Deployment Architecture

The system supports multi-machine deployment where the Base API and services run on one or more machines while agent sessions execute in various contexts.

#### 3.1 Execution Contexts

- **Container Sessions**: Mainly non-interactive agent sessions run in user-specific Docker containers on the server. Containers provide isolation and consistent environments. Triggered by API, scheduled commands, or other sessions.
- **Host Sessions**: Interactive sessions run directly on the user host machine with full terminal access. User-driven with real-time interaction.

#### 3.2 Data Sharing

All execution contexts share the same user-base directory via file system mounting and git synchronization:

- User-base exists as a git repository
- Containers and host machines push/pull to synchronize data via git synchronization
- Thread data (`thread/`) is a submodule with its own git repository for high-churn isolation

### 4. Glossary

- **Workflow**: A text document (markdown file) that defines agent behavior through a structured prompt with inputs, outputs, and tool specifications. Composability, looping, branching, and nesting are patterns that emerge from workflows referencing each other.
- **Thread**: The standardized session representation for conversations and agentic loops. See [[sys:system/text/execution-threads.md]].
- **Guideline**: A text document containing rules or recommendations that agents access during sessions.
- **Task**: A discrete unit of work that can be assigned, tracked, and completed.
- **Tool**: A capability exposed to agents during sessions (e.g., file access, shell, APIs).
- **Tags**: Labels assigned to entities for classification and organization.
- **Trigger**: An event or condition that activates a workflow.

## Related System Documentation

- [[sys:system/text/directory-structure.md]] - File organization and structure
- [[sys:system/text/knowledge-base-schema.md]] - Entity schemas and data models
- [[sys:system/text/tool-information.md]] - Tool capabilities and usage
- [[sys:system/text/workflow.md]] - Workflow definitions and execution
- [[sys:system/text/execution-threads.md]] - Thread lifecycle and management
- [[sys:system/text/external-data-sync.md]] - External system integrations
- [[sys:system/text/entity-relations.md]] - Entity relationship system
- [[sys:system/text/mcp-server.md]] - Model Context Protocol server
- [[sys:system/text/background-services.md]] - Scheduled commands, CLI queue, databases
- [[sys:system/text/roadmap.md]] - Development roadmap and priorities
- [[sys:system/text/base-uri.md]] - URI system for entity references
