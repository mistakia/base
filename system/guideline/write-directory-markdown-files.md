---
title: Write Directory Markdown Files
type: guideline
description: >-
  Guidelines for writing directory-level markdown documentation files that communicate essential
  context, standards, and relationships
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
  - '[distinction] Each file type has specific audience and purpose'
relations:
  - implements [[sys:system/schema/guideline.md]]
  - follows [[user:guideline/starting-point-philosophy.md]]
  - related_to [[sys:system/guideline/write-documentation.md]]
  - related_to [[user:guideline/write-text.md]]
updated_at: '2025-08-16T17:56:09.129Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
---

# Write Directory Markdown

Guidelines for creating directory-level markdown documentation files that communicate the essential context, purpose, and standards of directories.

## Purpose

Directory markdown files provide documentation at the directory level, each serving specific audiences and purposes while focusing on essential context, standards, and relationships.

## File Types and Their Purposes

### CLAUDE.md

Provides specific guidance for Claude Code and AI assistants when working with the codebase. Includes tool permissions, development commands, and AI-specific instructions.

### README.md

Traditional project documentation for general audiences. Typically includes project overview, setup instructions, and usage information.

### INDEX.md

Directory-level documentation focusing on the organization and purpose of contents within a specific directory.

### ABOUT.md

Conceptual documentation describing the domain, purpose, or background of a directory's contents.

Directory markdown files SHOULD be created when a directory contains a cohesive set of entities that benefit from contextual documentation.

## Core Principles

- **Focus on essential context** - Document why the directory exists and its role in the system
- **Communicate standards** - Define conventions and principles that apply to contents
- **Describe relationships** - Explain connections to other parts of the system
- **Avoid volatile information** - Do not list files or include frequently changing details
- **Start minimal** - Begin with core sections and expand based on actual needs
- **No markdown title** - Do not include a top-level markdown heading (h1) in the content

## Required Structure

All directory markdown files MUST include these three sections as a starting point:

### 1. Purpose

A clear statement of why this directory exists and what it contains conceptually.

### 2. Context

Essential background information including:

- How this directory fits into the larger system
- Key relationships to other directories or components
- Important design decisions or architectural choices

### 3. Standards

Applicable conventions, guidelines, and principles for content in this directory.

## What NOT to Include

Directory markdown files MUST NOT include:

- File listings or directory contents
- Frequently changing information
- Step-by-step processes (use workflows instead)
- Implementation details that belong in code
- Information easily obtained through other means

## File Selection and Location

- Choose the appropriate file type based on audience and purpose:
  - `CLAUDE.md` for AI assistant guidance
  - `README.md` for general project documentation
  - `INDEX.md` for directory organization documentation
  - `ABOUT.md` for conceptual or domain documentation
- Place the file at the root of the directory being documented
- Only create one primary documentation file per directory unless different audiences require different files

## Example Structure

```markdown
---
title: Directory Name Documentation
type: text
description: |
  Essential context and standards for the [directory name] directory
created_at: '2025-01-01T00:00:00.000Z'
entity_id: 'directory-name-documentation'
relations:
  - 'related_to [[path/to/related/entity.md]]'
---

## Purpose

This directory contains [conceptual description of contents and their role].

## Context

[Essential background, relationships, and architectural decisions]

## Standards

[Applicable conventions and guidelines for this directory's contents]
```

## When to Expand

Add optional sections only when justified by actual needs:

- **Key Concepts** - When domain-specific ideas need explanation
- **Common Operations** - When typical workflows would benefit readers
- **Related Directories** - When connections are not obvious from context
