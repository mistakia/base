---
title: 'External Data Sync'
type: 'text'
description: |
  System for synchronizing external data with conflict resolution
created_at: '2025-05-27T18:10:20.244Z'
entity_id: '11dc5b4c-365c-4e7f-b7f4-10c9851b1be1'
observations:
relations:
  - 'part_of [[sys:system/text/system-design.md]]'
tags:
updated_at: '2025-05-27T18:10:20.244Z'
user_id: '00000000-0000-0000-0000-000000000000'
---

# External Data Sync System

## Overview

Bidirectional synchronization system using content-addressed storage for change detection between internal entities and external sources. Designed to handle field-level conflicts while maintaining complete audit trails without requiring external system webhooks.

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

## Process Flow

### Change Detection Sequence

1. **Import Current State**: Fetch external data and calculate content hash
2. **Historical Comparison**: Compare against previous import using content identifier
3. **Field-Level Analysis**: Detect specific fields that changed between imports
4. **Local Conflict Check**: Compare existing local entity against normalized external data
5. **Transaction Execution**: Apply changes within database transaction scope

### GitHub Integration Process

1. **API Data Retrieval**: Fetch issues, project items, and comments via GraphQL/REST
2. **Normalization**: Transform GitHub format to internal task schema using label mappings
3. **Entity Resolution**: Find existing tasks by external ID or fuzzy matching on title/repository
4. **Bidirectional Sync**: Update local task from GitHub, optionally push local changes back

## Local-First GitHub Task Creation

### Design Pattern

Tasks created locally with GitHub repository metadata (`github_repository_owner`, `github_repository_name`) but without `external_id` can be promoted to GitHub issues. The absence of `external_id` indicates local-only state; its presence triggers the standard bidirectional sync process.

### Creation Workflow

1. **Local Task Creation**: Create task file in `user/task/github/{owner}/{repo}/` structure with repository metadata
2. **Issue Creation**: Use creation script to generate GitHub issues from local tasks
3. **Automatic Promotion**: Script updates task file with `external_id` and GitHub metadata
4. **Sync Activation**: Task transitions into standard external sync system

### Implementation Specification

- **Detection**: Tasks lacking `external_id` but containing `github_repository_owner` and `github_repository_name`
- **API Integration**: GitHub Issues REST API for issue creation with title, body, and labels
- **File Updates**: Atomic addition of `external_id`, `github_number`, `github_id`, and `github_url` fields
- **Error Handling**: Preserves local state on GitHub API failures; validates required metadata before creation
