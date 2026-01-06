---
title: Digital Item Schema
type: type_definition
description: Digital items represent files, software, or digital artifacts
base_uri: sys:system/schema/digital-item.md
created_at: '2025-08-16T17:56:08.203Z'
entity_id: 10194a1c-e110-4cfd-9212-fd9a15160d97
extends: entity
properties:
  - name: file_mime_type
    type: string
    required: false
    description: MIME type of the file (e.g., 'application/pdf', 'image/jpeg', 'video/mp4', 'text/html')
  - name: file_uri
    type: string
    required: false
    description: URL or path to the file
  - name: file_size
    type: string
    required: false
    description: Size of the file
  - name: file_cid
    type: string
    required: false
    description: Globally unique content-based identifier for the file
  - name: text
    type: string
    required: false
    description: Plain text content
  - name: html
    type: string
    required: false
    description: HTML content if applicable
type_name: digital_item
updated_at: '2026-01-05T19:24:58.833Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
---

# Digital Item

Digital items represent files, software, or other digital artifacts that are stored electronically. They can be referenced in tasks and other knowledge base items.

## Digital Asset Management

The digital item schema supports:

- Basic file metadata
- Location tracking (via URIs)
- File integrity verification (via hashes)
- Categorization by MIME type

## Common Digital Items

Digital items might include:

- Documents (application/pdf, application/msword, text/plain)
- Images (image/jpeg, image/png, image/svg+xml)
- Videos (video/mp4, video/webm, video/quicktime)
- Software (application/octet-stream, application/x-executable)
- Code (text/x-python, application/javascript, text/x-java)

## Relations

Digital items commonly relate to:

- tasks (work that produces or requires these files)
- persons (who create or use the files)
- organizations (groups that own or manage the files)
