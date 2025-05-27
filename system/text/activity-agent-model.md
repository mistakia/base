---
title: 'Activity-Agent Model'
type: 'text'
description: |
  Design concept for activity-based agent specialization and orchestration
created_at: '2025-05-27T18:10:20.241Z'
entity_id: '7ab1422d-533d-4967-972a-7fb8167604ff'
observations:
  - '[architecture] Activities define specialized agent behaviors that run inside threads #design'
  - '[execution] Each thread executes exactly one activity with defined inputs/outputs #implementation'
  - '[principle] Tool integration enables complex agent capabilities #implementation'
relations:
  - 'relates_to [[system/text/system-design.md]]'
  - 'relates_to [[system/text/base-threads.md]]'
  - 'relates_to [[system/text/knowledge-base-schema.md]]'
  - 'relates_to [[system/schema/activity.md]]'
tags:
updated_at: '2025-05-27T18:10:20.241Z'
user_id: '00000000-0000-0000-0000-000000000000'
---

# Activity-Agent Model

## Overview

The system implements a model where activities define agent behaviors that run inside threads. Each thread executes exactly one activity, providing the execution environment and context. Activities define both functional behavior and interaction patterns through structured inputs, outputs, and tool integrations.

## Key Concepts

- **Thread as Execution Environment**: Threads provide the runtime context in which activities execute
- **Activity as Behavior Definition**: Activities define specialized agent behaviors with specific inputs, outputs, and tools
- **One-to-One Relationship**: Each thread executes exactly one activity (specified by `activity_base_relative_path`)
- **Functional Structure**: Activities accept defined inputs (`prompt_properties`) and produce structured outputs through completion tools
- **Composition via Tools**: Activities can invoke other activities through tool calls, enabling complex workflows

## Implementation Notes

This design pattern enables:

1. **Modularity**: Activities can evolve independently while maintaining a consistent thread execution model
2. **Reusability**: Activities can be composed to create complex workflows through tool-based invocation
3. **Structured Data Flow**: Clear inputs and outputs enable reliable data passing between activities
4. **Specialized Behavior**: Each activity can define custom tools specific to its domain
5. **Consistent Completion**: Standardized activity completion mechanisms ensure reliable outputs

## Tool Integration

Activities integrate with tools in three primary ways:

1. **Using Available Tools**: Each activity specifies which system tools it needs access to
2. **Defining Custom Tools**: Activities can define specialized tools for their specific domain
3. **Completion Mechanisms**: Each activity implements a completion tool to return structured results

## Distinction Between Activity and Role

In this system, **activity** is the canonical, system-level entity that defines an agent's objective, specialization, and capabilities that determines what it is responsible for and how it should behave.

The term **role** is used only as a presentation concept in prompts and user interfaces. The agent's "role" is always derived from the assigned activity's title and description, and is never a separate or canonical identifier. In all backend, schema, and thread metadata, only `activity` and `activity_base_relative_path` are used to define agent objectives.

- Use `activity` for all system logic, metadata, and schema.
- Use `role` only for display in prompts or UI, always based on the assigned activity.
