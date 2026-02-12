---
title: File and Folder Organization
type: guideline
description: Standards for organizing files into directory hierarchies within the knowledge base
base_uri: sys:system/guideline/file-folder-organization.md
created_at: '2026-01-08T16:41:10.697Z'
entity_id: 3807da02-b0d2-43d6-85e7-67f37a77ab50
globs:
  - text/**
  - physical-item/**
observations:
  - '[principle] Domain-first organization creates intuitive navigation hierarchies'
  - '[threshold] Directories with fewer than 3 files indicate premature organization'
  - '[principle] Verbose names reduce ambiguity at the cost of brevity'
public_read: false
relations:
  - implements [[sys:system/schema/guideline.md]]
  - follows [[sys:system/guideline/starting-point-philosophy.md]]
  - related_to [[sys:system/guideline/directory-markdown-standards.md]]
updated_at: '2026-01-08T16:41:10.697Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
---

# File and Folder Organization

Standards for organizing files into directory hierarchies within the knowledge base.

## Directory Sizing

- Directories SHOULD NOT be created until at least 3 related files exist
- Directories MUST NOT contain only a single subdirectory
- Flat structure is acceptable until clear groupings emerge

## Directory Naming

- Directory names SHOULD be verbose and unambiguous rather than short and ambiguous
- Directory names MUST use singular nouns (e.g., `activity/` not `activities/`)
- Directory names MUST use kebab-case for multi-word names

## Domain-First Organization

- Top-level directories SHOULD represent distinct life or work domains
- Domain directories group related content regardless of content type
- Generic or cross-domain information SHOULD remain at the root level until clear grouping emerges

## Imported Content Alignment

- Subdirectories for imported content SHOULD match the source database or system names
- This alignment maintains traceability between the knowledge base and source systems

## Project vs Domain Content

- Project folders SHOULD contain project-specific documentation only
- General domain knowledge MUST NOT be placed in project folders
- Domain knowledge belongs in domain directories, not project directories

## Directory Documentation

- New directories SHOULD include an ABOUT.md file following [[sys:system/guideline/directory-markdown-standards.md]]
- Hub pages or index content MAY be converted to directory ABOUT.md files when creating new directories
