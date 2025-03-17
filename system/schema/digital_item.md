---
title: Digital Item
type: type_definition
extends: base
description: Digital items represent files, software, or digital artifacts
properties:
  - name: file_type
    type: string
    enum: [Document, Image, Video, Software, Code]
    required: false
    description: Type of digital item
  - name: file_uri
    type: string
    required: false
    description: URL or path to the file
  - name: file_size
    type: string
    required: false
    description: Size of the file
  - name: file_hash
    type: string
    required: false
    description: Hash value for verification
---

# Digital Item

Digital items represent files, software, or other digital artifacts that are stored electronically. They can be referenced in tasks, activities, and other knowledge base items.

## Digital Asset Management

The digital item schema supports:

- Basic file metadata
- Location tracking (via URIs)
- File integrity verification (via hashes)
- Categorization by file type

## Common Digital Items

Digital items might include:

- Documents (reports, manuals, specifications)
- Images (diagrams, photos, screenshots)
- Videos (tutorials, recordings, presentations)
- Software (applications, scripts, utilities)
- Code (source files, libraries, modules)

## Relations

Digital items commonly relate to:

- tasks (work that produces or requires these files)
- activities (processes that use these files)
- persons (who create or use the files)
- organizations (groups that own or manage the files)
