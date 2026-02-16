---
title: External Data Sync
type: text
description: System for importing external data to local entities with conflict resolution
base_uri: sys:system/text/external-data-sync.md
created_at: '2025-05-27T18:10:20.244Z'
entity_id: 11dc5b4c-365c-4e7f-b7f4-10c9851b1be1
public_read: true
relations:
  - part_of [[sys:system/text/system-design.md]]
updated_at: '2026-01-05T19:24:59.754Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
visibility_analyzed_at: '2026-02-16T04:36:27.794Z'
---

# External Data Sync System

## Overview

One-way (external -> local) synchronization system using content-addressed storage for change detection between internal entities and external sources. External systems are updated directly via their APIs (gh CLI, MCP Notion tools), then imports are triggered to sync local state. Designed to handle field-level conflicts while maintaining complete audit trails without requiring external system webhooks.

## Unique Design Decisions

### Content-Addressed Change Detection

Uses SHA-256 hashes of normalized data instead of timestamps or version numbers. Prevents false-positive updates when external APIs return identical data with different timestamps.

### Dual-State Storage Architecture

Separates raw external responses from normalized internal format to enable:

- Format evolution without losing historical context
- Debugging external API changes independent of internal schema changes
- Audit compliance through immutable external data preservation

### Conflict Resolution: External Source Wins

Local modifications are overwritten by external changes, with additive merging only for tags/labels. This aggressive strategy is viable because local data is version controlled in Git - actual conflict resolution occurs during the commit process, preserving local change history while maintaining external system authority.

### Notion-Specific Design Patterns

**Block-Based Content Architecture**: Notion's hierarchical block system requires specialized conversion logic to preserve formatting and structure when transforming to markdown. The system handles nested blocks, rich text formatting, and embedded content while maintaining semantic meaning.

**Database Property Mapping**: Configuration-driven approach maps Notion database properties to entity fields with type conversion support. Handles complex property types including multi-select, relations, formulas, and rollups through a flexible mapping system.

**Filesystem-Based Entity Matching**: Uses exact external_id matching followed by expected location search to prevent entity corruption.

## Specifications

### External ID Format

- **GitHub Issues**: `github:{owner}/{repo}:{issue_number}`
- **Notion Pages**: `notion:page:{page_id}`
- **Notion Database Items**: `notion:database:{database_id}:{page_id}`
- **Cloudflare DNS**: `cloudflare:dns:{record_id}`
- Enables cross-system entity identification without collision risk

### Filename Convention

Import history files use `{timestamp}_{content_id}.json` format where:

- Timestamp: ISO 8601 format with colons/periods replaced by hyphens
- Content ID: SHA-256 hash of file contents
- Enables chronological sorting and content-based deduplication

### Import History Directory Structure

The system supports flexible directory structures to accommodate different external systems:

**Flat Structure** (used by systems like Notion):

```
import-history/
  └── notion/
      └── {entity_id}/
          ├── raw/
          └── processed/
```

**Nested Structure with Import Sources** (used by systems like GitHub):

```
import-history/
  └── github/
      ├── issues/
      │   └── {entity_id}/
      │       ├── raw/
      │       └── processed/
      └── project/
          └── {entity_id}/
              ├── raw/
              └── processed/
```

The system automatically discovers the structure by scanning directories. Import sources (like `issues` and `project` for GitHub) allow separating import histories for different pathways within the same external system, enabling independent tracking and cleanup while maintaining logical grouping under the parent system.

## Process Flow

### Change Detection Sequence

1. **Import Current State**: Fetch external data and calculate content hash
2. **Historical Comparison**: Compare against previous import using content identifier
3. **Field-Level Analysis**: Detect specific fields that changed between imports
4. **Local Conflict Check**: Compare existing local entity against normalized external data
5. **Apply Changes**: Perform file writes with atomic operations

### GitHub Integration Process

1. **API Data Retrieval**: Fetch issues, project items, and comments via GraphQL/REST
2. **Normalization**: Transform GitHub format to internal task schema using label mappings
3. **Entity Resolution**: Find existing tasks by external ID or fuzzy matching on title/repository
4. **Import Sync**: Update local task from GitHub data

### Notion Integration Process

1. **Content Retrieval**: Fetch pages and database items via Notion API with full block content
2. **Block Conversion**: Transform Notion's hierarchical block structure to markdown with formatting preservation
3. **Property Mapping**: Convert database properties to entity fields using configuration-driven mappings
4. **Entity Resolution**: Find existing entities by external_id with filesystem-based exact matching
5. **Import Sync**: Import Notion content to local entities
6. **Safety Controls**: Dry-run analysis available to preview changes before writing

## Notion Sync Implementation

### Block-to-Markdown Conversion

**Rich Text Preservation**: Maintains all Notion formatting including bold, italic, strikethrough, code, and links through semantic markdown conversion. Handles complex nested structures and preserves intentional spacing.

**Content Structure Mapping**: Converts Notion's block hierarchy to markdown equivalents while preserving semantic meaning. Supports all Notion block types including headings, lists, toggles, callouts, tables, and embedded content.

**Entity Reference Translation**: Converts Notion page references to Base entity reference format (`[[user:type/filename.md]]`) enabling cross-system entity linking.

### Configuration-Driven Property Mapping

**Type Conversion System**: Handles transformation between Notion property types and entity fields with support for:

- Rich text to markdown content conversion
- Select properties to enumerated values
- Multi-select to tag arrays
- Date properties with timezone handling
- Number and formula property extraction
- Relation properties to entity references

**Database Schema Mapping**: Configuration files define which entity types correspond to specific Notion databases, enabling flexible sync relationships without code changes.

### Safety and Reliability Features

**Dry-Run Analysis**: Comprehensive preview mode showing exactly what changes would be made without executing them, including field-level change detection.

**Import History Tracking**: Content-addressed storage of sync operations enables precise change detection and prevents unnecessary updates when external data hasn't changed.

**Filesystem-Based Entity Search**: Exact external_id matching prevents entity corruption that could occur with fuzzy searches, ensuring sync operations target correct entities.

## Import History Management

### CLI Utilities for History Cleanup

The system includes comprehensive tools for managing import history files to prevent unlimited storage growth while maintaining audit trails:

**Cleanup Script**: `cli/import-history/cleanup-import-history.mjs` provides flexible control over import history retention:

```bash
# Keep only 5 most recent files for GitHub entities
node cli/import-history/cleanup-import-history.mjs --external-system github --keep-count 5

# Preview cleanup for specific entity without making changes
node cli/import-history/cleanup-import-history.mjs --entity-id abc123 --dry-run

# Show summary statistics across all systems
node cli/import-history/cleanup-import-history.mjs --summary

# List all import history files
node cli/import-history/cleanup-import-history.mjs --list

# Clean up all systems keeping default 10 files per entity
node cli/import-history/cleanup-import-history.mjs
```

**Safety Features**:

- Dry-run mode shows planned changes without executing them
- Confirmation prompts prevent accidental deletions (unless `--force` flag used)
- Preserves newest files based on timestamp ordering
- Handles both raw and processed data files independently
- Automatic cleanup of empty directories after file removal

**Filtering Options**:

- `--external-system`: Target specific sync system (e.g., github, notion)
- `--entity-id`: Process single entity when combined with external-system
- `--keep-count`: Number of files to retain per entity (default: 10)

**Structure Support**:

The cleanup script automatically handles both flat and nested directory structures:

- Systems with flat structure (like Notion) store entities directly under the system directory
- Systems with nested structure (like GitHub) use import sources to separate pathways (e.g., `issues` vs `project`)
- The script discovers and processes all structures automatically without requiring configuration

**Operational Modes**:

- `--summary`: Display statistics without performing cleanup
- `--list`: Show detailed file listing for inspection
- `--dry-run`: Preview changes without deletion
- `--verbose`: Enable detailed logging for troubleshooting

### Programmatic Access

Import history management is available through the sync module:

```javascript
import {
  list_import_history_files,
  cleanup_import_history_files,
  get_cleanup_summary
} from '#libs-server/sync/index.mjs'

// Get summary statistics
const summary = await get_cleanup_summary({
  external_system: 'github',
  keep_count: 5
})

// List files for specific entity
const files = await list_import_history_files({
  external_system: 'notion',
  entity_id: 'abc123'
})

// Perform cleanup with dry-run
const results = await cleanup_import_history_files({
  external_system: 'github',
  keep_count: 3,
  dry_run: true
})
```

**Use Cases**:

- Automated maintenance scripts in CI/CD pipelines
- Monitoring storage usage trends
- Investigating sync history for specific entities
- Bulk cleanup operations during system maintenance
