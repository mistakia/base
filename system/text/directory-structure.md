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
  - 'relates_to [[System Design]]'
  - 'part_of [[Documentation]]'
  - 'implements [[Knowledge Base Schema]]'
---

# Directory Structure

This document outlines the directory structure for the human-in-the-loop agent system, providing a clear organization of code and resources.

## Overview

The system is organized into the following top-level directories:

```
├── client/             # Client-side code only
├── config/             # Configuration
├── data/               # Data unique to the user
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
    ├── index.mjs       # Main export file
    ├── constants.mjs   # Shared constants
    ├── tasks/          # Task management functionality
    ├── integrations/   # External service integrations
    └── mcp/            # Model Context Protocol service
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
├── system/             # System Knowledge Base
│   ├── schema/         # Core schema definitions
│   ├── activities/     # System activities
│   ├── guidelines/     # System guidelines
│   └── text/           # System documentation
│
└── data/               # User Knowledge Base
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

The `system/` directory contains core definitions that provide the foundation for all knowledge items, while the `data/` directory contains user-specific implementations and extensions of these core types. This separation allows for system stability while enabling flexible customization for each user's specific needs.

## Implementation Notes

1. **Module System**: The system uses ES modules with the `.mjs` extension for clarity.
2. **Path Aliases**: Configure path aliases in build tools to simplify imports.
