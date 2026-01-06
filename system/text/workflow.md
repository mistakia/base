---
title: Workflow
type: text
description: Design for workflow-based agent specialization and orchestration
base_uri: sys:system/text/workflow.md
created_at: '2025-05-27T18:10:20.241Z'
entity_id: 7ab1422d-533d-4967-972a-7fb8167604ff
observations:
  - '[architecture] Workflows define agent behaviors that run inside threads'
  - '[execution] Each thread executes exactly one workflow with defined inputs/outputs'
  - '[principle] Tool integration enables complex agent capabilities'
relations:
  - relates_to [[sys:system/text/system-design.md]]
  - relates_to [[sys:system/text/execution-threads.md]]
  - relates_to [[sys:system/text/knowledge-base-schema.md]]
  - relates_to [[sys:system/schema/workflow.md]]
updated_at: '2026-01-05T19:24:57.362Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
---

# Workflow

Workflows define agent behaviors that run inside threads. Each thread should execute one workflow, providing the execution environment and context. Workflows define behavior and interaction patterns through structured inputs, outputs, and tool integrations.

## Key Concepts

- **Thread as Execution Environment**: Threads provide the runtime context for workflows
- **One-to-One Relationship**: Each thread executes one workflow (specified by `workflow_base_uri`)
- **Workflow as Behavior Definition**: Workflows define agent behaviors with inputs, outputs, and tools
- **Functional Structure**: Workflows accept inputs (`prompt_properties`) and produce outputs through completion tools
- **Composition**: Workflows can invoke other workflows through tool calls enabling various complex patterns

## Advanced Workflow Capabilities

Workflows support sophisticated control flows and patterns:

- **Loops and Recursion**: Workflows can iterate or call themselves recursively
- **Branching Logic**: Conditional execution paths based on inputs or intermediate results
- **State Management**: Maintain and transform state across execution steps
- **Human Interaction**: Pause execution to wait for human input
- **Nested Execution**: Embed and orchestrate other workflows as components
- **Asynchronous Operations**: Initiate long-running tasks and handle their results later

## Implementation Benefits

1. **Modularity**: Workflows evolve independently while maintaining a consistent execution model
2. **Reusability**: Workflows can be composed to create complex operations
3. **Structured Data Flow**: Clear inputs and outputs enable reliable data passing
4. **Specialized Behavior**: Each workflow can define custom tools for its domain
5. **Consistent Completion**: Standardized completion mechanisms ensure reliable outputs

## Tool Integration

Workflows integrate with tools in three ways:

1. **Using Available Tools**: Each workflow specifies which system tools it needs
2. **Defining Custom Tools**: Workflows can define specialized tools for their domain
3. **Completion Mechanisms**: Each workflow implements a completion tool to return results
