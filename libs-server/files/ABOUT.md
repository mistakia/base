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

- `list-file-paths.mjs` — exports `list_file_paths({directory, extensions, exclude})`. Uses ripgrep for speed when available and falls back to a pure-Node walker. Callers: `libs-server/search/file-path-cache.mjs`, `services/server.mjs`, and any future feature that needs fast path enumeration.

## Design notes

- This module imports no search code. The search module imports this one.
- Exclusion patterns default to `.git`, `node_modules`, `.system`, and `import-history` but are parameterizable.
