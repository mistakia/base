---
title: Workflow Schema
type: type_definition
description: A prompt used to create an agentic workflow with structured inputs and outputs
base_uri: user:repository/active/base/system/schema/workflow.md
created_at: '2025-08-16T17:56:08.207Z'
entity_id: 209fd254-b77f-4a57-ac3b-f7b9c45cc787
extends: entity
properties:
  - name: prompt_properties
    type: array
    description: Defines input parameters for the workflow
    optional: true
    items:
      type: object
      properties:
        - name: name
          type: string
          required: true
          description: Name of the property
        - name: type
          type: string
          required: true
          description: Data type of the property
        - name: required
          type: boolean
          required: false
          description: Whether the property is required
        - name: description
          type: string
          required: false
          description: Description of what the property is used for
        - name: default
          type: any
          required: false
          description: Default value for the property
        - name: properties
          type: array
          required: false
          description: Nested property definitions for object types
          items:
            type: object
            properties:
              - name: name
                type: string
                required: true
              - name: type
                type: string
                required: true
              - name: description
                type: string
                required: false
              - name: required
                type: boolean
                required: false
              - name: default
                type: any
                required: false
              - name: enum
                type: array
                required: false
        - name: enum
          type: array
          required: false
          description: Allowed values for enum types
        - name: items
          type: object
          required: false
          description: Item schema for array types
  - name: tool_definition
    type: object
    description: Defines custom tools for the workflow
    required: false
  - name: tools
    type: array
    description: List of tools available for this workflow
    required: false
    items:
      type: string
type_name: workflow
updated_at: '2026-01-05T19:25:18.020Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
---

# Workflow

Workflows define agentic processes with structured inputs and outputs. Each workflow can function as a self-contained agent or as part of a larger system, connecting with other workflows in a functional way. Workflows can be one-shot style prompts or complex multi-step processes.

## Purpose

Workflows serve as executable prompts that:

- Accept defined inputs through `prompt_properties`
- Execute a specific workflow or process
- Produce structured outputs through custom tool calls
- Can be composed together to create more complex behaviors

## Examples

Workflows might include:

- Summarizing a document
- Finding information in a knowledge base
- Analyzing data and providing insights
- Creating structured content based on requirements
- Converting information between formats
- Decision-making processes
- Software development processes
- Manufacturing procedures
- Operational workflows

## Tool Integration

Workflows can define and use tools in three ways:

1. **Available Tools** (`tools` property): Lists all tools that should be made available to this workflow.

   ```yaml
   tools:
     - search_knowledge_base
     - read_file
     - write_file
   ```

2. **Custom Tool Definitions** (`tool_definition` property): Defines custom tools specific to this workflow.

   ```yaml
   tool_definition:
     complete_workflow:
       description: Completes the current workflow with a structured result
       parameters:
         result:
           type: object
           description: The structured output of this workflow
   ```

3. **Tool Usage Documentation**: The workflow prompt should explain how to use each available tool effectively.

## Workflow Completion

Each workflow should define a `complete_workflow` (or similar) tool that:

- Provides a structured way to return the workflow's results
- Signals that the workflow has finished its work
- Formats outputs in a way that can be consumed by other workflows or processes

## Relations

Workflows commonly use these relation types:

- `follows`: Guidelines related to this workflow
- `calls`: Other workflows that this workflow may invoke

Example:

```yaml
relations:
  - 'follows [[sys:system/guideline/guideline-name.md]]'
  - 'calls [[sys:system/workflow/find-information.md]]'
```
