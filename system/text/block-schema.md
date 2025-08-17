---
title: 'Block Schema'
type: 'text'
description: |
  Defines the schema for content blocks in our markdown-based system
created_at: '2025-05-27T18:10:20.242Z'
entity_id: '981bb500-b0b9-44cc-a12f-18e0f9f49c33'
observations:
  - '[architecture] Content blocks provide granular control over document content'
  - '[format] JSON structure allows for flexible block attributes and relationships'
  - '[feature] Content addressing enables efficient versioning and deduplication'
  - '[principle] Block-based content facilitates modular document manipulation'
relations:
  - 'part_of [[sys:system/text/system-design.md]]'
  - 'relates_to [[sys:system/text/knowledge-base-schema.md]]'
tags:
updated_at: '2025-05-27T18:10:20.242Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
---

# Block Schema

This document defines the schema for content blocks in our markdown-based system.

## Overview

Blocks are the fundamental units of content in our system. Each markdown document is parsed into a collection of blocks, which can be stored, queried, and manipulated individually while maintaining their relationships.

## Block Structure

Each block is represented as a JSON object with the following structure:

```json
{
  "block_cid": "string", // Content ID (multihash)
  "type": "string", // Block type
  "content": "string", // Raw content
  "metadata": {
    // Block metadata
    "created_at": "ISO timestamp", // Creation time
    "updated_at": "ISO timestamp", // Last update time
    "user_public_key": "string", // Owner of the block
    "tags": [], // Optional tags
    "position": {
      // Position in document
      "start": { "line": 0, "character": 0 },
      "end": { "line": 0, "character": 0 }
    }
  },
  "attributes": {}, // Type-specific attributes
  "relationships": {
    // Block relationships
    "parent": "string", // CID of parent block
    "children": ["string"], // CIDs of child blocks
    "references": ["string"] // CIDs of referenced blocks
  }
}
```

## Block Types

| Type             | Description           | Specific Attributes                                                                                 |
| ---------------- | --------------------- | --------------------------------------------------------------------------------------------------- |
| `markdown_file`  | Root document         | `title` (string), `source_path` (string)                                                            |
| `heading`        | Section heading       | `level` (1-6), `is_toggleable` (boolean), `color` (string)                                          |
| `paragraph`      | Text paragraph        | `color` (string)                                                                                    |
| `list`           | List                  | `ordered` (boolean), `spread` (boolean), `color` (string)                                           |
| `list_item`      | Item in a list        | `indent_level` (integer), `list_type` (bullet/numbered/task), `checked` (boolean), `color` (string) |
| `code`           | Code snippet          | `language` (string)                                                                                 |
| `blockquote`     | Quoted text           | `color` (string)                                                                                    |
| `table`          | Table                 | `table_width` (integer), `has_column_header` (boolean), `has_row_header` (boolean)                  |
| `table_row`      | Row in a table        | `cells` (array of rich text arrays)                                                                 |
| `table_cell`     | Cell in a table       | None                                                                                                |
| `image`          | Image reference       | `uri` (string), `alt_text` (string), `caption` (string), `type` (file/external)                     |
| `thematic_break` | Horizontal rule       | None                                                                                                |
| `callout`        | Highlighted text      | `icon` (string), `color` (string)                                                                   |
| `bookmark`       | Saved link            | `uri` (string), `caption` (string)                                                                  |
| `equation`       | Mathematical equation | None                                                                                                |
| `file`           | Attached file         | `uri` (string), `type` (file/external)                                                              |
| `video`          | Video content         | `uri` (string), `type` (file/external)                                                              |
| `html_block`     | Raw HTML              | None                                                                                                |

### Common Attributes

- `color`: Block styling (default, gray, brown, orange, yellow, green, blue, purple, pink, red, or \_background variants)
- `uri`: External resource reference
- `caption`: Media/link description

## Content Addressing

Blocks are content-addressable using the [Multiformats](https://github.com/multiformats/js-multiformats) library:

1. The content and type of each block is hashed to create a unique Content Identifier (CID)
2. The CID is used as the primary key for block storage and referencing
3. This enables deduplication and efficient versioning

## Serialization

When converting blocks back to markdown:

1. Blocks are sorted based on their position metadata
2. Each block is rendered according to its type
3. Block relationships determine nesting and document structure
4. The result is valid markdown that can be edited directly

## Block Relationships

- **Parent-Child**: Hierarchical structure
- **References**: Cross-references between blocks

Relationships use CIDs for graph traversal and querying.

## Block Permissions

Companion `.blockpermissions` YAML files control block access. Default behavior is public access. Restricted blocks are content-redacted, not removed.

### Permission Levels

- `public`: All users (default)
- `owner`: Content owner only

### Companion File Format

```yaml
permissions:
  - blocks: [1, 2, 3]
    allow: owner
  - block_range: [5, 8]
    allow: owner
  - block_type: code
    allow: owner
  - heading_level: 3
    allow: owner
  - block_cids: ['block_cid_1', 'block_cid_2']
    allow: owner
```

### Block Matchers

- **blocks**: Block index (1-based)
- **block_range**: Inclusive range
- **block_type**: Specific type
- **heading_level**: Heading level (1-6)
- **block_cids**: Content identifiers

### User Context

Permission checking uses `{ is_owner: boolean, user_public_key: string }` context.

### Processing

1. Parse companion file
2. Apply rules based on user context
3. Redact restricted content
4. Preserve markdown syntax, block structure, and relationships
