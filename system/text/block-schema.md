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
  - 'part_of [[sys:text/system-design.md]]'
  - 'relates_to [[sys:text/knowledge-base-schema.md]]'
tags:
updated_at: '2025-05-27T18:10:20.242Z'
user_id: '00000000-0000-0000-0000-000000000000'
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
    "user_id": "string", // Owner of the block
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

The system supports the following block types:

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

Some attributes are shared across multiple block types:

- `color`: Visual styling of the block. Can be one of:

  - `default`
  - `gray`, `brown`, `orange`, `yellow`, `green`, `blue`, `purple`, `pink`, `red`
  - `gray_background`, `brown_background`, `orange_background`, `yellow_background`
  - `green_background`, `blue_background`, `purple_background`, `pink_background`, `red_background`

- `uri`: Used for blocks that reference external resources (images, files, videos, bookmarks)
- `type`: Used for blocks that can reference either local files or external resources
- `caption`: Optional descriptive text for media and link blocks

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

Blocks can have the following relationships:

1. **Parent-Child**: Hierarchical structure (e.g., a list contains list items)
2. **References**: Cross-references between blocks (e.g., link to another heading)

These relationships are stored as CIDs, enabling efficient graph traversal and querying.

## Implementation

The block system is implemented in JavaScript/Node.js. The core modules are:

1. `block-schemas.mjs`: Defines block types and schemas
2. `block-converter.mjs`: Handles conversion between markdown and blocks
3. `block-store.mjs`: Manages block storage and retrieval
4. `block-operations.mjs`: High-level operations for working with blocks

For implementation details, refer to the source code in the `libs-server/blocks` directory.
