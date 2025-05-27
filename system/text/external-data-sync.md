---
title: 'External Data Sync'
type: 'text'
description: |
  System for synchronizing external data with conflict resolution
created_at: '2025-05-27T18:10:20.244Z'
entity_id: '11dc5b4c-365c-4e7f-b7f4-10c9851b1be1'
observations:
  - '[architecture] Field-level conflict detection and resolution #sync'
  - '[feature] Raw import data saved with IPFS content identifiers #storage'
  - '[principle] Compare current import to previous imports for precise change detection #accuracy'
relations:
  - 'part_of [[system/text/system-design.md]]'
tags:
updated_at: '2025-05-27T18:10:20.244Z'
user_id: '00000000-0000-0000-0000-000000000000'
---

# External Data Sync System

## Overview

The external data sync system manages bidirectional synchronization between internal entities and external data sources (GitHub, Notion, etc.) with field-level conflict detection and resolution.

## Components

The system consists of:

- **Core Framework**: Generic sync utilities used by all adapters
- **System-Specific Adapters**: Code for each external system (GitHub, Notion)
- **Field Mappers**: Map data between internal and external schemas
- **Conflict Resolution**: Strategies for resolving conflicts

## Data Storage

- Database tracks sync status and metadata
- Raw import data stored on disk with IPFS content identifiers
- Previous imports compared to detect specific field changes

## Conflict Resolution Strategies

- **internal_wins**: Keep internal value, update external system
- **external_wins**: Use external value, update internal entity
- **newest_wins**: Use whichever was updated more recently
- **manual**: Queue for human review and resolution

## Directory Structure

```
/user/import-history
  /{external_system}
    /{entity_id}
      /raw
        /{timestamp}_{content_id}.json
      /processed
        /{timestamp}_{content_id}.json
```

## Schema

External sync tables track relationships, configurations, and conflicts:

- `entity_sync_records`: Links entities to external records
- `sync_configs`: Per-entity or per-type sync strategies
- `sync_conflicts`: Tracks conflicts and resolutions

## Key Features

- Field-level change detection based on historical comparison
- Content-addressed storage using IPFS CIDs for data integrity
- Configurable conflict resolution per field
- Audit trail of all imports and conflict resolutions
- Supports bidirectional sync with field-specific rules
