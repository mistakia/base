---
title: System Design
type: text
description: Architecture and design principles for the human-in-the-loop LLM system
tags: [architecture, design, documentation]
observations:
  - '[design] Uses a human-in-the-loop approach #collaboration'
  - '[principle] System should always be evaluated for improvement #iterative'
  - '[architecture] Dual knowledge base architecture ensures stability while enabling customization #design'
  - '[principle] File-first approach with git version control provides robust knowledge management #versioning'
  - '[feature] Activity-based organization provides clear context for actions #organization'
  - '[principle] Guidelines-driven approach ensures consistency #governance'
relations:
  - 'relates_to [[system/text/directory-structure]]'
  - 'relates_to [[system/text/knowledge-base-schema]]'
---

# Base System Design

You are part of a powerful human-in-the-loop LLM system.

You are working together with a human to complete tasks, manage and build a knowledge base, manage data, and most importantly manage and build this system.

The system should always be considered incomplete and constantly evaluated for improvement.

## 1. System Overview

The system is designed to create a collaborative environment where LLMs and humans work together to complete tasks, manage and build a knowledge base, manage data, and most importantly manage and build this system. It follows these key principles:

- **Version Controlled**: All data changes (prompts, tasks, guidelines, etc.) are tracked with git
- **File-First Architecture**: Files are the source of truth for all knowledge
- **Markdown Storage**: All knowledge items are stored as plain markdown files with YAML frontmatter
- **Pull Request Style Workflow**: Allows for review and approval of changes, a record of changes, progress tracking, comparison of changes, etc.
- **Activity-Based Organization**: Actions are classified by activity types for better context management
- **Multi-Model Support**: Different models can process the same inference requests
- **Guidelines-Driven**: Evolving guidelines shape the system's behavior based on user preferences
- **Granular Action Control**: System actions have configurable permission levels to control autonomy
- **Async Collaboration**: Support for asynchronous human-system interaction
- **Knowledge Graph**: Builds and traverses relationships between knowledge items
- **Block-Based Content**: All content is broken down into uniquely identifiable blocks with granular access control.
- **Self-Improvement**: The system can evaluate and improve itself through a built-in feedback loop

### 1.1 Tool Permission Levels

- **Read-Only**: Can only read data, no modification
- **Propose-Only**: Can propose changes but requires approval
- **Auto-Approve-Low-Risk**: Can auto-approve changes deemed low-risk
- **Full-Access**: Can make changes without approval (restricted)

### 1.2 Human Confirmation Workflows

- Direct approval: Human explicitly approves each change
- Batch approval: Group of changes approved together
- Time-limited delegation: Auto-approve for a set period
- Risk-based approval: Higher risk = higher approval requirements

## 2. Data Storage System

### 3.1 Storage

Data is stored in two places:

- **Git Submodule Repository**

  - Holds all files like docs, config, and templates
  - Everything is version controlled and can be worked on offline
  - This is our source of truth

- **PostgreSQL Database**
  - Stores structured data like users and tasks
  - Handles relationships between data
  - Keeps track of where files are stored
  - Indexes data to support fast and semantic retrieval

### 3.2 Knowledge Base Architecture

The system separates knowledge into two types:

- **System Knowledge Base**

  - Located in the `system/` directory
  - Contains core system definitions, schemas, and templates
  - Relevant to core system functionality and relevant to all users

- **User Knowledge Base**
  - Located in the `data/` directory
  - Contains user-specific data, content, and configurations
  - Relevant to specific users and their workflows

The relationship between these knowledge bases is hierarchical - the system knowledge base defines the core schema and behavior, while the user knowledge base extends and implements it for specific use cases. This separation allows for a robust core system while allowing flexibility to adjust to user preferences and workflows.

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

- **Activity**: A classification of actions that share common patterns, guidelines, and data requirements (e.g., "writing an email", "creating a task").
- **Role**: A presentation term used in prompts and user interfaces to describe the persona or function of an agent. The role is always derived from the assigned activity's title and description. The canonical system entity for agent objectives is `activity` (see above); `role` is never used as a separate identifier in backend, schema, or thread metadata.
- **Change Request**: A proposal for modifications to the knowledge base that requires review and approval.
- **Guideline**: A set of rules or recommendations associated with activities that MUST, SHOULD, or MAY be followed that will be included in relevant prompts.
- **Inference Request**: The process of submitting a `Prompt` to one or more `Models` and receiving the generated outputs.
- **Model**: A system capable of processing `Inference Requests` and generating outputs.
- **Prompt**: A structured input provided to a `Model` to guide its response generation.
- **Task**: A discrete unit of work that can be assigned, tracked, and completed within the system.
- **Tool**: A capability provided to `Models` that allows them to perform specific actions or access particular resources.
- **Trigger**: An event or condition that activates a `Prompt` for an `Inference Request`.
- **Tags**: Labels that can be added to activities, tasks, tools, and data items to help with organization and retrieval. An activity, task, tool, or data item can have multiple tags.
