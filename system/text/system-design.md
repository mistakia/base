---
title: System Design
type: text
description: Architecture and design principles for the human-in-the-loop agent system
tags: [architecture, design, documentation]
observations:
  - '[design] Uses a human-in-the-loop approach #collaboration'
  - '[principle] System should always be evaluated for improvement #iterative'
  - '[architecture] Dual knowledge base architecture ensures stability while enabling customization #design'
  - '[principle] File-first approach with git version control provides robust knowledge management #versioning'
  - '[feature] Activity-based organization provides clear context for actions #organization'
  - '[principle] Guidelines-driven approach ensures consistency #governance'
relations:
  - 'relates_to [[Directory Structure]]'
  - 'relates_to [[Knowledge Base Schema]]'
  - 'part_of [[Documentation]]'
---

# Base System Design

You are part of a powerful human-in-the-loop AI system.

You are working together with a human to complete tasks, manage and build a knowledge base, manage data, and most importantly manage and build this system.

The system should always be considered incomplete and constantly evaluated for improvement.

## 1. System Overview

The system is designed to create a collaborative environment where AI agents and humans work together to complete tasks, manage and build a knowledge base, manage data, and most importantly manage and build this system. It follows these key principles:

- **Version Control**: Everything is stored in git
- **File-First Architecture**: Files are the source of truth for all knowledge
- **Markdown Storage**: All knowledge items are stored as plain markdown files with YAML frontmatter
- **Pull Request Model**: Changes are proposed through git pull requests
- **Activity-Based Organization**: Actions are classified by activity types for better context management
- **Multi-Model Support**: Different models can process the same inference requests
- **Guidelines-Driven**: Activities follow established guidelines that evolve over time
- **Access Control**: Tools have configurable permissions
- **Async Collaboration**: Support for asynchronous human-agent interaction
- **Knowledge Graph**: Builds and traverses relationships between knowledge items

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

## 6. Data Storage System

### 6.1 Storage

Data is stored in two places:

- **Git Submodule Repository**

  - Holds all files like docs, config, and templates
  - Everything is version controlled and can be worked on offline
  - This is our source of truth

- **PostgreSQL Database**
  - Stores structured data like users and tasks
  - Handles relationships between data
  - Keeps track of where files are stored

### 6.2 Knowledge Base Architecture

The system implements a dual knowledge base architecture:

- **System Knowledge Base**

  - Located in the `system/` directory
  - Contains core system definitions, schemas, and templates
  - Managed by the system maintainers
  - Provides the foundation and structure for all knowledge items
  - Changes require more rigorous approval processes

- **User Knowledge Base**
  - Located in the `data/` directory
  - Contains user-specific content following the system schema
  - Can be extended with custom types and properties
  - Changes follow user-defined approval workflows
  - Syncs with external systems through bidirectional connectors

The relationship between these knowledge bases is hierarchical - the system knowledge base defines the core schema and behavior, while the user knowledge base extends and implements it for specific use cases. This separation ensures system stability while allowing for flexible customization.

### 6.3 External Connections

Each external data connection has bidirectional sync and conflict resolution:

- Google Drive
- Notion
- Apple Notes
- Ubuntu servers
- Github Projects
- Other git repos

## 7. Glossary

### 7.1 Key Terms

- **Activity**: A classification of actions that share common patterns, guidelines, and data requirements (e.g., "writing an email", "creating a task").
- **Change Request**: A proposal for modifications to data or content that requires review and approval.
- **Guideline**: A set of rules or recommendations associated with activities that MUST, SHOULD, or MAY be followed that will be included in relevant prompts.
- **Inference Request**: The process of submitting a prompt to one or more AI models and receiving the generated outputs.
- **Model**: A system capable of processing inference requests and generating outputs.
- **Prompt**: A structured input provided to a model to guide its response generation.
- **Task**: A discrete unit of work that can be assigned, tracked, and completed within the system.
- **Tool**: A capability provided to agents that allows them to perform specific actions or access particular resources.
- **Trigger**: An event or condition that activates a prompt for an inference request.
- **Tags**: Labels that can be added to activities, tasks, tools, and data items to help with organization and retrieval. An activity, task, tool, or data item can have multiple tags.
