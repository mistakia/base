# Human-in-the-Loop Agent System Design

## 1. System Overview

The system is designed to create a collaborative environment where AI agents and humans work together to complete tasks, manage and build a knowledge base, manage data, and most importantly manage and build this system. It follows these key principles:

- **Version Control**: Everything is stored in git
- **Pull Request Model**: Changes are proposed through git pull requests
- **Activity-Based Organization**: Actions are classified by activity types for better context management
- **Multi-Model Support**: Different models can process the same inference requests
- **Guidelines-Driven**: Activities follow established guidelines that evolve over time
- **Access Control**: Tools have configurable permissions
- **Async Collaboration**: Support for asynchronous human-agent interaction

See [Directory Structure](./directory-structure.md) for the complete organization.

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

### 6.2 External Connections

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
