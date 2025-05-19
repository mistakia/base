---
title: Directory Structure
type: text
description: Documentation for the system directory structure and organization
tags: [structure, organization, documentation]
observations:
  - '[architecture] Dual knowledge base separates system from user-specific content #organization'
  - '[principle] Clear directory structure improves navigation and discoverability #organization'
  - '[design] Organization follows separation of concerns principle #architecture'
relations:
  - 'relates_to [[system/text/system-design.md]]'
  - 'implements [[system/text/knowledge-base-schema.md]]'
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
├── user/               # Default user submodule (git submodule)
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
│   ├── activities/     # System activities
│   ├── guidelines/     # System guidelines
│   └── text/           # System documentation
│
└── user/               # Default User Knowledge Base (submodule)
    ├── schema/         # User schema extensions
    ├── activities/     # User activity definitions
    ├── guidelines/     # User guideline definitions
    ├── text/           # User-specific knowledge items
    │   ├── tasks/      # User tasks
    │   ├── notes/      # User notes
    │   ├── projects/   # User projects
    │   └── custom/     # User-defined custom types
    ├── tasks/          # Task data
    ├── inference/      # Inference request history
    ├── tags/           # Tags
    └── logs/           # System logs
```

Additional user submodules can be added as git submodules and will be automatically recognized and processed by the system. Each submodule is treated as a separate user repository and follows the same structure as the default `user/` submodule.

The `system/` directory in the root repository contains core definitions that provide the foundation for all knowledge items, while user submodules contain user-specific implementations and extensions of these core types. This separation allows for system stability while enabling flexible customization for multiple users' specific needs.

## Implementation Notes

1. **Module System**: The system uses ES modules with the `.mjs` extension for clarity.
2. **Path Aliases**: Configure path aliases in build tools to simplify imports.
3. **Multiple Users**: Multiple user repositories can be attached as git submodules and will be processed independently.
