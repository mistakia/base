---
title: System Design
type: text
description: Architecture and design principles for the human-in-the-loop LLM system
base_uri: sys:system/text/system-design.md
created_at: '2025-05-27T18:10:20.246Z'
entity_id: b75fe9b3-4a83-427c-9e62-3105019df96c
observations:
  - '[design] Uses a human-in-the-loop approach'
  - '[principle] File-first approach with git version control'
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

- **File-First Architecture**: Local files are the source of truth, stored as markdown files with YAML frontmatter
- **Version Controlled**: Everything is tracked with git
- **Change Tracking and Management**: Allows for review and approval of changes, a record of changes, progress tracking, comparison of changes, etc.
- **Composable Workflows**: Workflows can embed other workflows, enabling complex operations
- **Multi-Model Support**: Use the right model for a given prompt, task, or workflow
- **Guidelines-Driven**: Evolving guidelines shape the system's behavior based on user preferences
- **Granular Action Control**: Tool calls have configurable permission levels to control autonomy
- **Async Collaboration**: Support for asynchronous human-system interaction
- **Knowledge Graph**: Builds and traverses relationships between knowledge items
- **Block-Based Content**: All content is broken down into uniquely identifiable blocks with granular access control
- **Self-Improvement**: The system can evaluate and improve itself through feedback loops

### 2. Content Storage System

#### 2.1 Main File Storage

Data is mainly stored as files, particularly markdown files with YAML frontmatter.

- **User-specific git repository**

  - Everything is version controlled and can be worked on offline
  - This is our source of truth
  - All context, configuration, and data is easily accessible and editable by the user and agentic workflows

#### 2.2 Structured data

In addition to file-based content, structured datasets can live in any storage system (PostgreSQL, SQLite, CSV/Parquet, embedded databases, HTTP APIs, etc.). Each structured dataset is registered with a companion `<dataset_name>.md` entity file that defines its schema and how to connect/access it.

- The `<dataset_name>.md` file follows the `database` schema (see [[sys:system/schema/database.md]]) and typically includes:
  - `fields`: typed columns and constraints
  - `table_name`: logical name for the dataset
  - `storage_config` (optional): connection details such as `connection_string`, `schema_name`, and `indexes`. When omitted, data is stored as local files and indexed via embedded databases
  - `views` (optional): predefined `database_view` identifiers for display/filtering

The system uses the `<dataset_name>.md` definition to connect to the underlying store through a unified API. Records are represented as `database_item` entities that reference their parent database and are validated against its schema.

#### 2.3 Indexing

There is flexibility to use any indexing or vector database, but the preference is to use embedded databases like [Kuzudb](https://github.com/kuzudb/kuzu), sqlite, and [duckdb](https://duckdb.org/).

#### 2.4 Filesystem Architecture

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

#### 2.5 External Connections

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

- **Workflow**: Defines agent behavior as a composable, modular function that specifies inputs, outputs, and tool integrations. It is effectively a prompt that defines agent behavior that can be run repeatedly, have loops, branching, wait for human input, embed other workflows, and so on.
- **Thread**: The system's standardized session representation for conversations and agentic workflows. Threads can execute in container (non-interactive) or host (interactive) environments. See [[sys:system/text/execution-threads.md]].
- **Guideline**: A set of rules or recommendations accessed by workflows that MUST, SHOULD, or MAY be followed.
- **Inference Request**: The process of submitting a prompt to models and receiving the generated outputs.
- **Model**: A system capable of processing inference requests and generating outputs.
- **Prompt**: A structured input provided to a model to guide its response generation.
- **Task**: A discrete unit of work that can be assigned, tracked, and completed within the system.
- **Tool**: A capability provided to workflows (agents) executing in a thread that allows them to perform specific actions or access resources. The main tool used is `Bash` and file system access (`Read`)
- **Trigger**: An event or condition that activates a workflow.
- **Tags**: Labels assigned to entities to define the domain they belong to, supporting classification, organization, and efficient retrieval.

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
