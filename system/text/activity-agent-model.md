---
title: Activity-Agent Model
type: text
description: Design concept for activity-based agent specialization and orchestration
tags: [architecture, agents, activities, design, documentation]
observations:
  - '[architecture] Activities serve as the foundation for specialized agents #design'
  - '[design] Base Thread agents can create and delegate to activity-based agents #workflow'
  - '[principle] Agent specialization follows activity boundaries #organization'
relations:
  - 'relates_to [[system/text/system-design]]'
  - 'relates_to [[system/text/base-threads]]'
  - 'relates_to [[system/text/knowledge-base-schema]]'
---

# Activity-Agent Model

## Overview

The system implements an activity-based agent model where:

1. Each activity definition represents a specialized agent capability
2. Base Thread agents can create new agents by defining activities
3. Tasks can be assigned to specific activity-based agents

## Key Concepts

- **Activity-Based Specialization**: Activities define the boundaries and capabilities of specialized agents
- **Agent Creation**: Base Thread agents can dynamically create specialized agents by defining new activities
- **Task Assignment**: The Base Thread assigns tasks to appropriate activity-based agents based on their specialization

## Workflow

```
Base Thread Agent
  │
  ├── Creates Activity (Agent Type)
  │   └── Defines capabilities and guidelines
  │
  └── Assigns Task to Activity-Based Agent
      └── Agent executes task following activity guidelines
```

## Implementation Notes

This design pattern enables modular agent capabilities that can evolve independently while maintaining a consistent orchestration layer.

## Distinction Between Activity and Role

In this system, **activity** is the canonical, system-level entity that defines an agent's objective, specialization, and capabilities. Every agent is assigned an `activity_id` that determines what it is responsible for and how it should behave.

The term **role** is used only as a presentation concept in prompts and user interfaces. The agent's "role" is always derived from the assigned activity's title and description, and is never a separate or canonical identifier. In all backend, schema, and thread metadata, only `activity` and `activity_id` are used to define agent objectives.

- Use `activity` for all system logic, metadata, and schema.
- Use `role` only for display in prompts or UI, always based on the assigned activity.
