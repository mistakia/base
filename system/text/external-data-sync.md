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

One-way (external -> local) synchronization system using content-addressed storage for change detection between internal entities and external sources. External systems are updated directly via their APIs (e.g., gh CLI), then imports are triggered to sync local state. Designed to handle field-level conflicts while maintaining complete audit trails without requiring external system webhooks.

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

## Specifications

### External ID Format

- **GitHub Issues**: `github:{owner}/{repo}:{issue_number}`
- **Cloudflare DNS**: `cloudflare:dns:{record_id}`
- Enables cross-system entity identification without collision risk

### Filename Convention

Import history files use `{timestamp}_{content_id}.json` format where:

- Timestamp: ISO 8601 format with colons/periods replaced by hyphens
- Content ID: SHA-256 hash of file contents
- Enables chronological sorting and content-based deduplication

### Import History Directory Structure

The system supports flexible directory structures to accommodate different external systems:

**Flat Structure** (entity IDs directly under system directory):

```
import-history/
  └── {external_system}/
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

- `--external-system`: Target specific sync system (e.g., github)
- `--entity-id`: Process single entity when combined with external-system
- `--keep-count`: Number of files to retain per entity (default: 10)

**Structure Support**:

The cleanup script automatically handles both flat and nested directory structures:

- Systems with flat structure store entities directly under the system directory
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
  external_system: 'github',
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
