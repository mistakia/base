# Directory Structure

This document outlines the directory structure for the human-in-the-loop agent system, providing a clear organization of code and resources.

## Overview

The system is organized into the following top-level directories:

```
├── client/             # Client-side code only
├── config/             # Configuration
├── data/               # Data unique to the user
├── db/                 # Database Schema
├── docs/               # Documentation
├── libs-server/        # Server-side code only
├── libs-shared/        # Shared code (client & server)
├── scripts/            # Executable command-line scripts
├── server/             # Express API server
├── static/             # Static resources (images, styles, etc.)
├── system/             # Data & Prompts related to the core system
└── tests/              # Test files
```

## Detailed Structure

### Shared Libraries

The `libs-shared/` directory contains shared code between client and server:

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

### Static Resources

### Scripts

The `scripts/` directory contains executable command-line scripts:

### Documentation

The `docs/` directory contains system documentation:

```
└── docs/
    ├── system-design.md
    ├── configuration.md
    └── directory-structure.md
```

### Configuration

### Tests

The `tests/` directory contains test files organized by component:

```
└── tests/
    ├── unit/           # Unit tests
    ├── integration/    # Integration tests
    └── e2e/            # End-to-end tests
```

## Data Storage

The following directories are used for user data storage (knowledge base, prompts, preferences, guidelines, and anything else unique to the user):

```
└── data/
    ├── activities/     # Activity definitions
    ├── guidelines/     # Guideline definitions
    ├── knowledge_base/ # Knowledge base
    ├── tasks/          # Task data
    ├── inference/      # Inference request history
    ├── tags/           # Tags
    └── logs/           # System logs
```

Non-user specific data, prompts, and guidelines are stored in the `system/` directory.

## Implementation Notes

1. **Module System**: The system uses ES modules with the `.mjs` extension for clarity.
2. **Path Aliases**: Configure path aliases in build tools to simplify imports.
