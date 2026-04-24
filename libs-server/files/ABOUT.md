---
title: Files Utilities
type: text
description: >-
  Location-neutral file-path enumeration used by the path search source, the file-path cache,
  and services that need to enumerate markdown files without depending on the search module.
base_uri: sys:libs-server/files/ABOUT.md
public_read: false
---

# Files Utilities

## Purpose

Neutral helpers for filesystem enumeration that must not take a dependency on the search module. Extracting `list_file_paths` here unblocks the deletion of `libs-server/search/ripgrep-file-search.mjs` without breaking callers that only need to list files.

## Entries

- `list-file-paths.mjs` — exports `list_file_paths({resolved_directory_path, max_results, user_base_directory})`. The `resolved_directory_path` argument is an absolute filesystem path (null = whole user-base) and must lie within `user_base_directory`; URI resolution is the caller's responsibility and lives in `libs-server/search/resolve-search-scope.mjs`. Uses ripgrep and returns `{file_path, absolute_path, type}` rows. Callers: `libs-server/search/file-path-cache.mjs` and any future feature that needs fast path enumeration.

## Design notes

- This module imports no search code and knows nothing about base URIs. The search module imports this one.
- Exclusion patterns and hidden/symlink behaviour come from `search-config.ripgrep` (currently the only consumer of that config block).
