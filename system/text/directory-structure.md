---
title: 'Directory Structure'
type: 'text'
description: |
  Documentation for the system directory structure and organization
created_at: '2025-05-27T18:10:20.243Z'
entity_id: '655f72d5-82dc-49c5-9aa4-90ca5840b739'
observations:
  - '[architecture] Dual knowledge base separates system from user-specific content'
  - '[principle] Clear directory structure improves navigation and discoverability'
  - '[design] Organization follows separation of concerns principle'
relations:
  - 'relates_to [[sys:system/text/system-design.md]]'
  - 'implements [[sys:system/text/knowledge-base-schema.md]]'
tags:
updated_at: '2025-05-27T18:10:20.243Z'
user_id: '00000000-0000-0000-0000-000000000000'
---

# Directory Structure

This document outlines the directory structure for the human-in-the-loop agent system, providing a clear organization of code and resources.

## Overview

The system is organized into the following top-level directories:

```
├── client/             # Client-side code only
├── config/             # Configuration
├── db/                 # Database Schema
├── libs-server/        # Server-side code only
├── libs-shared/        # Shared code (client & server)
├── scripts/            # Executable command-line scripts
├── server/             # Express API server
├── static/             # Static resources (images, styles, etc.)
├── system/             # System Knowledge Base
└── tests/              # Test files
```

## Detailed Structure

### Shared Libraries

The `libs-shared/` directory contains shared code between client and server.

### Server Libraries

The `libs-server/` directory contains server-specific code organized by functionality:

```
└── libs-server/
    ├── index.mjs               # Main export file
    ├── blocks/                 # Block-related functionality
    ├── change_requests/        # Change request management
    ├── entities/               # Entity management
    ├── git/                    # Git integration functionality
    ├── inference_providers/    # Inference service providers
    ├── integrations/           # External service integrations
    ├── markdown/               # Markdown processing
    ├── mcp/                    # Model Context Protocol service
    ├── normalize_user_id.mjs   # User ID normalization utilities
    ├── tags/                   # Tag management functionality
    ├── tasks/                  # Task management functionality
    ├── threads/                # Thread management functionality
    └── users/                  # User management functionality
```

### Scripts

The `scripts/` directory contains executable command-line scripts.

### Tests

The `tests/` directory contains test files organized by component:

```
└── tests/
    ├── unit/           # Unit tests
    ├── integration/    # Integration tests
    └── e2e/            # End-to-end tests
```

## Data Storage

The system implements a dual knowledge base architecture:

```
├── system/             # System Knowledge Base (in root repository)
│   ├── schema/         # Core schema definitions
│   ├── workflow/       # System workflows
│   ├── guideline/      # System guidelines
│   └── text/           # System documentation
│
└── <user-repository>/  # User Knowledge Base (separate git repository)
    ├── schema/         # User schema extensions
    ├── workflow/       # User workflow definitions
    ├── guideline/      # User guideline definitions
    ├── text/           # User-specific knowledge items
    │   ├── projects/   # User projects
    │   └── custom/     # User-defined custom types
    ├── task/           # Task data
    ├── thread/         # Inference request history
    ├── tag/            # Tags
    └── log/            # System logs
```

Additional user repositories can be configured and will be automatically recognized and processed by the system. Each repository is treated as a separate user knowledge base and follows the same structure.

The `system/` directory in the `base` project repository contains core definitions that provide the foundation for all knowledge items, while user repositories contain user-specific implementations and extensions of these core types. This separation allows for system stability while enabling flexible customization for multiple users' specific needs.

## Implementation Notes

1. **Module System**: The system uses ES modules with the `.mjs` extension for clarity.
2. **Path Aliases**: Configure path aliases in build tools to simplify imports.
3. **Multiple Users**: Multiple user repositories can be configured independently and will be processed separately.

**Note**: User knowledge bases are stored in separate git repositories that can be located anywhere on the filesystem, configured via `config.user_base_directory` or runtime registration.
