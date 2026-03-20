---
title: Search System Design
type: text
description: Architecture and design decisions for the unified search system
base_uri: sys:system/text/search-system-design.md
created_at: '2026-01-14T05:11:24.063Z'
entity_id: 42df8f5c-24e8-4889-a9d9-c474fd84ace6
public_read: true
relations:
  - relates_to [[sys:system/text/system-design.md]]
  - relates_to [[sys:system/text/permission-system-design.md]]
  - relates_to [[sys:system/text/database-and-indexing.md]]
  - relates_to [[sys:system/text/background-services.md]]
updated_at: '2026-03-02T00:00:00.000Z'
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
visibility_analyzed_at: '2026-02-16T04:37:40.256Z'
---

# Search System Design

## Overview

The search system provides unified search across files, directories, entities, and threads using ripgrep for file discovery and a native fuzzy scoring algorithm for ranking. Results are permission-filtered and ranked by relevance.

## Search Modes

Two distinct modes optimize for different use cases:

1. **Paths Mode**: Fast path matching combining files and directories. Ripgrep's `--files` enumerates all files, and directories are derived from file paths. Both are scored using a native fuzzy algorithm that supports full path matching. Multi-word queries match each word independently against the full path. Used for autocomplete features.

2. **Full Mode**: Content search combining four parallel searches:
   - File content search via ripgrep
   - Entity search via DuckDB ILIKE on title and description (with fallback to path-based scoring if DuckDB is unavailable)
   - Directory search
   - Thread metadata search

## Directory Search

Directories are derived from file paths returned by ripgrep, rather than using separate filesystem traversal. This approach is significantly faster because:

1. Ripgrep already respects .gitignore and exclude patterns
2. No separate traversal into node_modules or other excluded directories
3. Processes paths already in memory

Results include:

- Relative path with trailing slash (e.g., "repository/active/league/")
- Absolute path for permission checking
- Category marker for UI display

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

### Entity Ranking (DuckDB)

Entity results in full mode are ranked by DuckDB using a relevance heuristic: title ILIKE matches rank first, then description-only matches, with `updated_at` as tiebreaker. Entity type and tag filtering use DuckDB WHERE clauses and tag joins, eliminating post-hoc filtering. The search API route queries DuckDB directly and merges results into the unified response.

### File and Directory Ranking (Fuzzy Scorer)

Files and directories are ranked using a native fuzzy scoring algorithm inspired by VS Code's Quick Open feature.

**VS Code Approach: Score Before Limit**

Following VS Code's architecture, all files (up to 20,000) are collected first, then fuzzy scored, then limited to the top results. This ensures high-quality matches are never truncated before scoring. The flow is:

1. Ripgrep returns all file paths (up to `max_search_results: 20000`)
2. All paths are fuzzy scored against the query
3. Top results selected by score (e.g., 512 for UI display)

This differs from approaches that truncate results before scoring, which can miss highly relevant files that appear later in the directory traversal order.

**Scoring Components** (values configurable in `search-config.json`):

- Base match score for character matching
- Consecutive match bonus for sequential character matches
- Word boundary bonuses (highest at start, then after path separators, then other separators)
- CamelCase bonus for uppercase after lowercase
- Case match bonus for exact case
- Path length penalty to prefer shorter paths

**Multi-word Handling:**

- Query is split on whitespace
- Each word is scored independently against the full path
- Final score is the sum of word scores
- All words must match for a result to be included (AND logic)

This native implementation removes the previous dependency on the fzf external binary while providing similar ranking quality.

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

## Search Operators

The Command Palette supports operator-based filtering via typed chips. Users type operator syntax which converts to visual chip elements on space.

### Operator Syntax

| Operator        | Aliases       | Example                | Chip label          |
| --------------- | ------------- | ---------------------- | ------------------- |
| Content mode    | `#`           | `# docker config`      | `Content`           |
| Semantic mode   | `?`           | `? how does auth work` | `Semantic`          |
| Entity type     | `type:`, `t:` | `type:task deploy`     | `type: task`        |
| Tag             | `tag:`        | `tag:base-project`     | `tag: base-project` |
| Directory scope | `in:`, `dir:` | `in:task/ migration`   | `in: task/`         |
| Exclude         | `-term`       | `search -archived`     | `-archived`         |

### Conversion Triggers

- **Mode prefixes** (`#`, `?`): Convert on first character typed after the prefix
- **Value operators** (`type:value`, `tag:value`, `in:path`, `-term`): Convert on space after the complete token

### Chip Interaction

- Chips render inline before the text input in the Command Palette
- Backspace with empty input removes the last chip
- Hover reveals an X button for click removal
- Removing a chip re-triggers search with updated filters

### API Parameters

The search API (`GET /api/search`) accepts these filter parameters alongside existing ones:

- `entity_types`: Comma-separated entity type names, filters entity results via DuckDB type column
- `tags`: Comma-separated tag base URIs, filters entity results via DuckDB tag join
- `exclude`: Comma-separated terms, post-filtered from result titles and paths (case-insensitive)
- When `entity_types` includes `thread`, threads are automatically included in result types

### Implementation

Chip state is managed in the Redux search reducer as an Immutable List. Selectors derive filter values from chips for the saga to pass to the API. Entity type and tag filtering are handled by DuckDB WHERE clauses in the API route. Exclude filtering is a post-filter on result titles/paths.

## Trade-offs

| Decision                 | Trade-off                                                                   |
| ------------------------ | --------------------------------------------------------------------------- |
| PCRE2 field regex        | Slower than simple search vs. precise field matching                        |
| Timeline search disabled | Missing conversation content vs. sub-second response                        |
| Native fuzzy scorer      | Simpler architecture (no external dependency) vs. potential ranking quality |
| Score-then-limit (20k)   | Higher memory for large codebases vs. accurate multi-word path matching     |
| Dirs from file paths     | Cannot discover empty directories vs. fast extraction                       |
| Read-after-match         | Additional file reads for matched threads vs. streaming results             |
| Operator chip parsing    | Parsing complexity on each keystroke vs. discoverable filter syntax         |
| DuckDB entity search     | Requires DuckDB index to be ready vs. accurate title/description ranking    |

## Performance

Target response times are sub-second for typical queries. The bottleneck is usually ripgrep file enumeration, not fuzzy scoring. Fuzzy scoring thousands of items takes only a few milliseconds.

Key performance characteristics:

- Paths mode is fastest (file enumeration + scoring only)
- Full mode adds content search and thread metadata search
- Directory extraction from file paths is essentially free (~0ms)
- Score-then-limit approach has minimal overhead for codebases under 20k files
