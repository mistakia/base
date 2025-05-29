---
title: 'System Design'
type: 'text'
description: |
  Architecture and design principles for the human-in-the-loop LLM system
created_at: '2025-05-27T18:10:20.246Z'
entity_id: 'b75fe9b3-4a83-427c-9e62-3105019df96c'
observations:
  - '[design] Uses a human-in-the-loop approach'
  - '[principle] File-first approach with git version control'
relations:
  - 'relates_to [[system/text/directory-structure.md]]'
  - 'relates_to [[system/text/knowledge-base-schema.md]]'
  - 'relates_to [[system/text/change-request-design.md]]'
  - 'relates_to [[system/text/tool-information.md]]'
  - 'relates_to [[system/text/workflow.md]]'
tags:
updated_at: '2025-05-27T18:10:20.246Z'
user_id: '00000000-0000-0000-0000-000000000000'
---

# Base System Design

A human-in-the-loop LLM system that works alongside a user to manage and build a knowledge base, manage data, complete tasks as the user would, and improve itself — designed for maximum flexibility, simplicity, and to operate as the user would unprompted.

## 1. System Overview

- **File-First Architecture**: Files are the source of truth, stored as markdown files with YAML frontmatter
- **Version Controlled**: Everything is tracked with git
- **Pull Request Style Change Management**: Allows for review and approval of changes, a record of changes, progress tracking, comparison of changes, etc.
- **Composable Workflows**: Workflows can embed other workflows, enabling complex operations
- **Multi-Model Support**: Different models can process the same inference requests
- **Guidelines-Driven**: Evolving guidelines shape the system's behavior based on user preferences
- **Granular Action Control**: System actions have configurable permission levels to control autonomy
- **Async Collaboration**: Support for asynchronous human-system interaction
- **Knowledge Graph**: Builds and traverses relationships between knowledge items
- **Block-Based Content**: All content is broken down into uniquely identifiable blocks with granular access control
- **Self-Improvement**: The system can evaluate and improve itself through feedback loops

## 2. Data Storage System

### 3.1 Storage

Data is stored in two places:

- **Git Repositories**

  - Root repository holds system files and configuration
  - User-specific content stored in git submodules
  - Everything is version controlled and can be worked on offline
  - This is our source of truth

- **PostgreSQL Database**
  - Stores structured data
  - Indexes data to support fast and semantic retrieval

### 3.2 Knowledge Base Architecture

The system separates knowledge into two types:

- **System Knowledge Base**

  - Located in the `system/` directory of the root repository
  - Contains core system definitions, schemas, and documentation
  - Relevant to core system functionality and relevant to all users

- **User Knowledge Bases**
  - Located in git submodules (with `user/` as the default submodule name)
  - Each submodule belongs to a different user and contains their specific content
  - Contains user-specific data, content, and configurations

The relationship between these knowledge bases is hierarchical - the system knowledge base defines the core schema and behavior, while user knowledge bases extend and implement it for specific use cases. This separation allows for a robust core system while allowing flexibility to adjust to multiple users' preferences and workflows.

### 3.3 External Connections

Each external data connection has bidirectional sync and conflict resolution:

- Google Drive
- Notion
- Apple Notes
- Ubuntu servers
- Github Projects
- Other git repos

## 4. Glossary

### 4.1 Key Terms

- **Workflow**: Defines agent behavior as a composable, modular function that specifies inputs, outputs, and tool integrations. It is effectively a prompt that defines agent behavior that can be run repeatedly, have loops, branching, wait for human input, embed other workflows, and so on.
- **Change Request**: A proposal for modifications to the knowledge base that requires review and approval.
- **Guideline**: A set of rules or recommendations accessed by workflows that MUST, SHOULD, or MAY be followed.
- **Inference Request**: The process of submitting a prompt to models and receiving the generated outputs.
- **Model**: A system capable of processing inference requests and generating outputs.
- **Prompt**: A structured input provided to a model to guide its response generation.
- **Task**: A discrete unit of work that can be assigned, tracked, and completed within the system.
- **Tool**: A capability provided to workflows (agents) executing in a thread that allows them to perform specific actions or access resources.
- **Trigger**: An event or condition that activates a workflow.
- **Tags**: Labels assigned to entities to define the domain they belong to, supporting classification, organization, and efficient retrieval.
