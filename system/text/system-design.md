---
title: System Design
type: text
description: Architecture and design principles for the human-in-the-loop LLM system
tags: []
observations:
  - '[design] Uses a human-in-the-loop approach'
  - '[principle] File-first approach with git version control'
relations:
  - 'relates_to [[system/text/directory-structure.md]]'
  - 'relates_to [[system/text/knowledge-base-schema.md]]'
---

# Base System Design

A human-in-the-loop LLM system to that works alongside you to manage and build a knowledge base, manage data, complete tasks, and improve itself — the goal is for it to do exactly what you want unprompted.

## 1. System Overview

- **File-First Architecture**: Files are the source of truth, stored as plain markdown files with YAML frontmatter
- **Version Controlled**: All changes are tracked with git
- **Pull Request Style Workflow**: Allows for review and approval of changes, a record of changes, progress tracking, comparison of changes, etc.
- **Activity-Based Organization**: Actions are classified by activity types for better context management
- **Multi-Model Support**: Different models can process the same inference requests
- **Guidelines-Driven**: Evolving guidelines shape the system's behavior based on user preferences
- **Granular Action Control**: System actions have configurable permission levels to control autonomy
- **Async Collaboration**: Support for asynchronous human-system interaction
- **Knowledge Graph**: Builds and traverses relationships between knowledge items
- **Block-Based Content**: All content is broken down into uniquely identifiable blocks with granular access control.
- **Self-Improvement**: The system can evaluate and improve itself through feedback loops

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
  - Contains core system definitions, schemas, and templates
  - Relevant to core system functionality and relevant to all users

- **User Knowledge Bases**
  - Located in git submodules (with `user/` as the default submodule name)
  - Each submodule belongs to a different user and contains their specific content
  - Contains user-specific data, content, and configurations
  - Relevant to specific users and their workflows

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

- **Activity**: Defines an agentic workflow as a composable, modular, and reusable function that specifies behavior, inputs, outputs, and tool integrations.
- **Change Request**: A proposal for modifications to the knowledge base that requires review and approval.
- **Guideline**: A set of rules or recommendations associated with activities that MUST, SHOULD, or MAY be followed that will be included in relevant prompts.
- **Inference Request**: The process of submitting a `Prompt` to one or more `Models` and receiving the generated outputs.
- **Model**: A system capable of processing `Inference Requests` and generating outputs.
- **Prompt**: A structured input provided to a `Model` to guide its response generation.
- **Task**: A discrete unit of work that can be assigned, tracked, and completed within the system.
- **Tool**: A capability provided to `Models` that allows them to perform specific actions or access particular resources.
- **Trigger**: An event or condition that activates a `Prompt` for an `Inference Request`.
- **Tags**: Labels that can be added to activities, tasks, tools, and data items to help with organization and retrieval. An activity, task, tool, or data item can have multiple tags.
