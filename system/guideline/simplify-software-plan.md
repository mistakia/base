---
title: Simplify Software Plan
type: guideline
description: Guidelines for reviewing implementation plans to prevent over-engineering before software is written
created_at: '2026-01-26T22:53:41.454Z'
entity_id: 206494e9-8c62-40bc-bec8-88e13360951f
globs:
  - '**/task/**/*.md'
observations:
  - '[philosophy] Best software is software that does not need to be written'
  - '[principle] YAGNI applies to design phase, not just implementation'
  - '[heuristic] Rule of three - defer abstraction until three concrete cases exist'
  - '[warning] Wrong abstractions are harder to fix than duplicated software'
public_read: false
relations:
  - follows [[sys:system/guideline/starting-point-philosophy.md]]
  - complements [[sys:system/guideline/simplify-software-implementation.md]]
  - informs [[sys:system/guideline/write-software.md]]
updated_at: '2026-01-26T22:53:41.454Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
---

# Simplify Software Plan

Apply YAGNI principles during planning to prevent unnecessary complexity from being designed in.

## Core Philosophy

The best software is software that doesn't need to be written. Plans should be scrutinized for scope creep, premature abstraction, and speculative features before any implementation begins.

## Scope Validation

- Each proposed component MUST trace to an explicit user requirement
- "Nice to have" features MUST be deferred, not included
- Configurability MUST NOT be added unless configuration is requested
- Error handling beyond immediate needs MUST NOT be planned speculatively

## Architecture Scrutiny

- Abstractions MUST solve problems that exist today, not tomorrow
- Layers MUST be justified by current complexity, not anticipated growth
- Patterns MUST match the problem scale
- Interfaces with single implementations MUST be questioned

## Abstraction Evaluation

### Default: Defer Abstraction

- If fewer than 3 concrete use cases exist, inline the logic
- If the "axis of change" is hypothetical, don't design for it
- If abstracting for "flexibility," ask: flexibility for what, specifically?

### Exceptions: Upfront Abstraction Justified When

- The abstraction models an explicit requirement (plugin system, multi-backend)
- The boundary is architectural, not speculative (external service integration)
- Cost of later change is genuinely prohibitive (public API, shared schema)

## Simplest Solution Test

- Before finalizing, ask: "What is the simplest thing that could work?"
- If a simpler approach exists, justify why the complex one is necessary
- Prefer boring, proven approaches over novel architectures

## Red Flags in Plans

- Interfaces with one implementation and no concrete second use case
- "Factory" or "Strategy" patterns without identified variants
- Configuration options for values that will never change
- Layers justified by "we might need to swap this out later"
