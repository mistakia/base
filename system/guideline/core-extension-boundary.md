---
title: Core Extension Boundary
type: guideline
description: >-
  Standards for determining whether functionality belongs in the base system (core) or in the
  user-base directory (extension)
created_at: '2026-02-24T16:39:41.797Z'
entity_id: c06c276d-b417-4e17-9f3f-bc0880157b85
globs:
  - system/**/*.md
  - guideline/**/*.md
  - workflow/**/*.md
public_read: true
relations:
  - implements [[sys:system/schema/guideline.md]]
  - follows [[sys:system/guideline/starting-point-philosophy.md]]
  - related_to [[sys:system/text/extension-system.md]]
updated_at: '2026-02-24T16:39:41.797Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
---

## Principle

The base repository is the generic engine. The user-base directory is the customization layer. When adding functionality to either location, apply these standards to determine correct placement.

## Decision Test

**Would 90%+ of users need this exact functionality?**

- If yes, it belongs in the base system (core)
- If no, it belongs in the user-base directory (extension/customization)

## Core Standards

### Consensus over opinion

Core functionality must reflect consensus practices or established standards. Approaches that are opinionated -- where reasonable users could disagree or choose differently -- belong in user-base.

Examples of consensus (core): entity validation, git commit message format guidelines, task schema definitions, entity CRUD operations.

Examples of opinionated (user-base): three-tier content classification (public/acquaintance/private), specific third-party integrations (GitHub), specific tooling choices (Ollama, Stylus).

### Integration-specific functionality is user-specific

Workflows, guidelines, and tools that depend on external services or integrations belong in user-base. Not all users will use the same external services.

Examples: GitHub issue management, specific LLM provider workflows, custom deployment scripts.

### The two-layer pattern

The system uses a consistent layering pattern across all extension points:

| Layer         | Location                               | Purpose                                      |
| ------------- | -------------------------------------- | -------------------------------------------- |
| Core defaults | `repository/active/base/system/`       | Generic engine, sensible defaults            |
| User overlay  | `user-base/{guideline,workflow,text}/` | User-specific values, integrations, opinions |

This pattern applies to: config, workflows, guidelines, CLI scripts, extensions, container config, deployment config.

### System entities must not reference user entities

System entities (with `sys:` base_uri) must not contain relations or tags pointing to `user:` URIs. This creates a hard dependency from the generic system on user-specific content.

If a system entity needs to reference user-customizable behavior:

- Use parameterized references (prompt_properties) instead of hard-coded paths
- Use plain text notes like "see user directory for project-specific configuration"
- Have the user entity declare the reverse relation instead

## Related Principles

- [[sys:system/guideline/starting-point-philosophy.md]] - Start minimal, expand based on actual needs
- [[sys:system/text/extension-system.md]] - Extension system for opinionated tooling
