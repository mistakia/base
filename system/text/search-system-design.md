---
title: Search System Design
type: text
description: Architecture and design decisions for the unified search system
base_uri: sys:system/text/search-system-design.md
created_at: '2026-01-14T05:11:24.063Z'
entity_id: 42df8f5c-24e8-4889-a9d9-c474fd84ace6
public_read: false
updated_at: '2026-01-14T05:35:00.000Z'
user_public_key: 10ba842b1307fd60475b887df61ccc7e697970a2d222e7cbf011e51f5de3349b
---

# Search System Design

## Overview

The search system provides unified search across files, entities, and threads using external binaries (ripgrep, fzf) for performance. Results are permission-filtered and ranked by relevance.

## Search Modes

Two distinct modes optimize for different use cases:

1. **Paths Mode**: Fast filename matching using ripgrep's `--files` with glob patterns. Multi-word queries are converted to wildcards (e.g., "foo bar" becomes `*foo*bar*`). Used for autocomplete features.

2. **Full Mode**: Content search combining three parallel searches:
   - File content search via ripgrep
   - Entity search (markdown files in designated entity directories)
   - Thread metadata search

## Thread Search Architecture

Threads present a unique challenge: metadata is stored in individual JSON files across thousands of directories.

**Key Design Decisions:**

- **Ripgrep PCRE2 field search**: Uses ripgrep with PCRE2 regex to search specific JSON fields across all thread metadata files. The regex pattern targets only designated searchable fields, avoiding false matches on JSON structure.

- **No artificial limits**: All threads are searched (~60-80ms for thousands of files). Results are sorted by `updated_at` after matching.

- **Field-specific matching**: A PCRE2 regex pattern matches only values within designated JSON keys:

  - `title`, `short_description`, `thread_id`
  - `workflow_base_uri`, `working_directory`, `git_branch`

- **Metadata-only by default**: Timeline content search is disabled by default due to performance cost. Can be enabled via configuration.

- **Two-phase search**: Ripgrep finds matching files first, then only matched metadata files are read for result formatting and date sorting.

## Result Ranking

Results pass through fzf for fuzzy ranking when available, with fallback to simple substring matching. This provides consistent ranking behavior across result types.

## Permission Integration

Search results are batch-filtered through the permission system before returning:

1. Execute search query
2. Convert result paths to base-URIs
3. Batch check permissions
4. Filter results where read access is denied

## Configuration

Search behavior is controlled by a JSON configuration file in the user base directory. Key settings:

- **Exclude patterns**: Directories and file patterns to skip (e.g., node_modules, .git)
- **Result type toggles**: Enable/disable files, threads, entities independently
- **Timeline search toggle**: Enable thread timeline content search (disabled by default)
- **Limits**: Max file size, timeout, result counts

## Trade-offs

| Decision                 | Trade-off                                                               |
| ------------------------ | ----------------------------------------------------------------------- |
| PCRE2 field regex        | Slower than simple search (~300ms vs ~100ms) vs. precise field matching |
| Timeline search disabled | Missing conversation content vs. sub-second response                    |
| External binaries        | Dependency on ripgrep/fzf vs. native search performance                 |
| Read-after-match         | Additional file reads for matched threads vs. streaming results         |
