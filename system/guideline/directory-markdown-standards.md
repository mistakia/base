---
title: Directory Markdown Standards
type: guideline
description: >-
  Standards for directory-level markdown documentation that communicates essential context,
  boundaries, and notable references for organizing content
base_uri: sys:system/guideline/directory-markdown-standards.md
created_at: '2025-08-16T00:00:00.000Z'
entity_id: 13ae9879-308e-4b8d-a252-8410d52ff740
globs:
  - '**/ABOUT.md'
  - '**/INDEX.md'
  - '**/README.md'
  - '**/CLAUDE.md'
observations:
  - '[types] Different markdown files serve different documentation purposes in directories'
  - '[principle] Focus on stable context rather than volatile file listings'
  - '[notable] Document context that would otherwise require discovery effort'
  - '[boundaries] Clarify scope boundaries when directory overlap exists'
relations:
  - implements [[sys:system/schema/guideline.md]]
  - follows [[user:guideline/starting-point-philosophy.md]]
  - related_to [[sys:system/guideline/write-documentation.md]]
  - related_to [[user:guideline/write-text.md]]
updated_at: '2025-01-21T00:00:00.000Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
---

# Directory Markdown Standards

Standards for directory-level markdown that communicates purpose, boundaries, and notable context.

## File Types

| File        | Audience      | Purpose                                          |
| ----------- | ------------- | ------------------------------------------------ |
| `CLAUDE.md` | AI assistants | Tool permissions, commands, AI-specific guidance |
| `README.md` | General       | Project overview, setup, usage                   |
| `INDEX.md`  | Navigation    | Directory organization and structure             |
| `ABOUT.md`  | Understanding | Domain concepts, background, rationale           |

Create documentation when a directory contains a cohesive set of content that benefits from shared context.

## Core Principles

- **Essential context only** - Document what's needed to understand or work with directory contents
- **Stable over volatile** - Avoid file listings or frequently changing details
- **Surface the non-obvious** - Highlight context that requires discovery effort to find
- **Clarify boundaries** - When scope overlaps with other directories, define what belongs where
- **Start minimal** - Expand based on actual confusion or repeated questions

## Required Sections

### Purpose

Why this directory exists and what it contains conceptually.

### Context

How this directory fits into the larger system, key relationships, and important design decisions.

### Standards

Conventions and guidelines that apply to content in this directory.

## Optional Sections

### Goals (Task and Project Directories)

For directories containing work toward a specific outcome, document the target state or success criteria. This extends Purpose by answering "what does done look like?"

- **Target outcome** - The end state this work is moving toward
- **Success criteria** - How to recognize when goals are achieved
- **Key milestones** - Major waypoints if the goal is complex

Goals are most valuable for task directories (`task/passive-house/`) and project directories where work has a defined endpoint. They help prioritize tasks and clarify what new work should be created.

**Example** for `task/passive-house/`:

```markdown
## Goals

**Target**: Complete passive house certification for primary residence

**Success criteria**: PHI or PHIUS certification achieved, blower door test ≤0.6 ACH50

**Milestones**: Design approval, envelope completion, mechanical install, certification audit
```

### Key Concepts

When domain-specific terminology or ideas need explanation to understand directory contents effectively.

## Notable Context

Directory documentation SHOULD surface important context that would otherwise require discovery effort. This includes references to entities both inside and outside the directory.

### What Makes Context Notable

Include context when it meets ANY of these criteria:

- **Widely relevant** - Applies to most content in the directory
- **Non-obvious** - Not easily discovered through normal navigation
- **Decision-influencing** - Affects how content should be created or organized
- **Cross-cutting** - Connects to entities outside the directory's immediate scope

### What to Document

- **Applicable tags** - Tags that should be applied to entities in this directory
- **Key guidelines** - Guidelines that govern content creation or formatting
- **Related schemas** - Type definitions that apply to directory contents
- **Sibling directories** - Related directories with overlapping or complementary scope
- **External dependencies** - Systems, APIs, or resources that directory contents interact with

### What to Avoid

- **Exhaustive listings** - Don't list every related entity; focus on the most important
- **Obvious relationships** - Don't document what's apparent from directory structure
- **Transient information** - Avoid status updates or time-sensitive details
- **Duplicated content** - Reference entities rather than copying their content

### Example

```markdown
## Notable Context

**Tags**: Content here should use `user:tag/passive-house.md`

**Guidelines**: Follows [[user:guideline/building-standards.md]] for documentation format

**Related directories**:

- `task/land-search/` - Property acquisition (before site selection)
- `task/parcels-system/` - GIS and parcel data management
```

## Boundary Disambiguation

When directories have overlapping domains, add a disambiguation section:

```markdown
## Scope

This directory focuses on [primary concern]. Content belongs here when [key criteria].

**Belongs here**: [2-4 concrete examples]

**Belongs elsewhere**: [2-4 examples with target directory]

**Decision guide**: [1-3 questions to determine placement]
```

### Example

For `task/passive-house/` with related directories `task/land-search/` and `task/parcels-system/`:

```markdown
## Scope

This directory focuses on passive house design and certification. Content belongs here when passive house standards are the primary concern.

**Belongs here**: Certification planning, envelope design, mechanical system selection for PH compliance

**Belongs elsewhere**:

- General property research → `task/land-search/`
- Parcel data and GIS → `task/parcels-system/`

**Decision guide**: Is passive house certification the primary goal? Would this task exist without the PH requirement?
```

## Anti-Patterns

- **File inventories** - Listing directory contents (use `ls` or glob patterns instead)
- **Changelog entries** - Recording what changed over time
- **Process documentation** - Step-by-step procedures (use workflows)
- **Implementation details** - Code-level specifics that belong in source files
