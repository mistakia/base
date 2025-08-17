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
user_public_key: '0000000000000000000000000000000000000000000000000000000000000000'
---

# Directory Structure

This document outlines the directory structure for the human-in-the-loop agent system, providing a clear organization of code and resources.

## Overview

The system is organized into the following top-level directories:

```
├── client/             # Client-side React application and components
├── cli/                # Command-line tools and utilities
├── config/             # Configuration files and settings
├── docs/               # Project documentation
├── examples/           # Example code and usage patterns
├── libs-server/        # Server-side libraries and modules
├── libs-shared/        # Shared code (client & server)
├── server/             # API server
├── services/           # Long-running processes and MCP servers
├── static/             # Static resources (favicon, etc.)
├── system/             # System Knowledge Base (schemas, guidelines, workflows)
├── tests/              # Test files (unit, integration, e2e)
├── tmp/                # Temporary files directory
└── webpack/            # Webpack build configuration
```

## Detailed Structure

### Shared Libraries

The `libs-shared/` directory contains shared code between client and server.

### Server Libraries

The `libs-server/` directory contains server-specific code organized by functionality:

```
└── libs-server/
    ├── index.mjs               # Main export file
    ├── base-files/             # File operations and utilities
    ├── base-uri/               # Base URI registry and utilities
    ├── blocks/                 # Block-related functionality
    ├── entity/                 # Entity management (filesystem, git, format, search)
    ├── filesystem/             # Filesystem operations
    ├── git/                    # Git integration functionality
    ├── guideline/              # Guideline management
    ├── inference-providers/    # Inference service providers
    ├── integrations/           # External service integrations
    │   ├── claude/             # Claude AI integration
    │   ├── cursor/             # Cursor IDE integration
    │   ├── github/             # GitHub API and sync
    │   ├── notion/             # Notion API and sync
    │   ├── openai/             # OpenAI integration
    │   ├── shared/             # Shared integration utilities
    │   └── thread/             # Thread integration utilities
    ├── markdown/               # Markdown processing
    ├── mcp/                    # Model Context Protocol service
    ├── prompts/                # Prompt generation and management
    ├── repository/             # Repository processing (filesystem & git)
    ├── services/               # Service layer components
    ├── sync/                   # Data synchronization utilities
    ├── tag/                    # Tag management functionality
    ├── task/                   # Task management functionality
    ├── threads/                # Thread management functionality
    ├── tools/                  # MCP tools implementation
    ├── users/                  # User management functionality
    ├── utils/                  # General utilities
    └── workflow/               # Workflow management
```

### CLI

The `cli/` directory contains command-line tools and utilities for development, system maintenance, and data processing:

```
└── cli/
    ├── github/                 # GitHub integration utilities
    ├── import-history/         # Import history management
    ├── notion/                 # Notion integration utilities
    └── *.mjs                   # Various CLI scripts for development and maintenance
```

### Services

The `services/` directory contains long-running processes and servers:

```
└── services/
    ├── claude-session-import-service.mjs  # Claude session import service
    ├── mcp/                               # MCP server implementations
    │   ├── mcp-server-sse.mjs            # Server-sent events MCP server
    │   └── mcp-server-stdio.mjs          # Standard I/O MCP server
    └── server.mjs                        # Main API server
```

### Tests

The `tests/` directory contains test files organized by component:

```
└── tests/
    ├── fixtures/       # Test fixtures and mock data
    ├── integration/    # Integration tests
    ├── unit/           # Unit tests
    └── utils/          # Test utilities and helpers
```

## Data Storage

The system implements a dual knowledge base architecture:

```
├── system/             # System Knowledge Base (in root repository)
│   ├── guideline/      # System guidelines and processes
│   ├── prompt/         # System prompt templates
│   ├── schema/         # Core schema definitions
│   ├── text/           # System documentation
│   └── workflow/       # System workflows
│
└── <user-repository>/  # User Knowledge Base (separate git repository)
    ├── change-request/ # Change management records
    ├── config/         # User-specific configuration
    ├── guideline/      # Personal guidelines and processes
    ├── import-history/ # Historical data from external systems
    ├── physical-item/  # Physical objects and equipment
    ├── physical-location/ # Real estate and location entities
    ├── repository/     # Git repository management
    ├── tag/            # Taxonomy and categorization
    ├── task/           # Task management and tracking
    ├── text/           # Documentation and text content
    ├── thread/         # Thread execution data
    └── workflow/       # Personal workflows and automation
```

Additional user repositories can be configured and will be automatically recognized and processed by the system. Each repository is treated as a separate user knowledge base and follows the same structure.

The `system/` directory in the `base` project repository contains core definitions that provide the foundation for all knowledge items, while user repositories contain user-specific implementations and extensions of these core types. This separation allows for system stability while enabling flexible customization for multiple users' specific needs.

## Additional Directories

### Client Structure

The `client/` directory contains the React-based web application:

```
└── client/
    ├── assets/         # Static assets (logos, images)
    ├── components/     # Reusable React components
    ├── core/           # Core application logic (Redux, sagas, API)
    ├── styles/         # Stylus stylesheets
    └── views/          # Page components and routing
```

### Configuration

The `config/` directory contains system configuration:

```
└── config/
    ├── config.json     # Main configuration file
    ├── config-test.json # Test environment configuration
    ├── index.mjs       # Configuration loader
    └── labels.mjs      # Label definitions
```

## Implementation Notes

1. **Module System**: The system uses ES modules with the `.mjs` extension for clarity.
2. **Build System**: Uses Webpack for client-side bundling and Babel for transpilation.
3. **Package Management**: Uses Yarn for dependency management.
4. **Process Management**: PM2 configuration for production deployment.
5. **Multiple Users**: Multiple user repositories can be configured independently and will be processed separately.

**Note**: User knowledge bases are stored in separate git repositories that can be located anywhere on the filesystem, configured via `config.user_base_directory` or runtime registration.
