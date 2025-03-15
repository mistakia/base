# Human-in-the-Loop Agent System Design

## 1. System Overview

The system is designed to create a collaborative environment where AI agents and humans work together on tasks and knowledge management. It follows these key principles:

- **Version Control for Everything**: All data changes (prompts, tasks, guidelines, etc.) are tracked with git
- **Pull Request Model**: Agents propose changes rather than directly implementing them
- **Data-Centric Architecture**: Almost everything is treated as versioned, classified data
- **Activity-Based Organization**: Actions are classified by activity types for better context management
- **Multi-Model Support**: Different models can process the same inference requests
- **Self-Improvement**: System can recursively work on improving its own components
- **Guidelines-Driven**: Activities follow established guidelines that evolve over time
- **Access Control**: Tools have configurable permissions based on sensitivity
- **Async Collaboration**: Support for asynchronous human-agent interaction

## 2. Core Components

The system is organized into a modular directory structure with clear separation of concerns. See [Directory Structure](./directory-structure.md) for the complete organization.

## 3. Core Schema

## 4. Workflows

## 5. Security and Access Control

### 5.1 Tool Permission Levels

- **Read-Only**: Can only read data, no modification
- **Propose-Only**: Can propose changes but requires approval
- **Auto-Approve-Low-Risk**: Can auto-approve changes deemed low-risk
- **Full-Access**: Can make changes without approval (restricted)

### 5.2 Human Confirmation Workflows

- Direct approval: Human explicitly approves each change
- Batch approval: Group of changes approved together
- Time-limited delegation: Auto-approve for a set period
- Risk-based approval: Higher risk = higher approval requirements

## 6. Glossary

### 6.1 Key Terms

- **Activity**: A classification of actions that share common patterns, guidelines, and data requirements (e.g., "writing an email", "creating a task").
- **Change Request**: A proposal for modifications to data or content that requires review and approval.
- **Guideline**: A set of rules or recommendations associated with activities that MUST, SHOULD, or MAY be followed.
- **Inference Request**: The process of submitting a prompt to one or more AI models and receiving the generated outputs.
- **Model**: A system capable of processing inference requests and generating outputs.
- **Prompt**: A structured input provided to a model to guide its response generation.
- **Task**: A discrete unit of work that can be assigned, tracked, and completed within the system.
- **Tool**: A capability provided to agents that allows them to perform specific actions or access particular resources.
- **Trigger**: An event or condition that activates building a prompt for an inference request.
- **Tags**: Labels that can be added to activities, tasks, tools, and data items to help with organization and retrieval. An activity, task, tool, or data item can have multiple tags.
